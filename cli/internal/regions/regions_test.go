package regions

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestFixtures(t *testing.T) {
	var fx struct {
		Holds []struct {
			Cond     string
			Features map[string]any
			Want     bool
		}
		Apply []struct {
			Name, Text, Out, Error string
			Features               map[string]any
		}
	}
	b, err := os.ReadFile("../../testdata/regions.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &fx); err != nil {
		t.Fatal(err)
	}
	for _, c := range fx.Holds {
		if got := Holds(c.Cond, c.Features); got != c.Want {
			t.Errorf("Holds(%q, %v) = %v", c.Cond, c.Features, got)
		}
	}
	for _, c := range fx.Apply {
		out, err := Apply(c.Text, c.Features, "f.ts")
		switch {
		case c.Error != "" && (err == nil || !strings.HasPrefix(err.Error(), c.Error)):
			t.Errorf("%s: error %v, want %q", c.Name, err, c.Error)
		case c.Error == "" && (err != nil || out != c.Out):
			t.Errorf("%s: got %q, %v", c.Name, out, err)
		}
	}
}
