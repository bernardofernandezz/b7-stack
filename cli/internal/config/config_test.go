package config

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestFixtures(t *testing.T) {
	var fx struct {
		Manifest json.RawMessage
		Cases    []struct {
			Name             string
			Requested        map[string]any
			Options, Derived map[string]any
			Notices          *[]string
			Error            string
		}
	}
	b, err := os.ReadFile("../../testdata/rules.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &fx); err != nil {
		t.Fatal(err)
	}
	m, err := ParseManifest(fx.Manifest)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range fx.Cases {
		got, err := Resolve("fullstack", m, c.Requested)
		if c.Error != "" {
			if err == nil || !strings.HasPrefix(err.Error(), c.Error) {
				t.Errorf("%s: error %v, want %q", c.Name, err, c.Error)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", c.Name, err)
			continue
		}
		if c.Options != nil && !reflect.DeepEqual(got.Map(), c.Options) {
			t.Errorf("%s: options %v", c.Name, got.Map())
		}
		if c.Derived != nil {
			if s, _ := got.Derived.Get("scheduler"); s != c.Derived["scheduler"] {
				t.Errorf("%s: derived scheduler %v", c.Name, s)
			}
		}
		if c.Notices != nil && strings.Join(got.Notices, "\n") != strings.Join(*c.Notices, "\n") {
			t.Errorf("%s: notices %q", c.Name, got.Notices)
		}
	}
}
