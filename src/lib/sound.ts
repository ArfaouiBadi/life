// Web Audio tones, no audio files. Browsers only allow audio after a user gesture;
// the click on the login screen calls unlockAudio().
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export const setMuted = (m: boolean) => void (muted = m);

function tone(freq: number, startS: number, durS: number, gain = 0.08) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startS;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.setValueAtTime(gain, t0 + durS - 0.03);
  g.gain.linearRampToValueAtTime(0, t0 + durS);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durS + 0.02);
}

/** Warning: one quiet 520 Hz tone, 120 ms. */
export const playWarning = () => tone(520, 0, 0.12, 0.05);

/** Critical: 880 then 660 Hz, 150 ms each, twice. */
export function playCritical() {
  [0, 0.15, 0.4, 0.55].forEach((t, i) => tone(i % 2 ? 660 : 880, t, 0.15));
}

/** Emergency uses the critical chime; the caller repeats it every 4 s until acknowledged. */
export const playEmergency = playCritical;
