// Data for every role: ships (spaces), crew (agents), their state, the status
// files agents write, and the 1-8 control groups.

import { spaces, agents, panes, shared, setShared, readTextFile, writeTextFile, appHome, openOverlay, run, layout, terminals, exec } from "herdr";
import { SHIPS, CREW, RANKS, autoColor } from "./fleet.js";

export const STATUS_KEY = "cockpit.status"; // { [agent address]: status file content }
export const SHARED_KEY = "cockpit.sharedStatus"; // { [agent address]: when the status.json it shares with others was last written }
export const SLOTS_KEY = "cockpit.slots"; // { "1": agent address, ... }
export const ROSTER_KEY = "cockpit.roster"; // the ships of cockpit-roster.json, or unset for the default roster
const COLORS_KEY = "space.colors"; // Herdr's own: { [space id]: a theme color name or "#rrggbb" }
export const POSES_KEY = "cockpit.poses"; // { [portrait stem]: ["base", and the states that have a portrait of their own] }
export const ACTIVE_LAYOUT = "cockpit";
export const AMBIENT_LAYOUT = "cockpit-ambient";

/** "vps/t12" -> "t12": the address as the agent's own machine knows it. */
export const localAddress = (address) => String(address).split("/").pop();
const order = (address) => parseInt(localAddress(address).replace(/\D/g, ""), 10) || 0;

// ---------------------------------------------------------------- state

// Most urgent first. `label` is always shown next to the state's shape.
export const STATES = ["hailing", "done", "ci", "subagents", "thinking", "working", "idle", "asleep"];
export const LABEL = {
  hailing: "HAILING",
  done: "DONE",
  ci: "ON CI",
  subagents: "ON SUBAGENTS",
  thinking: "THINKING",
  working: "WORKING",
  idle: "STANDING BY",
  asleep: "ASLEEP",
};

/**
 * Herdr's own status (OSC 7501) decides blocked and done. The status file only
 * refines what Herdr reports as working or idle, which is where an agent that
 * waits on subagents or on CI would otherwise look idle.
 */
export function stateOf(agent, file) {
  if (!agent) return "asleep";
  if (agent.status === "blocked") return "hailing";
  if (agent.status === "done") return "done";
  const f = file?.state;
  if (f === "subagents" || f === "ci") return f;
  if (agent.status === "working") return f === "thinking" ? "thinking" : "working";
  if (f === "blocked") return "hailing";
  return "idle";
}

// ---------------------------------------------------------------- fleet

/**
 * A crew member's picture: the one of this state when crew/ has it, the base one otherwise,
 * and null (drawn as a monogram) for a recruit whose base portrait is not in crew/ yet.
 */
export function portraitOf(crew, state = "base") {
  if (!crew?.portrait) return null;
  const poses = shared(POSES_KEY) ?? {};
  // An empty listing is one that was not read yet, or could not be: CREW is trusted until it is.
  if (Object.keys(poses).length && !poses[crew.portrait]?.includes("base")) return null;
  return `mods/cockpit/crew/${crew.portrait}-${poses[crew.portrait]?.includes(state) ? state : "base"}.png`;
}

/** Every space as a ship with its members (running agents, then empty seats). */
export function fleet() {
  const all = agents().filter((a) => !a.parent);
  const files = shared(STATUS_KEY) ?? {};
  const sharedFiles = shared(SHARED_KEY) ?? {};
  const ships = roster();
  return spaces().map((sp) => {
    const key = String(sp.name ?? "").toLowerCase();
    const cfg = ships[key];
    const ship = {
      id: sp.id,
      key,
      // The roster records a name with every ship. It only counts when it was chosen (crew ship
      // --name), not when it is the space's name as it was spelled that day: a renamed space wins.
      name: cfg?.name && cfg.name.toLowerCase() !== key ? cfg.name : String(sp.name ?? "?"),
      color: cfg?.color ?? autoColor(key),
      space: sp,
      members: [],
    };
    const seats = cfg?.crew ?? [];
    const live = all.filter((a) => a.space === sp.id).sort((a, b) => order(a.address) - order(b.address));
    const n = Math.max(live.length, seats.length);
    for (let i = 0; i < n; i++) {
      const agent = live[i] ?? null;
      const crew = CREW[seats[i]] ?? null;
      const file = agent ? files[agent.address] ?? null : null;
      const state = stateOf(agent, file);
      ship.members.push({
        // Set when this agent has no status of its own while one is being written to the file
        // it shares with the ship's other agents: the time of the last such write.
        sharedAt: agent && !file ? sharedFiles[agent.address] ?? 0 : 0,
        key: agent?.address ?? `${sp.id}:seat${i}`,
        agent,
        ship,
        name: crew?.name ?? agent?.program?.name ?? "Crew",
        program: agent?.program?.name ?? "",
        portrait: portraitOf(crew, state),
        rank: n > 1 ? RANKS[i] ?? "" : "",
        file,
        state,
      });
    }
    return ship;
  });
}

