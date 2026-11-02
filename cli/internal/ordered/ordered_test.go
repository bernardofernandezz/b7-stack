package ordered

import (
	"encoding/json"
	"testing"
)

func TestRoundTripKeepsOrderAndText(t *testing.T) {
	in := "{\n  \"name\": \"b7\",\n  \"scripts\": {\n    \"dev\": \"a && b <c>\"\n  },\n  \"n\": 1.50,\n  \"list\": [\n    true,\n    null\n  ],\n  \"empty\": {},\n  \"a\": \"é\"\n}\n"
	o := New()
	if err := json.Unmarshal([]byte(in), o); err != nil {
		t.Fatal(err)
	}
	o.Set("name", "app").Set("z", "z")
	o.Delete("a")
	out, err := Indent(o)
	if err != nil {
		t.Fatal(err)
	}
	want := "{\n  \"name\": \"app\",\n  \"scripts\": {\n    \"dev\": \"a && b <c>\"\n  },\n  \"n\": 1.50,\n  \"list\": [\n    true,\n    null\n  ],\n  \"empty\": {},\n  \"z\": \"z\"\n}\n"
	if string(out) != want {
		t.Fatalf("got\n%s\nwant\n%s", out, want)
	}
}
