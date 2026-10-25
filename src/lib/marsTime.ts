// Mars24 algorithm (NASA GISS).
export const SOL_S = 88775.244;
export const MARS_HOUR_S = SOL_S / 24; // 3,698.97 s

export function marsTime(date: Date) {
  const jdUT = date.getTime() / 86400000 + 2440587.5;
  const jdTT = jdUT + (37 + 32.184) / 86400; // TAI−UTC = 37 s (since 2017)
  const msd = (jdTT - 2405522.0028779) / 1.0274912517; // Mars Sol Date
  const mtcHours = (((msd % 1) + 1) % 1) * 24; // Coordinated Mars Time
  return { msd, sol: Math.floor(msd), mtcHours };
}

export function localMeanSolarTime(mtcHours: number, eastLonDeg: number) {
  return (((mtcHours + eastLonDeg / 15) % 24) + 24) % 24; // LMST in Mars hours
}

/** LMST of a settlement at a given instant. */
export const lmstAt = (ms: number, eastLonDeg: number) =>
  localMeanSolarTime(marsTime(new Date(ms)).mtcHours, eastLonDeg);

/** "14:06" from fractional Mars hours. */
export function formatMarsHours(h: number) {
  const totalMin = Math.floor(h * 60) % (24 * 60);
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
}

export const formatSol = (sol: number) => `Sol ${sol.toLocaleString("en-US")}`;

export const isNight = (lmst: number) => lmst >= 22 || lmst < 6;