/** "Emauria, Cpt." when the ship has several crew, "Emauria" otherwise. */
export const callSign = (m) => (m.rank ? `${m.ship.name}, ${m.rank}` : m.ship.name);

/** The member in front of the person: the focused agent, else one in the shown space. */
export function current(ships) {
  const awake = ships.flatMap((s) => s.members.filter((m) => m.agent));
  return awake.find((m) => m.agent.focused) ?? awake.find((m) => m.ship.space.active) ?? null;
}

/**
 * Whether a rail tile is where the person is: the focused agent, or an asleep seat of the
 * shown ship, unless a crewmate there is focused (then that one tile says it).
 */
export const inFront = (m) => (m.agent
  ? Boolean(m.agent.focused)
  : Boolean(m.ship.space.active) && !m.ship.members.some((x) => x.agent?.focused));

export const activeShip = (ships) => ships.find((s) => s.space.active) ?? null;

export const PER_PAGE = 8; // two rows of four on the ambient view, and as many control groups

/** Control groups 1-8: explicit bindings first, then the remaining crew in fleet order. */
export function slots(ships) {
  const awake = ships.flatMap((s) => s.members.filter((m) => m.agent));
  const bound = shared(SLOTS_KEY) ?? {};
  const out = Array(PER_PAGE).fill(null);
  const used = new Set();
  for (let i = 0; i < out.length; i++) {
    const m = awake.find((x) => x.agent.address === bound[String(i + 1)]);
    if (m && !used.has(m.key)) {
      out[i] = m;
      used.add(m.key);
    }
  }
  for (const m of awake) {
    if (used.has(m.key)) continue;
    const k = out.indexOf(null);
    if (k < 0) break;
    out[k] = m;
    used.add(m.key);
  }
  return out;
}

/** Every running agent, in the order the ambient view shows them: control groups 1-8, then the rest in fleet order. */
export function muster(ships) {
  const first = slots(ships).filter(Boolean);
  const keyed = new Set(first.map((m) => m.key));
  return first.concat(ships.flatMap((s) => s.members.filter((m) => m.agent && !keyed.has(m.key))));
}

/** The ambient view's pages: at most eight crew each, spread evenly (nine is 5 + 4, not 8 + 1). */
export function pages(list) {
  const n = Math.ceil(list.length / PER_PAGE) || 1;
  const per = Math.ceil(list.length / n);
  return Array.from({ length: n }, (_, i) => list.slice(i * per, (i + 1) * per));
}

export const slotOf = (m, groups) => {
  const i = groups.findIndex((x) => x && x.key === m.key);
  return i < 0 ? null : i + 1;
};

// ---------------------------------------------------------------- roster
// Who serves where. Kept in <Herdr home>/cockpit-roster.json, the file that
// tools/crew.mjs also reads and writes, so the tool and the in-app menu agree.
// Without that file the roster is the default in roster.js.

const rosterPath = () => `${appHome()}/cockpit-roster.json`;

/** { [space name, lowercase]: { name, color, crew: [crew id, ...] } } */
export const roster = () => shared(ROSTER_KEY) ?? SHIPS;

function cleanRoster(o) {
  if (!o || typeof o !== "object") return null;
  const out = {};
  for (const [key, s] of Object.entries(o)) {
    if (!s || typeof s !== "object") continue;
    out[key.toLowerCase()] = {
      name: typeof s.name === "string" && s.name ? s.name : key,
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : autoColor(key.toLowerCase()),
      crew: Array.isArray(s.crew) ? s.crew.filter((id) => typeof id === "string") : [],
    };
  }
  return out;
}

/**
 * Lists the portraits in crew/, so that `<stem>-<state>.png` is shown for that state as
 * soon as the file is there. Looked at once, then every minute.
 */
