import type { HomeTemplate, RoomType } from "@/api/contracts";

export interface RoomDef {
  code: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  lifeSupport?: boolean;
  shelter?: boolean;
}

export interface HatchDef {
  code: string;
  a: string;
  b: string | null; // null = outside
  x: number;
  y: number;
  orientation: "H" | "V"; // H = the hatch sits in a horizontal wall
  sealed?: boolean;
}

export interface TemplateDef {
  widthM: number;
  depthM: number; // footprint incl. airlock
  rooms: RoomDef[];
  hatches: HatchDef[];
}

const FAMILY: TemplateDef = {
  widthM: 16,
  depthM: 12,
  rooms: [
    { code: "BED1", name: "Bedroom 1", type: "BEDROOM", x: 0, y: 0, w: 4, h: 4 },
    { code: "BED2", name: "Bedroom 2", type: "BEDROOM", x: 4, y: 0, w: 4, h: 4 },
    { code: "KIDS", name: "Kids' room", type: "BEDROOM", x: 8, y: 0, w: 4, h: 4 },
    { code: "BATH", name: "Bathroom", type: "BATH", x: 12, y: 0, w: 4, h: 4 },
    { code: "COR", name: "Corridor", type: "CORRIDOR", x: 0, y: 4, w: 16, h: 1.5 },
    { code: "LIV", name: "Living room", type: "LIVING", x: 0, y: 5.5, w: 6, h: 4.5 },
    { code: "KIT", name: "Kitchen", type: "KITCHEN", x: 6, y: 5.5, w: 4, h: 4.5 },
    { code: "SHL", name: "Storm shelter", type: "SAFE_ROOM", x: 10, y: 5.5, w: 3, h: 4.5, shelter: true },
    { code: "UTL", name: "Utility", type: "UTILITY", x: 13, y: 5.5, w: 3, h: 4.5, lifeSupport: true },
    { code: "AIR", name: "Airlock", type: "AIRLOCK", x: 1, y: 10, w: 2.5, h: 2 },
  ],
  // Hatches at the midpoint of each shared wall.
  hatches: [
    { code: "H-BED1", a: "BED1", b: "COR", x: 2, y: 4, orientation: "H" },
    { code: "H-BED2", a: "BED2", b: "COR", x: 6, y: 4, orientation: "H" },
    { code: "H-KIDS", a: "KIDS", b: "COR", x: 10, y: 4, orientation: "H" },
    { code: "H-BATH", a: "BATH", b: "COR", x: 14, y: 4, orientation: "H" },
    { code: "H-LIV", a: "LIV", b: "COR", x: 3, y: 5.5, orientation: "H" },
    { code: "H-KIT", a: "KIT", b: "COR", x: 8, y: 5.5, orientation: "H" },
    { code: "H-SHL", a: "SHL", b: "COR", x: 11.5, y: 5.5, orientation: "H" },
    { code: "H-UTL", a: "UTL", b: "COR", x: 14.5, y: 5.5, orientation: "H" },
    { code: "H-LIVKIT", a: "LIV", b: "KIT", x: 6, y: 7.75, orientation: "V" },
    { code: "H-AIRIN", a: "AIR", b: "LIV", x: 2.25, y: 10, orientation: "H", sealed: true },
    { code: "H-AIROUT", a: "AIR", b: null, x: 2.25, y: 12, orientation: "H", sealed: true },
  ],
};

const POD: TemplateDef = {
  widthM: 10,
  depthM: 8,
  rooms: [
    { code: "MAIN", name: "Main room", type: "LIVING", x: 0, y: 0, w: 6, h: 6 },
    { code: "BED", name: "Bedroom", type: "BEDROOM", x: 6, y: 0, w: 4, h: 3.5 },
    { code: "BATH", name: "Bathroom", type: "BATH", x: 6, y: 3.5, w: 2, h: 2.5 },
    { code: "CORE", name: "Shelter core", type: "SAFE_ROOM", x: 8, y: 3.5, w: 2, h: 2.5, lifeSupport: true, shelter: true },
    { code: "AIR", name: "Airlock", type: "AIRLOCK", x: 1.5, y: 6, w: 2.5, h: 2 },
  ],
  hatches: [
    { code: "H-BED", a: "MAIN", b: "BED", x: 6, y: 1.75, orientation: "V" },
    { code: "H-BATH", a: "MAIN", b: "BATH", x: 6, y: 4.75, orientation: "V" },
    { code: "H-CORE", a: "BED", b: "CORE", x: 9, y: 3.5, orientation: "H" },
    { code: "H-AIRIN", a: "AIR", b: "MAIN", x: 2.75, y: 6, orientation: "H", sealed: true },
    { code: "H-AIROUT", a: "AIR", b: null, x: 2.75, y: 8, orientation: "H", sealed: true },
  ],
};

export const TEMPLATES: Record<HomeTemplate, TemplateDef> = { FAMILY, POD };

/** Where people go when told to leave a room. */
export const SAFE_GATHER: Record<HomeTemplate, string> = { FAMILY: "LIV", POD: "MAIN" };
export const SHELTER_ROOM: Record<HomeTemplate, string> = { FAMILY: "SHL", POD: "CORE" };
export const FIRE_ROOM: Record<HomeTemplate, string> = { FAMILY: "KIT", POD: "MAIN" };
