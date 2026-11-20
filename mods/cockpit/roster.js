// Which crew serve on which ship. This is the default roster; `tools/crew.mjs`
// writes your own over the installed copy of this file, so assign crew with
// that tool rather than editing here (see the README, "Your fleet").
//
// Keyed by the Herdr space name, lowercase. `crew` lists crew ids in rank order,
// captain first.

export const SHIPS = {
  "emauria": { "name": "Emauria", "color": "#4CC9F0", "crew": ["vega", "orrin"] },
  "ccbox": { "name": "ccbox", "color": "#F5A623", "crew": ["brass"] }
};
