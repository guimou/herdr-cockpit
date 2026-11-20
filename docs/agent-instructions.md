# Agent instructions

The journal panel and the finer states (thinking, on subagents, on CI) show what each agent writes in its [status file](status-file.md). Agents only write that file when they are told to. This is the one configuration step outside Herdr, and you do it once for all your projects.

## Set it up

1. **Add the prompt to your shared instructions.** The text is in [prompts/cockpit-status.md](../prompts/cockpit-status.md). Append it to the instructions file that every agent session loads, whatever the project:

   ```sh
   cat prompts/cockpit-status.md >> ~/.claude/CLAUDE.md
   ```

   `~/.claude/CLAUDE.md` is Claude Code's user-level file. For another harness, use its own global `AGENTS.md`. Agents that run in containers must see that file, so it has to be part of the configuration you mount into them.

2. **Forward `HC_TERMINAL_ID` into containers.** Herdr sets this variable in each terminal. Two agents in the same repository need it to write separate files, so pass it through when you start a container (for example `-e HC_TERMINAL_ID`). A repository with a single agent works without it: the agent writes `.cockpit/status.json`.

3. **Start a new agent session.** Running sessions do not reload their instructions.

Nothing is needed per project. The agent creates `.cockpit/` itself, with a `.gitignore` inside it that keeps the folder out of git.

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

- **Outside Herdr.** The prompt is in your shared instructions, so agents also write the file when they do not run in Herdr. It is a small ignored file and nothing reads it. To avoid it, forward `HC_TERMINAL_ID` everywhere and add "Skip all of this when `HC_TERMINAL_ID` is not set" at the top of the prompt. Single agents in containers then need the variable too.
- **Agents forget.** In a long task an agent can stop updating the file. The line "Status written 40 min ago" at the bottom of the journal tells you how fresh it is. If one workflow drifts often, repeat the relevant step in that workflow's own instructions (for example "update the cockpit status file" before the step that launches subagents).
- **Changing the prompt.** If you edit `prompts/cockpit-status.md`, replace the section in your shared file by hand: the installer does not manage it.
