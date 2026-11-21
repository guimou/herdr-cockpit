// Herdr Cockpit: projects are ships, agents are crew. One mod, several roles
// (props.role), placed by layouts/cockpit.json and layouts/cockpit-ambient.json:
//   rail     active view, left: crew portraits by ship, then ships without crew
//   journal  active view, right: state, task or milestone, current activity, pending decision
//   pane     active view, each pane's header: the ship and crew member (or HOST marker), pane buttons
//   ambient  ambient view, whole window: four large crew cards and the fleet strip
//   assign   a popup, opened by a right-click on a ship or crew member: who serves on this ship

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme, panes, run, nextCommand, setAgentOrder, checking, closeOverlay } from "herdr";
import {
  fleet, slots, slotOf, current, activeShip, callSign, goTo, handle, pollStatus, ago, LABEL,
  roster, pollRoster, pollPoses, shareColors, withAssigned, withUnassigned, saveRoster, openAssign,
  COMPACT_BELOW, journalNarrow, toggleJournal,
} from "./model.js";
import { CREW, RANKS } from "./fleet.js";
import { txt, say, heading, badge, mark, feed, settleDue, stop, MONO } from "./ui.js";

const POLL = 3000;

/**
 * For a role that draws portraits or spoken lines: draws once more when a change (a
 * glitch cut, a line being typed) has had its moment, so that it comes to rest.
 */
function settle(cx) {
  if (checking()) return;
  let done = 0;
  cx.timer.every(120, (cx) => {
    const due = settleDue();
    if (due !== done && Date.now() >= due) { done = due; cx.notify(); }
  });
}

/** Started by the one role per layout that owns the data: status files and key commands. */
function own(cx, fromAmbient) {
  if (checking()) return;
  settle(cx);
  cx.timer.every(POLL, () => { pollStatus(); pollRoster(); pollPoses(); shareColors(); });
  cx.spawn(async (cx) => {
    await pollPoses();
    await pollRoster();
    shareColors();
    await pollStatus();
    for (;;) {
      handle(await nextCommand(), fromAmbient);
      cx.notify();
    }
  });
}

const tabsLine = (ship) => {
  const n = ship.space.tabs?.length ?? 0;
  return `${n} tab${n === 1 ? "" : "s"}`;
};

function summary(ship) {
  const crew = ship.members.filter((m) => m.agent).length;
  return `${crew ? `${crew} crew` : "no crew"} · ${tabsLine(ship)}`;
}

/** The small square with a control-group number. */
function slotKey(n, color) {
  const t = theme();
  return div().flex_none().w(16).h(16).rounded(3).border_1().border_color(n ? color : t.border)
    .flex().items_center().justify_center().font_family(MONO).text_size(10).font_weight(700)
    .text_color(n ? color : t.dim).child(n ? String(n) : "·");
}

// ------------------------------------------------------------------ rail

// Below COMPACT_BELOW the rail has no room for text: portraits only.

class Rail {
  init(_pr, cx) {
    this.width = 268; // the sidebar's width in layouts/cockpit.json, until the first size report
    own(cx, false);
  }

  /** Collapsed sidebar: the portrait alone, as wide as the rail allows, with the state mark under it. */
  compactMember(m, w) {
    const t = theme();
    const here = Boolean(m.agent?.focused);
    let cell = v_flex().id(`crew-${m.key}`).flex_none().items_center().gap(3).px(2).py(3).rounded(5)
      .bg(here ? t.selected : "#00000000")
      .tooltip(`${callSign(m)} · ${m.name}${m.program ? ` (${m.program})` : ""} · ${LABEL[m.state] ?? m.state}`);
    if (m.agent) {
      cell = cell.cursor_pointer().hover((s) => s.bg(here ? t.selected : t.hover)).on_click(() => goTo(m));
    }
    return cell.on_mouse_down("right", () => openAssign(m.ship))
      .child(feed(m, w, `feed-rail-${m.key}`))
      .child(h_flex().flex_none().h(12).items_center().justify_center().child(mark(m.state, 9)));
  }

