// The fleet: the crew that exist, and the colors and ranks ships draw from.
// Who serves where is in roster.js, which `tools/crew.mjs` writes.
//
// A space that is not in the roster still shows up as a ship: it keeps its
// space name, gets a color from PALETTE, and its agents appear under their
// program name with a monogram instead of a portrait.
//
// The first agent started in a space takes the ship's first seat (captain), the
// second agent the second seat. Seats without a running agent show as asleep.

export { SHIPS } from "./roster.js";

// Every crew member, assigned or not. `portrait` is the file stem in
// mods/cockpit/crew/: <portrait>-base.png, 4:5. Add an entry here when you
// recruit someone, then seat them with `tools/crew.mjs assign`.
export const CREW = {
  vega: { name: "Vega", portrait: "vega" },
  orrin: { name: "Orrin", portrait: "orrin" },
  brass: { name: "Brass", portrait: "brass" },
  nyx: { name: "Nyx", portrait: "nyx" },
};

// Colors for ships that have none of their own. They differ in lightness as
// well as hue, and avoid the cyan and amber already taken.
export const PALETTE = ["#B69CFF", "#7BE0A0", "#FF8FA3", "#E8E36B", "#6F8CFF", "#FFB38A", "#5FD4C4", "#D98BE8"];

export const RANKS = ["Cpt.", "Lt.", "Ens."];

export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The color a ship has before anyone picks one: stable for a given space name. */
export const autoColor = (key) => PALETTE[hash(key) % PALETTE.length];
