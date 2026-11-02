// Package generate writes a configuration of a template into a directory.
package generate

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/bernardofernandezz/b7-stack/cli/internal/config"
	"github.com/bernardofernandezz/b7-stack/cli/internal/ordered"
	"github.com/bernardofernandezz/b7-stack/cli/internal/regions"
)

// manifestFile describes the template, not the project, so it is never copied.
const manifestFile = "b7.features.json"

type Params struct {
	Template     fs.FS // the template directory
	Target       string
	Name         string // project name: package.json "name", and replaces b7-<TemplateName> in the README
	TemplateName string
	Profile      string
	Config       config.Resolved
	Version      string // the create-b7 release that wrote the project, the merge base for a future `b7 update`
}

// Generate copies the template into p.Target for p.Config, as create-b7 does. It returns the disabled features.
func Generate(p Params) ([]config.Feature, error) {
	if err := copyTemplate(p.Template, p.Target); err != nil {
		return nil, err
	}
	manifest, err := ReadManifest(p.Template)
	if err != nil {
		return nil, err
	}
	options := p.Config.Map()

	// Disabled features lose their files and dependencies; every text file keeps or drops its regions (ADR-014).
	var disabled []config.Feature
	for _, f := range manifest.Features {
		if !regions.Holds(f.Cond, options) {
			disabled = append(disabled, f)
		}
	}
	pkgPath := filepath.Join(p.Target, "package.json")
	pkg := ordered.New()
	if err := readJSON(pkgPath, pkg); err != nil {
		return nil, err
	}
	for _, f := range disabled {
		for _, file := range f.Files {
			if err := os.RemoveAll(filepath.Join(p.Target, file)); err != nil {
				return nil, err
			}
		}
		for _, dep := range f.Dependencies {
			for _, section := range []string{"dependencies", "devDependencies"} {
				if deps := pkg.Object(section); deps != nil {
					deps.Delete(dep)
				}
			}
		}
	}
	pkg.Set("name", p.Name)
	if err := writeJSON(pkgPath, pkg); err != nil {
		return nil, err
	}
	// The template's migrations include tables of every feature, so a smaller configuration gets a fresh one.
	if len(disabled) > 0 {
		if err := os.RemoveAll(filepath.Join(p.Target, "drizzle")); err != nil {
			return nil, err
		}
	}

	err = filepath.WalkDir(p.Target, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			if d != nil && d.Name() == ".git" {
				return filepath.SkipDir
			}
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil || !bytes.Contains(b, []byte("#if")) || bytes.IndexByte(b, 0) >= 0 {
			return err
		}
		rel, _ := filepath.Rel(p.Target, path)
		out, err := regions.Apply(string(b), options, filepath.ToSlash(rel))
		if err != nil {
			return err
		}
		return os.WriteFile(path, []byte(out), 0o644)
	})
	if err != nil {
		return nil, err
	}

	readme := filepath.Join(p.Target, "README.md")
	if b, err := os.ReadFile(readme); err == nil {
		if err := os.WriteFile(readme, bytes.ReplaceAll(b, []byte("b7-"+p.TemplateName), []byte(p.Name)), 0o644); err != nil {
			return nil, err
		}
	}
	b7 := ordered.New().Set("profile", p.Profile).Set("options", p.Config.Options).Set("derived", p.Config.Derived).Set("version", p.Version)
	return disabled, writeJSON(filepath.Join(p.Target, "b7.json"), b7)
}

// ReadManifest reads the template's b7.features.json; a template without one has no options.
func ReadManifest(template fs.FS) (config.Manifest, error) {
	b, err := fs.ReadFile(template, manifestFile)
	if os.IsNotExist(err) {
		return config.Manifest{}, nil
	}
	if err != nil {
		return config.Manifest{}, err
	}
	return config.ParseManifest(b)
}

func copyTemplate(template fs.FS, target string) error {
	return fs.WalkDir(template, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || path == manifestFile {
			return err
		}
		dst := filepath.Join(target, filepath.FromSlash(path))
		if d.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		b, err := fs.ReadFile(template, path)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0o644)
	})
}

var (
	authSecret = regexp.MustCompile(`(?m)^BETTER_AUTH_SECRET=$`)
	cronSecret = regexp.MustCompile(`(?m)^CRON_SECRET=$`)
	dbPassword = regexp.MustCompile(`(?m)^POSTGRES_PASSWORD=postgres$`)
)

// FillEnv fills the secrets an .env.example leaves empty.
func FillEnv(example string) string {
	// Hex: the password is embedded in DATABASE_URL, where base64's "+/=" would need escaping.
	password := hex.EncodeToString(random(16))
	s := authSecret.ReplaceAllLiteralString(example, "BETTER_AUTH_SECRET="+base64.StdEncoding.EncodeToString(random(32)))
	s = cronSecret.ReplaceAllLiteralString(s, "CRON_SECRET="+base64.StdEncoding.EncodeToString(random(32)))
	s = dbPassword.ReplaceAllLiteralString(s, "POSTGRES_PASSWORD="+password)
	return strings.Replace(s, "postgres://postgres:postgres@", "postgres://postgres:"+password+"@", 1)
}

func random(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b) // crypto/rand.Read never fails on supported platforms (Go 1.24+)
	return b
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func writeJSON(path string, v any) error {
	b, err := ordered.Indent(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}
