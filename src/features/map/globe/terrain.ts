import { contours, geoDistance } from "d3";
import { createNoise3D } from "simplex-noise";
import { mulberry32 } from "@/lib/mulberry32";

// A rough Mars elevation model (km), shaped after MOLA: southern highlands, northern lowlands,
// the Tharsis bulge and its volcanoes, the big impact basins and Valles Marineris. Drawn as
// contour lines, like a printed survey chart. Visual only; nothing in the simulation uses it.

const rad = Math.PI / 180;
type Bump = { lon: number; lat: number; h: number; r: number };

const BUMPS: Bump[] = [
  { lon: -105, lat: 0, h: 5.5, r: 32 }, // Tharsis rise
  { lon: -134, lat: 18.6, h: 14, r: 4.5 }, // Olympus Mons
  { lon: -121, lat: -9, h: 9, r: 2.8 }, // Arsia Mons
  { lon: -113, lat: 1, h: 8, r: 2.6 }, // Pavonis Mons
  { lon: -104, lat: 11, h: 9, r: 2.8 }, // Ascraeus Mons
  { lon: -110, lat: 40, h: 2.5, r: 8 }, // Alba Mons
  { lon: 147, lat: 25, h: 4.5, r: 4 }, // Elysium Mons
  { lon: 147, lat: 22, h: 2, r: 14 }, // Elysium rise
  { lon: 70, lat: -42, h: -7, r: 17 }, // Hellas
  { lon: -43, lat: -50, h: -4, r: 10 }, // Argyre
  { lon: 88, lat: 13, h: -3.5, r: 8 }, // Isidis (Jezero sits on its western rim)
  { lon: 117, lat: 47, h: -2.2, r: 20 }, // Utopia
  { lon: 137.8, lat: -5.4, h: -2, r: 1.6 }, // Gale crater
];

export const NATURE_LABELS = [
  { name: "Olympus Mons", lon: -134, lat: 18.6 },
  { name: "Tharsis Montes", lon: -113, lat: -3 },
  { name: "Valles Marineris", lon: -70, lat: -12 },
  { name: "Hellas Planitia", lon: 70, lat: -42 },
  { name: "Argyre Planitia", lon: -43, lat: -50 },
  { name: "Isidis Planitia", lon: 88, lat: 10 },
  { name: "Acidalia Planitia", lon: -30, lat: 47 },
  { name: "Syrtis Major", lon: 69, lat: 9 },
];

const noise = createNoise3D(mulberry32(1976)); // Viking 1 landed in 1976

export function elevation(lon: number, lat: number): number {
  // Hemispheric dichotomy: a wavy boundary roughly along the equator, higher to the south.
  const boundary = 4 + 12 * Math.sin((lon + 30) * rad * 1.3) + 6 * Math.sin(lon * rad * 3.1);
  let e = 2.6 * Math.tanh((boundary - lat) / 14) - 0.6;
  for (const b of BUMPS) {
    const d = geoDistance([lon, lat], [b.lon, b.lat]) / rad;
    e += b.h * Math.exp(-(d * d) / (2 * b.r * b.r));
    if (b.h < -3) e += 1.2 * Math.exp(-((d - b.r * 1.7) ** 2) / (2 * (b.r * 0.35) ** 2)); // basin rim
  }
  // Valles Marineris: a trough east of Tharsis.
  if (lon > -100 && lon < -35) {
    const center = -8 - 4 * Math.sin(((lon + 100) / 65) * Math.PI);
    const w = Math.min(1, (lon + 100) / 10, (-35 - lon) / 10);
    e -= 4.5 * w * Math.exp(-((lat - center) ** 2) / (2 * 1.6 ** 2));
  }
  // Fractal roughness sampled on the unit sphere (no seam at ±180°).
  const x = Math.cos(lat * rad) * Math.cos(lon * rad);
  const y = Math.cos(lat * rad) * Math.sin(lon * rad);
  const z = Math.sin(lat * rad);
  let amp = 0.9;
  let f = 2.2;
  for (let o = 0; o < 4; o++) {
    e += amp * noise(x * f, y * f, z * f);
    amp *= 0.5;
    f *= 2.1;
  }
  return e;
}

export interface ContourLevel {
  value: number;
  major: boolean;
  geometry: GeoJSON.MultiLineString;
}

let cache: ContourLevel[] | null = null;

/** Contour lines in lon/lat, computed once on a 1.5° grid. */
export function marsContours(): ContourLevel[] {
  if (cache) return cache;
  const step = 1.5;
  const w = Math.round(360 / step) + 1; // includes +180, a copy of −180
  const h = Math.round(180 / step) + 1;
  const grid = new Float64Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[j * w + i] = elevation(-180 + i * step, 90 - j * step);
  const thresholds = [-6, -4, -2.5, -1, 0, 1, 2, 3, 4.5, 6, 8, 10, 13];
  const gen = contours().size([w, h]).thresholds(thresholds);
  // d3-contour closes rings along the grid border; drop those border runs so no fake meridians appear.
  const interior = ([x, y]: number[]) => x > 0.6 && x < w - 1.6 && y > 0.6 && y < h - 1.6;
  const toLonLat = ([x, y]: number[]) => [-180 + x * step, 90 - y * step] as [number, number];
  cache = gen(Array.from(grid)).map((c) => {
    const lines: [number, number][][] = [];
    for (const poly of c.coordinates)
      for (const ring of poly) {
        let run: [number, number][] = [];
        for (const p of ring) {
          if (interior(p)) run.push(toLonLat(p));
          else {
            if (run.length > 1) lines.push(run);
            run = [];
          }
        }
        if (run.length > 1) lines.push(run);
      }
    return {
      value: c.value,
      major: c.value === 0 || c.value === 4.5 || c.value === -4 || c.value === 10,
      geometry: { type: "MultiLineString", coordinates: lines },
    };
  });
  return cache;
}
