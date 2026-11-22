# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A theme ("mod" plus two layouts) for the [Herdr](https://herdr.dev) desktop app, which runs several coding agents side by side. Each Herdr space is shown as a ship with a color, each agent as a crew member with a portrait, and the UI shows who needs you, what each agent is doing and which terminal you are in. README.md covers the user-facing features and keys; `docs/design-brief.md` covers the goals, constraints and open questions.

No build step and no package.json. The mod is plain ES modules that Herdr loads directly; the tools need Node 22.7+.

## Commands

```sh
node tools/smoke.mjs     # the only test: renders every role against stubbed Herdr modules
tools/install.sh         # copies mods/cockpit and layouts into ~/.config/herdr-app (HERDR_APP_HOME overrides), then runs herdr-app check
herdr-app check ~/.config/herdr-app/mods/cockpit   # validates the mod against Herdr's real API (needs Herdr installed)
node tools/crew.mjs ...  # roster CLI (crew assign/unassign/ship/sync)
```

The smoke test is a single script of sequential `check(...)` calls with shared state, so there is no running one test in isolation: run the whole file. It catches JavaScript errors (bad imports, `null` children, NaN sizes) but does not know Herdr's real API, so a passing smoke test still needs `herdr-app check` and a look in the app.

CI (`.github/workflows/ci.yml`) runs the smoke test on Node 22 and 24, `shellcheck tools/install.sh`, and a parse of the JSON files. It cannot run `herdr-app check`.

## Architecture

**One mod, many roles.** `mods/cockpit/main.js` exports a single `View`; the layouts (`layouts/cockpit.json`, `layouts/cockpit-ambient.json`) place it several times with different `props.role`: `rail`, `journal`, `pane` (per-pane header), `ambient`, and `assign` (a popup opened with `openOverlay`). With no role (as under `herdr-app check`) it renders every role at once so the check covers them all.

**Module split.** `model.js` holds the data and actions (no drawing), `ui.js` the shared drawing primitives (text, state mark, comm-feed portrait frame), `main.js` the roles, `fleet.js` the crew list, palette and ranks, `roster.js` the default ship assignments. Imports come from Herdr's modules `gpui-kit`, `gpui-base` and `herdr`; their typed API is `herdr.d.ts` in Herdr's source (`defaults/`), and the app's own `~/.config/herdr-app/AGENTS.md` explains mods. Using a `herdr` function that `tools/smoke.mjs` does not stub breaks the smoke test: add a stub there too.

**Data flow.** `fleet()` is recomputed on every render from Herdr's live `spaces()` and `agents()` plus three pieces of Herdr shared state (`cockpit.status`, `cockpit.sharedStatus`, `cockpit.roster`). Only the roles that own the data (`rail` in the active layout, `ambient` in the ambient one, via `own()`) poll every 3 s (`pollStatus`, `pollRoster`) and consume key commands from `nextCommand()`; the other roles only read shared state. Agents are seated in a ship by terminal order (`t3` before `t12`), matched to the roster's crew list in rank order.

**State.** `stateOf()` in `model.js` is the single place that decides the eight displayed states. Herdr's own status (OSC 7501) always wins for blocked and done; the status file only refines working/idle into thinking, subagents or ci. The table in `docs/status-file.md` documents it.

**Status files and the report script.** Agents never write their status file directly. The cockpit provisions `<agent folder>/.cockpit/report` (the `REPORT` string in `model.js`, plus a `.gitignore` of `*`), and agents pipe JSON to it. The script names the file `c-<container>.json` (from `CODEBOX_SESSION`, else `/run/.containerenv`), else `<HC_TERMINAL_ID>.json`, else `status.json`, and stamps `updated`. The cockpit finds the same container name from the terminal's `podman run --name` argv (`containerName`, `statusNames`). `status.json` is only trusted when a ship has a single agent. The cockpit times a status by when it saw the file change, not by the agent's `updated` (`timed`).

This contract is described in four places that must stay in agreement: `REPORT` and `statusNames` in `model.js`, `docs/status-file.md`, `docs/agent-instructions.md`, and `prompts/cockpit-status.md` (the text users paste into their shared CLAUDE.md/AGENTS.md). Change one, check the others.

**Roster.** The user's assignments live in `<Herdr home>/cockpit-roster.json`, outside the mod, so reinstalls keep them. Both the in-app `assign` popup (`saveRoster`, with a compare-and-write retry) and `tools/crew.mjs` write that file; `crew.mjs` also rewrites the installed `mods/cockpit/roster.js`, and `install.sh` runs `crew sync` to restore it after copying the default over. The repo's `roster.js` is only the default. A space not in the roster still appears, with its own name and `autoColor(name)`. `shareColors` publishes each ship's color to Herdr's own `space.colors` shared state, which is what colors the Ships panel's tiles.

**Recruiting crew.** Add `mods/cockpit/crew/<id>-base.png` (4:5) and a name in `CREW` in `fleet.js`; `docs/crew-style-guide.md` has the portrait rules and generation prompts. `pollPoses` (an `ls` of the installed `crew/` folder, published as `cockpit.poses`) finds the base and the optional `<id>-<state>.png` files; `portraitOf` in `model.js` uses the state's file when there is one, and returns null (a monogram) for a crew member in `CREW` whose base is not there yet.

**Moments.** Herdr's animations loop forever, so anything that should play once (the glitch cut in `feed`, a line typed by `say`) goes through `fresh(id, value, ms)` in `ui.js`, and the role must call `settle(cx)` in its `init` so it draws again when the moment is over. Herdr does not draw a view that holds an animation faster than 100 ms (frame time or loop period); the smoke test's stubs refuse those.

## Constraints that shape the code

- Use only supported Herdr customization points; nothing that needs re-patching after Herdr updates. The one exception is the "Ships" panel, which `install.sh` makes by copying Herdr's Spaces mod with `sed` (heading renamed, plus a fold button that sends the cockpit `foldships`; the folding itself is `toggleFold` in `model.js`) and which must be refreshed after a Herdr update.
- The mod must be installed as real files in the Herdr home: a symlinked mod shows no images and does not hot-reload. That is why `install.sh` copies.
- `install.sh` never edits the user's `keys.json` (Herdr stops updating a keys file once edited); `keys.json` here is merged by hand.
- Agent-agnostic: status comes from OSC 7501 and the status file, never from per-harness hooks (agents are Claude Code and Oh My Pi).
- Ship identity is carried by color; state by shape, motion and caption, never by color alone.
- Leave the terminal area itself untouched: a work tool, not a game scene.

## This repo's own `.cockpit/`

`.cockpit/` at the repo root is the cockpit's runtime folder for agents working on this repo (provisioned by the installed mod, gitignored by its own `.gitignore`). It is not source: never edit `.cockpit/report` or write files there by hand.
