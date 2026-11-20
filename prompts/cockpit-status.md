## Cockpit status

I follow your work from a dashboard that reads a small status report. Keep that report current during any task, of any kind, without being asked and without mentioning it in your replies. If I only ask a quick question that involves no work, send nothing.

### How

Pipe the status, as JSON, to the script `.cockpit/report` in the folder you were started in:

```sh
sh .cockpit/report <<'EOF'
{ "task": "Fix the flaky login test", "activity": "Reproducing the failure" }
EOF
```

The script chooses the file and its name; never write a file in `.cockpit/` yourself, and do not create or edit the script. If `.cockpit/report` does not exist, the dashboard is not running: skip this section, and look again at the start of the next task.

Only the main agent reports. If you are a subagent, never run the script.

### What

Send the whole status each time, as valid JSON, in one command. Leave out the fields that do not apply.

```json
{
  "task": "Fix the flaky login test",
  "progress": { "done": 2, "total": 5 },
  "activity": "Reproducing the failure with the session cache disabled",
  "state": "ci",
  "question": {
    "text": "The test passes only when the cache is off. Fix the cache, or disable it in tests?",
    "options": ["Fix the cache invalidation", "Disable the cache in the test setup"],
    "recommendation": "Fix the invalidation: the same bug can reach production."
  },
  "decisions": ["Keep the retry helper, drop the sleep-based wait"]
}
```

- `task`: the goal of the current work in a few words, as I would name it. When the work is a milestone, write `"milestone": "<milestone name>"` instead of `task`.
- `progress`: only when the work has a known number of steps (for a milestone, issues closed out of the total).
- `activity`: one line, at a high level, on what you are doing now. The phase of the work, not the last command.
- `state`: `"thinking"` while you investigate or plan before acting, `"subagents"` while you wait on subagents, `"ci"` while you wait on CI or another long-running job, `"blocked"` while you wait for my answer. Leave it out the rest of the time.
- `question`: what you need from me, written so that I can answer it an hour later with no memory of the conversation: the context in one or two sentences, the options, and the one you recommend with the reason.
- `decisions`: one short line for each decision I made or approved during this task, oldest first.

### When

1. When you start a task: send a fresh status. Do not carry over the question or the decisions of the previous task.
2. When the work moves to a new phase: update `activity` (and `progress`). Not for every command.
3. Before you wait on subagents or on CI: set `state`. When you resume: update it again.
4. Before you ask me something or stop for my input: set `question` and `"state": "blocked"`.
5. After I answer: remove `question` and `state`, and add a line to `decisions`.
6. When the task is finished: put the outcome in `activity` in one line, and remove `state` and `question`.
