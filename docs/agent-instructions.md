# Agent instructions

The journal panel and the finer states (thinking, on subagents, on CI) show what each agent reports in its [status file](status-file.md). Agents only report when they are told to. This is the one configuration step outside Herdr, and you do it once for all your projects.

## Set it up

1. **Add the prompt to your shared instructions.** The text is in [prompts/cockpit-status.md](../prompts/cockpit-status.md). Append it to the instructions file that every agent session loads, whatever the project:

   ```sh
   cat prompts/cockpit-status.md >> ~/.claude/CLAUDE.md
   ```

   `~/.claude/CLAUDE.md` is Claude Code's user-level file. For another harness, use its own global `AGENTS.md`. Agents that run in containers must see that file, so it has to be part of the configuration you mount into them. Do the same on every machine where agents run: an agent on a machine added with `hc machine add` reads that machine's file.

2. **Start a new agent session.** Running sessions do not reload their instructions.

Nothing is needed per project, per agent or per terminal. When an agent starts in a Herdr space, on this machine or another, the cockpit puts a small script, `.cockpit/report`, in that folder (with a `.gitignore` that keeps the folder out of git). The agent pipes its status to the script, and the script decides which file it goes to, so the agent never needs to know which terminal it is in. A second or third agent in the same project gets its own journal, provided each one can be told apart, as below.

## How agents are told apart

The script names the file after something the cockpit can also see from outside:

| The agent runs | How the script knows | File | How the cockpit finds it |
| --- | --- | --- | --- |
| in a box (ccbox, ompbox and the other box launchers, on Podman) | the launcher sets `CODEBOX_SESSION` to the container's name | `c-<container name>.json` | the container name in the terminal's `podman run --name` |
| in a privileged Podman container started with `--name` | Podman writes the name in `/run/.containerenv` | `c-<container name>.json` | same |
| on the host, in a Herdr terminal | Herdr sets `HC_TERMINAL_ID` in the terminal | `<terminal id>.json` | the terminal's id |
| anywhere else | nothing to go by | `status.json` | read only when the ship has a single agent |

A container gets a new name each time it starts, so a file can never be taken for another agent's, whatever happens to terminal ids.

A container does not know its own name unless it is told: Podman fills `/run/.containerenv` only for privileged containers, which boxes are not. So the launcher has to pass it:

- **ccbox and the other box launchers** set `CODEBOX_SESSION` themselves. An older launcher does not: update it on every machine where agents run, and restart the agents.
- **Any other launcher** on Podman: add `-e CODEBOX_SESSION=<the value given to --name>` to its `podman run`.
- **Docker, or no `--name`**: forward the terminal id instead, with `-e HC_TERMINAL_ID`.

Without any of these, every agent in the folder writes `status.json`. One agent alone is still shown. With two or more, the cockpit cannot tell whose status it is and shows it for neither; the journal then says that a status was written to the shared file, and when.

## What the prompt asks for

It makes reporting a required part of any work: a turn in which the agent uses a tool is work, however the request was phrased, and the agent reports as its first action and again as its last action before it stops. Only a reply given from what it already knows needs no report.

It is not tied to a methodology. The agent names the work in `task`, or in `milestone` when it is working on one, and the journal labels the section accordingly. It then rewrites the file:

- at the start of a task, from scratch;
- when the work moves to a new phase;
- before and after waiting on subagents or CI;
- before asking a question, with the options and a recommendation;
- after the answer, recording the decision;
- when the task is finished.

Subagents are told not to write the file.

## Things to know

- **Outside Herdr.** The prompt is in your shared instructions, and it tells agents to run the script without checking for it first: an agent that checks tends to assume the answer and skip the report. Only the cockpit creates the script, so in a folder it has never opened the command fails, and the agent is told to carry on and not try again until its next task. That costs one failed command per task. A project that was once open in the cockpit keeps the script, so an agent started there outside Herdr still reports; nothing reads it.
- **Sessions started with the earlier prompt** keep writing `<terminal id>.json` or `status.json` themselves. Those files are still read.
- **Agents forget.** The prompt is an instruction, not a guarantee: an agent can skip the report, and in a long task it can stop updating the file. The line "Status written 40 min ago" at the bottom of the journal tells you how fresh it is. If one workflow drifts often, repeat the relevant step in that workflow's own instructions (for example "update the cockpit status file" before the step that launches subagents).
- **Changing the prompt.** When `prompts/cockpit-status.md` changes, here or by your own edit, replace the section in your shared file by hand, on every machine: the installer does not manage it. Running sessions keep the text they started with.
