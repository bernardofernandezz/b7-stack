// create-b7 generates a B7 project from an embedded template (cli/README.md).
package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/charmbracelet/huh"
	"golang.org/x/term"

	"github.com/bernardofernandezz/b7-stack/cli/internal/config"
	"github.com/bernardofernandezz/b7-stack/cli/internal/generate"
	"github.com/bernardofernandezz/b7-stack/cli/internal/ordered"
	tmpl "github.com/bernardofernandezz/b7-stack/cli/internal/template"
)

// Set by the release build (-ldflags "-X main.version=..."); b7.json records it.
var version = "dev"

var validName = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

func main() { os.Exit(run(os.Args[1:])) }

func run(args []string) int {
	opts, dir, err := parseFlags(args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Print(usage())
		return 0
	}
	if err != nil {
		return fail(err.Error())
	}
	if opts.version {
		fmt.Println(version)
		return 0
	}
	interactive := !opts.yes
	accessible := !term.IsTerminal(int(os.Stdin.Fd()))
	stdin := byteReader{bufio.NewReader(os.Stdin)}
	form := func(fields ...huh.Field) error {
		return huh.NewForm(huh.NewGroup(fields...)).WithAccessible(accessible).WithInput(stdin).Run()
	}
	templates := templateNames()
	fmt.Println(title.Render(" create-b7 ") + " " + faint.Render(version))

	// Ask for what flags left open: the directory and the template first, then the template's options.
	template := opts.template
	var first []huh.Field
	if dir == "" && interactive {
		first = append(first, huh.NewInput().Title("Project directory").Placeholder("my-b7-app").Value(&dir))
	}
	if template == "" && interactive && len(templates) > 1 {
		first = append(first, huh.NewSelect[string]().Title("Template").Options(huh.NewOptions(templates...)...).Value(&template))
	}
	if len(first) > 0 {
		if err := form(first...); err != nil {
			return cancelled(err)
		}
	}
	if dir == "" {
		dir = "my-b7-app"
	}
	if template == "" {
		template = templates[0]
	}

	target, _ := filepath.Abs(dir)
	name := filepath.Base(target)
	if !validName.MatchString(name) {
		return fail(fmt.Sprintf("Invalid name %q: use lowercase letters, digits and dashes (it becomes the package and Compose project name).", name))
	}
	if entries, err := os.ReadDir(target); err == nil && len(entries) > 0 {
		return fail(target + " is not empty.")
	}
	if !slices.Contains(templates, template) {
		return fail(fmt.Sprintf("Unknown template %q. Available: %s", template, strings.Join(templates, ", ")))
	}
	templateFS, _ := fs.Sub(tmpl.FS, template)
	manifest, err := generate.ReadManifest(templateFS)
	if err != nil {
		return fail(err.Error())
	}
	b7 := ordered.New()
	if b, err := fs.ReadFile(templateFS, "b7.json"); err != nil || b7.UnmarshalJSON(b) != nil {
		return fail("template " + template + " has no valid b7.json")
	}
	profile, _ := b7.Get("profile")

	// Flags first; prompts for the rest unless --yes. Options this template does not support are rejected by rule 1.
	requested := opts.options
	answers := map[string]*string{}
	toggles := map[string]*bool{}
	var fields []huh.Field
	for _, o := range manifest.Options {
		if _, set := requested[o.Name]; set || !interactive {
			continue
		}
		if def, ok := o.Default.(bool); ok {
			toggles[o.Name] = &def
			fields = append(fields, huh.NewConfirm().Title("Add "+o.Name+"?").Value(toggles[o.Name]))
			continue
		}
		v := fmt.Sprint(o.Default)
		answers[o.Name] = &v
		choices := make([]string, len(o.Choices))
		for i, c := range o.Choices {
			choices[i] = fmt.Sprint(c)
		}
		fields = append(fields, huh.NewSelect[string]().Title(o.Name).Options(huh.NewOptions(choices...)...).Value(answers[o.Name]))
	}
	if len(fields) > 0 {
		if err := form(fields...); err != nil {
			return cancelled(err)
		}
	}
	for k, v := range answers {
		requested[k] = *v
	}
	for k, v := range toggles {
		requested[k] = *v
	}
	resolved, err := config.Resolve(fmt.Sprint(profile), manifest, requested)
	if err != nil {
		return fail(err.Error())
	}
	for _, n := range resolved.Notices {
		warn(n)
	}

	disabled, err := generate.Generate(generate.Params{
		Template: templateFS, Target: target, Name: name, TemplateName: template,
		Profile: fmt.Sprint(profile), Config: resolved, Version: version,
	})
	if err != nil {
		return fail(err.Error())
	}
	if b, err := os.ReadFile(filepath.Join(target, ".env.example")); err == nil {
		if err := os.WriteFile(filepath.Join(target, ".env"), []byte(generate.FillEnv(string(b))), 0o600); err != nil {
			return fail(err.Error())
		}
	}
	ok(fmt.Sprintf("Created %s (%s)", name, template))

	checkNode()
	_, pnpmErr := exec.LookPath("pnpm")
	hasPnpm := pnpmErr == nil
	if !hasPnpm {
		// Node.js 25+ no longer ships corepack, so pnpm may be missing even where Node is installed.
		warn("pnpm not found: install it with `npm install -g pnpm`, then run `pnpm install`")
	}
	// Steps a smaller configuration needs before it builds: a fresh migration and the route tree. Formatting
	// tidies the blank lines that removed regions leave behind.
	finalize := []string{"pnpm run format"}
	if len(disabled) > 0 {
		finalize = []string{"pnpm run db:generate init", "pnpm run build", "pnpm run format"}
	}
	installed := false
	switch {
	case hasPnpm && opts.install:
		// Removed features leave the lockfile stale; CI=true would otherwise make pnpm refuse (frozen lockfile).
		installed = step(target, "pnpm install --no-frozen-lockfile --prefer-offline")
		for _, s := range finalize {
			installed = installed && step(target, s)
		}
	case hasPnpm && len(disabled) > 0:
		if !step(target, "pnpm install --lockfile-only") {
			warn("Could not update pnpm-lock.yaml: run `pnpm install` before building the Docker image")
		}
	}
	if opts.git {
		quiet := func(args ...string) bool {
			return exec.Command("git", append([]string{"-C", target}, args...)...).Run() == nil
		}
		if quiet("init", "-q") && quiet("add", "-A") && quiet("commit", "-qm", "chore: create-b7") {
			ok("git repository initialized")
		} else {
			warn("git init skipped (git missing or not configured)")
		}
	}

	next := []string{"cd " + dir}
	if !installed {
		next = append(next, append([]string{"pnpm install"}, finalize...)...)
	}
	next = append(next,
		"pnpm run db:up && pnpm run db:migrate && pnpm run dev   "+faint.Render("# develop on :3000"),
		"docker compose up -d --build                            "+faint.Render("# or run the whole stack"))
	fmt.Println(summary(name, resolved, next))
	fmt.Println(faint.Render("Preview release: see README.md › Verification status before deploying."))
	// A project that failed to install, migrate or build is still left in place, but the exit code says so (CI).
	if hasPnpm && opts.install && !installed {
		return 1
	}
	return 0
}

