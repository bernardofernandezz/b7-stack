// The landing's copy of create-b7's rules (cli/internal/config). cli/testdata/rules.json keeps both the same.
// Resolves and validates a configuration against a template's b7.features.json and the
// configuration model rules (site/content/docs/configuration-model.md › Rules).

const EXPERIMENTAL = new Set(["billing=abacatepay", "passkeys=true"]);

/** Parses a flag value into the option's type: "true"/"false" for booleans, the string otherwise. */
const coerce = (choices, value) =>
  typeof choices[0] === "boolean" ? value === true || value === "true" : value;

/**
 * Returns { config, notices } or throws an Error whose message names the broken rule.
 * `requested` maps option names to values from flags or prompts; missing options take the manifest default.
 */
export function resolveConfig(profile, manifest, requested) {
  const options = {};
  for (const [name, value] of Object.entries(requested)) {
    const spec = manifest.options[name];
    // Rule 1: a profile admits only its own options. Options documented but not yet in the template are "not available".
    if (!spec)
      throw new Error(
        `Rule 1: "${name}" is not an option of the ${profile} template`,
      );
    const v = coerce(spec.choices, value);
    if (!spec.choices.includes(v))
      throw new Error(
        `Rule 1: ${name} must be one of ${spec.choices.join(", ")}`,
      );
    options[name] = v;
  }
  for (const [name, spec] of Object.entries(manifest.options))
    options[name] ??= spec.default;

  // Rule 2: organization invitations are sent by email.
  if (options.organizations === true && options.email === "none") {
    throw new Error(
      "Rule 2: organizations need email (invitations are sent by email): use --email resend",
    );
  }
  // Rule 3: billing derives the scheduler service that runs reconciliation.
  const derived = {
    scheduler: options.billing !== undefined && options.billing !== "none",
  };
  // Rule 4: experimental choices print a notice.
  const notices = Object.entries(options)
    .filter(([name, value]) => EXPERIMENTAL.has(`${name}=${value}`))
    .map(
      ([name, value]) =>
        `Rule 4: ${name} = ${value} is EXPERIMENTAL. See https://github.com/bernardofernandezz/b7-stack/blob/main/site/content/docs/configuration-model.md.`,
    );

  return { config: { profile, options, derived }, notices };
}
