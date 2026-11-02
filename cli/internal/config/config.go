// Package config resolves and validates a configuration against a template's b7.features.json and the
// configuration model rules (site/content/docs/configuration-model.md › Rules). The site keeps a JS copy
// (site/src/lib/b7/config.js); testdata/rules.json keeps both the same.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/bernardofernandezz/b7-stack/cli/internal/ordered"
)

var experimental = map[string]bool{"billing=abacatepay": true, "passkeys=true": true}

type Option struct {
	Name    string
	Choices []any // bool or string
	Default any
}

// Feature is what an option owns when it is off: files to delete and dependencies to drop.
type Feature struct {
	Cond         string
	Files        []string
	Dependencies []string
}

type Manifest struct {
	Options  []Option
	Features []Feature
}

// ParseManifest reads b7.features.json, keeping the order its options are listed in.
func ParseManifest(b []byte) (Manifest, error) {
	raw := ordered.New()
	if err := json.Unmarshal(b, raw); err != nil {
		return Manifest{}, err
	}
	var m Manifest
	if opts := raw.Object("options"); opts != nil {
		for _, name := range opts.Keys() {
			spec := opts.Object(name)
			choices, _ := spec.Get("choices")
			def, _ := spec.Get("default")
			list, _ := choices.([]any)
			m.Options = append(m.Options, Option{Name: name, Choices: list, Default: def})
		}
	}
	if feats := raw.Object("features"); feats != nil {
		for _, cond := range feats.Keys() {
			f := feats.Object(cond)
			m.Features = append(m.Features, Feature{Cond: cond, Files: stringList(f, "files"), Dependencies: stringList(f, "dependencies")})
		}
	}
	return m, nil
}

func stringList(o *ordered.Object, key string) []string {
	v, _ := o.Get(key)
	list, _ := v.([]any)
	out := make([]string, 0, len(list))
	for _, s := range list {
		out = append(out, fmt.Sprint(s))
	}
	return out
}

func (m Manifest) option(name string) *Option {
	for i := range m.Options {
		if m.Options[i].Name == name {
			return &m.Options[i]
		}
	}
	return nil
}

type Resolved struct {
	Options *ordered.Object // manifest order
	Derived *ordered.Object
	Notices []string
}

// Map returns the options as the map regions.Holds reads.
func (r Resolved) Map() map[string]any {
	m := map[string]any{}
	for _, k := range r.Options.Keys() {
		m[k], _ = r.Options.Get(k)
	}
	return m
}

// Resolve applies the rules to the requested options (from flags or prompts). Missing options take the
// manifest default. The error message names the broken rule.
func Resolve(profile string, m Manifest, requested map[string]any) (Resolved, error) {
	names := make([]string, 0, len(requested))
	for name := range requested {
		names = append(names, name)
	}
	sort.Strings(names)
	chosen := map[string]any{}
	for _, name := range names {
		spec := m.option(name)
		// Rule 1: a profile admits only its own options. Options documented but not yet in the template are "not available".
		if spec == nil {
			return Resolved{}, fmt.Errorf("Rule 1: %q is not an option of the %s template", name, profile)
		}
		v := coerce(spec.Choices, requested[name])
		if !contains(spec.Choices, v) {
			return Resolved{}, fmt.Errorf("Rule 1: %s must be one of %s", name, join(spec.Choices))
		}
		chosen[name] = v
	}
	options := ordered.New()
	for _, spec := range m.Options {
		v, ok := chosen[spec.Name]
		if !ok {
			v = spec.Default
		}
		options.Set(spec.Name, v)
	}

	// Rule 2: organization invitations are sent by email.
	if orgs, _ := options.Get("organizations"); orgs == true {
		if email, _ := options.Get("email"); email == "none" {
			return Resolved{}, errors.New("Rule 2: organizations need email (invitations are sent by email): use --email resend")
		}
	}
	// Rule 3: billing derives the scheduler service that runs reconciliation.
	billing, hasBilling := options.Get("billing")
	derived := ordered.New().Set("scheduler", hasBilling && billing != "none")
	// Rule 4: experimental choices print a notice.
	var notices []string
	for _, name := range options.Keys() {
		v, _ := options.Get(name)
		if experimental[fmt.Sprintf("%s=%v", name, v)] {
			notices = append(notices, fmt.Sprintf("Rule 4: %s = %v is EXPERIMENTAL. See https://github.com/bernardofernandezz/b7-stack/blob/main/site/content/docs/configuration-model.md.", name, v))
		}
	}
	return Resolved{Options: options, Derived: derived, Notices: notices}, nil
}

// coerce parses a flag value into the option's type: "true"/"false" for booleans, the string otherwise.
func coerce(choices []any, v any) any {
	if len(choices) > 0 {
		if _, isBool := choices[0].(bool); isBool {
			return v == true || v == "true"
		}
	}
	return v
}

func contains(choices []any, v any) bool {
	for _, c := range choices {
		if c == v {
			return true
		}
	}
	return false
}

func join(choices []any) string {
	parts := make([]string, len(choices))
	for i, c := range choices {
		parts[i] = fmt.Sprint(c)
	}
	return strings.Join(parts, ", ")
}
