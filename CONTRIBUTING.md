# Contributing to B7 Stack

B7 is documentation-first in v0.1. Most contributions will change docs, compatibility rules or technology choices.

## Ground rules

1. **One owner per topic.** Every fact lives in exactly one document, and other documents link to it. Before adding content, find the owner using the map in the [README](README.md#documentation-map).
2. **Cite official sources.** Any claim about a framework, runtime limit or integration must match the current official documentation. Link to it in the PR description.
3. **Mark uncertainty.** If you cannot verify that an integration works, label it with `**Uncertain:**` and describe what still needs checking. Never present a guess as a supported path.
4. **No arbitrary version pins.** Name a version only when a documented capability or breaking change depends on it.
5. **The configuration model is the contract.** Adding or changing an option means updating [docs/configuration-model.md](docs/configuration-model.md) (allowed values, dependencies, env vars, compatibility) in the same change.
6. **Justify additions.** A new technology needs an entry in [docs/technology-decisions.md](docs/technology-decisions.md) that explains why, the alternatives and the trade-offs, including any vendor lock-in. Default to "optional" rather than "default".

## Proposing a technology or profile change

Open an issue that states:

- the problem it solves for real projects,
- which pillar and profiles it affects,
- whether it should be a default, optional or alternative,
- its runtime constraints (for example, Cloudflare Workers compatibility) and any paid or vendor-specific requirements.

## Style

- Clear technical English, short sections, tables for comparisons.
- Relative links between documents.
- Code snippets only when they show a real, verified API shape. Keep them minimal.

## Review checklist

- [ ] Links resolve.
- [ ] No duplicate content. Other documents link to the owner instead.
- [ ] Configuration model updated if options changed.
- [ ] Uncertain claims are labeled.
