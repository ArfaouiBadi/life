import type { HomeTemplate } from "@/api/contracts";

/**
 * Room rectangles of each floor-plan template (meters, origin top-left), for the mini mosaic on map
 * tiles. Static product knowledge; the twin uses the live HomeDetail geometry instead.
 */
export const MOSAIC: Record<HomeTemplate, { w: number; h: number; rooms: Record<string, [number, number, number, number]> }> = {
  FAMILY: {
    w: 16,
    h: 10,
    rooms: {
      BED1: [0, 0, 4, 4],
      BED2: [4, 0, 4, 4],
      KIDS: [8, 0, 4, 4],
      BATH: [12, 0, 4, 4],
      COR: [0, 4, 16, 1.5],
      LIV: [0, 5.5, 6, 4.5],
      KIT: [6, 5.5, 4, 4.5],
      SHL: [10, 5.5, 3, 4.5],
      UTL: [13, 5.5, 3, 4.5],
    },
  },
  POD: {
    w: 10,
    h: 6,
    rooms: { MAIN: [0, 0, 6, 6], BED: [6, 0, 4, 3.5], BATH: [6, 3.5, 2, 2.5], CORE: [8, 3.5, 2, 2.5] },
  },
};
