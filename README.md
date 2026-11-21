# herdr-cockpit

A Herdr theme: a clean sci-fi "fleet and crew" skin for running several coding agents in parallel in the [Herdr](https://herdr.dev) desktop app. Each project is a ship with its own color, each agent is a crew member with a portrait, and the interface shows at a glance who needs you, what each agent is doing, and which terminal you are in.

**Status:** first pass of the mod and layouts. It runs in Herdr: both views, the status files and the per-state portraits have been used in the app. The smoke test in this repository covers the rest.

## Install

```sh
tools/install.sh
```

This copies `mods/cockpit` and the two layouts into `~/.config/herdr-app` and runs `herdr-app check`. Then merge [keys.json](keys.json) into your own keys file and switch layout with `herdr-app do layout.switch --name cockpit`. Your other layouts are untouched; `ctrl-shift-l` cycles back.

The journal and the finer states stay empty until your agents are told to report: add the prompt in [prompts/cockpit-status.md](prompts/cockpit-status.md) to your shared `CLAUDE.md` or `AGENTS.md`, once for all projects. See [docs/agent-instructions.md](docs/agent-instructions.md).

## What is in it

- **Active view** (layout `cockpit`): crew rail on the left (portraits only when the sidebar is collapsed), a header naming the ship and crew member in front of you, the terminals with a HOST marker on host-side panes, and a journal panel with the task or milestone, current activity and pending decision.
- **Ambient view** (layout `cockpit-ambient`): up to four large crew cards and the fleet strip, for a monitor you glance at.
- **Finer states**: hailing, working, thinking, on subagents, on CI, done, standing by, asleep. Each has its own shape and motion as well as a caption.
- **Crew with some life**: a crew member can have a portrait per state (`mods/cockpit/crew/<id>-<state>.png`, picked up within a minute; the base portrait is used for the states that have none). The feed glitches for a moment when the state changes, and a new activity line or question is typed out as the crew member reports in.
- **Ships panel**: Herdr's Spaces list under the crew rail, with its heading renamed. The installer makes it as a renamed copy of the Spaces mod you have; run `tools/install.sh` again after a Herdr update to refresh the copy.

Not built yet: the fleet picker overlay, extra state sounds. The per-state portraits themselves are still to be generated: only the base ones exist.

### Keys

| Key | Does |
| --- | --- |
| `alt-a` | Switch between the active and ambient views |
| `alt-h` | Jump to the next crew member who needs you |
| `alt-1` to `alt-4` | Jump to a crew member |
| `ctrl-alt-1` to `ctrl-alt-4` | Bind the crew member in front of you to that number |
| `alt-j` | Show or hide the journal panel |
| `alt-shift-j` | Collapse the journal to a narrow rail, or open it again (also the `>` button at its top) |
| `alt-c` | Open the crew assignment menu for the ship in front of you |

### Your fleet

In the app, right-click a crew member or a ship in the rail (or the ship header, or press `alt-c`) to open the crew assignment menu: click someone to bring them aboard, and use Promote or Remove on the ship's own crew.

From a terminal, assign crew to ships with the `crew` tool (`tools/crew.mjs`; the installer links it as `crew` when `~/.local/bin` exists). A ship is a Herdr space, named as the space is.

```sh
crew                                             # show the roster
crew assign vega school-of-sardeenz              # Vega joins the ship: captain if it had no crew, else the next seat
crew assign vega to school-of-sardeenz as captain   # the same in words; "--as cpt|lt|ens" also works
crew unassign vega
crew ship school-of-sardeenz --name "School of Sardeenz" --color "#7BE0A0"
```

A crew member serves on one ship at a time, so assigning moves them. A ship named for the first time keeps the automatic color its space already had. The first agent started in a space takes the captain's seat, the second the next one.

Your roster is saved in `~/.config/herdr-app/cockpit-roster.json`, outside the mod, so reinstalling keeps it. The menu and the tool both write that file, and the cockpit follows it within a few seconds; `mods/cockpit/roster.js` is the roster used when the file does not exist. The tool needs Node 22.7 or newer.

Spaces that are not in the roster still appear, with their space name and an automatic color. To recruit a new crew member, add the portrait to `mods/cockpit/crew/` and an entry to `CREW` in [mods/cockpit/fleet.js](mods/cockpit/fleet.js), then run `tools/install.sh`.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/design-brief.md](docs/design-brief.md) | Problems to solve, constraints, the fleet-and-crew concept, views, controls, build order and open questions. |
| [docs/crew-style-guide.md](docs/crew-style-guide.md) | Portrait rules, ship colors, file naming, generation prompts and the template for recruiting a new crew member. |
| [docs/agent-instructions.md](docs/agent-instructions.md) | Configuring your agents, once for all projects, so they report to the cockpit. |
| [docs/status-file.md](docs/status-file.md) | The format of the file each agent writes so the cockpit can show finer states and the journal. |

## Repository layout

The top-level folders follow the layout Herdr uses for shared layouts and mods, which mirrors `~/.config/herdr-app`.

```
layouts/       cockpit.json (active view), cockpit-ambient.json (ambient view)
mods/cockpit/  The mod: main.js (roles), model.js (data), ui.js (drawing), fleet.js (the crew), roster.js (default assignments), crew/ (portraits)
keys.json      Key bindings to merge into your own
prompts/       cockpit-status.md, the instructions to add to your shared CLAUDE.md or AGENTS.md
docs/          Design documents
tools/         install.sh, crew.mjs (assign crew to ships), and smoke.mjs (node tools/smoke.mjs)
```

## License

[MIT](LICENSE)
