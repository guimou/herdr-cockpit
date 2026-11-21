// Smoke test: renders every role of the cockpit mod under Node against stand-in
// versions of Herdr's modules, with and without agents. It catches JavaScript
// errors (a bad import, an undefined child, a crash on missing data). It does
// not know Herdr's real API, so `herdr-app check` and a look at the app are
// still required.
//
//   node tools/smoke.mjs

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
        } else if (key === "loop") {
          if (!(args[1]?.period >= 100)) throw new Error("loop() needs a period of 100 ms or more, got " + args[1]?.period);
        } else if (key === "frames") {
          if (!Array.isArray(args[0]) || typeof args[1] !== "number") throw new Error("frames(list, ms)");
          // Seen in Herdr: a view with an animation faster than 100 ms is not drawn at all.
          if (args[1] < 100) throw new Error("frames() faster than 100 ms");
          globalThis.framed?.push(args[0]);
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
export const world = { spaces: [], agents: [], panes: [], shared: {}, props: {}, files: {}, ran: [], overlays: [], terminals: [], execs: [], crewDir: "", framed: [] };
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
export const readTextFile = async (path) => (path in world.files ? world.files[path] : null);
export const writeTextFile = async (path, text, expected) => {
  if ((world.files[path] ?? null) !== expected) throw new Error("stale");
  world.files[path] = text;
  return null;
};
export const appHome = () => "/herdr";
export const terminals = () => world.terminals;
export const exec = async (command, args, options) => {
  world.execs.push([command, args, options]);
  if (command === "ls") return { code: 0, stdout: world.crewDir, stderr: "" };
  if (command === "sh" && args[2] === "cockpit") world.files[options.cwd + "/.cockpit/report"] = args[3];
  return { code: 0, stdout: "", stderr: "" };
};
export const layout = () => world.layout;
export const openOverlay = (spec) => { world.overlays.push(spec); return "o1"; };
export const closeOverlay = () => null;
`);

const { world } = await import(pathToFileURL(join(dir, "node_modules", "herdr", "index.js")).href);
const { default: Cockpit } = await import(pathToFileURL(join(dir, "cockpit", "main.js")).href);
const model = await import(pathToFileURL(join(dir, "cockpit", "model.js")).href);
const ui = await import(pathToFileURL(join(dir, "cockpit", "ui.js")).href);
globalThis.framed = []; // every list of frames an element was given

const cx = { notify() {}, spawn() {}, stop_propagation() {}, timer: { every() { return { cancel() {} }; } } };
const render = (role, extra = {}) => {
  world.props = role ? { role, ...extra } : {};
  const view = new Cockpit();
  view.init(world.props, cx);
  const out = view.render(cx);
  if (!out || !out.kind) throw new Error(`${role ?? "all"}: render returned nothing`);
};
// The rail as it draws with the sidebar collapsed (44 px) or dragged narrow.
const narrowRail = () => {
  world.props = { role: "rail" };
  const view = new Cockpit();
  view.init(world.props, cx);
  for (const width of [44, 60, 159]) {
    view.role.resized({ width, height: 600 }, cx);
    const out = view.render(cx);
    if (!out || !out.kind) throw new Error(`rail at ${width}px: render returned nothing`);
  }
};
const everything = () => {
  for (const role of ["rail", "journal", "ambient", null]) render(role);
  for (const sp of world.spaces) render("assign", { ship: sp.id });
  render("assign", { ship: "gone" });
  narrowRail();
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
  "/r/emauria/.cockpit/t12.json": JSON.stringify({ state: "subagents", task: "Fix the flaky login test", activity: "Three reviewers running", updated: new Date().toISOString() }),
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
check("a task is shown where a milestone would be", emauria.members[1].file.milestone === "Fix the flaky login test" && emauria.members[1].file.kind === "task" && emauria.members[0].file.kind === "milestone");
check("a lone agent may use status.json", ccbox.members[0].state === "thinking" && ccbox.members[0].file.question.text === "plain string question");
world.shared["space.colors"] = { s1: "ansi6", gone: "ansi3" };
model.shareColors();
check("every space gets its ship's color for Herdr's own space avatars",
  world.shared["space.colors"].s1 === "#4CC9F0" && world.shared["space.colors"].s3 === model.fleet()[2].color && world.shared["space.colors"].gone === "ansi3");
world.spaces[0].name = "EMAURIA";
world.spaces[1].name = "CCBox";
const savedRoster = world.shared["cockpit.roster"];
world.shared["cockpit.roster"] = { ...model.roster(), ccbox: { ...model.roster().ccbox, name: "Codebox" } };
check("a listed ship follows its space's spelling, unless the roster gives it a name of its own",
  model.fleet()[0].name === "EMAURIA" && model.fleet()[1].name === "Codebox" && model.fleet()[0].members.length === 2);
world.spaces[0].name = "Emauria";
world.spaces[1].name = "ccbox";
world.shared["cockpit.roster"] = savedRoster;
check("an unlisted ship keeps its space name and a palette color", jukebox.name === "agents-jukebox" && /^#/.test(jukebox.color) && jukebox.members[0].portrait === null);
check("a broken status file is ignored", jukebox.members[0].file === null && jukebox.members[0].state === "idle");
check("a ship without agents has no crew", litemaas.members.length === 0);

// The time shown is when the cockpit saw the file change, not the time the agent wrote in it.
{
  const first = model.fleet()[0].members[0].file.updated;
  await model.pollStatus();
  check("an unchanged status file keeps its time", model.fleet()[0].members[0].file.updated === first);
  // An agent writes local time labelled as UTC: five hours off.
  world.files["/r/emauria/.cockpit/t3.json"] = JSON.stringify({ task: "Next task", updated: Date.now() - 5 * 3600000 });
  await model.pollStatus();
  const f = model.fleet()[0].members[0].file;
  check("a status seen changing is timed by the cockpit, not by the agent's clock", f.milestone === "Next task" && Date.now() - f.updated < 5000);
}

// A state's own portrait is used once its file is in crew/, and a change is drawn for a moment.
{
  const vega = () => model.fleet()[0].members[0];
  check("without a portrait for its state, a crew member shows the base one", vega().portrait.endsWith("/vega-base.png"));
  world.files["/r/emauria/.cockpit/t3.json"] = JSON.stringify({ state: "blocked", task: "Next task", activity: "Waiting for you", question: "Ship it?" });
  await model.pollStatus();
  world.crewDir = "vega-base.png\nvega-hailing.png\nvega-notastate.png\norrin-base.png\nREADME.md\n";
  await model.pollPoses();
  check("a portrait named after a state is used for that state", vega().state === "hailing" && vega().portrait.endsWith("/vega-hailing.png")
    && JSON.stringify(world.shared["cockpit.poses"]) === '{"vega":["hailing"]}');
  check("nothing is fresh the first time it is drawn", !ui.fresh("x", "a", 1000) && !ui.fresh("x", "a", 1000));
  check("a change is fresh for a moment, and says when to draw again", ui.fresh("x", "b", 1000) && ui.fresh("x", "b", 1000) && ui.settleDue() > Date.now());
  // The rail and the cards were drawn with the previous line: the new one is typed out.
  framed.length = 0;
  everything();
  const typed = framed.filter((f) => f.at(-1) === "Ship it?");
  check("a line that changed is typed out and ends whole", typed.length > 0 && typed.every((f) => f[0] === "Sh_"));
  world.agents = world.agents.map((a) => (a.address === "t3" ? { ...a, status: "working" } : a));
  check("another state goes back to the base portrait", vega().portrait.endsWith("/vega-base.png"));
  everything(); // the glitch cut
  world.crewDir = "";
}

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

// The ambient view takes any number of crew: one row to four, two rows to eight, then pages.
{
  const crowd = (n) => { world.agents = Array.from({ length: n }, (_, i) => agent(`t${i + 1}`, `s${(i % 4) + 1}`, i === 9 ? "blocked" : "working")); };
  const sizes = () => model.pages(model.muster(model.fleet())).map((p) => p.length).join();
  crowd(11);
  const all = model.muster(model.fleet());
  check("the ambient view lists every agent once, control groups first",
    all.length === 11 && new Set(all.map((m) => m.key)).size === 11 && all[3].agent.address === "t3");
  check("more than eight crew are spread over pages", sizes() === "6,5");
  world.props = { role: "ambient" };
  const view = new Cockpit();
  view.init(world.props, cx);
  for (const n of [1, 4, 5, 7, 8, 9, 11, 17]) {
    crowd(n);
    for (const [width, height] of [[1600, 900], [3840, 2160], [640, 360]]) {
      Object.assign(view.role, { width, height });
      // Cards measured with little or no room for the portrait must still draw.
      view.role.room = new Map(n % 2 ? [["t1", { w: 0, h: 0 }], ["t2", { w: 500, h: 90 }]] : []);
      for (view.role.page = 0; view.role.page < 3; view.role.page++) {
        if (!view.render(cx)?.kind) throw new Error(`ambient with ${n} crew: render returned nothing`);
      }
    }
  }
  check("the ambient view draws 1 to 17 crew at any window size, on every page", view.role.pages === 3 && sizes() === "6,6,5");
  // The page switches: on holds a page, off lets the pages turn again.
  const realCx = cx.timer.every;
  let turn;
  cx.timer.every = (ms, fn) => { if (ms === 10_000) turn = fn; return { cancel() {} }; };
  const amb = new Cockpit();
  amb.init(world.props, cx);
  cx.timer.every = realCx;
  amb.render(cx);
  turn(cx); turn(cx);
  check("with every switch off the pages turn", amb.role.page === 2);
  amb.role.pinned = 0; amb.role.page = 0;
  turn(cx);
  amb.render(cx);
  check("a switch that is on holds its page", amb.role.page === 0 && amb.role.pinned === 0);
  amb.role.pinned = 2; amb.role.page = 2;
  crowd(8);
  amb.render(cx);
  check("a held page that no longer exists lets go", amb.role.pinned === null && amb.role.pages === 1);
  check("eight crew still fit one page", sizes() === "8");
  world.ran.length = 0;
  model.handle("crew8");
  check("crew8 jumps to the eighth control group", world.ran.at(-1)[0] === "agent.focus" && model.slots(model.fleet()).filter(Boolean).length === 8);
  world.agents = [];
  check("no crew is one empty page", sizes() === "0");
}

// Status files without terminal ids: the cockpit hands out a report script, and
// finds each agent's file by the container its terminal runs.
world.agents = [agent("t3", "s1", "working", true), agent("t12", "s1", "working"), agent("t20", "s1", "working")];
world.terminals = [
  { address: "t3", foreground: { argv: ["/usr/bin/podman", "run", "--rm", "-it", "--name", "ccbox-emauria-a1", "img"] } },
  { address: "t12", argv: ["podman", "run", "--name=ompbox-emauria-b2", "img"] },
  { address: "t20", foreground: { argv: ["claude"] } },
];
world.files = {
  "/r/emauria/.cockpit/c-ccbox-emauria-a1.json": JSON.stringify({ task: "first agent" }),
  "/r/emauria/.cockpit/c-ompbox-emauria-b2.json": JSON.stringify({ task: "second agent" }),
  "/r/emauria/.cockpit/t20.json": JSON.stringify({ task: "third agent, on the host" }),
  "/r/emauria/.cockpit/t3.json": JSON.stringify({ task: "left by an earlier agent that had terminal t3" }),
  "/r/emauria/.cockpit/status.json": JSON.stringify({ task: "left by a lone agent" }),
};
await model.pollStatus();
{
  const st = world.shared["cockpit.status"];
  check("three agents in one ship each get their own journal", st.t3.milestone === "first agent" && st.t12.milestone === "second agent" && st.t20.milestone === "third agent, on the host");
  check("the cockpit puts the report script in the agent's folder", world.execs.some(([cmd, args, opt]) => cmd === "sh" && args[3] === model.REPORT && opt.cwd === "/r/emauria") && model.REPORT.startsWith("#!/bin/sh"));
  everything();
  // The script itself, run as an agent would.
  const work = mkdtempSync(join(tmpdir(), "cockpit-report-"));
  mkdirSync(join(work, ".cockpit"));
  writeFileSync(join(work, ".cockpit", "report"), model.REPORT);
  writeFileSync(join(work, "containerenv"), 'engine="podman-5.2"\nname="ccbox-emauria-a1"\nid="abc"\n');
  const report = (env, input) => execFileSync("sh", [".cockpit/report"], { cwd: work, input, env: { PATH: process.env.PATH, COCKPIT_CONTAINERENV: join(work, "none"), ...env } });
  // What Podman puts in a box: the file is there, but empty unless the container is privileged.
  writeFileSync(join(work, "containerenv-empty"), "");
  const fileOf = (name) => JSON.parse(readFileSync(join(work, ".cockpit", name), "utf8"));
  report({ COCKPIT_CONTAINERENV: join(work, "containerenv-empty"), CODEBOX_SESSION: "ccbox-emauria-c3", HC_TERMINAL_ID: "t9" }, '{\n  "task": "in a box"\n}\n');
  report({ COCKPIT_CONTAINERENV: join(work, "containerenv"), HC_TERMINAL_ID: "t9" }, '{"task":"in a privileged container"}');
  report({ HC_TERMINAL_ID: "t9" }, '{"task":"on the host"}');
  report({ CODEBOX_SESSION: "ccbox-emauria-d4", HC_TERMINAL_ID: "t8" }, '{"task":"in a box that is not a Podman container"}');
  report({ COCKPIT_CONTAINERENV: join(work, "containerenv-empty") }, '{"task":"in a container that was given no name"}');
  const boxed = fileOf("c-ccbox-emauria-c3.json");
  check("in a box the script names the file after the session its launcher passed, and stamps the time", boxed.task === "in a box" && Math.abs(Date.parse(boxed.updated) - Date.now()) < 60000);
  check("without it, a privileged Podman container still gets its name from /run/.containerenv", fileOf("c-ccbox-emauria-a1.json").task === "in a privileged container");
  check("outside a container it uses the terminal id", fileOf("t9.json").task === "on the host");
  check("the session name is only a key under Podman, where the cockpit can see it too",
    fileOf("t8.json").task === "in a box that is not a Podman container" && !readdirSync(join(work, ".cockpit")).includes("c-ccbox-emauria-d4.json"));
  check("with nothing to go by it falls back to status.json", fileOf("status.json").task === "in a container that was given no name");
  report({}, "{}");
  check("an empty status is written as it is", readFileSync(join(work, ".cockpit", "status.json"), "utf8") === "{}");
  check("the script leaves no temporary file", readdirSync(join(work, ".cockpit")).every((f) => !f.startsWith(".report")));
}

// Two boxes whose launcher passes no name: both write status.json. The cockpit shows it
// for neither, and says so once it has seen the file written.
world.agents = [agent("t3", "s1", "working", true), agent("t12", "s1", "working")];
world.terminals = [
  { address: "t3", foreground: { argv: ["podman", "run", "--name", "ccbox-emauria-e5", "img"] } },
  { address: "t12", foreground: { argv: ["podman", "run", "--name", "ccbox-emauria-f6", "img"] } },
];
world.files = { "/r/emauria/.cockpit/status.json": JSON.stringify({ task: "left by a lone agent" }) };
await model.pollStatus();
{
  const members = () => model.fleet().find((s) => s.id === "s1").members;
  check("a status.json that was already there is not taken for a shared one",
    !world.shared["cockpit.status"].t3 && !world.shared["cockpit.status"].t12 && members().every((m) => !m.file && !m.sharedAt));
  world.files["/r/emauria/.cockpit/status.json"] = JSON.stringify({ task: "one of the two" });
  await model.pollStatus();
  check("a write to the shared status.json is shown for neither agent, and flagged for both",
    !world.shared["cockpit.status"].t3 && !world.shared["cockpit.status"].t12 && members().every((m) => !m.file && m.sharedAt > 0));
  everything();
  world.files["/r/emauria/.cockpit/c-ccbox-emauria-e5.json"] = JSON.stringify({ task: "now with its own file" });
  await model.pollStatus();
  const [first, second] = members();
  check("an agent that gets its own file is shown again, and no longer flagged", first.file?.milestone === "now with its own file" && !first.sharedAt && second.sharedAt > 0);
  everything();
}
// An agent left alone in its ship, whose script went back to writing status.json: the file
// under its own name stops changing, and must not hide the one it writes now.
world.agents = [agent("t3", "s1", "working", true)];
world.files = {
  "/r/emauria/.cockpit/c-ccbox-emauria-e5.json": JSON.stringify({ task: "under its own name", updated: Date.now() - 60 * 60000 }),
  "/r/emauria/.cockpit/status.json": JSON.stringify({ task: "left by a lone agent", updated: Date.now() - 120 * 60000 }),
};
await model.pollStatus();
check("a lone agent's own file wins over an older status.json", world.shared["cockpit.status"].t3.milestone === "under its own name");
world.files["/r/emauria/.cockpit/status.json"] = JSON.stringify({ task: "now in status.json", updated: Date.now() - 60000 });
await model.pollStatus();
check("a lone agent that goes back to status.json is followed there", world.shared["cockpit.status"].t3.milestone === "now in status.json");
world.terminals = [];
world.agents = [];
world.files = {};
await model.pollStatus();

// The journal collapses to a rail by width, as Herdr's sidebar does.
world.layout = { id: "root", children: [{ id: "work", children: [{ id: "journal", size: { px: 380 } }] }] };
world.ran.length = 0;
model.handle("journal");
check("collapsing the journal remembers its width", world.ran.at(-1)[0] === "layout.resize" && world.ran.at(-1)[1].px === 44 && world.shared["cockpit.journal.width"] === 380);
world.layout.children[0].children[0].size.px = 44;
check("a narrow journal counts as collapsed", model.journalNarrow());
everything();
model.handle("journal");
check("opening the journal restores its width", world.ran.at(-1)[1].id === "journal" && world.ran.at(-1)[1].px === 380);
world.agents = [];
everything();
world.layout = null;

// The Crew and Ships panels fold down to their header, and open again at the size they had.
world.layout = { id: "root", children: [{ id: "sidebar", size: { px: 268 }, children: [{ id: "rail", size: { weight: 3 } }, { id: "spaces", size: { px: 300 } }] }] };
world.agents = [agent("t3", "s1", "idle", true)];
{
  const [rail, ships] = world.layout.children[0].children;
  world.ran.length = 0;
  model.handle("foldcrew");
  check("folding the Crew panel shrinks it to its header", !model.folded("rail") && world.ran.at(-1)[0] === "layout.resize" && world.ran.at(-1)[1].id === "rail" && world.ran.at(-1)[1].px === model.FOLDED);
  rail.size = { px: model.FOLDED };
  check("a panel that small counts as folded", model.folded("rail") && !model.folded("spaces"));
  everything();
  narrowRail();
  model.handle("foldcrew");
  check("opening the Crew panel gives it its share back", world.ran.at(-1)[1].id === "rail" && world.ran.at(-1)[1].weight === 3 && !("px" in world.ran.at(-1)[1]));
  model.handle("foldships");
  ships.size = { px: model.FOLDED };
  model.handle("foldships");
  check("the Ships panel's button folds it, and it opens at the height it had", world.ran.at(-2)[1].px === model.FOLDED && world.ran.at(-1)[1].id === "spaces" && world.ran.at(-1)[1].px === 300);
}
world.agents = [];
world.layout = null;

// 5. Assigning crew in the app: the roster file is written, read back and shown.
world.agents = [agent("t3", "s1", "idle", true)];
{
  const f = model.fleet();
  const lite = f.find((s) => s.name === "litemaas");
  check("a ship knows its roster key", lite.key === "litemaas");
  check("saving the roster writes cockpit-roster.json", await model.saveRoster(model.withAssigned(model.roster(), "vega", lite)));
  const saved = JSON.parse(world.files["/herdr/cockpit-roster.json"]).ships;
  check("assigning moves the crew member and names the new ship", saved.litemaas.crew.join() === "vega" && saved.emauria.crew.join() === "orrin" && saved.litemaas.name === "litemaas");
  await model.saveRoster(model.withAssigned(model.roster(), "nyx", model.fleet().find((s) => s.key === "litemaas")));
  await model.saveRoster(model.withAssigned(model.roster(), "nyx", model.fleet().find((s) => s.key === "litemaas"), 0));
  check("promoting moves a crew member up a seat", model.roster().litemaas.crew.join() === "nyx,vega");
  check("the fleet follows the saved roster", model.fleet().find((s) => s.key === "emauria").members[0].name === "Orrin");
  // A change made by tools/crew.mjs is picked up by the next poll.
  world.files["/herdr/cockpit-roster.json"] = JSON.stringify({ ships: { ccbox: { name: "ccbox", color: "#F5A623", crew: ["brass", "vega"] } } });
  await model.pollRoster();
  check("a roster changed outside the app is picked up", model.roster().ccbox.crew.join() === "brass,vega" && !model.roster().litemaas);
  world.overlays.length = 0;
  model.handle("assign");
  check("the assign key opens the menu for the ship in front", world.overlays[0]?.props.role === "assign" && world.overlays[0].props.ship === "s1" && world.overlays[0].kind === "dialog");
  everything();
  delete world.files["/herdr/cockpit-roster.json"];
  await model.pollRoster();
  check("without a roster file the default roster applies", model.roster().emauria.crew.join() === "vega,orrin");
}

// 6. The crew tool, against a throwaway Herdr home.
const fakeHome = mkdtempSync(join(tmpdir(), "cockpit-home-"));
cpSync(join(repo, "mods"), join(fakeHome, "mods"), { recursive: true });
const crew = (...args) => execFileSync(process.execPath, [join(repo, "tools", "crew.mjs"), ...args],
  { env: { ...process.env, HERDR_APP_HOME: fakeHome }, encoding: "utf8" });
crew("assign", "Vega", "to", "School-of-Sardeenz", "as", "captain");
crew("assign", "nyx", "school-of-sardeenz");
crew("assign", "brass", "school-of-sardeenz", "--as", "cpt");
const written = await import(pathToFileURL(join(fakeHome, "mods", "cockpit", "roster.js")).href);
check("crew assign moves a crew member and inserts at the given rank",
  written.SHIPS["school-of-sardeenz"].crew.join() === "brass,vega,nyx" && written.SHIPS.emauria.crew.join() === "orrin" && written.SHIPS.ccbox.crew.length === 0);
check("a new ship keeps the automatic color its space already had",
  written.SHIPS["school-of-sardeenz"].color === (await import(pathToFileURL(join(dir, "cockpit", "fleet.js")).href)).autoColor("school-of-sardeenz"));
crew("unassign", "brass");
cpSync(join(repo, "mods"), join(fakeHome, "mods"), { recursive: true }); // a reinstall puts the default roster back
crew("sync");
check("the roster survives a reinstall", /"school-of-sardeenz": .*\["vega","nyx"\]/.test(readFileSync(join(fakeHome, "mods", "cockpit", "roster.js"), "utf8")));

console.log("\nSmoke test passed. Next: herdr-app check, then look at it in Herdr.");
