# Herdr skinning: design brief

Status: design exploration finished on 2026-11-19, nothing built yet. Next step: implementation tests (see the end of this document).
Mockups: https://claude.ai/artifact/JnnG6dYDPEBd1Xut9aqN8j with five boards: ambient view, active view, fleet and crew, fleet picker, states legend. The states legend still shows an earlier emblem-only version; the other boards are current and use the real crew portraits.

## Context

- Up to 4 coding agents run in parallel in the Herdr desktop app, across several projects. Agents are Claude Code and Oh My Pi.
- Each Herdr space is a repository folder. A typical space has two agent tabs, a dev server tab (`pnpm dev`) and a shell tab. Some spaces have no agent at all, and may never have one.
- Agents run in containers with only the repo folder (plus some shared config) mounted. The dev server and shell tabs are host-side, used for host-only operations.
- Herdr sits full screen on the left monitor when not in direct use, and moves to the center monitor when working in it. The right screen (laptop) is rarely used.
- Work follows the milestone methodology: milestones made of ordered issues, not always detailed into steps.
- The set of active projects changes often.

## Problems to solve, in priority order

1. Cold re-entry. After meetings and other context switches, it is unclear what an agent was doing, and its pending question is buried in the transcript, especially when subagents keep posting results. Today this means asking the agent for a recap and for the question again with context, options and a recommendation.
2. Coarse "idle". Herdr detects an agent asking a question well, but an agent waiting on subagents or on CI also shows as idle, which forces a manual patrol of idle agents.
3. Location. Knowing which project and which agent instance is in front of you. Wrong-terminal mistakes are rare but the cues are weak (renamed tabs only).

## Constraints

- Low maintenance: use supported Herdr customization points, nothing that needs re-patching after updates.
- Agent-agnostic: must work for Claude Code and Oh My Pi, not through per-harness hooks.
- Terminal and code space stay untouched. This is a work tool, not a game scene.
- Look: clean, futuristic sci-fi. No fantasy theme.
- Animation is welcome when it carries information. It is icing, not the main point.

## Concept

### Fleet and crew
- Each project (Herdr space) is a ship with its own color.
- Each agent is a crew member, shown as a portrait. Crew can be humans, aliens or robots, and are created when a project gets an agent. Crew may be reassigned to another ship; the portrait frame takes the color of the current ship.
- A ship can have any number of crew, including none.
- Current crew: Vega (human) and Orrin (alien) on Emauria, Brass (robot) on ccbox, Nyx (alien) on Demo lab, a sample project.

### Naming
- The ship name is the large, colored label everywhere. It matters more than the crew name: the portrait identifies the crew member, and the crew name appears only in the small caption under the portrait.
- Ranks are shown only when a ship has more than one crew member, as a short suffix on the ship name: "Emauria, Cpt.", "Emauria, Lt.", and "Ens." for a third. A ship with one crew member shows its name alone.

### Agent card
In order of how fast each item should register:
1. Ship: color and large name (with rank suffix when needed).
2. Crew portrait in a comm-feed frame.
3. State.
4. Milestone name (not issue names).
5. One line on what the agent is doing at a high level, written by the agent.
6. If blocked: the pending question, with options and a recommendation.

Optional: milestone progress as issues closed out of total.

### States
needs you (hailing), working, thinking, on subagents, on CI, done, asleep (ship parked, no session).

Ship identity is carried by color. State is carried by shape, motion and caption, never by color alone.

### Two views
- Ambient, for the left monitor: four large crew cards readable from a distance, motion and color, little text, with the fleet strip at the bottom.
- Active, for the center monitor: terminal, a rail of crew portraits followed by tiles for crewless ships, a header naming the ship, and a journal panel (milestone, current activity, pending decision, earlier decisions).
- One key toggles between them.

### Ships without crew
- Fleet strip (ambient view, bottom): one chip per ship in its color, crewed or not, with a line on what is inside ("2 crew · dev server", "no crew · 1 shell"). Crewless ships use a dashed outline. Host shells are folded into each ship's summary line here.
- Fleet picker: an overlay on one key (F in the mockups). Filter field, ships with crew first (portraits and state summary), then ships without crew. Enter jumps to the ship's last-used tab.
- Inside a ship, tab cycling works the same whether or not it has crew.