let posePolls = 0;
export async function pollPoses() {
  if (posePolls++ % 20) return;
  try {
    const { stdout } = await exec("ls", ["mods/cockpit/crew"], { cwd: appHome(), timeout: 5000 });
    const out = {};
    for (const [, stem, state] of String(stdout ?? "").matchAll(/^(.+)-([a-z]+)\.png$/gm)) {
      if (state === "base" || STATES.includes(state)) (out[stem] ??= []).push(state);
    }
    if (JSON.stringify(out) !== JSON.stringify(shared(POSES_KEY) ?? {})) setShared(POSES_KEY, out);
  } catch {
    posePolls = 0; // try again at the next poll
  }
}

/** Picks up a roster changed outside the app (tools/crew.mjs, or a hand edit). */
export async function pollRoster() {
  let next = null;
  try {
    const raw = await readTextFile(rosterPath());
    if (raw) next = cleanRoster(JSON.parse(raw).ships);
  } catch {
    return; // an unreadable file leaves the roster as it was
  }
  if (JSON.stringify(next) !== JSON.stringify(shared(ROSTER_KEY) ?? null)) setShared(ROSTER_KEY, next);
}

const copy = (ships) => JSON.parse(JSON.stringify(ships));

/**
 * Gives every space its ship's color in "space.colors", the shared value Herdr's own mods
 * draw space avatars from (the Ships panel's lettered tiles), so they match the crew.
 * Herdr keeps a color that is already there and only fills in the missing ones.
 */
export function shareColors() {
  const was = shared(COLORS_KEY) ?? {};
  const next = { ...was };
  for (const s of fleet()) next[s.id] = s.color;
  if (JSON.stringify(next) !== JSON.stringify(was)) setShared(COLORS_KEY, next);
}

/** The roster with `id` seated on `ship` at seat `at` (default: the next free one). A crew member serves on one ship, so this moves them. */
export function withAssigned(ships, id, ship, at) {
  const next = withUnassigned(ships, id);
  const s = (next[ship.key] ??= { name: ship.name, color: ship.color, crew: [] });
  s.crew.splice(Math.max(0, Math.min(at ?? s.crew.length, s.crew.length)), 0, id);
  return next;
}

export function withUnassigned(ships, id) {
  const next = copy(ships);
  for (const s of Object.values(next)) s.crew = s.crew.filter((c) => c !== id);
  return next;
}

/** Writes the roster file, then shows it. False when the file could not be written. */
export async function saveRoster(ships) {
  const text = `${JSON.stringify({ ships }, null, 2)}\n`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await readTextFile(rosterPath());
      await writeTextFile(rosterPath(), text, raw ?? null);
      setShared(ROSTER_KEY, ships);
      return true;
    } catch {
      // the file changed between the read and the write: read again, once
    }
  }
  return false;
}

/** The crew assignment menu for a ship: a popup at the pointer, or a dialog when opened from a key. */
export function openAssign(ship, kind = "popup") {
  if (!ship) return;
  openOverlay({ mod: "cockpit", kind, width: 300, height: 560, props: { role: "assign", ship: ship.id } });
}

// ---------------------------------------------------------------- journal rail
// Like Herdr's sidebar, the journal is collapsed when it is narrow, not by a
// flag, so dragging its edge collapses it too.

export const JOURNAL_KEY = "cockpit.journal.width"; // the width to come back to
export const COMPACT_BELOW = 160; // the width under which Herdr's own sidebar panels go compact
const JOURNAL_RAIL = 44;
const JOURNAL_WIDTH = 340; // as in layouts/cockpit.json

function block(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = block(child, id);
    if (found) return found;
  }
  return null;
}

export const journalNarrow = () => (block(layout(), "journal")?.size?.px ?? Infinity) < COMPACT_BELOW;

export function toggleJournal() {
  const px = block(layout(), "journal")?.size?.px;
  const narrow = journalNarrow();
  if (!narrow && Number.isFinite(px)) setShared(JOURNAL_KEY, px);
  run("layout.resize", { id: "journal", px: narrow ? shared(JOURNAL_KEY) ?? JOURNAL_WIDTH : JOURNAL_RAIL });
}

// ---------------------------------------------------------------- folding the sidebar panels
// The Crew and Ships panels fold down to their header. Like the journal, a panel is
// folded when its block is that small, not by a flag.

