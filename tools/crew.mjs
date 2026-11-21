#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
// Assigns crew to ships without editing any file by hand.
//
//   crew                                   show the roster
//   crew assign vega school-of-sardeenz    Vega joins the ship (captain if it has no crew yet)
//   crew assign vega school-of-sardeenz --as cpt     ...as captain; the others move down a seat
//   crew assign vega to school-of-sardeenz as captain   the same, said in words
//   crew unassign vega                     Vega leaves her ship
//   crew ship school-of-sardeenz --name "School of Sardeenz" --color "#7BE0A0"
//   crew ship demo-lab --remove            forget a ship (its space still shows, unnamed)
//   crew sync                              rewrite the installed roster from your roster file
//
// A ship is a Herdr space, named as the space is (the app follows a renamed space; --name
// sets a different name to display). A crew member serves on one
// ship at a time, so assigning moves them.
//
// Your roster is kept in <Herdr home>/cockpit-roster.json, outside the mod, so
// reinstalling the cockpit keeps it. Each change also rewrites
// <Herdr home>/mods/cockpit/roster.js, which is what the mod reads.

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(realpathSync(fileURLToPath(import.meta.url))), "..");
const home = process.env.HERDR_APP_HOME || join(homedir(), ".config", "herdr-app");
const rosterFile = join(home, "cockpit-roster.json");
const installed = join(home, "mods", "cockpit");

const fail = (msg) => {
  console.error(`crew: ${msg}`);
  process.exit(1);
};

// The crew that exist and the default roster come from the mod itself: the
// installed copy when there is one, so a crew member added there is known here.
const modDir = existsSync(join(installed, "fleet.js")) ? installed : join(repo, "mods", "cockpit");
let mod;
try {
  mod = await import(pathToFileURL(join(modDir, "fleet.js")).href);
} catch (e) {
  fail(`cannot load ${join(modDir, "fleet.js")} (${e.message}). This tool needs Node 22.7 or newer.`);
}
const { CREW, RANKS, autoColor } = mod;

function load() {
  if (!existsSync(rosterFile)) return structuredClone(mod.SHIPS);
  try {
    const ships = JSON.parse(readFileSync(rosterFile, "utf8")).ships;
    if (!ships || typeof ships !== "object") throw new Error("no \"ships\" object");
    return ships;
  } catch (e) {
    fail(`${rosterFile} is not readable (${e.message}). Fix or delete it.`);
  }
}

function save(ships) {
  if (!existsSync(home)) fail(`Herdr home not found at ${home}. Start Herdr once, or set HERDR_APP_HOME.`);
  writeFileSync(rosterFile, `${JSON.stringify({ ships }, null, 2)}\n`);
  if (!existsSync(installed)) {
    console.log(`Saved to ${rosterFile}. The cockpit mod is not installed yet: run tools/install.sh and it will pick this up.`);
    return;
  }
  const lines = Object.entries(ships).map(([key, s]) => `  ${JSON.stringify(key)}: ${JSON.stringify(s)}`);
  writeFileSync(join(installed, "roster.js"),
    `// Written by the cockpit's crew tool from ${rosterFile}.\n// Change it with that tool: edits made here are lost on the next change.\n\nexport const SHIPS = {\n${lines.join(",\n")}\n};\n`);
}

function show(ships) {
  const seated = new Set();
  for (const [key, s] of Object.entries(ships)) {
    console.log(`${s.name}${s.name.toLowerCase() === key ? "" : `  (space: ${key})`}  ${s.color}`);
    if (!s.crew.length) console.log("    no crew");
    s.crew.forEach((id, i) => {
      seated.add(id);
      const rank = s.crew.length > 1 ? RANKS[i] ?? "" : "Cpt.";
      console.log(`    ${(CREW[id]?.name ?? `${id} (unknown)`).padEnd(10)} ${rank}`);
    });
  }
  const free = Object.keys(CREW).filter((id) => !seated.has(id)).map((id) => CREW[id].name);
  console.log(`\nUnassigned: ${free.length ? free.join(", ") : "none"}`);
}

