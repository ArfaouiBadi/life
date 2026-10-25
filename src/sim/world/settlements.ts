export interface SettlementDef {
  code: string;
  name: string;
  featureName: string;
  lat: number;
  lon: number; // east positive
  foundedYear: number;
  domes: string[];
  blurb: string;
}

// Real (approximate) Mars locations.
export const SETTLEMENTS: SettlementDef[] = [
  {
    code: "JZR",
    name: "New Jezero",
    featureName: "Jezero Crater",
    lat: 18.38,
    lon: 77.58,
    foundedYear: 2049,
    domes: ["Aurora", "Delta", "Neretva", "Isidis"],
    blurb: "Built beside an ancient river delta. The science capital.",
  },
  {
    code: "UTP",
    name: "Utopia Station",
    featureName: "Utopia Planitia",
    lat: 49.7,
    lon: 118.0,
    foundedYear: 2052,
    domes: ["Zhurong", "Viking", "Boreal"],
    blurb: "Shallow ground ice for water.",
  },
  {
    code: "ARC",
    name: "Arcadia Reach",
    featureName: "Arcadia Planitia",
    lat: 46.7,
    lon: -162.1,
    foundedYear: 2054,
    domes: ["Rime", "Frost", "Tundra", "Cirrus"],
    blurb: "Ice-rich plains. Supplies water to the other settlements.",
  },
  {
    code: "GLE",
    name: "Gale Terrace",
    featureName: "Gale Crater",
    lat: -5.4,
    lon: 137.8,
    foundedYear: 2056,
    domes: ["Sharp", "Bradbury", "Aeolis"],
    blurb: "Equatorial sun and milder temperatures.",
  },
  {
    code: "ELY",
    name: "Elysium Gate",
    featureName: "Elysium Planitia",
    lat: 3.0,
    lon: 154.7,
    foundedYear: 2058,
    domes: ["InSight", "Cerberus", "Athabasca"],
    blurb: "Flat plains for landing. The cargo port.",
  },
];

/** The fleet size the pitch and the launch film use. */
export const TOTAL_HOMES = 452;

export const FRAME_W = 4000;
export const FRAME_H = 2600;

export const HERO = {
  settlement: "JZR",
  dome: "Aurora",
  domeHomes: 30,
  homeIndex: 14,
  household: "Trabelsi",
  occupants: [
    { name: "Amira Trabelsi", age: 41, homeowner: true, bed: "BED1" },
    { name: "Sami Trabelsi", age: 43, homeowner: false, bed: "BED1" },
    { name: "Nour Trabelsi", age: 12, homeowner: false, bed: "KIDS" },
    { name: "Youssef Trabelsi", age: 8, homeowner: false, bed: "BED2" },
  ],
} as const;
