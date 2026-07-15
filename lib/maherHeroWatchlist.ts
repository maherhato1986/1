export const MAHER_HERO_WATCHLIST = [
  "TNDM", "ETOR", "JLHL", "EAH", "BBAR", "AMWL", "GMM", "JZXN", "IFBD", "CCC",
  "OPEN", "PYPL", "FIG", "TGHL", "KLXE", "IBKR", "HPE", "MCHP", "OXY", "LVS", "BKR", "VLO",
] as const;

export type MaherHeroSymbol = (typeof MAHER_HERO_WATCHLIST)[number];
