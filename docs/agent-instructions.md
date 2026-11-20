# Agent instructions

The journal panel and the finer states (thinking, on subagents, on CI) show what each agent reports in its [status file](status-file.md). Agents only report when they are told to. This is the one configuration step outside Herdr, and you do it once for all your projects.

## Set it up

1. **Add the prompt to your shared instructions.** The text is in [prompts/cockpit-status.md](../prompts/cockpit-status.md). Append it to the instructions file that every agent session loads, whatever the project:

   ```sh
   cat prompts/cockpit-status.md >> ~/.claude/CLAUDE.md
   ```

   `~/.claude/CLAUDE.md` is Claude Code's user-level file. For another harness, use its own global `AGENTS.md`. Agents that run in containers must see that file, so it has to be part of the configuration you mount into them.

2. **Start a new agent session.** Running sessions do not reload their instructions.

Nothing is needed per project, per agent or per terminal. When an agent starts in a Herdr space, the cockpit puts a small script, `.cockpit/report`, in that folder (with a `.gitignore` that keeps the folder out of git). The agent pipes its status to the script, and the script decides which file it goes to, so the agent never needs to know which terminal it is in. A second or third agent in the same project gets its own journal without any setup.

## How agents are told apart

The script names the file after something the cockpit can also see from outside:

| The agent runs | File | How the cockpit finds it |
| --- | --- | --- |
| in a Podman container started with `--name` (ccbox, ompbox and the other box launchers) | `c-<container name>.json` | the container name in the terminal's `podman run` command |
| on the host, in a Herdr terminal | `<terminal id>.json` | Herdr sets `HC_TERMINAL_ID` in the terminal |
| anywhere else | `status.json` | read only when the ship has a single agent |

A container gets a new name each time it starts, so a file can never be taken for another agent's, whatever happens to terminal ids. For containers started another way (Docker, or Podman without `--name`), two agents in one project still need `HC_TERMINAL_ID` forwarded into the container (`-e HC_TERMINAL_ID`).

## What the prompt asks for

It is not tied to a methodology. The agent names the work in `task`, or in `milestone` when it is working on one, and the journal labels the section accordingly. It then rewrites the file:

- at the start of a task, from scratch;
- when the work moves to a new phase;
- before and after waiting on subagents or CI;
- before asking a question, with the options and a recommendation;
- after the answer, recording the decision;
- when the task is finished.

Subagents are told not to write the file.

## Things to know

- **Outside Herdr.** The prompt is in your shared instructions, but it tells agents to do nothing when `.cockpit/report` is missing, and only the cockpit creates that script. A project that was once open in the cockpit keeps the script, so an agent started there outside Herdr still reports; nothing reads it.
- **Sessions started with the earlier prompt** keep writing `<terminal id>.json` or `status.json` themselves. Those files are still read.
- **Agents forget.** In a long task an agent can stop updating the file. The line "Status written 40 min ago" at the bottom of the journal tells you how fresh it is. If one workflow drifts often, repeat the relevant step in that workflow's own instructions (for example "update the cockpit status file" before the step that launches subagents).
- **Changing the prompt.** If you edit `prompts/cockpit-status.md`, replace the section in your shared file by hand: the installer does not manage it.
