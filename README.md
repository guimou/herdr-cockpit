# herdr-cockpit

A Herdr theme: a clean sci-fi "fleet and crew" skin for running several coding agents in parallel in the [Herdr](https://herdr.dev) desktop app. Each project is a ship with its own color, each agent is a crew member with a portrait, and the interface shows at a glance who needs you, what each agent is doing, and which terminal you are in.

**Status:** first pass of the mod and layouts. It passes the smoke test in this repository but has not yet been run in Herdr.

## Install

```sh
tools/install.sh
```

This copies `mods/cockpit` and the two layouts into `~/.config/herdr-app` and runs `herdr-app check`. Then merge [keys.json](keys.json) into your own keys file and switch layout with `herdr-app do layout.switch --name cockpit`. Your other layouts are untouched; `ctrl-shift-l` cycles back.

## What is in it

- **Active view** (layout `cockpit`): crew rail on the left, a header naming the ship and crew member in front of you, the terminals with a HOST marker on host-side panes, and a journal panel with the milestone, current activity and pending decision.
- **Ambient view** (layout `cockpit-ambient`): up to four large crew cards and the fleet strip, for a monitor you glance at.
- **Finer states**: hailing, working, thinking, on subagents, on CI, done, standing by, asleep. Each has its own shape and motion as well as a caption.

Not built yet: the fleet picker overlay, per-state portraits, extra state sounds.

### Keys

| Key | Does |
| --- | --- |
| `alt-a` | Switch between the active and ambient views |
| `alt-h` | Jump to the next crew member who needs you |
| `alt-1` to `alt-4` | Jump to a crew member |
| `ctrl-alt-1` to `ctrl-alt-4` | Bind the crew member in front of you to that number |
| `alt-j` | Show or hide the journal panel |

### Your fleet

Edit [mods/cockpit/fleet.js](mods/cockpit/fleet.js) to name ships, pick their colors and seat crew. Spaces that are not listed still appear, with their space name and an automatic color.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/design-brief.md](docs/design-brief.md) | Problems to solve, constraints, the fleet-and-crew concept, views, controls, build order and open questions. |
| [docs/crew-style-guide.md](docs/crew-style-guide.md) | Portrait rules, ship colors, file naming, generation prompts and the template for recruiting a new crew member. |
| [docs/status-file.md](docs/status-file.md) | The file each agent writes so the cockpit can show finer states and the journal. |

## Repository layout

The top-level folders follow the layout Herdr uses for shared layouts and mods, which mirrors `~/.config/herdr-app`.

```
layouts/       cockpit.json (active view), cockpit-ambient.json (ambient view)
mods/cockpit/  The mod: main.js (roles), model.js (data), ui.js (drawing), fleet.js (your roster), crew/ (portraits)
keys.json      Key bindings to merge into your own
docs/          Design documents
tools/         install.sh, and smoke.mjs (node tools/smoke.mjs)
```

## License

[MIT](LICENSE)
