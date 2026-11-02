// Package regions applies feature regions (ADR-014): lines between `#if <cond>` and `#endif` markers, in any
// comment style (`// #if x`, `# #if x`, `-- #if x`, `{/* #if x */}`, `<!-- #if x -->`), are kept only when
// <cond> holds. Marker lines are always removed. <cond> is `name`, `!name` or `name=value`. Regions do not nest.
// The site keeps a JS copy (site/src/lib/b7/regions.js); testdata/regions.json keeps both the same.
package regions

import (
	"fmt"
	"regexp"
	"strings"
)

// ImportPragma turns off Biome's import sorting in template files with imports inside regions, which would
// move imports across markers. Generated projects drop it, and create-b7's final `pnpm run format` sorts them.
const ImportPragma = "// biome-ignore-all assist/source/organizeImports: B7 feature regions"

var marker = regexp.MustCompile(`^\s*(?://|#|\{/\*|<!--|--)\s*#(if|endif)\b\s*([^*\s]*)`)

// Holds reports whether a region condition holds for the enabled features ({"email": "resend", ...}).
func Holds(cond string, features map[string]any) bool {
	if rest, ok := strings.CutPrefix(cond, "!"); ok {
		return !Holds(rest, features)
	}
	name, value, hasValue := strings.Cut(cond, "=")
	actual, ok := features[name]
	if hasValue {
		return ok && fmt.Sprint(actual) == value
	}
	switch v := actual.(type) {
	case bool:
		return v
	case string:
		return v != "" && v != "none"
	}
	return false
}

// Apply applies the regions in text. It fails on unbalanced or nested markers, naming the line.
func Apply(text string, features map[string]any, file string) (string, error) {
	var out []string
	open, keep, openLine := false, false, 0
	for i, line := range strings.Split(text, "\n") {
		m := marker.FindStringSubmatch(line)
		switch {
		case m != nil && m[1] == "if":
			if open {
				return "", fmt.Errorf("%s:%d: nested #if (regions do not nest)", file, i+1)
			}
			if m[2] == "" {
				return "", fmt.Errorf("%s:%d: #if without a condition", file, i+1)
			}
			open, keep, openLine = true, Holds(m[2], features), i+1
		case m != nil && m[1] == "endif":
			if !open {
				return "", fmt.Errorf("%s:%d: #endif without #if", file, i+1)
			}
			open = false
		case line == ImportPragma:
		case !open || keep:
			out = append(out, line)
		}
	}
	if open {
		return "", fmt.Errorf("%s:%d: #if without #endif", file, openLine)
	}
	return strings.Join(out, "\n"), nil
}
