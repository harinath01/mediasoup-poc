import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as mediasoupClient from 'mediasoup-client';
import { apiCall, sendJsonBeacon } from '../api.js';
import AppShell, { cardClass, inputClass } from '../components/AppShell.jsx';
import { STATUS_COPY } from '../constants/status.js';
import { useRoomChat } from '../useRoomChat.js';

function StudentPage() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState({ state: 'idle', text: STATUS_COPY.idle });
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = useRef(null);
  const sendTransportRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const producersRef = useRef({
    cameraAudio: null,
    cameraVideo: null,
    screenVideo: null,
  });
  const hasLeftRef = useRef(false);
  const activeSessionRef = useRef({ name: '', roomId: '' });
  const joinedRoomId = roomInfo.split(' | ')[0]?.replace('Room: ', '') || '';
  const joinedName = roomInfo.split(' | ')[1]?.replace('Name: ', '') || '';
  const { messages, presence, connected: chatConnected, chatError, sendMessage } = useRoomChat({
    enabled: joined,
    roomId: joinedRoomId,
    name: joinedName,
    role: 'student',
  });

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    function handlePageHide() {
      beaconLeave();
    }

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      beaconLeave();
    };
  }, []);

  async function onJoin(event) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedRoomId = roomId.trim();
    if (!trimmedName || !trimmedRoomId) {
      setError('Name and room ID are required.');
      return;
    }

    setError('');
    setStatus({ state: 'connecting', text: 'Joining room...' });
    hasLeftRef.current = false;
    activeSessionRef.current = { name: trimmedName, roomId: trimmedRoomId };

    try {
      const result = await apiCall('POST', '/api/students/join', {
        name: trimmedName,
        roomId: trimmedRoomId,
      });

      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: result.routerRtpCapabilities });

      const sendTransport = device.createSendTransport({
        ...result.transport,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      sendTransportRef.current = sendTransport;
      setJoined(true);
      setRoomInfo(`Room: ${result.roomId} | Name: ${result.name}`);

      sendTransport.on('connectionstatechange', state => {
        switch (state) {
          case 'connecting':
            setStatus({ state: 'connecting', text: 'Connecting...' });
            break;
          case 'connected':
            setStatus({ state: 'connected', text: 'Proctoring Active' });
            break;
          case 'failed':
            setStatus({ state: 'failed', text: 'Connection Failed' });
            break;
          case 'disconnected':
            setStatus({ state: 'connecting', text: 'Disconnected - reconnecting...' });
            break;
          default:
            break;
        }
      });

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        apiCall('POST', '/api/students/connect-transport', {
          transportId: sendTransport.id,
          dtlsParameters,
        }).then(callback).catch(errback);
      });

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const { id } = await apiCall('POST', '/api/students/produce', {
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            name: activeSessionRef.current.name,
            roomId: activeSessionRef.current.roomId,
            sourceType: appData?.sourceType || 'camera',
            displayLabel: appData?.displayLabel || null,
          });
          callback({ id });
        } catch (err) {
          errback(err);
        }
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
          frameRate: { ideal: 15, max: 20 },
        },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(true);
      setCamEnabled(true);
      setStatus({ state: 'connecting', text: 'Publishing media...' });
      await publishCameraTracks(stream);
    } catch (err) {
      setError(err.message || 'Failed to join room.');
      setStatus({ state: 'failed', text: 'Connection Failed' });
      closeStudentTransport();
      stopLocalTracks();
      setJoined(false);
    }
  }

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
  }

  function toggleCam() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamEnabled(track.enabled);
  }

  async function publishCameraTracks(stream) {
    const transport = sendTransportRef.current;
    if (!transport) return;

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    if (audioTrack && !producersRef.current.cameraAudio) {
      producersRef.current.cameraAudio = await transport.produce({
        track: audioTrack,
        appData: { sourceType: 'camera', displayLabel: 'Microphone' },
      });
    }

    if (videoTrack && !producersRef.current.cameraVideo) {
      producersRef.current.cameraVideo = await transport.produce({
        track: videoTrack,
        encodings: [
          { rid: 'low', maxBitrate: 180_000, scaleResolutionDownBy: 2 },
          { rid: 'high', maxBitrate: 900_000, scaleResolutionDownBy: 1 },
        ],
        appData: { sourceType: 'camera', displayLabel: 'Camera' },
      });
    }
  }

  async function startScreenShare() {
    if (screenSharing) return;

    try {
      setError('');
      setStatus({ state: 'connecting', text: 'Requesting screen share...' });

      if (!navigator.mediaDevices?.getDisplayMedia) {
        setStatus({ state: 'connected', text: 'Proctoring Active' });
        setError('Screen sharing is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 5, max: 8 },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        stopScreenShare();
        return;
      }

      videoTrack.contentHint = 'detail';

      screenStreamRef.current = stream;
      videoTrack.addEventListener('ended', () => {
        stopScreenShare();
      }, { once: true });

      const transport = sendTransportRef.current;
      if (!transport) {
        stopScreenShare();
        return;
      }

      producersRef.current.screenVideo = await transport.produce({
        track: videoTrack,
        encodings: [
          { rid: 'low', maxBitrate: 250_000, scaleResolutionDownBy: 2 },
          { rid: 'high', maxBitrate: 1_200_000, scaleResolutionDownBy: 1 },
        ],
        appData: {
          sourceType: 'screen',
          displayLabel: videoTrack.label || 'Screen Share',
        },
      });

      setScreenSharing(true);
      setStatus({ state: 'connected', text: 'Proctoring Active' });
    } catch (err) {
      setStatus({ state: 'connected', text: 'Proctoring Active' });

      if (err?.name === 'NotAllowedError') {
        setError('Screen sharing permission was denied.');
        return;
      }

      setError(err.message || 'Failed to start screen share.');
    }
  }

  function stopScreenShare() {
    if (producersRef.current.screenVideo) {
      producersRef.current.screenVideo.close();
      producersRef.current.screenVideo = null;
    }

    const screenStream = screenStreamRef.current;
    if (screenStream) {
      for (const track of screenStream.getTracks()) {
        track.stop();
      }
    }

    screenStreamRef.current = null;
    setScreenSharing(false);
  }

  async function leaveRoom() {
    const transport = sendTransportRef.current;
    if (!transport || hasLeftRef.current) return;

    hasLeftRef.current = true;
    setIsLeaving(true);

    try {
      await apiCall('POST', '/api/students/leave', { transportId: transport.id });
    } catch (err) {
      console.error('failed to leave room', err);
    }

    stopLocalTracks();
    closeStudentTransport();
    resetStudentUi();
    setIsLeaving(false);
  }

  function beaconLeave() {
    const transport = sendTransportRef.current;
    if (!transport || hasLeftRef.current) return;

    hasLeftRef.current = true;
    sendJsonBeacon('/api/students/leave', { transportId: transport.id });
    stopLocalTracks();
    closeStudentTransport();
  }

  function stopLocalTracks() {
    const stream = localStreamRef.current;
    if (!stream) return;

    for (const track of stream.getTracks()) {
      track.stop();
    }

    localStreamRef.current = null;
    setLocalStream(null);
    stopScreenShare();
  }

  function closeStudentTransport() {
    if (!sendTransportRef.current) return;
    sendTransportRef.current.close();
    sendTransportRef.current = null;
    producersRef.current = {
      cameraAudio: null,
      cameraVideo: null,
      screenVideo: null,
    };
  }

  function resetStudentUi() {
    activeSessionRef.current = { name: '', roomId: '' };
    setJoined(false);
    setRoomInfo('');
    setStatus({ state: 'idle', text: STATUS_COPY.idle });
    setMicEnabled(true);
    setCamEnabled(true);
    setScreenSharing(false);
    setChatOpen(false);
    setChatDraft('');
  }

  async function handleSendChatMessage() {
    const text = chatDraft.trim();
    if (!text) return;

    try {
      await sendMessage({ text });
      setChatDraft('');
    } catch (err) {
      setError(err.message || 'Failed to send chat message.');
    }
  }

  return (
    <AppShell mainClassName={joined ? (chatOpen ? 'max-w-[920px]' : 'max-w-[560px]') : 'max-w-[560px]'}>
      {!joined ? (
        <section className={`${cardClass} max-w-[500px]`}>
          <div className="mb-5 grid gap-2.5">
            <Link className="w-fit text-sm text-muted transition hover:text-text" to="/">
              Back
            </Link>
            <h2 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Join Room</h2>
            <p className="m-0 text-[0.95rem] text-muted">Student session publishing for live proctoring.</p>
          </div>

          <form className="grid gap-[13px]" onSubmit={onJoin}>
            <label className="grid gap-2">
              <span className="text-[0.84rem] text-muted">Name</span>
              <input id="student-name" className={inputClass} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.84rem] text-muted">Room ID</span>
              <input id="student-room" className={inputClass} value={roomId} onChange={event => setRoomId(event.target.value)} placeholder="Room ID" />
            </label>
            {error ? <div className="rounded border border-danger/20 bg-danger/10 px-3.5 py-3 text-[#f3b4c1]">{error}</div> : null}
            <button id="student-join" className="rounded bg-primary px-4 py-3.5 font-bold text-white transition hover:bg-primary-strong" type="submit">
              Join as Student
            </button>
          </form>
        </section>
      ) : (
        <div className={`mx-auto transition-all duration-300 ${chatOpen ? 'max-w-[860px]' : 'max-w-[500px]'}`}>
          <div className="flex items-stretch justify-center">
            <section
              className={`${cardClass} relative min-w-0 overflow-hidden border-white/10 bg-[#1a1a1a]/85 backdrop-blur-sm transition-all duration-300 ${
                chatOpen ? 'flex-1 rounded-r-none border-r-0' : 'w-full'
              } ${
                chatOpen ? '' : ''
              }`}
            >
            <div
              className={`flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 ${
                status.state === 'connected'
                  ? 'border-emerald-500/20 bg-emerald-950/30 text-emerald-400'
                  : status.state === 'failed'
                    ? 'border-danger/20 bg-danger/10 text-danger'
                    : 'border-warning/20 bg-warning/10 text-warning'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full bg-current ${status.state === 'connected' ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">
                {status.state === 'connected' ? 'Proctoring Active' : status.text}
              </span>
            </div>

            <p id="student-room-info" className="mt-5 text-center text-[0.95rem] text-muted">
              {roomInfo.replace(' | ', ' · ')}
            </p>

            <div id="student-self-preview" className="relative mt-7 aspect-square w-full overflow-hidden rounded-lg border border-emerald-500/20 bg-black">
              <video
                className={`h-full w-full object-cover ${camEnabled ? '-scale-x-100 opacity-90' : 'grayscale blur-[3px] opacity-40'} transition`}
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
              />
              <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-white/80 backdrop-blur-sm">
                Self View
              </div>
            </div>

            <div className="mt-6 flex w-full items-center gap-2 rounded-lg bg-emerald-950/10 px-4 py-3 text-left">
              <span className="text-sm font-semibold text-primary">Proctor:</span>
              <span className="min-w-0 flex-1 truncate text-[0.95rem] text-white/75">
                {messages.findLast(message => message.senderRole === 'staff')?.text || 'No staff messages yet.'}
              </span>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-4">
              <div className="flex flex-wrap items-center gap-5">
                <button className="flex items-center gap-2 text-white/75 transition hover:text-white" onClick={toggleMic} type="button">
                  {micEnabled ? <MicInlineIcon /> : <MicOffInlineIcon />}
                  <span className="text-[0.95rem] font-semibold">{micEnabled ? 'Mute' : 'Unmute'}</span>
                </button>

                <button className="flex items-center gap-2 text-white/75 transition hover:text-white" onClick={toggleCam} type="button">
                  {camEnabled ? <CameraInlineIcon /> : <CameraOffInlineIcon />}
                  <span className="text-[0.95rem] font-semibold">{camEnabled ? 'Stop Camera' : 'Start Camera'}</span>
                </button>

                <button className="flex items-center gap-2 text-white/75 transition hover:text-white" onClick={screenSharing ? stopScreenShare : startScreenShare} type="button">
                  {screenSharing ? <StopScreenIcon /> : <ScreenShareIcon />}
                  <span className="text-[0.95rem] font-semibold">{screenSharing ? 'Stop Share' : 'Share Screen'}</span>
                </button>
              </div>

              <button
                aria-label={chatOpen ? 'Close chat' : 'Open chat'}
                className={`relative transition ${chatOpen ? 'text-white' : 'text-primary hover:text-indigo-300'}`}
                onClick={() => setChatOpen(current => !current)}
                type="button"
              >
                <ChatIcon />
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-[#1a1a1a] bg-[#f8a5a5]" />
              </button>
            </div>
            </section>

            <aside
              className={`flex min-h-full shrink-0 flex-col overflow-hidden border-y border-r border-white/[0.08] bg-[#1c1b1b] shadow-2xl transition-all duration-300 ${
                chatOpen ? 'w-[312px] rounded-r-md opacity-100' : 'w-0 border-transparent opacity-0'
              }`}
            >
              <div
                className={`flex min-h-0 flex-1 flex-col transition-all duration-200 ${
                  chatOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-6 opacity-0'
                }`}
              >
                <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4">
                  <h2 className="text-lg font-semibold text-white">Proctor Chat</h2>
                  <button className="text-white/60 transition hover:text-white" onClick={() => setChatOpen(false)} type="button">
                    <CloseIcon />
                  </button>
                </div>

                <div className="flex items-center justify-center bg-emerald-950/10 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-xs font-semibold text-white/70">{presence.staff.length ? `${presence.staff.join(', ')} online` : 'Waiting for staff'}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-auto px-4 py-4">
                  <div className="flex min-h-full flex-col justify-end gap-5">
                    {messages.length ? messages.map(message => {
                      const ownMessage = message.senderName === joinedName && message.senderRole === 'student';
                      return (
                        <div className={`flex flex-col ${ownMessage ? 'items-end' : 'items-start'}`} key={message.id}>
                          <span className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/45">
                            {ownMessage ? 'Me' : message.senderName}
                          </span>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.95rem] ${ownMessage ? 'rounded-tr-md bg-white/[0.08] text-white/85' : 'rounded-tl-md bg-primary text-white shadow-action'}`}>
                            {message.text}
                          </div>
                          {!ownMessage && message.recipientMode === 'student' ? <span className="mt-1 text-[11px] uppercase tracking-[0.08em] text-primary/80">Direct message</span> : null}
                          {!ownMessage && message.recipientMode === 'all' ? <span className="mt-1 text-[11px] uppercase tracking-[0.08em] text-white/55">Broadcast message</span> : null}
                        </div>
                      );
                    }) : (
                      <div className="py-6 text-center text-sm text-white/38">No messages yet.</div>
                    )}
                  </div>
                </div>

                <div className="border-t border-white/[0.08] bg-[#1c1b1b] p-4">
                  {chatError ? <div className="mb-3 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-[#f3b4c1]">{chatError}</div> : null}
                  <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0f0f0f] px-3 py-2">
                    <input
                      className="min-w-0 flex-1 bg-transparent py-2 text-[0.95rem] text-white outline-none placeholder:text-white/35"
                      placeholder="Type a message..."
                      value={chatDraft}
                      onChange={event => setChatDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleSendChatMessage();
                        }
                      }}
                    />
                    <button className="text-primary transition hover:text-indigo-300 disabled:cursor-default disabled:opacity-40" disabled={!chatConnected || !chatDraft.trim()} onClick={handleSendChatMessage} type="button">
                      <SendInlineIcon />
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <p className="mt-8 text-center text-sm font-medium tracking-[0.02em] text-white/30">
            {screenSharing ? 'Screen sharing is active for this session.' : 'Session is being recorded for academic integrity.'}
          </p>

          <div className="mt-4 text-center">
            <button
              className="text-sm text-white/45 transition hover:text-white/70 disabled:cursor-default disabled:opacity-60"
              disabled={isLeaving}
              onClick={leaveRoom}
              type="button"
            >
              {isLeaving ? 'Leaving session...' : 'Leave session'}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function MicInlineIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4a2 2 0 0 1 2 2v6a2 2 0 1 1-4 0V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MicOffInlineIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.8 15.8A5.46 5.46 0 0 1 12 17a5.5 5.5 0 0 1-5.5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 4a2 2 0 0 1 2 2v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.8 9.8V12a2 2 0 0 0 2.83 1.82" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CameraInlineIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 8h-9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m17 11 3-2v8l-3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraOffInlineIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 8h-1.5M4.8 4.8 19.2 19.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.7 8H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h9a2 2 0 0 0 1.17-.38" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m17 11 3-2v8l-3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 18H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4 4v-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5.5" width="17" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 19v-3M8.5 19h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m9 10 3-3 3 3M12 7v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopScreenIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5.5" width="17" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 19v-3M8.5 19h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="9" y="8.5" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendInlineIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 20 20 12 4 4l3 8-3 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default StudentPage;
