# Status file

Herdr itself only knows four agent states: working, blocked, idle and done. The cockpit's finer states and the journal panel come from a small JSON file that each agent keeps up to date in its repository. Any agent can write it, so nothing depends on a particular harness. The prompt that makes agents write it is in [agent-instructions.md](agent-instructions.md); this page is the format.

## Where

```
<repo root>/.cockpit/<agent key>.json
```

- Agents do not write the file themselves. They pipe the JSON to `.cockpit/report`, a script the cockpit puts in the folder, and the script picks the name: `c-<container name>` in a Podman container that was given its name (`CODEBOX_SESSION`, which the box launchers set), else the Herdr terminal id (`HC_TERMINAL_ID`, such as `t7`), else `status`. See [how agents are told apart](agent-instructions.md#how-agents-are-told-apart).
- The script adds `updated` with its own clock, writes the file in one move, and removes container files older than a week.
- The cockpit reads the container's file, the terminal's, and `status.json` when the ship has a single agent, and shows the one written last (`updated`), so a file an agent no longer writes cannot hide the one it writes now. With several agents, `status.json` is never shown, since nobody can tell whose it is; the journal says so when it sees that file written.
- Keep the folder out of git. The agent prompt does it with a `.cockpit/.gitignore` containing `*`, so the repository's own `.gitignore` need not change.

The mod reads these files every 3 seconds from the folder of the agent's pane, on the machine the space lives on: this one, or one added with `hc machine add`.

## Content

Every field is optional.

```json
{
  "state": "subagents",
  "milestone": "M4 Billing",
  "progress": { "done": 3, "total": 7 },
  "activity": "Wiring the invoice export to the new ledger",
  "question": {
    "text": "The old /export endpoint still has two callers. Keep it?",
    "options": ["Keep it behind a deprecation warning", "Remove it and update both callers"],
    "recommendation": "Remove it: both callers are in this repo."
  },
  "decisions": ["Use Stripe webhooks rather than polling"],
  "updated": "2026-11-20T12:40:00Z"
}
```

| Field | Meaning |
| --- | --- |
| `state` | `thinking`, `subagents`, `ci` or `blocked`. Leave it out, or use any other value, for plain work. |
| `task` | The goal of the current work, in a few words. Shown under "Task". |
| `milestone` | Milestone name, not issue names. Used instead of `task` when the work is a milestone; shown under "Milestone". |
| `progress` | Steps done out of total, or issues closed out of total for a milestone. |
| `activity` | One line on what the agent is doing, at a high level. |
| `question` | The pending question, with options and a recommendation. A plain string also works. Remove it once answered. |
| `decisions` | Earlier decisions, oldest first. The last eight are shown. |
| `updated` | Added by the report script; agents leave it out. ISO time with its zone (`Z` means UTC) or milliseconds since the epoch. Only used for a file that was already there when the cockpit started: see below. |

## How the state is decided

Herdr's own report always wins for blocked and done. The file only refines what Herdr calls working or idle.

| Herdr says | File `state` | Cockpit shows |
| --- | --- | --- |
| blocked | anything | hailing |
| done | anything | done |
| working or idle | `subagents` | on subagents |
| working or idle | `ci` | on CI |
| working | `thinking` | thinking |
| working | other or none | working |
| idle | `blocked` | hailing |
| idle | other or none | standing by |
| no agent in a listed seat | | asleep |

An agent that waits on subagents or on CI should write that state before it goes quiet, and write a new state when it resumes. A file left at `subagents` or `ci` keeps showing that state for as long as Herdr reports the agent as idle.

## "Status written ... ago"

The journal shows how long ago the status was written. The report script stamps the time itself. Agents that wrote the file directly, with the earlier prompt, got their own timestamp wrong often enough (typed from memory, or local time with a `Z` after it, which reads as hours ago or in the future) that the cockpit does not rely on it: once it has seen the file change, it uses the moment it saw the change, which is at most 3 seconds late. The `updated` field is only used for a file written before the cockpit started, and a time in the future is shown as "just now".
