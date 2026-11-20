// The fleet roster: the one file to edit when projects or crew change.
//
// SHIPS is keyed by the Herdr space name, lowercase. A space that is not listed
// still shows up as a ship: it keeps its space name, gets a color from PALETTE,
// and its agents appear under their program name with a monogram instead of a
// portrait.
//
// `crew` lists crew ids in rank order (captain first). The first agent started
// in the space takes the first seat, the second agent the second seat. Seats
// without a running agent show as asleep.

export const SHIPS = {
  emauria: { name: "Emauria", color: "#4CC9F0", crew: ["vega", "orrin"] },
  ccbox: { name: "ccbox", color: "#F5A623", crew: ["brass"] },
};

// `portrait` is the file stem in mods/cockpit/crew/: <portrait>-base.png, 4:5.
export const CREW = {
  vega: { name: "Vega", portrait: "vega" },
  orrin: { name: "Orrin", portrait: "orrin" },
  brass: { name: "Brass", portrait: "brass" },
  nyx: { name: "Nyx", portrait: "nyx" }, // not assigned yet: add "nyx" to a ship's crew
};

// Colors for ships that are not listed above. They differ in lightness as well
// as hue, and avoid the cyan and amber already taken.
export const PALETTE = ["#B69CFF", "#7BE0A0", "#FF8FA3", "#E8E36B", "#6F8CFF", "#FFB38A", "#5FD4C4", "#D98BE8"];

export const RANKS = ["Cpt.", "Lt.", "Ens."];
