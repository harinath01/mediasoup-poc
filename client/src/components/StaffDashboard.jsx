import React, { useState } from 'react';

const placeholderAlerts = [
  { name: 'Elena G.', text: 'Tab switch detected', time: '10:42', tone: 'text-primary' },
  { name: 'Marcus R.', text: 'No face visible', time: '10:38', tone: 'text-amber-400' },
  { name: 'Chen Y.', text: 'Audio spike detected', time: '10:35', tone: 'text-muted' },
];

const placeholderQueue = [
  { initials: 'EG', name: 'Elena G.', status: 'Unread Message', accent: 'bg-primary/15 text-primary' },
  { initials: 'MR', name: 'Marcus R.', status: 'Flagged', accent: 'bg-white/5 text-white/75' },
];

function StaffDashboard({
  roomInfo,
  rooms,
  sidebarOpen,
  setSidebarOpen,
  messages,
  presence,
  chatDraft,
  setChatDraft,
  chatRecipient,
  setChatRecipient,
  chatConnected,
  chatError,
  sendChatMessage,
  tiles,
  tileVideoRefs,
  error,
  leaveRoom,
  toggleRemoteAudio,
  switchTileSource,
  viewMode,
  setViewMode,
  timeRemaining,
}) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const primaryTile = tiles[0] || null;
  const secondaryTiles = primaryTile ? tiles.slice(1) : tiles;
  const roomId = roomInfo.split(' | ')[0]?.replace('Room: ', '') || '';
  const roomStats = rooms.find(room => room.id === roomId);
  const studentCount = roomStats?.students || tiles.length || 0;

  return (
    <div className={`grid h-full gap-0 ${sidebarOpen ? 'xl:grid-cols-[minmax(0,1fr)_390px]' : 'grid-cols-1'}`}>
      <section className={`flex min-h-0 flex-col overflow-hidden border border-white/[0.05] bg-[#101016]/95 ${sidebarOpen ? 'rounded-l-xl' : 'rounded-xl'}`}>
        <DashboardHeader roomInfo={roomInfo} leaveRoom={leaveRoom} timeRemaining={timeRemaining} />
        <DashboardToolbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          studentCount={studentCount}
          setViewMode={setViewMode}
          viewMode={viewMode}
        />

        {error ? <div className="mx-6 mt-6 rounded border border-danger/20 bg-danger/10 px-3.5 py-3 text-[#f3b4c1]">{error}</div> : null}

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {viewMode === 'grid' ? (
            <GridView tiles={tiles} tileVideoRefs={tileVideoRefs} toggleRemoteAudio={toggleRemoteAudio} switchTileSource={switchTileSource} />
          ) : viewMode === 'compact' ? (
            <CompactView tiles={tiles} tileVideoRefs={tileVideoRefs} toggleRemoteAudio={toggleRemoteAudio} switchTileSource={switchTileSource} />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_360px]">
                <PrimaryFeedTile tile={primaryTile} tileVideoRefs={tileVideoRefs} toggleRemoteAudio={toggleRemoteAudio} switchTileSource={switchTileSource} />
                <SecondaryFeedStack tiles={secondaryTiles.slice(0, 2)} tileVideoRefs={tileVideoRefs} toggleRemoteAudio={toggleRemoteAudio} switchTileSource={switchTileSource} />
              </div>
              <FeedGrid tiles={secondaryTiles.slice(2)} tileVideoRefs={tileVideoRefs} toggleRemoteAudio={toggleRemoteAudio} switchTileSource={switchTileSource} />
            </>
          )}
        </div>
      </section>

      <aside className={`${sidebarOpen ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-r-xl border-y border-r border-white/[0.05] bg-[#16161f]/98`}>
        <AlertsPanel isOpen={alertsOpen} setIsOpen={setAlertsOpen} />
        <PriorityQueuePanel isOpen={queueOpen} setIsOpen={setQueueOpen} />
        <ChatPanel
          chatConnected={chatConnected}
          chatDraft={chatDraft}
          chatError={chatError}
          chatRecipient={chatRecipient}
          messages={messages}
          presence={presence}
          sendChatMessage={sendChatMessage}
          setChatDraft={setChatDraft}
          setChatRecipient={setChatRecipient}
        />
      </aside>
    </div>
  );
}