  /** Collapsed sidebar: a ship without crew as a tile in its color, with the start of its name. */
  compactCrewless(ship, w) {
    const t = theme();
    const on = ship.space.active;
    return div().id(`ship-${ship.id}`).flex_none().w(w).h(26).rounded(5).cursor_pointer()
      .flex().items_center().justify_center()
      .border_1().border_color(on ? ship.color : t.border).bg(on ? t.selected : "#00000000")
      .hover((s) => s.bg(on ? t.selected : t.hover))
      .tooltip(`${ship.name}: no crew · ${tabsLine(ship)} · right-click to assign crew`)
      .on_click(() => run("space.select", { id: ship.id }))
      .on_mouse_down("right", () => openAssign(ship))
      .child(txt(String(ship.name).slice(0, 2), 12, ship.color, 700));
  }

  compact(crewed, empty) {
    const t = theme();
    const pad = 2; // each portrait cell adds 2 more, which is where the selection shows
    const w = Math.max(24, Math.min(48, Math.floor(this.width) - 4 * pad));
    return v_flex().id("cockpit-rail").size_full().bg(t.chrome).overflow_y_scrollbar().py(8).px(pad).gap(4).items_center()
      .on_size_change((size, cx) => this.resized(size, cx))
      .children(crewed.flatMap((s) => s.members.map((m) => this.compactMember(m, w))))
      .when(Boolean(crewed.length && empty.length), (el) => el
        .child(div().flex_none().w(Math.round(w * 0.6)).h(1).bg(t.border)))
      .children(empty.map((s) => this.compactCrewless(s, w)));
  }

  resized(size, cx) {
    if (size.width === this.width) return;
    this.width = size.width;
    cx.notify();
  }

  member(m, groups) {
    const t = theme();
    const here = Boolean(m.agent?.focused);
    let row = h_flex().id(`crew-${m.key}`).gap(8).p(6).rounded(6).items_center()
      .bg(here ? t.selected : "#00000000");
    if (m.agent) {
      row = row.cursor_pointer().hover((s) => s.bg(here ? t.selected : t.hover))
        .tooltip(`${callSign(m)} · ${m.name}${m.program ? ` (${m.program})` : ""}`)
        .on_click(() => goTo(m));
    }
    // What the crew member is saying: their question when they hail you, else what they are doing.
    const asking = m.state === "hailing" && Boolean(m.file?.question?.text);
    const line = m.state === "asleep" ? "" : asking ? m.file.question.text : m.file?.activity ?? "";
    const said = say(`say-rail-${m.key}`, line, 11, asking ? t.foreground : t.dim, asking ? 600 : 500).truncate();
    return row.on_mouse_down("right", () => openAssign(m.ship))
      .child(feed(m, 48, `feed-rail-${m.key}`))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center()
          .child(txt(callSign(m), 14, m.agent ? m.ship.color : t.muted, 700).flex_1().min_w(0).truncate())
          .when(Boolean(m.agent), (el) => el.child(slotKey(slotOf(m, groups), m.ship.color))))
        .child(txt(m.name, 11, t.muted, 500).truncate())
        .child(badge(m.state, 10))
        .when(Boolean(line), (el) => el.child(said)));
  }

  crewless(ship) {
    const t = theme();
    const on = ship.space.active;
    return h_flex().id(`ship-${ship.id}`).gap(8).px(8).h(30).rounded(6).items_center().cursor_pointer()
      .border_1().border_color(on ? ship.color : t.border).bg(on ? t.selected : "#00000000")
      .hover((s) => s.bg(on ? t.selected : t.hover))
      .tooltip(`${ship.name}: no crew · right-click to assign crew`)
      .on_click(() => run("space.select", { id: ship.id }))
      .on_mouse_down("right", () => openAssign(ship))
      .child(div().flex_none().w(4).h(14).bg(ship.color))
      .child(txt(ship.name, 13, ship.color, 700).flex_1().min_w(0).truncate())
      .child(txt(tabsLine(ship), 11, t.dim, 500).flex_none());
  }

  render() {
    const t = theme();
    const ships = fleet();
    const groups = slots(ships);
    const crewed = ships.filter((s) => s.members.length);
    const empty = ships.filter((s) => !s.members.length);
    setAgentOrder(crewed.flatMap((s) => s.members.filter((m) => m.agent).map((m) => m.agent.address)));
    if (this.width < COMPACT_BELOW) return this.compact(crewed, empty);
    return v_flex().id("cockpit-rail").size_full().bg(t.chrome).overflow_y_scrollbar().p(8).gap(4)
      .on_size_change((size, cx) => this.resized(size, cx))
      .child(heading("Crew"))
      .when(!crewed.length, (el) => el.child(txt("No agents running.", 12, t.muted)))
      .children(crewed.flatMap((s) => s.members.map((m) => this.member(m, groups))))
      .when(Boolean(empty.length), (el) => el
        .child(div().h(6).flex_none())
        .child(heading("No crew"))
        .children(empty.map((s) => this.crewless(s))));
  }
}

