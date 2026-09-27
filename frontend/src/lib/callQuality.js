// Grades a WebRTC connection from RTCStats summaries (side-effect free,
// unit-tested with vitest).
//
// Thresholds (tuned for voice/video calls):
//   good: rtt <= 200ms, loss <= 3%, jitter <= 30ms
//   fair: rtt <= 400ms, loss <= 10%, jitter <= 50ms
//   poor: anything worse
export function gradeCallQuality({ rtt = null, lossRate = null, jitter = null } = {}) {
  const poor =
    (rtt != null && rtt > 0.4) ||
    (lossRate != null && lossRate > 0.1) ||
    (jitter != null && jitter > 0.05);
  if (poor) return "poor";
  const fair =
    (rtt != null && rtt > 0.2) ||
    (lossRate != null && lossRate > 0.03) ||
    (jitter != null && jitter > 0.03);
  if (fair) return "fair";
  return "good";
}
