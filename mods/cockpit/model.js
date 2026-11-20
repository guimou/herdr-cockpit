// Data for every role: ships (spaces), crew (agents), their state, the status
// files agents write, and the 1-4 control groups.

import { spaces, agents, panes, shared, setShared, readTextFile, run } from "herdr";
import { SHIPS, CREW, RANKS, autoColor } from "./fleet.js";

export const STATUS_KEY = "cockpit.status"; // { [agent address]: status file content }
export const SLOTS_KEY = "cockpit.slots"; // { "1": agent address, ... }
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
  return spaces().map((sp) => {
    const key = String(sp.name ?? "").toLowerCase();
    const cfg = SHIPS[key];
    const ship = {
      id: sp.id,
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

// ---------------------------------------------------------------- actions

export function goTo(member, fromAmbient = false) {
  if (!member?.agent) return;
  if (fromAmbient) run("layout.switch", { name: ACTIVE_LAYOUT });
  run("agent.focus", { terminal: member.agent.address });
}

/** One key command from keys.json: crew1..4, bind1..4, hail. */
export function handle(command, fromAmbient = false) {
  const ships = fleet();
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
    milestone: text(o.milestone, 120),
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

async function readAll() {
  const all = agents().filter((a) => !a.parent);
  const sps = spaces();
  const ps = panes();
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
        out[a.address] = s;
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
