# herdr-cockpit

A Herdr theme: a clean sci-fi "fleet and crew" skin for running several coding agents in parallel in the [Herdr](https://herdr.dev) desktop app. Each project is a ship with its own color, each agent is a crew member with a portrait, and the interface shows at a glance who needs you, what each agent is doing, and which terminal you are in.

**Status:** design finished, nothing built yet. The next step is the set of implementation tests listed at the end of the design brief.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/design-brief.md](docs/design-brief.md) | Problems to solve, constraints, the fleet-and-crew concept, views, controls, build order, open questions and first implementation tests. |
| [docs/crew-style-guide.md](docs/crew-style-guide.md) | Portrait rules, ship colors, file naming, generation prompts and the template for recruiting a new crew member. |

## Repository layout

```
docs/          Design documents (above)
```

Planned, to be added as each build step lands:

```
herdr-app/     Files that mirror ~/.config/herdr-app: settings, keys, layouts, mods, themes
assets/crew/   One folder per crew member, holding <name>-<state>.jpg portraits
assets/sounds/ Per-state sound samples
```

## License

[MIT](LICENSE)
