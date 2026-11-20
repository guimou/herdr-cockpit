// Shared drawing: text, the state mark, and the comm-feed portrait frame.
// Ship identity is carried by color. State is carried by shape, motion and a
// caption, never by color alone.

import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { LABEL } from "./model.js";

export const MONO = "JetBrains Mono"; // ships with Herdr
const SIGNAL = "#ffffff";
const FEED_BG = "#05080d";

export const stop = (_e, cx) => cx.stop_propagation();

export const txt = (s, size = 13, color = null, weight = 500) =>
  div().text_size(size).font_weight(weight).text_color(color ?? theme().foreground).child(String(s ?? ""));

/** Small spaced capitals for section headings. */
export const heading = (s) => txt(String(s).toUpperCase(), 10, theme().dim, 700);

/** The moving or still mark of a state, about `size` px tall. */
export function mark(state, size = 12) {
  const t = theme();
  const anim = (frames, ms) =>
    div().flex_none().font_family(MONO).text_size(size).font_weight(700).text_color(t.foreground).frames(frames, ms);
  if (state === "hailing") {
    return div().flex_none().w(size + 4).h(size + 4).rounded(2).bg(SIGNAL).flex().items_center().justify_center()
      .text_size(size).font_weight(800).text_color("#000000").child("!")
      .loop("opacity", { from: 0.25, to: 1, period: 520 });
  }
  if (state === "working") return anim([">  ", ">> ", ">>>", "   "], 260);
  if (state === "thinking") return anim([".  ", ".. ", "...", "   "], 420);
  if (state === "subagents") return anim(["o..", ".o.", "..o", ".o."], 300);
  if (state === "ci") return anim(["[=  ]", "[== ]", "[===]", "[   ]"], 380);
  if (state === "done") return div().flex_none().size(size - 2).rounded(1).bg(t.foreground);
  if (state === "asleep") return div().flex_none().font_family(MONO).text_size(size).text_color(t.dim).child("z z");
  return div().flex_none().size(size - 2).rounded(1).border_1().border_color(t.muted); // idle
}

/** Mark and caption together. */
export function badge(state, size = 12) {
  const t = theme();
  const quiet = state === "idle" || state === "asleep";
  return h_flex().flex_none().gap(Math.round(size / 2)).items_center()
    .child(mark(state, size))
    .child(txt(LABEL[state] ?? state, size, quiet ? t.muted : t.foreground, 700));
}

/**
 * A crew portrait in its comm-feed frame, `w` wide and 4:5. The border takes
 * the ship's color; what moves inside the frame tells the state.
 */
export function feed(member, w, id) {
  const t = theme();
  const state = member.state;
  const asleep = state === "asleep";
  const b = w >= 120 ? 3 : 2;
  const iw = w - 2 * b;
  const ih = Math.round(w * 1.25) - 2 * b;

  let screen = div().relative().w(iw).h(ih).overflow_hidden().bg(FEED_BG);
  if (member.portrait) {
    screen = screen.child(image(member.portrait).absolute().left(0).top(0).w(iw).h(ih).opacity(asleep ? 0.28 : 1));
  } else {
    screen = screen.child(div().absolute().left(0).top(0).w(iw).h(ih).flex().items_center().justify_center()
      .text_size(Math.round(iw * 0.5)).font_weight(700).text_color(asleep ? t.dim : member.ship.color)
      .child(String(member.name).slice(0, 1).toUpperCase()));
  }

  // Scanlines, on portraits large enough to show them.
  if (iw >= 96) {
    const lines = [];
    for (let y = 2; y < ih; y += 4) lines.push(div().absolute().left(0).top(y).w(iw).h(1).bg("#00000038"));
    screen = screen.children(lines);
  }

  if (state === "working") {
    // a band of light sweeping across
    const band = Math.max(8, Math.round(iw * 0.22));
    screen = screen.child(div().absolute().top(0).left(-band).w(band).h(ih).bg("#ffffff26")
      .loop("left", { from: -band, to: iw, period: 2200, easing: "linear" }));
  } else if (state === "thinking") {
    screen = screen.child(div().absolute().right(4).bottom(2).font_family(MONO).text_size(Math.max(11, Math.round(iw / 6)))
      .font_weight(800).text_color(SIGNAL).frames([".  ", ".. ", "...", "   "], 420));
  } else if (state === "subagents") {
    // three drones circling overhead
    const s = Math.max(4, Math.round(iw / 14));
    for (let k = 0; k < 3; k++) {
      const period = 2600 + k * 700;
      screen = screen.child(div().absolute().left(0).top(s).size(s).rounded(1).bg(SIGNAL)
        .loop("left", { from: Math.round(iw * 0.08), to: Math.round(iw * 0.92) - s, period })
        .loop("top", { from: s + k * s, to: Math.round(ih * 0.3) - k * s, period: Math.round(period / 2.3) }));
    }
  } else if (state === "ci") {
    // a bar filling again and again along the bottom
    const h = Math.max(3, Math.round(iw / 24));
    screen = screen
      .child(div().absolute().left(0).bottom(0).w(iw).h(h).bg("#ffffff30"))
      .child(div().absolute().left(0).bottom(0).w(0).h(h).bg(SIGNAL).loop("width", { from: 0, to: iw, period: 1800, easing: "linear" }));
  } else if (state === "hailing") {
    // the whole frame blinks white
    screen = screen.child(div().absolute().left(0).top(0).w(iw).h(ih).border_2().border_color(SIGNAL)
      .loop("opacity", { from: 0.1, to: 1, period: 520 }));
  }

  const frame = state === "hailing" ? SIGNAL : asleep ? t.border : member.ship.color;
  let box = div().id(id).flex_none().p(b).bg(frame).child(screen);
  if (state === "hailing") box = box.loop("opacity", { from: 0.7, to: 1, period: 520 });
  return box;
}
