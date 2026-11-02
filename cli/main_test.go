package main

import (
	"encoding/json"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/bernardofernandezz/b7-stack/cli/internal/config"
	"github.com/bernardofernandezz/b7-stack/cli/internal/generate"
	tmpl "github.com/bernardofernandezz/b7-stack/cli/internal/template"
)

const testVersion = "1.2.3-test"

var cli string

// TestMain builds the binary once, the way a release does, and runs every test against it.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "create-b7-")
	if err != nil {
		panic(err)
	}
	cli = filepath.Join(dir, "create-b7")
	if runtime.GOOS == "windows" {
		cli += ".exe" // Windows runs only files with an executable extension
	}
	if out, err := exec.Command("go", "build", "-ldflags", "-X main.version="+testVersion, "-o", cli, ".").CombinedOutput(); err != nil {
		panic(string(out))
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

func create(t *testing.T, name string, args ...string) (string, string, error) {
	t.Helper()
	app := filepath.Join(t.TempDir(), name)
	out, err := exec.Command(cli, append([]string{app, "--yes", "--no-install", "--no-git"}, args...)...).CombinedOutput()
	return app, string(out), err
}

func mustCreate(t *testing.T, name string, args ...string) string {
	t.Helper()
	app, out, err := create(t, name, args...)
	if err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	return app
}

func read(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func readJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal([]byte(read(t, path)), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func exists(path string) bool { _, err := os.Stat(path); return err == nil }

// noMarkers fails on any file that still contains a region marker after generation.
func noMarkers(t *testing.T, app string) {
	t.Helper()
	marker := regexp.MustCompile(`(?m)^\s*\S+\s*#(if|endif)\b`)
	filepath.WalkDir(app, func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && marker.MatchString(read(t, path)) {
			t.Errorf("marker left in %s", path)
		}
		return err
	})
}

func TestScaffoldsTheFullstackTemplate(t *testing.T) {
	app := mustCreate(t, "my-app", "--template", "fullstack")
	pkg := readJSON(t, filepath.Join(app, "package.json"))
	if pkg["name"] != "my-app" {
		t.Errorf("package name %v", pkg["name"])
	}
	want := map[string]any{
		"profile": "fullstack",
		"options": map[string]any{"email": "resend", "organizations": false, "billing": "none"},
		"derived": map[string]any{"scheduler": false},
		"version": testVersion,
	}
	if got := readJSON(t, filepath.Join(app, "b7.json")); !reflect.DeepEqual(got, want) {
		t.Errorf("b7.json = %v", got)
	}
	if exists(filepath.Join(app, "b7.features.json")) {
		t.Error("b7.features.json copied")
	}
	noMarkers(t, app)
	env := read(t, filepath.Join(app, ".env"))
	if !regexp.MustCompile(`(?m)^BETTER_AUTH_SECRET=[A-Za-z0-9+/]{43}=$`).MatchString(env) {
		t.Error("BETTER_AUTH_SECRET not generated")
	}
	m := regexp.MustCompile(`(?m)^POSTGRES_PASSWORD=([0-9a-f]{32})$`).FindStringSubmatch(env)
	if m == nil {
		t.Fatal("random POSTGRES_PASSWORD missing")
	}
	if !strings.Contains(env, "DATABASE_URL=postgres://postgres:"+m[1]+"@localhost:5432/b7\n") {
		t.Error("DATABASE_URL does not use the generated password")
	}
	for _, f := range []string{"Dockerfile", "compose.yaml", "Caddyfile", ".dockerignore", ".gitignore"} {
		if !exists(filepath.Join(app, f)) {
			t.Errorf("%s missing", f)
		}
	}
	for _, f := range []string{"node_modules", "dist", "test-results", "src/modules/organizations", "src/modules/billing"} {
		if exists(filepath.Join(app, f)) {
			t.Errorf("%s should not exist", f)
		}
	}
	if strings.Contains(read(t, filepath.Join(app, "src/modules/notes/schema.ts")), "organizationId") {
		t.Error("notes keep organizationId")
	}
	if regexp.MustCompile(`scheduler|STRIPE`).MatchString(read(t, filepath.Join(app, "compose.yaml"))) {
		t.Error("compose.yaml keeps billing")
	}
	if _, ok := pkg["dependencies"].(map[string]any)["stripe"]; ok {
		t.Error("stripe dependency kept")
	}
	if strings.Contains(read(t, filepath.Join(app, "src/rpc/router.ts")), "biome-ignore-all") {
		t.Error("import pragma kept")
	}
}

func TestOrganizations(t *testing.T) {
	app := mustCreate(t, "orgs", "--organizations")
	if !exists(filepath.Join(app, "src/modules/organizations/membership.ts")) {
		t.Error("organizations module missing")
	}
	if !strings.Contains(read(t, filepath.Join(app, "src/modules/notes/schema.ts")), "organizationId") {
		t.Error("notes lack organizationId")
	}
	if readJSON(t, filepath.Join(app, "b7.json"))["options"].(map[string]any)["organizations"] != true {
		t.Error("b7.json organizations not true")
	}
	noMarkers(t, app)
}

func TestBillingDerivesTheScheduler(t *testing.T) {
	app := mustCreate(t, "billing", "--billing", "stripe")
	if !exists(filepath.Join(app, "src/routes/api/webhooks/stripe.ts")) {
		t.Error("webhook route missing")
	}
	if !strings.Contains(read(t, filepath.Join(app, "compose.yaml")), "scheduler:") {
		t.Error("scheduler service missing")
	}
	if !regexp.MustCompile(`(?m)^CRON_SECRET=.{44}$`).MatchString(read(t, filepath.Join(app, ".env"))) {
		t.Error("CRON_SECRET not generated")
	}
	if !reflect.DeepEqual(readJSON(t, filepath.Join(app, "b7.json"))["derived"], map[string]any{"scheduler": true}) {
		t.Error("scheduler not derived")
	}
	noMarkers(t, app)
}

func TestEmailNoneDropsTheEmailFeature(t *testing.T) {
	app := mustCreate(t, "no-email", "--email", "none")
	if _, ok := readJSON(t, filepath.Join(app, "package.json"))["dependencies"].(map[string]any)["resend"]; ok {
		t.Error("resend dependency kept")
	}
	for _, f := range []string{"src/modules/email", "src/routes/forgot-password.tsx", "test/email.test.ts", "drizzle"} {
		if exists(filepath.Join(app, f)) {
			t.Errorf("%s should be removed", f)
		}
	}
	if regexp.MustCompile(`sendEmail|requireEmailVerification`).MatchString(read(t, filepath.Join(app, "src/modules/auth/auth.ts"))) {
		t.Error("auth keeps email")
	}
	if strings.Contains(read(t, filepath.Join(app, ".env.example")), "RESEND_API_KEY") {
		t.Error(".env.example keeps RESEND_API_KEY")
	}
	noMarkers(t, app)
}

func TestRuleViolationsExitWithTheRuleNumber(t *testing.T) {
	for _, c := range []struct {
		args []string
		rule string
	}{
		{[]string{"--email", "smtp"}, "Rule 1"},
		{[]string{"--billing", "paypal"}, "Rule 1"},
		{[]string{"--organizations", "--email", "none"}, "Rule 2"},
	} {
		if _, out, err := create(t, "app", c.args...); err == nil || !strings.Contains(out, c.rule) {
			t.Errorf("%v: err=%v out=%s", c.args, err, out)
		}
	}
}

func TestRejectsInvalidNamesAndUnknownTemplates(t *testing.T) {
	if _, _, err := create(t, "My App"); err == nil {
		t.Error("invalid name accepted")
	}
	if _, out, err := create(t, "ok", "-t", "nope"); err == nil || !strings.Contains(out, "Available: fullstack") {
		t.Errorf("unknown template: %v %s", err, out)
	}
}

func TestHelpAndVersion(t *testing.T) {
	help, _ := exec.Command(cli, "--help").CombinedOutput()
	for _, s := range []string{"--template", "--yes", "--no-install", "--no-git", "--version", "fullstack"} {
		if !strings.Contains(string(help), s) {
			t.Errorf("help lacks %s", s)
		}
	}
	if v, _ := exec.Command(cli, "-v").Output(); strings.TrimSpace(string(v)) != testVersion {
		t.Errorf("version %q", v)
	}
}

func TestWarnsWhenPnpmIsMissing(t *testing.T) {
	app := filepath.Join(t.TempDir(), "no-pnpm")
	cmd := exec.Command(cli, app, "--yes", "--no-git")
	cmd.Env = append(os.Environ(), "PATH="+t.TempDir())
	out, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(out), "pnpm not found") || !exists(filepath.Join(app, "package.json")) {
		t.Errorf("%v\n%s", err, out)
	}
}

// The template's own b7.json is a valid, complete configuration of its b7.features.json.
func TestTemplateConfigIsValid(t *testing.T) {
	for _, name := range templateNames() {
		var b7 struct {
			Profile string
			Options map[string]any
		}
		sub, _ := fs.Sub(tmpl.FS, name)
		b, _ := fs.ReadFile(sub, "b7.json")
		if err := json.Unmarshal(b, &b7); err != nil {
			t.Fatal(err)
		}
		m, err := generate.ReadManifest(sub)
		if err != nil {
			t.Fatal(err)
		}
		r, err := config.Resolve(b7.Profile, m, b7.Options)
		if err != nil || !reflect.DeepEqual(r.Map(), b7.Options) {
			t.Errorf("%s: %v %v", name, r.Map(), err)
		}
	}
}

// Piped answers reach every prompt (huh's accessible mode), not only the first one.
func TestPipedPrompts(t *testing.T) {
	cmd := exec.Command(cli, "--no-install", "--no-git")
	cmd.Dir = t.TempDir()
	cmd.Stdin = strings.NewReader("piped\n1\ny\n2\n") // directory, email: resend, organizations: yes, billing: stripe
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}
	want := map[string]any{"email": "resend", "organizations": true, "billing": "stripe"}
	if got := readJSON(t, filepath.Join(cmd.Dir, "piped", "b7.json"))["options"]; !reflect.DeepEqual(got, want) {
		t.Errorf("options = %v", got)
	}
}
