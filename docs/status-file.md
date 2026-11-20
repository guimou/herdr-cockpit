# Status file

Herdr itself only knows four agent states: working, blocked, idle and done. The cockpit's finer states and the journal panel come from a small JSON file that each agent keeps up to date in its repository. Any agent can write it, so nothing depends on a particular harness.

## Where

```
<repo root>/.cockpit/<terminal id>.json
```

- `<terminal id>` is the agent's Herdr terminal address, such as `t7`. Herdr sets it in the terminal's environment as `HC_TERMINAL_ID`.
- A ship with a single agent may write `.cockpit/status.json` instead, so that agent need not know its terminal id.
- A ship with two or more agents needs the terminal id. For agents in containers, forward the variable into the container (for example `-e HC_TERMINAL_ID`).
- Add `.cockpit/` to the repository's `.gitignore`.

The mod reads these files every 3 seconds from the folder of the agent's pane, which is on the host.

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
| `milestone` | Milestone name, not issue names. |
| `progress` | Issues closed out of total in the milestone. |
| `activity` | One line on what the agent is doing, at a high level. |
| `question` | The pending question, with options and a recommendation. A plain string also works. Remove it once answered. |
| `decisions` | Earlier decisions, oldest first. The last eight are shown. |
| `updated` | ISO time or milliseconds since the epoch. |

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
