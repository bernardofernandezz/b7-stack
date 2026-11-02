// Package ordered is a JSON object that keeps its key order, so package.json, b7.json and
// b7.features.json are written back the way JSON.stringify would write them.
package ordered

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type Object struct {
	keys []string
	vals map[string]any
}

func New() *Object { return &Object{vals: map[string]any{}} }

func (o *Object) Keys() []string { return o.keys }

func (o *Object) Get(key string) (any, bool) {
	v, ok := o.vals[key]
	return v, ok
}

// Set adds key at the end, or replaces its value in place.
func (o *Object) Set(key string, v any) *Object {
	if _, ok := o.vals[key]; !ok {
		o.keys = append(o.keys, key)
	}
	o.vals[key] = v
	return o
}

func (o *Object) Delete(key string) {
	if _, ok := o.vals[key]; !ok {
		return
	}
	delete(o.vals, key)
	for i, k := range o.keys {
		if k == key {
			o.keys = append(o.keys[:i], o.keys[i+1:]...)
			break
		}
	}
}

// Object returns the nested object at key, or nil.
func (o *Object) Object(key string) *Object {
	v, _ := o.vals[key].(*Object)
	return v
}

func (o *Object) UnmarshalJSON(b []byte) error {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	v, err := parse(dec)
	if err != nil {
		return err
	}
	obj, ok := v.(*Object)
	if !ok {
		return fmt.Errorf("ordered: not a JSON object")
	}
	*o = *obj
	return nil
}

func parse(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch tok {
	case json.Delim('{'):
		o := New()
		for dec.More() {
			k, err := dec.Token()
			if err != nil {
				return nil, err
			}
			v, err := parse(dec)
			if err != nil {
				return nil, err
			}
			o.Set(k.(string), v)
		}
		_, err = dec.Token()
		return o, err
	case json.Delim('['):
		arr := []any{}
		for dec.More() {
			v, err := parse(dec)
			if err != nil {
				return nil, err
			}
			arr = append(arr, v)
		}
		_, err = dec.Token()
		return arr, err
	}
	return tok, nil
}

func (o *Object) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range o.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		key, _ := encode(k)
		val, err := encode(o.vals[k])
		if err != nil {
			return nil, err
		}
		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(val)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// Indent writes v as JSON.stringify(v, null, 2) does, with a trailing newline.
func Indent(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false) // package.json scripts contain "&&"
	enc.SetIndent("", "  ")
	err := enc.Encode(v)
	return buf.Bytes(), err
}

func encode(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	err := enc.Encode(v)
	return bytes.TrimSuffix(buf.Bytes(), []byte("\n")), err
}