// ------------------------------------------------------------------ journal

class Journal {
  init(_pr, cx) {
    settle(cx);
    if (!checking()) cx.timer.every(60_000, (cx) => cx.notify()); // keeps "4 min ago" honest
  }

  section(title, body) {
    return v_flex().gap(4).child(heading(title)).child(body);
  }

  /** The button that collapses the journal to a rail, or opens it again. */
  toggle(narrow) {
    const t = theme();
    return div().id("journal-toggle").flex_none().w(22).h(20).rounded(4).flex().items_center().justify_center()
      .font_family(MONO).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(narrow ? "Open the journal" : "Collapse the journal").on_mouse_down("left", stop)
      .on_click(() => toggleJournal()).child(narrow ? "<" : ">");
  }

  /** Collapsed: who is in front of you and their state, nothing to read. A click opens the journal. */
  rail(m) {
    const t = theme();
    let col = v_flex().id("cockpit-journal").size_full().bg(t.chrome).py(8).gap(8).items_center()
      .cursor_pointer().on_click(() => toggleJournal())
      .child(this.toggle(true));
    if (!m) return col.tooltip("Journal");
    const f = m.file;
    const asks = Boolean(f?.question) && m.state === "hailing";
    return col
      .tooltip(`${callSign(m)} · ${LABEL[m.state] ?? m.state}${f?.milestone ? ` · ${f.milestone}` : ""}${asks ? " · decision needed" : ""}`)
      .child(feed(m, 36, `feed-journal-${m.key}`))
      .child(h_flex().flex_none().h(12).items_center().justify_center().child(mark(m.state, 9)))
      .when(Boolean(f?.progress), (el) => el.child(txt(`${f.progress.done}/${f.progress.total}`, 10, t.muted, 600)));
  }

  decision(m) {
    const t = theme();
    const q = m.file.question;
    const urgent = m.state === "hailing";
    let box = v_flex().gap(6).p(10).rounded(6).border_1().border_color(urgent ? "#ffffff" : t.border).bg(t.surface)
      .child(h_flex().gap(6).items_center()
        .when(urgent, (el) => el.child(mark("hailing", 10)))
        .child(heading(urgent ? "Decision needed" : "Last question")))
      .child(txt(q.text, 13, t.foreground, 500));
    q.options.forEach((o, i) => {
      box = box.child(h_flex().gap(6).items_start()
        .child(txt(`${i + 1}.`, 12, t.muted, 700).flex_none())
        .child(txt(o, 12, t.foreground, 500).flex_1().min_w(0)));
    });
    if (q.recommendation) {
      box = box.child(v_flex().gap(2).pt(2)
        .child(heading("Recommended"))
        .child(txt(q.recommendation, 12, m.ship.color, 600)));
    }
    return box;
  }

