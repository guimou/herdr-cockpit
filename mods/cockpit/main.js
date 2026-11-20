// Herdr Cockpit: projects are ships, agents are crew. One mod, several roles
// (props.role), placed by layouts/cockpit.json and layouts/cockpit-ambient.json:
//   rail     active view, left: crew portraits by ship, then ships without crew
//   header   active view, top: the ship and crew member in front of you
//   journal  active view, right: milestone, current activity, pending decision
//   pane     active view, each pane's header: crew or HOST marker, pane buttons
//   ambient  ambient view, whole window: four large crew cards and the fleet strip

import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme, panes, run, nextCommand, setAgentOrder, checking } from "herdr";
import { fleet, slots, slotOf, current, activeShip, callSign, goTo, handle, pollStatus, ago, LABEL } from "./model.js";
import { txt, heading, badge, mark, feed, stop, MONO } from "./ui.js";

const POLL = 3000;

/** Started by the one role per layout that owns the data: status files and key commands. */
function own(cx, fromAmbient) {
  if (checking()) return;
  cx.timer.every(POLL, () => { pollStatus(); });
  cx.spawn(async (cx) => {
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

// Below this width the rail has no room for text: portraits only.
const COMPACT_BELOW = 132;

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
    return cell
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
      .tooltip(`${ship.name}: no crew · ${tabsLine(ship)}`)
      .on_click(() => run("space.select", { id: ship.id }))
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
    return row
      .child(feed(m, 48, `feed-rail-${m.key}`))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center()
          .child(txt(callSign(m), 14, m.agent ? m.ship.color : t.muted, 700).flex_1().min_w(0).truncate())
          .when(Boolean(m.agent), (el) => el.child(slotKey(slotOf(m, groups), m.ship.color))))
        .child(txt(m.name, 11, t.muted, 500).truncate())
        .child(badge(m.state, 10))
        .when(Boolean(m.file?.activity) && m.state !== "asleep", (el) => el.child(txt(m.file.activity, 11, t.dim, 500).truncate())));
  }

  crewless(ship) {
    const t = theme();
    const on = ship.space.active;
    return h_flex().id(`ship-${ship.id}`).gap(8).px(8).h(30).rounded(6).items_center().cursor_pointer()
      .border_1().border_color(on ? ship.color : t.border).bg(on ? t.selected : "#00000000")
      .hover((s) => s.bg(on ? t.selected : t.hover))
      .tooltip(`${ship.name}: no crew`)
      .on_click(() => run("space.select", { id: ship.id }))
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

// ------------------------------------------------------------------ header

class Header {
  init() {}

  render() {
    const t = theme();
    const ships = fleet();
    const m = current(ships);
    const ship = m?.ship ?? activeShip(ships);
    if (!ship) return div().size_full().bg(t.chrome);
    let bar = h_flex().id("cockpit-header").size_full().bg(t.chrome).items_center().gap(14).pr(14)
      .child(div().flex_none().w(6).h_full().bg(ship.color))
      .child(txt(m ? callSign(m) : ship.name, 24, ship.color, 700).flex_none());
    if (!m) return bar.child(txt(summary(ship), 13, t.muted).flex_1().min_w(0).truncate());
    const p = m.file?.progress;
    return bar
      .child(txt(`${m.name}${m.program ? ` · ${m.program}` : ""}`, 12, t.muted).flex_none())
      .child(badge(m.state, 12))
      .child(txt(m.file?.milestone ?? "", 13, t.foreground, 600).flex_1().min_w(0).truncate())
      .when(Boolean(p), (el) => el.child(txt(`${p.done}/${p.total}`, 12, t.muted, 600).flex_none()));
  }
}

// ------------------------------------------------------------------ journal

class Journal {
  init(_pr, cx) {
    if (!checking()) cx.timer.every(60_000, (cx) => cx.notify()); // keeps "4 min ago" honest
  }

  section(title, body) {
    return v_flex().gap(4).child(heading(title)).child(body);
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
    let col = v_flex().id("cockpit-journal").size_full().bg(t.chrome).overflow_y_scrollbar().p(12).gap(14);
    if (!m) return col.child(heading("Journal")).child(txt("No crew member in front of you.", 12, t.muted));
    col = col.child(h_flex().gap(10).items_center()
      .child(feed(m, 64, `feed-journal-${m.key}`))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(txt(callSign(m), 16, m.ship.color, 700).truncate())
        .child(txt(m.name, 11, t.muted).truncate())
        .child(badge(m.state, 11))));
    const f = m.file;
    if (!f) {
      return col.child(this.section("Journal",
        txt("This agent has not written a status file yet. Its milestone, current activity and pending question appear here once it writes .cockpit/<terminal id>.json in the repo.", 12, t.muted)));
    }
    if (f.question) col = col.child(this.decision(m));
    if (f.milestone) {
      const p = f.progress;
      const W = 200;
      col = col.child(this.section("Milestone", v_flex().gap(6)
        .child(txt(f.milestone, 13, t.foreground, 600))
        .when(Boolean(p), (el) => el.child(h_flex().gap(8).items_center()
          .child(div().relative().flex_none().w(W).h(4).bg(t.border)
            .child(div().absolute().left(0).top(0).h(4).w(Math.round(W * Math.min(1, p.done / p.total))).bg(m.ship.color)))
          .child(txt(`${p.done}/${p.total} issues`, 11, t.muted))))));
    }
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
    const where = `${p.cwd ?? ""}${p.branch ? `  [${p.branch}]` : ""}`;
    return h_flex().id(`cockpit-pane-${me}`).size_full().bg(p.focused ? t.surface : t.chrome).items_center().gap(8).pr(6)
      .on_click(() => run("pane.focus", { pane: me }))
      .child(div().flex_none().w(4).h_full().bg(ship?.color ?? t.border))
      .when(Boolean(m), (el) => el
        .child(txt(m.name, 12, m.ship.color, 700).flex_none())
        .child(badge(m.state, 10)))
      .when(!m && Boolean(p.terminal), (el) => el.child(this.host()))
      .child(txt(p.title || p.program?.name || "", 12, t.foreground, 600).flex_none())
      .child(txt(where, 11, t.dim).flex_1().min_w(0).truncate())
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
        .when(Boolean(f?.activity), (el) => el.child(txt(f.activity, 14, t.muted, 500)))
        .when(hailing && Boolean(f?.question), (el) => el.child(txt(f.question.text, 15, t.foreground, 600))));
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

// ------------------------------------------------------------------ the mod

const ROLES = { rail: Rail, header: Header, journal: Journal, pane: PaneHead, ambient: Ambient };

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
