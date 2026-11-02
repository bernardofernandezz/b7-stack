package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"

	"github.com/bernardofernandezz/b7-stack/cli/internal/config"
)

var (
	accent = lipgloss.AdaptiveColor{Light: "#5A3FD9", Dark: "#9D8CFF"}
	title  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FFFFFF")).Background(accent)
	faint  = lipgloss.NewStyle().Faint(true)
	green  = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#1A7F37", Dark: "#3FB950"})
	yellow = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#9A6700", Dark: "#D29922"})
	red    = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#CF222E", Dark: "#F85149"})
	box    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(accent).Padding(0, 1)
)

func ok(msg string)   { fmt.Println(green.Render("✓") + " " + msg) }
func warn(msg string) { fmt.Println(yellow.Render("!") + " " + msg) }

func fail(msg string) int {
	fmt.Fprintln(os.Stderr, red.Render("✗")+" "+msg)
	return 1
}

// step runs a command in dir with a spinner and its elapsed time. On failure it shows the end of the output,
// so the reason is on screen instead of behind "run it again to see why".
func step(dir, command string) bool {
	args := strings.Fields(command)
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out

	start := time.Now()
	done := make(chan struct{})
	tty := term.IsTerminal(int(os.Stdout.Fd()))
	if tty {
		go spin(command, start, done)
	}
	err := cmd.Run()
	close(done)
	elapsed := faint.Render(fmt.Sprintf("(%.1fs)", time.Since(start).Seconds()))
	if tty {
		fmt.Print("\r\033[K") // clears the spinner line
	}
	if err == nil {
		ok(command + " " + elapsed)
		return true
	}
	fail(command + " failed " + elapsed)
	lines := strings.Split(strings.TrimRight(out.String(), "\n"), "\n")
	if len(lines) > 20 {
		lines = lines[len(lines)-20:]
	}
	for _, l := range lines {
		fmt.Fprintln(os.Stderr, faint.Render("  │ ")+l)
	}
	return false
}

func spin(label string, start time.Time, done chan struct{}) {
	frames := []rune("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
	for i := 0; ; i++ {
		select {
		case <-done:
			return
		case <-time.After(80 * time.Millisecond):
			fmt.Printf("\r%s %s %s", lipgloss.NewStyle().Foreground(accent).Render(string(frames[i%len(frames)])), label,
				faint.Render(fmt.Sprintf("%.0fs", time.Since(start).Seconds())))
		}
	}
}

// checkNode warns when Node.js is missing or older than the generated project needs (engines in package.json).
func checkNode() {
	out, err := exec.Command("node", "--version").Output()
	if err != nil {
		warn("Node.js not found: the project needs Node.js 22.12 or newer (https://nodejs.org)")
		return
	}
	v := strings.TrimPrefix(strings.TrimSpace(string(out)), "v")
	parts := strings.SplitN(v, ".", 3)
	major, _ := strconv.Atoi(parts[0])
	minor := 0
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	if major < 22 || major == 22 && minor < 12 {
		warn("Node.js " + v + " is too old: the project needs 22.12 or newer")
	}
}

func summary(name string, c config.Resolved, next []string) string {
	var b strings.Builder
	b.WriteString(lipgloss.NewStyle().Bold(true).Render(name) + "\n")
	for _, k := range c.Options.Keys() {
		v, _ := c.Options.Get(k)
		b.WriteString(fmt.Sprintf("  %-14s %v\n", k, v))
	}
	for _, k := range c.Derived.Keys() {
		v, _ := c.Derived.Get(k)
		b.WriteString(faint.Render(fmt.Sprintf("  %-14s %v (derived)", k, v)) + "\n")
	}
	b.WriteString("\n" + lipgloss.NewStyle().Bold(true).Render("Next steps") + "\n")
	for _, n := range next {
		b.WriteString("  " + n + "\n")
	}
	return box.Render(strings.TrimRight(b.String(), "\n"))
}