function DashboardHeader({ roomInfo, leaveRoom, timeRemaining }) {
  return (
    <div className="flex flex-col gap-5 border-b border-white/[0.05] px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldIcon />
          </div>
          <div className="text-[1.15rem] font-bold tracking-[-0.03em]">ProctorLive</div>
        </div>
        <div className="hidden h-8 w-px bg-white/10 xl:block" />
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">Session Room</div>
          <div className="mt-1 text-[1.05rem] font-semibold tracking-[-0.02em] text-white/90">
            {roomInfo.replace('Room: ', '').replace(' | Staff: ', ' • ')}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="rounded-lg bg-white/[0.06] px-6 py-3 text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Time Remaining</div>
          <div className="mt-1 font-mono text-[2rem] font-bold tracking-[0.08em] text-white">{timeRemaining}</div>
        </div>
        <button
          className="rounded-xl bg-[#ff6d70] px-6 py-3 text-base font-bold text-white shadow-[0_10px_24px_rgba(255,109,112,0.18)] transition hover:bg-[#ff7f81]"
          onClick={leaveRoom}
          type="button"
        >
          End Session
        </button>
      </div>
    </div>
  );
}

function DashboardToolbar({ studentCount, viewMode, setViewMode, sidebarOpen, setSidebarOpen }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-4">
      <div className="flex items-center gap-5">
        <div className="inline-flex rounded-xl bg-white/[0.06] p-1">
          <button
            className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${viewMode === 'grid' ? 'bg-primary text-white shadow-action' : 'text-white/45'}`}
            onClick={() => setViewMode('grid')}
            type="button"
          >
            <GridIcon />
          </button>
          <button
            className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${viewMode === 'spotlight' ? 'bg-primary text-white shadow-action' : 'text-white/45'}`}
            onClick={() => setViewMode('spotlight')}
            type="button"
          >
            <PanelIcon />
          </button>
          <button
            className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${viewMode === 'compact' ? 'bg-primary text-white shadow-action' : 'text-white/45'}`}
            onClick={() => setViewMode('compact')}
            type="button"
          >
            <CompactGridIcon />
          </button>
        </div>
        <div className="text-lg text-white/75">Viewing {studentCount} Students</div>
      </div>
      <button
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-white/[0.05] hover:text-white ${sidebarOpen ? 'text-white' : 'bg-primary text-white shadow-action'}`}
        onClick={() => setSidebarOpen(current => !current)}
        type="button"
      >
        <SidebarIcon />
      </button>
    </div>
  );
}

function PrimaryFeedTile({ tile, tileVideoRefs, toggleRemoteAudio, switchTileSource }) {
  if (!tile) {
    return <div className="flex aspect-[1.6/1] items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.03] text-white/35">Waiting for student feeds</div>;
  }

  return (
    <article className="relative aspect-[1.6/1] overflow-hidden rounded-2xl border border-white/[0.05] bg-transparent">
      <video
        autoPlay
        playsInline
        className="h-full w-full object-cover"
        ref={node => {
          if (node) {
            tileVideoRefs.current.set(tile.studentName, node);
            if (node.srcObject !== tile.stream) node.srcObject = tile.stream;
            node.muted = !tile.audioEnabled;
            node.volume = tile.audioEnabled ? 1 : 0;
          } else {
            tileVideoRefs.current.delete(tile.studentName);
          }
        }}
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/85 via-black/25 to-transparent px-5 pb-5 pt-16">
        <div>
          <div className="text-[2.1rem] font-bold tracking-[-0.03em] text-white">{tile.studentName}</div>
          <div className="mt-3">
            <SourceSelector tile={tile} switchTileSource={switchTileSource} />
          </div>
        </div>
        <AudioToggleButton audioEnabled={tile.audioEnabled} onClick={() => toggleRemoteAudio(tile.studentName)} size="lg" />
      </div>
    </article>
  );
}

function SecondaryFeedStack({ tiles, tileVideoRefs, toggleRemoteAudio, switchTileSource }) {
  return (
    <div className="grid gap-4">
      {tiles.map((tile, index) => (
        <article className={`relative aspect-[1.6/1] overflow-hidden rounded-2xl border bg-transparent ${index === 0 ? 'border-primary shadow-[0_0_0_2px_rgba(104,103,240,0.35)]' : 'border-white/[0.05]'}`} key={tile.studentName}>
          <video
            autoPlay
            playsInline
            className="h-full w-full object-cover"
            ref={node => {
              if (node) {
                tileVideoRefs.current.set(tile.studentName, node);
                if (node.srcObject !== tile.stream) node.srcObject = tile.stream;
                node.muted = !tile.audioEnabled;
                node.volume = tile.audioEnabled ? 1 : 0;
              } else {
                tileVideoRefs.current.delete(tile.studentName);
              }
            }}
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-[0.95rem] font-bold text-white">
                <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-emerald-400' : 'bg-white/20'}`} />
                <span>{tile.studentName}</span>
              </div>
              <SourceSelector tile={tile} switchTileSource={switchTileSource} compact />
            </div>
            <AudioToggleButton audioEnabled={tile.audioEnabled} onClick={() => toggleRemoteAudio(tile.studentName)} />
          </div>
        </article>
      ))}
    </div>
  );
}

