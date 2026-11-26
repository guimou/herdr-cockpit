// Herdr Cockpit: projects are ships, agents are crew. One mod, several roles
// (props.role), placed by layouts/cockpit.json and layouts/cockpit-ambient.json:
//   rail     active view, left: crew portraits by ship (running agents, then the asleep), then ships without crew
//   journal  active view, right: state, task or milestone, current activity, pending decision
//   pane     active view, each pane's header: the ship and crew member (or HOST marker), pane buttons
//   ambient  ambient view, whole window: up to eight crew cards a page, and the fleet strip
//   assign   a popup, opened by a right-click on a ship or crew member: who serves on this ship

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme, panes, run, nextCommand, setAgentOrder, checking, closeOverlay } from "herdr";
import {
  fleet, slots, slotOf, muster, pages, current, activeShip, inFront, callSign, goTo, handle, pollStatus, ago, LABEL,
  roster, pollRoster, pollPoses, portraitOf, shareColors, withAssigned, withUnassigned, saveRoster, openAssign,
  COMPACT_BELOW, journalNarrow, toggleJournal, FOLDED, folded, toggleFold, ASSIGN_HEIGHT,
} from "./model.js";
import { CREW, RANKS } from "./fleet.js";
import { txt, say, heading, badge, mark, feed, hostMark, settleDue, stop, MONO } from "./ui.js";

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
    const here = inFront(m);
    const cell = v_flex().id(`crew-${m.key}`).flex_none().items_center().gap(3).px(2).py(3).rounded(5)
      .bg(here ? t.selected : "#00000000")
      .tooltip(`${callSign(m)} · ${m.name}${m.program ? ` (${m.program})` : ""} · ${LABEL[m.state] ?? m.state}${m.agent ? "" : " · click to open the ship"}`)
      .cursor_pointer().hover((s) => s.bg(here ? t.selected : t.hover)).on_click(() => goTo(m));
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

  compact(awake, asleep, empty) {
    const t = theme();
    const pad = 2; // each portrait cell adds 2 more, which is where the selection shows
    const w = Math.max(24, Math.min(48, Math.floor(this.width) - 4 * pad));
    const rule = () => div().flex_none().w(Math.round(w * 0.6)).h(1).bg(t.border);
    return this.frame(true, v_flex().pb(8).px(pad).gap(4).items_center(), [
      ...awake.map((m) => this.compactMember(m, w)),
      ...(awake.length && asleep.length ? [rule()] : []),
      ...asleep.map((m) => this.compactMember(m, w)),
      ...((awake.length || asleep.length) && empty.length ? [rule()] : []),
      ...empty.map((s) => this.compactCrewless(s, w)),
    ]);
  }

  /**
   * The rail, built as Herdr's Spaces panel (the Ships panel) is: a header with the title,
   * over a list that takes the rest of the height and always shows its scrollbar. The rows
   * are flex_none, so that a long list scrolls instead of squeezing them. The button before
   * the title folds the panel down to this header, and opens it again.
   */
  frame(compact, list, rows) {
    const t = theme();
    const shut = folded("rail");
    const fold = div().id("crew-fold").size(20).flex_none().flex().items_center().justify_center().rounded(5)
      .text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(shut ? "Open the Crew panel" : "Fold the Crew panel")
      .on_click(() => toggleFold("rail"))
      .child(svg(`mods/workspace-chrome/chevron-${shut ? "right" : "down"}.svg`).size(11));
    return v_flex().id("cockpit-rail").size_full().min_h(0).bg(t.chrome)
      .on_size_change((size, cx) => this.resized(size, cx))
      .child(h_flex().flex_none().h(FOLDED).gap(4).items_center().text_size(11.5).text_color(t.dim)
        .when(compact, (el) => el.justify_center())
        .when(!compact, (el) => el.pl(16).pr(10))
        .child(fold)
        .when(!compact, (el) => el.child("Crew")))
      .when(!shut, (el) => el.child(list.flex_1().min_h(0).overflow_y_scrollbar().mode("always").children(rows)));
  }

  resized(size, cx) {
    if (size.width === this.width) return;
    this.width = size.width;
    cx.notify();
  }

  member(m, groups) {
    const t = theme();
    const here = inFront(m);
    const row = h_flex().id(`crew-${m.key}`).flex_none().gap(8).p(6).rounded(6).items_center()
      .bg(here ? t.selected : "#00000000")
      .cursor_pointer().hover((s) => s.bg(here ? t.selected : t.hover))
      .tooltip(`${callSign(m)} · ${m.name}${m.agent ? (m.program ? ` (${m.program})` : "") : " · click to open the ship"}`)
      .on_click(() => goTo(m)); // asleep: opens the ship, to launch the agent there
    // What the crew member is saying: their question when they hail you, else what they are doing.
    const asking = m.state === "hailing" && Boolean(m.file?.question?.text);
    const line = m.state === "asleep" ? "" : asking ? m.file.question.text : m.file?.activity ?? "";
    const said = say(`say-rail-${m.key}`, line, 11, asking ? t.foreground : t.dim, asking ? 600 : 500).truncate();
    return row.on_mouse_down("right", () => openAssign(m.ship))
      .child(feed(m, 48, `feed-rail-${m.key}`))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center()
          .child(txt(callSign(m), 14, m.agent ? m.ship.color : t.muted, 700).flex_1().min_w(0).truncate())
          .child(hostMark(m.ship, 12))
          .when(Boolean(m.agent), (el) => el.child(slotKey(slotOf(m, groups), m.ship.color))))
        .child(txt(m.name, 11, t.muted, 500).truncate())
        .child(badge(m.state, 10))
        .when(Boolean(line), (el) => el.child(said)));
  }

  crewless(ship) {
    const t = theme();
    const on = ship.space.active;
    return h_flex().id(`ship-${ship.id}`).flex_none().gap(8).px(8).h(30).rounded(6).items_center().cursor_pointer()
      .border_1().border_color(on ? ship.color : t.border).bg(on ? t.selected : "#00000000")
      .hover((s) => s.bg(on ? t.selected : t.hover))
      .tooltip(`${ship.name}: no crew · right-click to assign crew`)
      .on_click(() => run("space.select", { id: ship.id }))
      .on_mouse_down("right", () => openAssign(ship))
      .child(div().flex_none().w(4).h(14).bg(ship.color))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(txt(ship.name, 13, ship.color, 700).flex_1().min_w(0).truncate())
        .child(hostMark(ship, 12)))
      .child(txt(tabsLine(ship), 11, t.dim, 500).flex_none());
  }

  render() {
    const t = theme();
    const ships = fleet();
    const groups = slots(ships);
    const crewed = ships.filter((s) => s.members.length);
    const empty = ships.filter((s) => !s.members.length);
    setAgentOrder(crewed.flatMap((s) => s.members.filter((m) => m.agent).map((m) => m.agent.address)));
    // Running agents first, ship by ship; the seats whose agent is not running go under them.
    const crew = crewed.flatMap((s) => s.members);
    const awake = crew.filter((m) => m.agent);
    const asleep = crew.filter((m) => !m.agent);
    if (this.width < COMPACT_BELOW) return this.compact(awake, asleep, empty);
    const gap = () => div().h(6).flex_none();
    return this.frame(false, v_flex().px(8).pb(8).gap(4), [
      ...(awake.length ? [] : [txt("No agents running.", 12, t.muted).flex_none()]),
      ...awake.map((m) => this.member(m, groups)),
      ...(asleep.length ? [gap(), heading("Asleep").flex_none(), ...asleep.map((m) => this.member(m, groups))] : []),
      ...(empty.length ? [gap(), heading("No crew").flex_none(), ...empty.map((s) => this.crewless(s))] : []),
    ]);
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
      .when(Boolean(ship), (el) => el.child(hostMark(ship, 12)))
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

const TURN = 10_000; // how long a page stays up when the crew needs several
const STRIP = 60; // the fleet strip's height, for sizing the cards above it
const SWITCHES = 76; // its height with the page switches in it

class Ambient {
  init(_pr, cx) {
    this.width = 1600;
    this.height = 900;
    this.page = 0;
    this.pages = 1;
    this.pinned = null; // the page whose switch is on: it stays up, and the pages stop turning
    own(cx, true);
    if (checking()) return;
    cx.timer.every(TURN, (cx) => {
      if (this.pages < 2 || this.pinned !== null) return;
      this.page = (this.page + 1) % this.pages;
      cx.notify();
    });
  }

  /** One crew card. `small` when the page has two rows: same content, tighter. */
  card(m, n, w, small) {
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
      // Portrait at the top left; who and what state beside it, so the picture does not
      // take a whole row of height from the text. The report's details get the width below.
      .child(v_flex().flex_1().min_h(0).p(small ? 12 : 18).gap(small ? 10 : 14)
        .child(h_flex().flex_none().gap(small ? 10 : 14).items_start()
          .child(feed(m, w, `feed-card-${m.key}`))
          .child(v_flex().flex_1().min_w(0).gap(4)
            .child(h_flex().gap(8).items_center()
              .child(txt(callSign(m), small ? 24 : 32, m.ship.color, 700).flex_1().min_w(0).truncate())
              .child(hostMark(m.ship, small ? 12 : 14))
              .child(slotKey(n, m.ship.color)))
            .child(txt(m.name.toUpperCase(), 12, t.muted, 700))
            .child(badge(m.state, small ? 16 : 20))
            .when(Boolean(f?.milestone), (el) => el.child(txt(f.milestone, small ? 14 : 16, t.foreground, 600)))))
        .child(v_flex().flex_1().min_h(0).gap(6)
          .when(Boolean(f?.activity), (el) => el.child(doing))
          .when(Boolean(ask), (el) => el.child(asking))));
  }

  chip(ship) {
    const t = theme();
    const crewed = ship.members.some((m) => m.agent);
    return v_flex().id(`chip-${ship.id}`).flex_none().px(12).py(6).gap(2).rounded(6).cursor_pointer()
      .border_1().border_color(crewed ? ship.color : t.border)
      .hover((s) => s.bg(t.hover))
      .on_click(() => { run("layout.switch", { name: "cockpit" }); run("space.select", { id: ship.id }); })
      .child(h_flex().gap(6).items_center()
        .child(txt(ship.name, 15, crewed ? ship.color : t.muted, 700))
        .child(hostMark(ship, 12)))
      .child(txt(summary(ship), 11, t.dim, 500));
  }

  /**
   * One toggle switch per page, shown when there are several. Lever up holds that page and
   * stops the pages turning; lever down again lets them turn. The lamp above the switch is
   * lit for the page on screen, and blinks "!" when someone on that page is hailing.
   */
  pager(decks, at) {
    const t = theme();
    return h_flex().flex_none().gap(10).children(decks.map((deck, i) => {
      const on = this.pinned === i;
      const lamp = deck.some((m) => m.state === "hailing")
        ? mark("hailing", 10)
        : div().flex_none().w(14).h(5).rounded(1).border_1().border_color(i === at ? t.foreground : t.border)
            .bg(i === at ? t.foreground : t.canvas);
      const lever = div().absolute().left(3).w(12).h(14).rounded(2).bg(on ? t.foreground : t.muted);
      return v_flex().id(`page-${i}`).flex_none().gap(3).items_center().cursor_pointer()
        .tooltip(on ? "Let the pages turn again" : `Hold page ${i + 1}`)
        .on_click((_e, cx) => { this.pinned = on ? null : i; this.page = i; cx.notify(); })
        .child(h_flex().flex_none().h(14).items_center().child(lamp))
        .child(div().relative().flex_none().w(20).h(34).rounded(4).bg("#05080d").border_1().border_color(on ? t.foreground : t.border)
          .child(div().absolute().left(8).top(4).w(2).h(24).bg(t.border)) // the slot the lever travels in
          .child(on ? lever.top(2) : lever.bottom(2)))
        .child(txt(i + 1, 11, on || i === at ? t.foreground : t.muted, 700).font_family(MONO));
    }));
  }

  render() {
    const t = theme();
    const ships = fleet();
    const groups = slots(ships);
    const decks = pages(muster(ships));
    this.pages = decks.length;
    if (this.pinned >= decks.length) this.pinned = null; // its page is gone: turn again
    const at = this.page % decks.length;
    const shown = decks[at];
    setAgentOrder(decks.flat().map((m) => m.agent.address));
    // One row up to two crew, two rows up to eight: three or four in one row would be too
    // wide to read from a distance. A short second row keeps the columns.
    const rows = shown.length > 2 ? 2 : 1;
    const cols = Math.ceil(shown.length / rows) || 1;
    const small = rows > 1;
    // Portrait size: the same on every card, from the window's card size. It takes about a
    // third of the card's width, but no more than leaves the details below some height.
    const cardW = (this.width - 16 * (cols + 1)) / cols;
    const cardH = (this.height - 16 * (rows + 2) - (decks.length > 1 ? SWITCHES : STRIP)) / rows;
    const pad = small ? 12 : 18;
    const scale = small ? 84 : 112; // the caption block and one detail line, for the height cap
    const fitW = Math.max(0, cardW - 2 * pad) * 0.3;
    const fitH = Math.max(0, cardH - 8 - 2 * pad - scale) / 1.25;
    const w = Math.floor(Math.max(32, Math.min(180, fitW, fitH > 40 ? fitH : 32)));
    const row = (r) => {
      const cards = shown.slice(r * cols, (r + 1) * cols).map((m) => this.card(m, slotOf(m, groups), w, small));
      while (cards.length < cols) cards.push(div().flex_1().min_w(0));
      return h_flex().flex_1().min_h(0).gap(16).children(cards);
    };
    return v_flex().id("cockpit-ambient").size_full().bg(t.canvas).p(16).gap(16)
      .on_size_change((size, cx) => {
        if (size.width === this.width && size.height === this.height) return;
        this.width = size.width;
        this.height = size.height;
        cx.notify();
      })
      .children(shown.length
        ? Array.from({ length: rows }, (_, r) => row(r))
        : [v_flex().flex_1().items_center().justify_center().gap(6)
            .child(txt("All hands asleep", 28, t.muted, 700))
            .child(txt("No agent is running in any ship.", 14, t.dim))])
      .child(h_flex().flex_none().gap(16).items_center()
        .child(h_flex().flex_1().min_w(0).flex_wrap().gap(10).children(ships.map((s) => this.chip(s))))
        .when(decks.length > 1, (el) => el.child(this.pager(decks, at))));
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
    const face = { name: CREW[id].name, state: "idle", ship: { color: posting?.color ?? t.border }, portrait: portraitOf(CREW[id]) };
    let row = h_flex().id(`assign-${id}`).flex_none().gap(8).p(6).rounded(6).items_center()
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
    // Pinned, not size_full: a popup is as tall as its content, and the scrolling list
    // below is flex_1, which needs a height to fill or it draws nothing.
    let col = v_flex().id("cockpit-assign").w_full().min_h(ASSIGN_HEIGHT).p(8).gap(4).bg(t.popover ?? t.surface);
    if (!ship) return col.child(txt("No ship selected.", 12, t.muted));
    const ships = roster();
    const here = (ships[ship.key]?.crew ?? []).filter((id) => CREW[id]);
    const others = Object.keys(CREW).filter((id) => !here.includes(id));
    return col
      .child(h_flex().gap(8).items_center().px(6).pt(2)
        .child(div().flex_none().w(4).h(16).bg(ship.color))
        .child(txt(ship.name, 15, ship.color, 700).flex_1().min_w(0).truncate())
        .child(hostMark(ship, 12))
        .child(this.button("assign-close", "Close", "Close", () => closeOverlay(props()?.overlay))))
      // The whole crew does not fit the popup: the list scrolls under the ship's name, as the rail does.
      .child(v_flex().id("assign-list").flex_1().min_h(0).gap(4).overflow_y_scrollbar().mode("always")
        .child(div().flex_none().px(6).child(heading(here.length ? "Crew of this ship" : "No crew yet")))
        .children(here.map((id) => this.row(id, ship, ships)))
        .when(Boolean(others.length), (el) => el
          .child(div().flex_none().px(6).pt(4).child(heading("Available")))
          .children(others.map((id) => this.row(id, ship, ships)))))
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
