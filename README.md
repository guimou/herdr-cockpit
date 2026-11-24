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

- **Active view** (layout `cockpit`): crew rail on the left (running agents first, asleep crew under them, where a click opens their ship so you can launch them; portraits only when the sidebar is collapsed), the terminals, each under a pane header naming its ship and crew member (or a HOST marker on host-side panes), and a journal panel with the state, the task or milestone, current activity and pending decision.
- **Ambient view** (layout `cockpit-ambient`): a card per running agent and the fleet strip, for a monitor you glance at. One row up to four agents, two rows up to eight; beyond that the cards are spread over pages that turn every 10 seconds, with a toggle switch per page: lever up holds that page, lever down lets the pages turn again. The lamp above a switch is lit for the page on screen and blinks when someone on that page needs you.
- **Finer states**: hailing, working, thinking, on subagents, on CI, done, standing by, asleep. Each has its own shape and motion as well as a caption.
- **Local and remote ships**: a ship on this computer carries a monitor icon, one on a machine added with `hc machine add` a server icon (as Herdr's status bar does), next to its name in the crew rail, pane headers, ambient cards and fleet strip. Hovering the icon names the machine.
- **Crew with some life**: a crew member can have a portrait per state (`mods/cockpit/crew/<id>-<state>.png`, picked up within a minute; the base portrait is used for the states that have none). The feed glitches for a moment when the state changes, and a new activity line or question is typed out as the crew member reports in.
- **Folding panels**: the button before the Crew and Ships titles folds that panel down to its title, and opens it again at the size it had.
- **Ships panel**: Herdr's Spaces list under the crew rail, with its heading renamed and a fold button added. The installer makes it as a changed copy of the Spaces mod you have; run `tools/install.sh` again after a Herdr update to refresh the copy.

Not built yet: the fleet picker overlay, extra state sounds. The per-state portraits themselves are still to be generated: only the base ones exist.

### Keys

| Key | Does |
| --- | --- |
| `alt-a` | Switch between the active and ambient views |
| `alt-h` | Jump to the next crew member who needs you |
| `alt-1` to `alt-8` | Jump to a crew member |
| `ctrl-alt-1` to `ctrl-alt-8` | Bind the crew member in front of you to that number |
| `alt-j` | Show or hide the journal panel |
| `alt-shift-j` | Collapse the journal to a narrow rail, or open it again (also the `>` button at its top) |
| `alt-c` | Open the crew assignment menu for the ship in front of you |

### Your fleet

In the app, right-click a crew member or a ship in the rail (or a pane header, or press `alt-c`) to open the crew assignment menu: click someone to bring them aboard, and use Promote or Remove on the ship's own crew.

From a terminal, assign crew to ships with the `crew` tool (`tools/crew.mjs`; the installer links it as `crew` when `~/.local/bin` exists). A ship is a Herdr space, named as the space is: rename the space and the ship follows. `--name` gives it a different name to display.

```sh
crew                                             # show the roster
crew assign vega school-of-sardeenz              # Vega joins the ship: captain if it had no crew, else the next seat
crew assign vega to school-of-sardeenz as captain   # the same in words; "--as cpt|lt|ens" also works
crew unassign vega
crew ship school-of-sardeenz --name "School of Sardeenz" --color "#7BE0A0"
```

A crew member serves on one ship at a time, so assigning moves them. A ship named for the first time keeps the automatic color its space already had. The first agent started in a space takes the captain's seat, the second the next one.

Your roster is saved in `~/.config/herdr-app/cockpit-roster.json`, outside the mod, so reinstalling keeps it. The menu and the tool both write that file, and the cockpit follows it within a few seconds; `mods/cockpit/roster.js` is the roster used when the file does not exist. The tool needs Node 22.7 or newer.

Spaces that are not in the roster still appear, with their space name and an automatic color. The crew has sixteen members. Those whose portrait is not in `mods/cockpit/crew/` yet are shown as the first letter of their name; [docs/crew-style-guide.md](docs/crew-style-guide.md) has the prompt to generate each one. To recruit beyond them, add the portrait and a name to `CREW` in [mods/cockpit/fleet.js](mods/cockpit/fleet.js), then run `tools/install.sh`.

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