function FeedGrid({ tiles, tileVideoRefs, toggleRemoteAudio, switchTileSource }) {
  if (!tiles.length) return null;

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tiles.map(tile => (
        <article className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-transparent" key={tile.studentName}>
          <video
            autoPlay
            playsInline
            className="aspect-[1.32/1] w-full object-cover"
            ref={node => {
              if (node) {
                tileVideoRefs.current.set(tile.studentName, node);
                if (node.srcObject !== tile.stream) node.srcObject = tile.stream;
                node.muted = !tile.audioEnabled;
                node.volume = tile.audioEnabled ? 1 : 0;
              } else {
                tileVideoRefs.current.delete(tile.studentName);
              }
            }}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-10">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-bold text-white">{tile.studentName}</div>
              <SourceSelector tile={tile} switchTileSource={switchTileSource} />
              <AudioToggleButton audioEnabled={tile.audioEnabled} onClick={() => toggleRemoteAudio(tile.studentName)} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function GridView({ tiles, tileVideoRefs, toggleRemoteAudio, switchTileSource }) {
  if (!tiles.length) {
    return <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.03] text-white/35">Waiting for student feeds</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {tiles.map(tile => (
        <article className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-transparent" key={tile.studentName}>
          <video
            autoPlay
            playsInline
            className="aspect-[1.32/1] w-full object-cover"
            ref={node => {
              if (node) {
                tileVideoRefs.current.set(tile.studentName, node);
                if (node.srcObject !== tile.stream) node.srcObject = tile.stream;
                node.muted = !tile.audioEnabled;
                node.volume = tile.audioEnabled ? 1 : 0;
              } else {
                tileVideoRefs.current.delete(tile.studentName);
              }
            }}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-10">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-bold text-white">{tile.studentName}</div>
              <SourceSelector tile={tile} switchTileSource={switchTileSource} />
              <AudioToggleButton audioEnabled={tile.audioEnabled} onClick={() => toggleRemoteAudio(tile.studentName)} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function CompactView({ tiles, tileVideoRefs, toggleRemoteAudio, switchTileSource }) {
  if (!tiles.length) {
    return <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.03] text-white/35">Waiting for student feeds</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-4">
      {tiles.map(tile => (
        <article className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-transparent" key={tile.studentName}>
          <video
            autoPlay
            playsInline
            className="aspect-video w-full object-cover"
            ref={node => {
              if (node) {
                tileVideoRefs.current.set(tile.studentName, node);
                if (node.srcObject !== tile.stream) node.srcObject = tile.stream;
                node.muted = !tile.audioEnabled;
                node.volume = tile.audioEnabled ? 1 : 0;
              } else {
                tileVideoRefs.current.delete(tile.studentName);
              }
            }}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/52 to-transparent px-3 pb-2.5 pt-8">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-bold text-white">{tile.studentName}</div>
              <SourceSelector tile={tile} switchTileSource={switchTileSource} compact />
              <AudioToggleButton audioEnabled={tile.audioEnabled} onClick={() => toggleRemoteAudio(tile.studentName)} compact />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function SourceSelector({ tile, switchTileSource, compact = false }) {
  const options = ['camera', 'screen'];

  return (
    <div className={`inline-flex items-center rounded-full border border-white/10 bg-black/45 p-[3px] backdrop-blur-md ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {options.map(sourceType => {
        const available = tile.availableSourceTypes.includes(sourceType);
        return (
        <button
          className={`rounded-full px-2.5 py-1 font-semibold transition ${
            compact ? 'text-[9px]' : 'text-[10px]'
          } ${
            tile.activeSourceType === sourceType
              ? 'bg-white text-[#11131a] shadow-[0_1px_8px_rgba(0,0,0,0.25)]'
              : available
                ? 'text-white/70 hover:bg-white/10 hover:text-white'
                : 'cursor-not-allowed text-white/20'
          }`}
          disabled={!available}
          key={sourceType}
          onClick={() => switchTileSource(tile.studentName, sourceType)}
          type="button"
        >
          {sourceType === 'screen' ? 'Screen' : 'Cam'}
        </button>
      );})}
    </div>
  );
}

function AudioToggleButton({ audioEnabled, onClick, size = 'md', compact = false }) {
  const buttonSize = size === 'lg' ? 'h-14 w-14' : compact ? 'h-9 w-9' : 'h-10 w-10';
  const iconSize = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  const label = audioEnabled ? 'Mute user audio' : 'Unmute user audio';

  return (
    <button
      aria-label={label}
      className={`inline-flex ${buttonSize} items-center justify-center rounded-full border border-white/10 backdrop-blur-sm transition ${
        audioEnabled ? 'bg-primary/24 text-white hover:bg-primary/32' : 'bg-black/60 text-white/88 hover:bg-black/75 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {audioEnabled ? <VolumeIcon className={iconSize} /> : <MuteIcon className={iconSize} />}
    </button>
  );
}

function AlertsPanel({ isOpen, setIsOpen }) {
  return (
    <section className="border-b border-white/[0.05]">
      <div className="flex items-center justify-between px-6 py-5">
        <button className="flex items-center gap-3" onClick={() => setIsOpen(current => !current)} type="button">
          <ChevronDownIcon className={isOpen ? '' : '-rotate-90'} />
          <h3 className="text-[0.88rem] font-bold uppercase tracking-[0.12em] text-white/70">Recent Alerts</h3>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#4a2a33] px-2 text-sm font-bold text-[#ff8386]">3</span>
        </button>
      </div>
      <div className={`${isOpen ? 'block' : 'hidden'} space-y-8 px-6 pb-8`}>
        {placeholderAlerts.map(alert => (
          <div key={`${alert.name}-${alert.time}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="text-[1rem] font-bold text-white">{alert.name}</div>
              <div className="text-sm text-white/35">{alert.time}</div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[0.95rem] text-white/70">
              <span className={alert.tone}><AlertIcon /></span>
              <span>{alert.text}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriorityQueuePanel({ isOpen, setIsOpen }) {
  return (
    <section className="border-b border-white/[0.05]">
      <div className="flex items-center justify-between px-6 py-5">
        <button className="flex items-center gap-3" onClick={() => setIsOpen(current => !current)} type="button">
          <ChevronDownIcon className={isOpen ? '' : '-rotate-90'} />
          <h3 className="text-[0.88rem] font-bold uppercase tracking-[0.12em] text-white/70">Priority Queue</h3>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/25 px-2 text-sm font-bold text-primary">2</span>
        </button>
        <FilterIcon />
      </div>
      <div className={`${isOpen ? 'block' : 'hidden'} pb-6`}>
        {placeholderQueue.map((item, index) => (
          <div className={`flex items-center gap-4 px-6 py-3 ${index === 0 ? 'border-l-4 border-primary bg-primary/10' : ''}`} key={item.name}>
            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-bold ${item.accent}`}>{item.initials}</div>
            <div>
              <div className="text-[1rem] font-bold text-white">{item.name}</div>
              <div className={`mt-1 text-sm font-bold uppercase ${index === 0 ? 'text-primary' : 'text-amber-400'}`}>{item.status}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChatPanel({ messages, presence, chatDraft, setChatDraft, chatRecipient, setChatRecipient, chatConnected, chatError, sendChatMessage }) {
  const visibleMessages = messages.filter(message => {
    if (chatRecipient === 'all') {
      return message.recipientMode === 'all';
    }

    if (message.senderRole === 'student') {
      return message.senderName === chatRecipient;
    }

    return message.recipientMode === 'student' && message.recipientName === chatRecipient;
  });

  return (
    <section className="min-h-0 flex flex-1 flex-col">
      <div className="px-6 py-5">
        <div className="flex items-center gap-3 text-[0.88rem] font-bold uppercase tracking-[0.12em] text-white/70">
          <span>Room Chat</span>
          <span className="rounded-md bg-primary/20 px-3 py-1 text-primary">{presence.students.length} Students</span>
        </div>
        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">Send To</div>
          <div className="flex flex-wrap gap-2">
            <ChatTargetButton active={chatRecipient === 'all'} label="Broadcast" onClick={() => setChatRecipient('all')} />
            {presence.students.map(studentName => (
              <ChatTargetButton
                key={studentName}
                active={chatRecipient === studentName}
                label={studentName}
                onClick={() => setChatRecipient(studentName)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6">
        <div className="space-y-5 pb-6">
          {visibleMessages.length ? visibleMessages.map(message => {
            const ownMessage = message.senderRole === 'staff';
            return (
              <div className={ownMessage ? 'ml-10 rounded-2xl bg-primary px-4 py-4 text-white shadow-action' : 'rounded-2xl bg-white/[0.12] px-4 py-4 text-white/90'} key={message.id}>
                <div className={`text-xs font-bold uppercase tracking-[0.08em] ${ownMessage ? 'text-white/65' : 'text-white/50'}`}>{ownMessage ? 'You' : `${message.senderName} (${message.senderRole})`}</div>
                <p className="mt-3 text-[1.05rem] leading-8">{message.text}</p>
                {message.senderRole === 'staff' ? (
                  <div className={`mt-3 text-[11px] font-bold uppercase tracking-[0.08em] ${ownMessage ? 'text-white/70' : 'text-primary/80'}`}>
                    {message.recipientMode === 'all' ? 'Broadcast' : `Direct to ${message.recipientName}`}
                  </div>
                ) : null}
              </div>
            );
          }) : <div className="rounded-2xl border border-white/[0.05] bg-white/[0.03] px-4 py-5 text-sm text-white/42">No messages for this view yet.</div>}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-white/[0.05] bg-[#16161f]/98 px-6 py-4">
        {chatError ? <div className="mb-3 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-[#f3b4c1]">{chatError}</div> : null}
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#101018] p-3">
          <input
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-lg text-white outline-none placeholder:text-white/28"
            placeholder={chatRecipient === 'all' ? 'Broadcast to room...' : `Message ${chatRecipient}...`}
            value={chatDraft}
            onChange={event => setChatDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                sendChatMessage();
              }
            }}
          />
          <button className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white shadow-action disabled:cursor-default disabled:opacity-40" disabled={!chatConnected || !chatDraft.trim()} onClick={sendChatMessage} type="button"><SendIcon /></button>
        </div>
      </div>
    </section>
  );
}

function ShieldIcon() { return <svg className="h-6 w-6" viewBox="-4 -2 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M2 4.386V8a9.02 9.02 0 0 0 3.08 6.787L8 17.342l2.92-2.555A9.019 9.019 0 0 0 14 8V4.386l-6-2.25-6 2.25zM.649 2.756L8 0l7.351 2.757a1 1 0 0 1 .649.936V8c0 3.177-1.372 6.2-3.763 8.293L8 20l-4.237-3.707A11.019 11.019 0 0 1 0 8V3.693a1 1 0 0 1 .649-.936z" /></svg>; }
function GridIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke="currentColor" strokeWidth="1.6" /></svg>; }
function PanelIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="16" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="4" width="6" height="6" stroke="currentColor" strokeWidth="1.6" /><rect x="14" y="14" width="6" height="6" stroke="currentColor" strokeWidth="1.6" /></svg>; }
function CompactGridIcon() { return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="5" height="5" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="5" width="5" height="5" stroke="currentColor" strokeWidth="1.6" /><rect x="16" y="5" width="4" height="5" stroke="currentColor" strokeWidth="1.6" /><rect x="4" y="12" width="5" height="7" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="12" width="5" height="7" stroke="currentColor" strokeWidth="1.6" /><rect x="16" y="12" width="4" height="7" stroke="currentColor" strokeWidth="1.6" /></svg>; }
function SidebarIcon() { return <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M9 4v16" stroke="currentColor" strokeWidth="1.6" /></svg>; }
function MuteIcon({ className = 'h-6 w-6' }) { return <svg className={className} viewBox="0 0 24 24" fill="none"><path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M14 9.5V6a2 2 0 1 0-4 0v2.2M9.9 13.9A2 2 0 0 0 14 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M6.5 11.5A5.5 5.5 0 0 0 12 17a5.47 5.47 0 0 0 3.8-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function VolumeIcon({ className = 'h-6 w-6' }) { return <svg className={className} viewBox="0 0 24 24" fill="none"><path d="M3 10h4l5-4v12l-5-4H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function ChevronDownIcon({ className = '' }) { return <svg className={`h-4 w-4 text-white/60 transition ${className}`.trim()} viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function AlertIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M4 6h12v12H4zM16 10l4-2v8l-4-2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="m2 2 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>; }
function FilterIcon() { return <svg className="h-5 w-5 text-white/55" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function SendIcon() { return <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none"><path d="M4 20 20 12 4 4l3 8-3 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M7 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function ChatTargetButton({ active, label, onClick }) {
  return (
    <button
      className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
        active ? 'border-primary bg-primary text-white shadow-action' : 'border-white/[0.08] bg-white/[0.04] text-white/72 hover:bg-white/[0.08] hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export default StaffDashboard;
