// Smoke test: renders every role of the cockpit mod under Node against stand-in
// versions of Herdr's modules, with and without agents. It catches JavaScript
// errors (a bad import, an undefined child, a crash on missing data). It does
// not know Herdr's real API, so `herdr-app check` and a look at the app are
// still required.
//
//   node tools/smoke.mjs

import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "cockpit-smoke-"));
cpSync(join(repo, "mods", "cockpit"), join(dir, "cockpit"), { recursive: true });

const stub = (name, source) => {
  mkdirSync(join(dir, "node_modules", name), { recursive: true });
  writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
  writeFileSync(join(dir, "node_modules", name, "index.js"), source);
};

// An element whose every builder method returns itself, and that refuses the
// mistakes that would crash a real render.
const element = `
const el = (kind) => {
  const node = { kind, kids: 0 };
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key in target || typeof key === "symbol" || key === "then") return target[key];
      return (...args) => {
        if (key === "child") {
          if (args[0] === undefined || args[0] === null) throw new Error(kind + ".child() got " + args[0]);
          target.kids++;
        } else if (key === "children") {
          if (!Array.isArray(args[0])) throw new Error(kind + ".children() needs an array");
          if (args[0].some((c) => c === undefined || c === null)) throw new Error(kind + ".children() holds an empty entry");
          target.kids += args[0].length;
        } else if (key === "when") {
          if (args[0]) return args[1](proxy);
        } else if (key === "hover" || key === "active") {
          args[0](proxy);
        } else if (key === "frames") {
          if (!Array.isArray(args[0]) || typeof args[1] !== "number") throw new Error("frames(list, ms)");
        } else {
          for (const a of args) if (typeof a === "number" && Number.isNaN(a)) throw new Error(kind + "." + String(key) + "() got NaN");
        }
        return proxy;
      };
    },
  });
  return proxy;
};
`;

stub("gpui-kit", `${element}
export class View {}
export const div = () => el("div");
export const image = (path) => { if (typeof path !== "string") throw new Error("image(path)"); return el("image"); };
export const svg = () => el("svg");
`);
stub("gpui-base", `${element}
export const h_flex = () => el("h_flex");
export const v_flex = () => el("v_flex");
`);
stub("herdr", `
export const world = { spaces: [], agents: [], panes: [], shared: {}, props: {}, files: {}, ran: [] };
export const spaces = () => world.spaces;
export const agents = () => world.agents;
export const panes = () => world.panes;
export const props = () => world.props;
export const theme = () => new Proxy({}, { get: () => "#808080" });
export const shared = (k) => world.shared[k];
export const setShared = (k, v) => { world.shared[k] = v; };
export const run = (name, args) => { world.ran.push([name, args]); };
export const nextCommand = () => new Promise(() => {});
export const setAgentOrder = (list) => { if (!Array.isArray(list)) throw new Error("setAgentOrder(list)"); };
export const checking = () => false;
export const readTextFile = async (path) => { if (path in world.files) return world.files[path]; throw new Error("no such file"); };
`);

const { world } = await import(pathToFileURL(join(dir, "node_modules", "herdr", "index.js")).href);
const { default: Cockpit } = await import(pathToFileURL(join(dir, "cockpit", "main.js")).href);
const model = await import(pathToFileURL(join(dir, "cockpit", "model.js")).href);

const cx = { notify() {}, spawn() {}, stop_propagation() {}, timer: { every() { return { cancel() {} }; } } };
const render = (role, extra = {}) => {
  world.props = role ? { role, ...extra } : {};
  const view = new Cockpit();
  view.init(world.props, cx);
  const out = view.render(cx);
  if (!out || !out.kind) throw new Error(`${role ?? "all"}: render returned nothing`);
};
const everything = () => {
  for (const role of ["rail", "header", "journal", "ambient", null]) render(role);
  for (const p of world.panes) render("pane", { pane: p.pane, terminal: p.terminal });
  render("pane", { pane: "gone" });
};
const check = (what, ok) => {
  if (!ok) throw new Error(`failed: ${what}`);
  console.log(`ok  ${what}`);
};

// 1. An empty window.
everything();
check("renders with no spaces and no agents", true);

