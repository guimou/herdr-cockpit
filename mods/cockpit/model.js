// Data for every role: ships (spaces), crew (agents), their state, the status
// files agents write, and the 1-4 control groups.

import { spaces, agents, panes, shared, setShared, readTextFile, writeTextFile, appHome, openOverlay, run } from "herdr";
import { SHIPS, CREW, RANKS, autoColor } from "./fleet.js";

export const STATUS_KEY = "cockpit.status"; // { [agent address]: status file content }
export const SLOTS_KEY = "cockpit.slots"; // { "1": agent address, ... }
export const ROSTER_KEY = "cockpit.roster"; // the ships of cockpit-roster.json, or unset for the default roster
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

/** Every space as a ship with its members (running agents, then empty seats). */
export function fleet() {
  const all = agents().filter((a) => !a.parent);
  const files = shared(STATUS_KEY) ?? {};
  const ships = roster();
  return spaces().map((sp) => {
    const key = String(sp.name ?? "").toLowerCase();
    const cfg = ships[key];
    const ship = {
      id: sp.id,
      key,
      name: cfg?.name ?? String(sp.name ?? "?"),
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
      ship.members.push({
        key: agent?.address ?? `${sp.id}:seat${i}`,
        agent,
        ship,
        name: crew?.name ?? agent?.program?.name ?? "Crew",
        program: agent?.program?.name ?? "",
        portrait: crew?.portrait ? `mods/cockpit/crew/${crew.portrait}-base.png` : null,
        rank: n > 1 ? RANKS[i] ?? "" : "",
        file,
        state: stateOf(agent, file),
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

export const activeShip = (ships) => ships.find((s) => s.space.active) ?? null;

/** Control groups 1-4: explicit bindings first, then the remaining crew in fleet order. */
export function slots(ships) {
  const awake = ships.flatMap((s) => s.members.filter((m) => m.agent));
  const bound = shared(SLOTS_KEY) ?? {};
  const out = [null, null, null, null];
  const used = new Set();
  for (let i = 0; i < 4; i++) {
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
  openOverlay({ mod: "cockpit", kind, width: 300, height: 460, props: { role: "assign", ship: ship.id } });
}

// ---------------------------------------------------------------- actions

export function goTo(member, fromAmbient = false) {
  if (!member?.agent) return;
  if (fromAmbient) run("layout.switch", { name: ACTIVE_LAYOUT });
  run("agent.focus", { terminal: member.agent.address });
}

/** One key command from keys.json: crew1..4, bind1..4, hail, assign. */
export function handle(command, fromAmbient = false) {
  const ships = fleet();
  if (command === "assign") return openAssign(current(ships)?.ship ?? activeShip(ships), "dialog");
  const groups = slots(ships);
  const crew = /^crew([1-4])$/.exec(command);
  if (crew) return goTo(groups[Number(crew[1]) - 1], fromAmbient);
  const bind = /^bind([1-4])$/.exec(command);
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
// <repo>/.cockpit/<terminal id>.json, written by the agent. See docs/status-file.md.

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

async function readAll() {
  const all = agents().filter((a) => !a.parent);
  const sps = spaces();
  const ps = panes();
  const before = shared(STATUS_KEY) ?? {};
  const out = {};
  for (const a of all) {
    const sp = sps.find((s) => s.id === a.space);
    const cwd = ps.find((p) => p.terminal === a.address)?.cwd ?? sp?.folder;
    if (!cwd) continue;
    const alone = all.filter((x) => x.space === a.space).length === 1;
    // A ship with one agent may use the plain name, so the agent need not know its terminal id.
    const names = alone ? [`${localAddress(a.address)}.json`, "status.json"] : [`${localAddress(a.address)}.json`];
    for (const name of names) {
      const s = await read(`${cwd}/.cockpit/${name}`, sp?.machine);
      if (s) {
        out[a.address] = timed(s, before[a.address]);
        break;
      }
    }
  }
  if (JSON.stringify(out) !== JSON.stringify(shared(STATUS_KEY) ?? {})) setShared(STATUS_KEY, out);
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
