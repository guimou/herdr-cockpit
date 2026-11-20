## Cockpit status (required)

I run several agents at once and follow them from a dashboard. When I come back to you after an hour away, the dashboard is what I read first: what you are working on, where you are, and what you need from me. It only knows what you report. A missing or stale report means I have to ask you for a recap, which is what the dashboard is there to avoid.

So reporting is part of every task, of any kind, in every project. It is not optional and it does not wait for me to ask. Do not mention it in your replies.

### The rule

**If a turn makes you use any tool, it is work, and you report.** Running a command, reading or editing a file, searching, starting a subagent: all of it counts. Go by what you do, not by how my message reads: a short question that sends you to look at the repository is work. Only a reply given entirely from what you already know needs no report.

- **Your first action in a task is a report.** Send it along with your first tool call, so it costs no extra step. If you keep a task list, its first item is "Report cockpit status" and its last is "Report the outcome".
- **Your last action before you stop is a report.** Before you end a turn in which you did any work, check that your last report says where you are stopping: the outcome if you are done, your question if you need me. If it does not, send it first.

### How

Pipe the status, as JSON, to the script `.cockpit/report` in the folder you were started in:

```sh
sh .cockpit/report <<'EOF'
{ "task": "Fix the flaky login test", "activity": "Reproducing the failure" }
EOF
```

Do not check whether the script exists: run it. If the command fails because `.cockpit/report` is not there, the dashboard is not following this folder. Carry on with your work, say nothing about it, and do not try again until your next task.

The script chooses the file and its name; never write a file in `.cockpit/` yourself, and do not create or edit the script.

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

Each of these is a report:

1. When you start a task: a fresh status. Do not carry over the question or the decisions of the previous task.
2. When the work moves to a new phase: update `activity` (and `progress`). Not for every command.
3. Before you wait on subagents or on CI: set `state`. When you resume: update it again.
4. Before you ask me something or stop for my input: set `question` and `"state": "blocked"`.
5. After I answer: remove `question` and `state`, and add a line to `decisions`.
6. When the task is finished: put the outcome in `activity` in one line, and remove `state` and `question`.