export const FOLDED = 31; // a header's height, the Ships panel's (Herdr's Spaces mod)
const UNFOLDED = { rail: { weight: 3 }, spaces: { weight: 2 } }; // as in layouts/cockpit.json
const foldKey = (id) => `cockpit.fold.${id}`; // the size to come back to

// tools/install.sh writes the same limit into the Ships panel's fold button.
export const folded = (id) => (block(layout(), id)?.size?.px ?? Infinity) <= 40;

export function toggleFold(id) {
  if (folded(id)) return run("layout.resize", { id, ...(shared(foldKey(id)) ?? UNFOLDED[id]) });
  const { px, weight } = block(layout(), id)?.size ?? {};
  if (Number.isFinite(px)) setShared(foldKey(id), { px });
  else if (Number.isFinite(weight)) setShared(foldKey(id), { weight });
  run("layout.resize", { id, px: FOLDED });
}

// ---------------------------------------------------------------- actions

export function goTo(member, fromAmbient = false) {
  if (!member) return;
  if (fromAmbient) run("layout.switch", { name: ACTIVE_LAYOUT });
  // An asleep seat has no terminal to go to: open its ship, where the agent can be launched.
  if (member.agent) run("agent.focus", { terminal: member.agent.address });
  else run("space.select", { id: member.ship.id });
}

/** One key command from keys.json: crew1..8, bind1..8, hail, assign, journal, foldcrew, foldships. */
export function handle(command, fromAmbient = false) {
  const ships = fleet();
  if (command === "journal") return toggleJournal();
  if (command === "foldcrew") return toggleFold("rail");
  if (command === "foldships") return toggleFold("spaces"); // sent by the Ships panel's fold button
  if (command === "assign") return openAssign(current(ships)?.ship ?? activeShip(ships), "dialog");
  const groups = slots(ships);
  const crew = /^crew([1-8])$/.exec(command);
  if (crew) return goTo(groups[Number(crew[1]) - 1], fromAmbient);
  const bind = /^bind([1-8])$/.exec(command);
  if (bind) {
    const m = current(ships);
    if (!m) return;
    const next = { ...(shared(SLOTS_KEY) ?? {}) };
    for (const k of Object.keys(next)) if (next[k] === m.agent.address) delete next[k];
    next[bind[1]] = m.agent.address;
    setShared(SLOTS_KEY, next);
    return;
  }
  if (command === "hail") {
    const awake = ships.flatMap((s) => s.members.filter((m) => m.agent));
    const waiting = awake.filter((m) => m.state === "hailing").concat(awake.filter((m) => m.state === "done"));
    if (!waiting.length) return;
    // Move on from the one already in front of the person, if it is waiting too.
    const at = waiting.findIndex((m) => m.agent.focused);
    goTo(waiting[(at + 1) % waiting.length], fromAmbient);
  }
}

// ---------------------------------------------------------------- status files
// <repo>/.cockpit/<agent key>.json, written by the agent through .cockpit/report,
// a script the cockpit puts there. See docs/status-file.md.

/**
 * The script agents pipe their status to. It names the file after the one thing
 * that tells agents apart and that the cockpit can also see from outside: the
 * container the agent runs in, else Herdr's terminal id. The agent itself never
 * has to know either.
 *
 * The container's name has to be given to the container: the box launchers set it
 * as CODEBOX_SESSION, and the cockpit reads the same name from the terminal's
 * `podman run --name`. /run/.containerenv only carries it in a privileged Podman
 * container, so it is a fallback, not the rule.
 */