  render() {
    const t = theme();
    const m = current(fleet());
    if (journalNarrow()) return this.rail(m);
    let col = v_flex().id("cockpit-journal").size_full().bg(t.chrome).overflow_y_scrollbar().p(12).gap(14);
    if (!m) {
      return col.child(h_flex().items_center().child(heading("Journal").flex_1()).child(this.toggle(false)))
        .child(txt("No crew member in front of you.", 12, t.muted));
    }
    const f = m.file;
    // No names here: the pane header, at the same height, says whose journal this is.
    col = col.child(h_flex().gap(10).items_start()
      .child(feed(m, 64, `feed-journal-${m.key}`))
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(badge(m.state, 12))
        .when(Boolean(f?.milestone), (el) => el
          .child(div().pt(4).child(heading(f.kind === "milestone" ? "Milestone" : "Task")))
          .child(txt(f.milestone, 13, t.foreground, 600))))
      .child(this.toggle(false)));
    if (!f && m.sharedAt) {
      // Reports are arriving, but in the one file this ship's agents share.
      return col.child(this.section("Journal", v_flex().gap(6)
        .child(txt(`A status was written ${ago(m.sharedAt)} to the file this ship's agents share (.cockpit/status.json), so it cannot be shown: the cockpit cannot tell whose it is.`, 12, t.foreground, 500))
        .child(txt("Each agent needs a name of its own. In a box, that is CODEBOX_SESSION: update ccbox and restart the agent. See docs/agent-instructions.md.", 12, t.muted))));
    }
    if (!f) {
      return col.child(this.section("Journal",
        txt("This agent has not reported yet. Its task, current activity and pending question appear here once it pipes a status to .cockpit/report (see docs/agent-instructions.md).", 12, t.muted)));
    }
    const p = f.milestone ? f.progress : null;
    if (p) {
      const W = 200;
      col = col.child(h_flex().gap(8).items_center()
        .child(div().relative().flex_none().w(W).h(4).bg(t.border)
          .child(div().absolute().left(0).top(0).h(4).w(Math.round(W * Math.min(1, p.done / p.total))).bg(m.ship.color)))
        .child(txt(`${p.done}/${p.total} ${f.kind === "milestone" ? "issues" : "steps"}`, 11, t.muted)));
    }
    if (f.question) col = col.child(this.decision(m));
    if (f.activity) col = col.child(this.section("Now", txt(f.activity, 13, t.foreground, 500)));
    if (f.decisions.length) {
      col = col.child(this.section("Earlier decisions", v_flex().gap(4)
        .children(f.decisions.map((d) => h_flex().gap(6).items_start()
          .child(txt("-", 12, t.dim).flex_none())
          .child(txt(d, 12, t.muted).flex_1().min_w(0))))));
    }
    if (f.updated) col = col.child(txt(`Status written ${ago(f.updated)}`, 10, t.dim));
    return col;
  }
}

// ------------------------------------------------------------------ pane header

class PaneHead {
  init() {}

  /** A hatched tag for panes that run on the host, where a wrong command costs the most. */
  host() {
    const stripes = [];
    for (let i = 0; i < 4; i++) stripes.push(div().flex_none().w(3).h(14).bg(i % 2 ? "#00000000" : "#F5C542"));
    return h_flex().flex_none().gap(4).items_center().px(5).h(20).rounded(3).border_1().border_color("#F5C542")
      .child(h_flex().gap(2).children(stripes))
      .child(txt("HOST", 10, "#F5C542", 800));
  }

  render() {
    const t = theme();
    const me = props()?.pane;
    const p = panes().find((x) => x.pane === me);
    if (!p) return div().size_full().bg(t.chrome);
    const ships = fleet();
    const m = p.terminal ? ships.flatMap((s) => s.members).find((x) => x.agent?.address === p.terminal) : null;
    const ship = m?.ship ?? activeShip(ships);
    const btn = (key, label, tip, command, args) =>
      div().id(`${key}-${me}`).flex_none().w(22).h(20).rounded(4).flex().items_center().justify_center()
        .font_family(MONO).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
        .tooltip(tip).on_mouse_down("left", stop).on_click(() => run(command, { pane: me, ...args })).child(label);
    // A terminal's title is left out: an agent's is its session name, which says little after
    // the first prompts, and a shell's is the path, shown next to it anyway. Nor the harness:
    // Herdr's tab already shows its icon.
    const label = p.terminal ? "" : p.title;
    return h_flex().id(`cockpit-pane-${me}`).size_full().bg(p.focused ? t.surface : t.chrome).items_center().gap(8).pr(6)
      .on_click(() => run("pane.focus", { pane: me }))
      .when(Boolean(ship), (el) => el.on_mouse_down("right", () => openAssign(ship)))
      .child(div().flex_none().w(4).h_full().bg(ship?.color ?? t.border))
      // Where you are: the ship, large for this strip, then who. The state is in the rail and the journal.
      .when(Boolean(ship), (el) => el.child(txt(m ? callSign(m) : ship.name, 14, ship.color, 700).flex_none()))
      .when(Boolean(m), (el) => el.child(txt(m.name, 12, t.foreground, 600).flex_none()))
      .when(!m && Boolean(p.terminal), (el) => el.child(this.host()))
      .when(Boolean(label), (el) => el.child(txt(label, 12, t.foreground, 600).flex_none()))
      .child(h_flex().flex_1().min_w(0).gap(10).items_center().text_color(t.dim)
        .child(txt(p.cwd ?? "", 11, t.dim).min_w(0).truncate())
        // The same icon as Herdr's status bar, from a mod Herdr ships.
        .when(Boolean(p.branch), (el) => el.child(h_flex().flex_none().gap(4).items_center()
          .child(svg("mods/workspace-chrome/branch.svg").flex_none().size(12).text_color(ship?.color ?? t.dim))
          .child(txt(p.branch, 11, t.dim)))))
      .child(h_flex().flex_none().gap(2)
        .child(btn("split-r", "|", "Split right", "pane.split", { direction: "right" }))
        .child(btn("split-d", "=", "Split down", "pane.split", { direction: "down" }))
        .child(btn("zoom", "+", "Zoom", "pane.zoom", {}))
        .child(btn("close", "x", "Close", "pane.close", {})));
  }
}

