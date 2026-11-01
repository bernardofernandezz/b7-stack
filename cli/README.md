# create-b7 (planned)

**Not implemented.** This page states what the generator must do, so the documentation stays implementable. The schedule is in [ROADMAP.md](../ROADMAP.md) (milestone M6).

## Contract

`create-b7` turns a [`B7Config`](../docs/configuration-model.md#model) into a project:

1. **Collect.** Ask for the profile, then only the options that profile offers. Every prompt also has a flag (`--profile fullstack --billing stripe`).
2. **Validate.** Apply the [rules](../docs/configuration-model.md#rules). Reject violations with the rule number. Print the EXPERIMENTAL notice where rule 4 applies.
3. **Generate.** Write only the packages, files, Wrangler sections and `.dev.vars.example` entries that the [feature table](../docs/configuration-model.md#fullstack-features-what-each-one-adds) lists for the selected options.
4. **Record.** Write `b7.json` with the resolved configuration, including derived values, for later `b7 add <option>` commands.

Shared packages (`packages/`) are created only when two or more templates actually share code.