type options struct {
	yes, version, install, git bool
	template                   string
	options                    map[string]any
}

// parseFlags accepts flags before and after the directory, as create-b7 always did.
func parseFlags(args []string) (options, string, error) {
	o := options{options: map[string]any{}}
	var noInstall, noGit, orgs, noOrgs bool
	var email, billing string
	fs := flag.NewFlagSet("create-b7", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	for _, n := range []string{"y", "yes"} {
		fs.BoolVar(&o.yes, n, false, "")
	}
	for _, n := range []string{"v", "version"} {
		fs.BoolVar(&o.version, n, false, "")
	}
	for _, n := range []string{"t", "template"} {
		fs.StringVar(&o.template, n, "", "")
	}
	fs.BoolVar(&noInstall, "no-install", false, "")
	fs.BoolVar(&noGit, "no-git", false, "")
	fs.BoolVar(&orgs, "organizations", false, "")
	fs.BoolVar(&noOrgs, "no-organizations", false, "")
	fs.StringVar(&email, "email", "", "")
	fs.StringVar(&billing, "billing", "", "")
	fs.Usage = func() {}

	var dir string
	for {
		if err := fs.Parse(args); err != nil {
			return o, "", err
		}
		if fs.NArg() == 0 {
			break
		}
		if dir != "" {
			return o, "", fmt.Errorf("unexpected argument %q (one project directory only)", fs.Arg(0))
		}
		dir, args = fs.Arg(0), fs.Args()[1:]
	}
	fs.Visit(func(f *flag.Flag) {
		switch f.Name {
		case "email":
			o.options["email"] = email
		case "billing":
			o.options["billing"] = billing
		case "organizations":
			o.options["organizations"] = orgs
		case "no-organizations":
			o.options["organizations"] = !noOrgs
		}
	})
	o.install, o.git = !noInstall, !noGit
	return o, dir, nil
}

func templateNames() []string {
	entries, _ := fs.ReadDir(tmpl.FS, ".")
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names
}

func usage() string {
	return fmt.Sprintf(`Usage: create-b7 [directory] [options]

Options:
  -t, --template <name>          Template to use (%s)
  -y, --yes                      Accept defaults, no prompts
      --email <resend|none>      Email provider (fullstack)
      --[no-]organizations       Organizations and members (fullstack, needs email)
      --billing <stripe|none>    Billing provider (fullstack)
      --no-install               Skip pnpm install
      --no-git                   Skip git init
  -v, --version                  Print the version
  -h, --help                     Print this help
`, strings.Join(templateNames(), ", "))
}

// byteReader hands out one byte per Read. huh's accessible (piped) mode starts a new bufio.Scanner for every
// prompt, and a scanner reading 4 KB at a time would swallow the answers to the prompts after it.
type byteReader struct{ r *bufio.Reader }

func (b byteReader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	c, err := b.r.ReadByte()
	if err != nil {
		return 0, err
	}
	p[0] = c
	return 1, nil
}

func cancelled(err error) int {
	if errors.Is(err, huh.ErrUserAborted) {
		return fail("Cancelled.")
	}
	return fail(err.Error())
}