// ------------------------------------------------------------------ ambient

class Ambient {
  init(_pr, cx) {
    this.width = 1600;
    own(cx, true);
  }

  card(m, n, w) {
    const t = theme();
    const f = m.file;
    const hailing = m.state === "hailing";
    // Drawn even when empty, so that a line that appears later counts as a change and is typed out.
    const doing = say(`say-card-${m.key}`, f?.activity ?? "", 14, t.muted, 500);
    const ask = hailing ? f?.question?.text ?? "" : "";
    const asking = say(`ask-card-${m.key}`, ask, 15, t.foreground, 600);
    return v_flex().id(`card-${m.key}`).flex_1().min_w(0).h_full().bg(t.surface).rounded(8).overflow_hidden().cursor_pointer()
      .border_1().border_color(hailing ? "#ffffff" : t.border)
      .on_click(() => goTo(m, true))
      .child(div().flex_none().h(8).bg(m.ship.color))
      .child(v_flex().flex_1().min_h(0).p(18).gap(12)
        .child(h_flex().gap(10).items_center()
          .child(txt(callSign(m), 38, m.ship.color, 700).flex_1().min_w(0).truncate())
          .child(slotKey(n, m.ship.color)))
        .child(h_flex().justify_center().child(feed(m, w, `feed-card-${m.key}`)))
        .child(txt(m.name.toUpperCase(), 12, t.muted, 700))
        .child(badge(m.state, 22))
        .when(Boolean(f?.milestone), (el) => el.child(txt(f.milestone, 16, t.foreground, 600).truncate()))
        .when(Boolean(f?.activity), (el) => el.child(doing))
        .when(Boolean(ask), (el) => el.child(asking)));
  }

  chip(ship) {
    const t = theme();
    const crewed = ship.members.some((m) => m.agent);
    return v_flex().id(`chip-${ship.id}`).flex_none().px(12).py(6).gap(2).rounded(6).cursor_pointer()
      .border_1().border_color(crewed ? ship.color : t.border)
      .hover((s) => s.bg(t.hover))
      .on_click(() => { run("layout.switch", { name: "cockpit" }); run("space.select", { id: ship.id }); })
      .child(txt(ship.name, 15, crewed ? ship.color : t.muted, 700))
      .child(txt(summary(ship), 11, t.dim, 500));
  }

  render() {
    const t = theme();
    const ships = fleet();
    const groups = slots(ships);
    const shown = groups.filter(Boolean);
    setAgentOrder(shown.map((m) => m.agent.address));
    // Portrait width from the window: four cards across, each with its padding.
    const w = Math.max(120, Math.min(300, Math.floor((this.width - 5 * 16) / 4) - 60));
    return v_flex().id("cockpit-ambient").size_full().bg(t.canvas).p(16).gap(16)
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .child(shown.length
        ? h_flex().flex_1().min_h(0).gap(16).children(groups.map((m, i) => (m ? this.card(m, i + 1, w) : null)).filter(Boolean))
        : v_flex().flex_1().items_center().justify_center().gap(6)
            .child(txt("All hands asleep", 28, t.muted, 700))
            .child(txt("No agent is running in any ship.", 14, t.dim)))
      .child(h_flex().flex_none().flex_wrap().gap(10).children(ships.map((s) => this.chip(s))));
  }
}

// ------------------------------------------------------------------ crew assignment

const RANK_NAMES = ["Captain", "Lieutenant", "Ensign"];

class Assign {
  init() {
    this.error = "";
  }

  /** Saves a changed roster; the popup stays open and redraws from it. */
  apply(next, cx) {
    cx.spawn(async (cx) => {
      this.error = (await saveRoster(next)) ? "" : "Could not write cockpit-roster.json. Nothing was changed.";
      cx.notify();
    });
  }

  button(id, label, tip, act) {
    const t = theme();
    return div().id(id).flex_none().px(6).h(20).rounded(4).border_1().border_color(t.border)
      .flex().items_center().justify_center().text_size(11).font_weight(600).text_color(t.muted)
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_mouse_down("left", stop).on_click((_e, cx) => act(cx)).child(label);
  }