### Host tabs
Host-side tabs get a distinct hatched "HOST" marker and dashed border in the active view, since a command in the wrong place costs the most there.

### Controls
- Number keys 1 to 4 jump to a crew member.
- Ctrl plus a number binds whatever is in focus to that key (Warcraft 3 control-group gesture), so remapping needs no config editing. Proposed: this works for any tab or ship, not only crew.
- One key jumps to the next agent that needs you.
- One key cycles tabs within the ship.
- One key opens the fleet picker.

### Sound
Per-state samples played at the Herdr level so they work for any agent. Previously done with a Claude Code hook playing Warcraft samples ("Job's done", "Awaiting your orders"); not yet ported to the new laptop.

### Crew art
- Photographic, cinematic portraits (decided after the first Gemini batch; painted was the earlier plan), shown in a comm-feed frame (scanlines, caption, ship-color border).
- With one portrait per crew member, the frame carries the state: sweeping light for working, pulsing dots for thinking, white blinking frame for hailing, orbiting drones for subagents, a bar for CI, still for done, dimmed grey for asleep.
- Later: one still per state, swapped with a signal-glitch cut, plus light overlay effects.
- Possible further upgrade: short video loops for selected states, by dropping a clip into the character's folder.
- Portraits are generated outside Claude (Gemini). See the [crew style guide](crew-style-guide.md).

## Build order

1. Core: finer states, journal card with the pending question, ship color and name, fleet strip and picker, bridge keys with Ctrl+number binding, sounds.
2. Crew, basic: one portrait per agent in the comm-feed frame, with the frame carrying the state.
3. Crew, expressive: per-state stills with the glitch cut and light effects.
4. Later, optional: video loops.

Each step is usable on its own.

## What the Herdr docs confirm (herdr.dev, checked 2026-11-19)

- Config lives as plain files in `~/.config/herdr-app`: `settings.json` (fonts, theme, sounds), `keys.json` (keybindings), `layouts/main.json` and `layouts/board.json`, `mods/agents/main.js` and `mods/tabs/main.js`, `themes/`, and an `AGENTS.md` that explains the setup to an agent.
- Agents report state through the OSC 7501 terminal escape protocol. Documented states: working, done, blocked. Any script can send one, e.g. `printf '\e]7501;state=blocked:app=my-agent\e\\'`. Being terminal output, it should pass through the containers without extra mounts (not yet tested).
- An agent running inside tmux within Herdr cannot report status.
- The `hc` CLI controls agents (`hc run`, `hc send`, `hc machine add`).

## Open questions

1. Mod API. The public pages do not document it. Need to read `~/.config/herdr-app/AGENTS.md` to learn whether a mod can render custom cards, images and animation, read files, add an overlay such as the fleet picker, and play sounds on state changes.
2. States beyond working, done and blocked are not documented. "On subagents", "on CI", "thinking" and "asleep" would be our extension.
3. How agents publish the finer states and the journal content from inside containers. Candidate: a small status file kept up to date in the repo folder (the one thing mounted), read by Herdr on the host, and driven by the milestone skills so it stays agent-agnostic.
4. What `layouts/board.json` does, and whether layout switching can back the ambient/active toggle.
5. Whether the frame alone says enough about state, or per-state poses are worth generating.
6. Whether host shells should also be listed on the ambient view, as a second row under the fleet strip.

## Suggested first implementation tests

1. Read `~/.config/herdr-app/AGENTS.md` and summarize what mods, layouts and keys can do (answers open questions 1, 2 and 4).
2. From inside a container, send an OSC 7501 state with `printf` and confirm Herdr shows it.
3. Smallest visible win: give each space its color and a large ship name through theme or layout files.
4. Port the state sounds to `settings.json`.
5. Prototype the status file: have one agent write state, milestone, current activity and pending question, and have a mod display it.