// 2. A fleet: a listed ship with two crew, a listed ship with one, an unlisted ship, a crewless ship.
const tab = (id) => ({ id, name: "1", index: 1, active: true, panes: 2 });
world.spaces = [
  { id: "s1", name: "Emauria", folder: "/r/emauria", active: true, machine: null, tabs: [tab("a"), tab("b")] },
  { id: "s2", name: "ccbox", folder: "/r/ccbox", active: false, machine: null, tabs: [tab("c")] },
  { id: "s3", name: "agents-jukebox", folder: "/r/jukebox", active: false, machine: null, tabs: [tab("d")] },
  { id: "s4", name: "litemaas", folder: "/r/litemaas", active: false, machine: null, tabs: [tab("e")] },
];
const agent = (address, space, status, focused = false) =>
  ({ address, space, tab: "a", status, focused, pane: `p-${address}`, program: { name: "Claude Code", key: "claude" } });
world.agents = [agent("t12", "s1", "idle"), agent("t3", "s1", "blocked", true), agent("t5", "s2", "working"), agent("t7", "s3", "idle")];
world.panes = [
  { pane: "p-t3", terminal: "t3", cwd: "/r/emauria", branch: "dev", focused: true, title: "claude", program: { name: "Claude Code" } },
  { pane: "p-sh", terminal: "t9", cwd: "/r/emauria", focused: false, title: "bash", program: { name: "bash", shell: true } },
  { pane: "p-md", terminal: null, cwd: null, focused: false, title: "notes" },
];
world.files = {
  "/r/emauria/.cockpit/t3.json": JSON.stringify({
    state: "blocked", milestone: "M4 Billing", progress: { done: 3, total: 7 }, activity: "Wiring the invoice export",
    question: { text: "Keep the old endpoint?", options: ["Keep it", "Remove it"], recommendation: "Remove it" },
    decisions: ["Use Stripe webhooks"], updated: Date.now() - 5 * 60000,
  }),
  "/r/emauria/.cockpit/t12.json": JSON.stringify({ state: "subagents", activity: "Three reviewers running", updated: new Date().toISOString() }),
  "/r/ccbox/.cockpit/status.json": JSON.stringify({ state: "thinking", milestone: "M1", question: "plain string question" }),
  "/r/jukebox/.cockpit/t7.json": "{ not json",
};
await model.pollStatus();
everything();

const ships = model.fleet();
const [emauria, ccbox, jukebox, litemaas] = ships;
check("crew take seats in terminal order (t3 before t12)", emauria.members[0].agent.address === "t3" && emauria.members[0].name === "Vega" && emauria.members[1].name === "Orrin");
check("ranks appear only on a ship with several crew", model.callSign(emauria.members[1]) === "Emauria, Lt." && model.callSign(ccbox.members[0]) === "ccbox");
check("blocked agent is hailing", emauria.members[0].state === "hailing");
check("idle agent waiting on subagents is not shown idle", emauria.members[1].state === "subagents");
check("a lone agent may use status.json", ccbox.members[0].state === "thinking" && ccbox.members[0].file.question.text === "plain string question");
check("an unlisted ship keeps its space name and a palette color", jukebox.name === "agents-jukebox" && /^#/.test(jukebox.color) && jukebox.members[0].portrait === null);
check("a broken status file is ignored", jukebox.members[0].file === null && jukebox.members[0].state === "idle");
check("a ship without agents has no crew", litemaas.members.length === 0);

// 3. A listed ship whose crew are not running shows them asleep.
world.agents = world.agents.filter((a) => a.space !== "s1");
await model.pollStatus();
everything();
check("seats without a running agent are asleep", model.fleet()[0].members.every((m) => m.state === "asleep"));

// 4. Keys.
world.agents = [agent("t3", "s1", "idle", true), agent("t5", "s2", "blocked"), agent("t7", "s3", "done")];
world.ran.length = 0;
model.handle("crew2");
check("crew2 jumps to the second control group", world.ran.at(-1)[0] === "agent.focus" && world.ran.at(-1)[1].terminal === "t5");
model.handle("bind4");
check("bind4 puts the focused agent on key 4", model.slots(model.fleet())[3].agent.address === "t3" && world.shared["cockpit.slots"]["4"] === "t3");
model.handle("hail", true);
check("hail goes to the hailing agent first, switching to the active view", world.ran.at(-2)[0] === "layout.switch" && world.ran.at(-1)[1].terminal === "t5");
everything();

console.log("\nSmoke test passed. Next: herdr-app check, then look at it in Herdr.");
