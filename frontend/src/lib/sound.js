// Incoming-message notification sound. Synthesized with WebAudio so no audio
// asset is needed; honors the user's Settings → Message sound preference.

let audioContext = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  // Browsers start the context suspended until a user gesture; resume on play.
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(context, frequency, startAt, duration) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
}

// Soft two-tone "pop" for a new incoming message.
export function playMessageSound() {
  try {
    const context = getContext();
    if (!context) return;
    const now = context.currentTime;
    tone(context, 880, now, 0.12);
    tone(context, 1174.66, now + 0.1, 0.16);
  } catch {
    /* audio unavailable — never break messaging over a sound */
  }
}
