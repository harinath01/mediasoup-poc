const TELEMETRY_QUERY_PARAMETER = 'k6Telemetry';

export function installK6WebRtcTelemetry({ role, getTransport }) {
  if (!isK6TelemetryEnabled()) return () => {};

  const telemetry = async () => {
    const transport = getTransport();
    if (!transport) {
      return { role, ready: false, timestampMs: Date.now() };
    }

    const reports = Array.from((await transport.getStats()).values());
    const videoReports = reports.filter(report => isVideoRtpReport(report));
    const candidatePair = reports.find(report => report.type === 'candidate-pair' && report.nominated) ||
      reports.find(report => report.type === 'candidate-pair' && report.selected);

    const inbound = summarizeReports(videoReports.filter(report => report.type === 'inbound-rtp'), 'bytesReceived', 'framesDecoded');
    const outbound = summarizeReports(videoReports.filter(report => report.type === 'outbound-rtp'), 'bytesSent', 'framesEncoded');
    const remoteInbound = summarizeReports(videoReports.filter(report => report.type === 'remote-inbound-rtp'), null, null);
    const playback = summarizePlaybackQuality();

    return {
      role,
      ready: true,
      timestampMs: Date.now(),
      inbound,
      outbound,
      remoteInbound,
      candidatePairRttSeconds: numericOrNull(candidatePair?.currentRoundTripTime),
      renderedFrames: playback.totalVideoFrames,
    };
  };

  window.__k6WebRtcTelemetry = telemetry;

  return () => {
    if (window.__k6WebRtcTelemetry === telemetry) {
      delete window.__k6WebRtcTelemetry;
    }
  };
}

function isK6TelemetryEnabled() {
  return new URLSearchParams(window.location.search).get(TELEMETRY_QUERY_PARAMETER) === '1';
}

function isVideoRtpReport(report) {
  return (report.mediaType || report.kind) === 'video';
}

function summarizeReports(reports, byteField, frameField) {
  const summary = {
    bytes: byteField ? sumNumeric(reports, byteField) : null,
    frames: frameField ? sumNumeric(reports, frameField) : null,
    packetsLost: sumNumeric(reports, 'packetsLost'),
    jitterSeconds: averageNumeric(reports, 'jitter'),
    roundTripTimeSeconds: averageNumeric(reports, 'roundTripTime'),
    framesPerSecond: averageNumeric(reports, 'framesPerSecond'),
  };

  return summary;
}

function summarizePlaybackQuality() {
  return Array.from(document.querySelectorAll('video')).reduce(
    (total, video) => total + Number(video.getVideoPlaybackQuality?.().totalVideoFrames || 0),
    0
  );
}

function sumNumeric(reports, field) {
  const values = reports.map(report => numericOrNull(report[field])).filter(value => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function averageNumeric(reports, field) {
  const values = reports.map(report => numericOrNull(report[field])).filter(value => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function numericOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