const crewId = (word) => {
  const w = String(word ?? "").toLowerCase();
  const id = Object.keys(CREW).find((k) => k === w || CREW[k].name.toLowerCase() === w);
  if (!id) fail(`no crew member called "${word}". Known: ${Object.values(CREW).map((c) => c.name).join(", ")}.`);
  return id;
};

const SEATS = { cpt: 0, captain: 0, 1: 0, lt: 1, lieutenant: 1, 2: 1, ens: 2, ensign: 2, 3: 2 };
const seat = (word) => {
  const k = String(word).toLowerCase().replace(/\.$/, "");
  if (!(k in SEATS)) fail(`unknown rank "${word}". Use cpt, lt or ens.`);
  return SEATS[k];
};

const color = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : fail(`"${c}" is not a color like #7BE0A0.`));

// Options, then plain words with the filler of a spoken sentence dropped.
const args = process.argv.slice(2);
const opt = {};
const words = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--remove") opt.remove = true;
  else if (a === "-h" || a === "--help") opt.help = true;
  else if (a.startsWith("--")) {
    if (i + 1 >= args.length) fail(`${a} needs a value.`);
    opt[a.slice(2)] = args[++i];
  } else words.push(a);
}
const [command = "list", ...rest] = words;

if (opt.help || command === "help") {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(text.slice(1, text.findIndex((l) => !l.startsWith("//") && !l.startsWith("#!"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}

const ships = load();
const unseat = (id) => {
  for (const s of Object.values(ships)) s.crew = s.crew.filter((c) => c !== id);
};

if (command === "list") {
  show(ships);
} else if (command === "assign") {
  // "vega to school-of-sardeenz as captain" or "vega school-of-sardeenz cpt"
  const plain = rest.filter((w, i) => !(["to", "the", "of"].includes(w.toLowerCase()) && i > 0));
  const as = plain.findIndex((w) => w.toLowerCase() === "as");
  let rank = opt.as;
  if (as >= 0) rank ??= plain.slice(as + 1).join(" ");
  const [who, where, third] = as >= 0 ? plain.slice(0, as) : plain;
  if (third && as < 0) rank ??= third;
  if (!who || !where) fail("usage: crew assign <crew> <ship> [--as cpt|lt|ens]");
  const id = crewId(who);
  const key = where.toLowerCase();
  unseat(id);
  const ship = (ships[key] ??= { name: where, color: autoColor(key), crew: [] });
  const at = rank === undefined ? ship.crew.length : Math.min(seat(rank), ship.crew.length);
  ship.crew.splice(at, 0, id);
  if (opt.name) ship.name = opt.name;
  if (opt.color) ship.color = color(opt.color);
  save(ships);
  const title = ship.crew.length > 1 ? ` (${RANKS[at] ?? `seat ${at + 1}`})` : ", captain";
  console.log(`${CREW[id].name} now serves on ${ship.name}${title}.\n`);
  show(ships);
} else if (command === "unassign") {
  if (!rest[0]) fail("usage: crew unassign <crew>");
  const id = crewId(rest[0]);
  unseat(id);
  save(ships);
  console.log(`${CREW[id].name} is unassigned.\n`);
  show(ships);
} else if (command === "ship") {
  if (!rest[0]) fail("usage: crew ship <ship> [--name <name>] [--color <#rrggbb>] [--remove]");
  const key = rest[0].toLowerCase();
  if (opt.remove) {
    if (!ships[key]) fail(`no ship "${rest[0]}" in the roster.`);
    delete ships[key];
  } else {
    const ship = (ships[key] ??= { name: rest[0], color: autoColor(key), crew: [] });
    if (opt.name) ship.name = opt.name;
    if (opt.color) ship.color = color(opt.color);
  }
  save(ships);
  show(ships);
} else if (command === "sync") {
  save(ships);
} else {
  fail(`unknown command "${command}". Try: crew --help`);
}