  row(id, ship, ships) {
    const t = theme();
    const here = ships[ship.key]?.crew ?? [];
    const seat = here.indexOf(id);
    // Named and colored as the fleet shows it now; from the roster alone when its space is not open.
    const [postKey, listed] = Object.entries(ships).find(([, s]) => s.crew.includes(id)) ?? [];
    const posting = fleet().find((s) => s.key === postKey) ?? listed;
    // The thumbnail's frame is the color of the ship the crew member serves on now.
    const face = { name: CREW[id].name, state: "idle", ship: { color: posting?.color ?? t.border },
      portrait: CREW[id].portrait ? `mods/cockpit/crew/${CREW[id].portrait}-base.png` : null };
    let row = h_flex().id(`assign-${id}`).gap(8).p(6).rounded(6).items_center()
      .child(feed(face, 30, `assign-feed-${id}`));
    if (seat >= 0) {
      return row.bg(t.selected)
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(txt(CREW[id].name, 13, ship.color, 700).truncate())
          .child(txt(RANK_NAMES[seat] ?? `Seat ${seat + 1}`, 11, t.muted)))
        .when(seat > 0, (el) => el.child(this.button(`assign-up-${id}`, "Promote", "Move up one rank",
          (cx) => this.apply(withAssigned(ships, id, ship, seat - 1), cx))))
        .child(this.button(`assign-off-${id}`, "Remove", `Take ${CREW[id].name} off ${ship.name}`,
          (cx) => this.apply(withUnassigned(ships, id), cx)));
    }
    return row.cursor_pointer().hover((s) => s.bg(t.hover))
      .tooltip(posting ? `Move ${CREW[id].name} from ${posting.name} to ${ship.name}` : `Assign ${CREW[id].name} to ${ship.name}`)
      .on_click((_e, cx) => this.apply(withAssigned(ships, id, ship), cx))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(txt(CREW[id].name, 13, t.foreground, 700).truncate())
        .child(txt(posting ? `on ${posting.name}` : "unassigned", 11, posting ? posting.color : t.dim)))
      .child(txt(posting ? "Move here" : "Assign", 11, t.dim, 600).flex_none());
  }

  render() {
    const t = theme();
    const all = fleet();
    const ship = all.find((s) => s.id === props()?.ship) ?? activeShip(all);
    let col = v_flex().id("cockpit-assign").w_full().min_h(0).p(8).gap(4).bg(t.popover ?? t.surface);
    if (!ship) return col.child(txt("No ship selected.", 12, t.muted));
    const ships = roster();
    const here = (ships[ship.key]?.crew ?? []).filter((id) => CREW[id]);
    const others = Object.keys(CREW).filter((id) => !here.includes(id));
    return col
      .child(h_flex().gap(8).items_center().px(6).pt(2)
        .child(div().flex_none().w(4).h(16).bg(ship.color))
        .child(txt(ship.name, 15, ship.color, 700).flex_1().min_w(0).truncate())
        .child(this.button("assign-close", "Close", "Close", () => closeOverlay(props()?.overlay))))
      .child(div().px(6).child(heading(here.length ? "Crew of this ship" : "No crew yet")))
      .children(here.map((id) => this.row(id, ship, ships)))
      .when(Boolean(others.length), (el) => el
        .child(div().px(6).pt(4).child(heading("Available")))
        .children(others.map((id) => this.row(id, ship, ships))))
      .when(Boolean(this.error), (el) => el.child(div().px(6).child(txt(this.error, 11, t.foreground, 600))));
  }
}

// ------------------------------------------------------------------ the mod

const ROLES = { rail: Rail, journal: Journal, pane: PaneHead, ambient: Ambient, assign: Assign };

export default class Cockpit extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const Role = ROLES[pr.role] ?? (pr.pane ? PaneHead : null);
    this.role = Role ? new Role() : null;
    this.role?.init?.(pr, cx);
    // No role (herdr-app check): every role at once, so the check covers them all.
    if (!this.role) {
      this.all = Object.values(ROLES).map((K) => {
        const r = new K();
        r.init?.(pr, cx);
        return r;
      });
    }
  }

  render(cx) {
    if (!this.role) return v_flex().size_full().children(this.all.map((r) => div().h(240).child(r.render(cx))));
    return this.role.render(cx);
  }
}