export const REPORT = `#!/bin/sh
# Written by the Herdr cockpit, and rewritten when the cockpit changes it: do not edit.
# Usage: sh .cockpit/report <<'EOF'
#        { "task": "...", "activity": "..." }
#        EOF
dir=$(dirname "$0")
key=""
# Podman puts this file in every container it starts. The cockpit only knows
# Podman containers by name, so the name is only used as the key there.
env_file="\${COCKPIT_CONTAINERENV:-/run/.containerenv}"
if [ -e "$env_file" ]; then
  # A box: its launcher passes the container's name.
  name="$CODEBOX_SESSION"
  # Otherwise Podman writes it in the file, for a privileged container only.
  [ -z "$name" ] && [ -r "$env_file" ] && name=$(sed -n 's/^name="\\(.*\\)"$/\\1/p' "$env_file" | head -n 1)
  [ -n "$name" ] && key="c-$name"
fi
[ -z "$key" ] && [ -n "$HC_TERMINAL_ID" ] && key="$HC_TERMINAL_ID"
[ -n "$key" ] || key="status"
key=$(printf %s "$key" | tr -c 'A-Za-z0-9._-' '_')
tmp="$dir/.report.$$"
cat > "$tmp" || exit 1
# Stamp the time here: this clock is right, an agent's idea of the time often is not.
flat=$(tr -d ' \\t\\r\\n' < "$tmp")
case "$flat" in
  "{}"|*'"updated"'*) ;;
  "{"*) now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        sed "1s/{/{\\"updated\\":\\"$now\\",/" "$tmp" > "$tmp.s" && mv "$tmp.s" "$tmp" ;;
esac
mv "$tmp" "$dir/$key.json"
# Files of containers that are long gone.
find "$dir" -maxdepth 1 -name 'c-*.json' -mtime +7 -exec rm -f {} + 2>/dev/null
exit 0
`;

/** The container a terminal runs, from its foreground \`podman run ... --name <name>\`, if any. */
export function containerName(argv) {
  if (!Array.isArray(argv) || !/(^|\/)podman$/.test(argv[0] ?? "") || !argv.includes("run")) return null;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--name" && i + 1 < argv.length) return argv[i + 1];
    if (String(argv[i]).startsWith("--name=")) return argv[i].slice(7);
  }
  return null;
}

const fileKey = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "_");

/** The status file names to try for an agent, most certain first. */
export function statusNames(agent, terms, alone) {
  const term = terms.find((t) => t.address === agent.address);
  const box = containerName(term?.foreground?.argv) ?? containerName(term?.argv);
  const names = [];
  // A container's name is new for every session, so its file can only be this agent's.
  if (box) names.push(`c-${fileKey(box)}.json`);
  names.push(`${localAddress(agent.address)}.json`);
  // The script falls back to this name when it finds neither: enough for a ship with one agent.
  if (alone) names.push("status.json");
  return names;
}

// Folders already given the script, with the number of polls since.
const provisioned = new Map();

/** Puts .cockpit/report (and a .gitignore) in an agent's folder, and puts it back if it goes or is out of date. */
async function provision(cwd, machine) {
  const id = `${machine ?? ""}|${cwd}`;
  const n = provisioned.get(id) ?? 0;
  provisioned.set(id, n + 1);
  if (n % 100) return; // looked at once, then every five minutes
  try {
    const have = machine ? await readTextFile(`${cwd}/.cockpit/report`, { on: machine }) : await readTextFile(`${cwd}/.cockpit/report`);
    if (have === REPORT) return;
    const write = 'mkdir -p .cockpit && printf %s "$1" > .cockpit/report && { [ -e .cockpit/.gitignore ] || echo "*" > .cockpit/.gitignore; }';
    await exec("sh", ["-c", write, "cockpit", REPORT], machine ? { cwd, on: machine, timeout: 5000 } : { cwd, timeout: 5000 });
  } catch {
    provisioned.delete(id); // try again at the next poll
  }
}

const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function clean(o) {
  if (!o || typeof o !== "object") return null;
  let question = null;
  if (typeof o.question === "string") question = { text: text(o.question, 600), options: [], recommendation: "" };
  else if (o.question && typeof o.question === "object") {
    question = {
      text: text(o.question.text, 600),
      options: Array.isArray(o.question.options) ? o.question.options.slice(0, 6).map((x) => text(x, 200)).filter(Boolean) : [],
      recommendation: text(o.question.recommendation, 400),
    };
  }
  const p = o.progress;
  return {
    state: text(o.state, 20).toLowerCase(),
    // `task` is the general name; `milestone` is kept for the milestone methodology.
    milestone: text(o.milestone, 120) || text(o.task, 120),
    kind: text(o.milestone, 120) ? "milestone" : "task",
    activity: text(o.activity, 200),
    question: question?.text ? question : null,
    decisions: Array.isArray(o.decisions) ? o.decisions.slice(-8).map((x) => text(x, 200)).filter(Boolean) : [],
    progress: p && Number.isFinite(p.done) && Number.isFinite(p.total) && p.total > 0 ? { done: p.done, total: p.total } : null,
    updated: typeof o.updated === "number" ? o.updated : Date.parse(o.updated) || 0,
  };
}

async function read(path, machine) {
  try {
    const raw = machine ? await readTextFile(path, { on: machine }) : await readTextFile(path);
    return clean(JSON.parse(raw ?? "null"));
  } catch {
    return null;
  }
}

/** Reads every agent's status file and publishes the result when it changed. */
let polling = false;
export async function pollStatus() {
  if (polling) return;
  polling = true;
  try {
    await readAll();
  } catch {
    // a failed read leaves the last published status in place
  } finally {
    polling = false;
  }
}

/**
 * Decides when a status was written. The agent's own `updated` is often wrong: typed
 * from memory, or local time labelled as UTC. So once the cockpit has watched the file
 * change, the moment it saw the change is used. The agent's time only serves for a file
 * that was already there when the cockpit started.
 */
function timed(s, prev) {
  const stamp = s.updated;
  const same = prev && JSON.stringify({ ...prev, updated: 0, stamp: 0 }) === JSON.stringify({ ...s, updated: 0, stamp: 0 }) && prev.stamp === stamp;
  // A time in the future can only be a wrong clock or a wrong zone.
  const own = Math.min(stamp, Date.now());
  return { ...s, stamp, updated: same ? prev.updated : prev ? Date.now() : own };
}

// status.json of the folders where several agents may be writing it: its last content,
// and when the cockpit saw it change.
const sharedSeen = new Map();
// When the cockpit first saw each agent: a write made before that is not this agent's.
const firstSeen = new Map();

/**
 * When the status.json of a folder was last written, for a ship with several agents.
 * Nobody can tell whose it is there, so it is never shown as a status; but a write to it
 * means an agent is reporting without a name of its own, which the journal says. 0 when
 * the file has not changed since the cockpit first looked: it may be left from earlier.
 */
async function sharedWrite(cwd, machine, cache) {
  const id = `${machine ?? ""}|${cwd}`;
  if (cache.has(id)) return cache.get(id);
  let raw = null;
  try {
    const path = `${cwd}/.cockpit/status.json`;
    raw = machine ? await readTextFile(path, { on: machine }) : await readTextFile(path);
  } catch {
    raw = null;
  }
  const seen = sharedSeen.get(id);
  let at = 0;
  if (raw != null) {
    at = !seen ? 0 : seen.raw === raw ? seen.at : Date.now();
    sharedSeen.set(id, { raw, at });
  }
  cache.set(id, at);
  return at;
}

async function readAll() {
  const all = agents().filter((a) => !a.parent);
  const sps = spaces();
  const ps = panes();
  const terms = terminals();
  const before = shared(STATUS_KEY) ?? {};
  const out = {};
  const sharedOut = {};
  const polled = new Map(); // one read of a folder's status.json per poll
  for (const address of firstSeen.keys()) if (!all.some((a) => a.address === address)) firstSeen.delete(address);
  for (const a of all) {
    if (!firstSeen.has(a.address)) firstSeen.set(a.address, Date.now());
    const sp = sps.find((s) => s.id === a.space);
    const cwd = ps.find((p) => p.terminal === a.address)?.cwd ?? sp?.folder;
    if (!cwd) continue;
    await provision(cwd, sp?.machine);
    const alone = all.filter((x) => x.space === a.space).length === 1;
    // Every name here can only be this agent's, so the last one written is the one it
    // is writing now: an agent changes file when the script changes its naming, and the
    // file it leaves behind must not hide the new one. Equal times: the most certain name.
    let best = null;
    for (const name of statusNames(a, terms, alone)) {
      const s = await read(`${cwd}/.cockpit/${name}`, sp?.machine);
      if (s && (!best || s.updated > best.updated)) best = s;
    }
    if (best) out[a.address] = timed(best, before[a.address]);
    if (!out[a.address] && !alone) {
      const at = await sharedWrite(cwd, sp?.machine, polled);
      if (at >= firstSeen.get(a.address)) sharedOut[a.address] = at;
    }
  }
  if (JSON.stringify(out) !== JSON.stringify(shared(STATUS_KEY) ?? {})) setShared(STATUS_KEY, out);
  if (JSON.stringify(sharedOut) !== JSON.stringify(shared(SHARED_KEY) ?? {})) setShared(SHARED_KEY, sharedOut);
}

/** "just now", "4 min ago", "2 h ago". */
export function ago(ms) {
  if (!ms) return "";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}
