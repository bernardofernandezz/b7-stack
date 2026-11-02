// Copies ../../../templates into ../templates for go:embed, without build output and local state.
package main

import (
	"io/fs"
	"log"
	"os"
	"path/filepath"
)

var skip = map[string]bool{"node_modules": true, "dist": true, ".tanstack": true, ".env": true, "test-results": true, "playwright-report": true}

func main() {
	src, out := filepath.Join("..", "..", "..", "templates"), "templates"
	if err := os.RemoveAll(out); err != nil {
		log.Fatal(err)
	}
	err := filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if skip[d.Name()] {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(src, path)
		dst := filepath.Join(out, rel)
		if d.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0o644)
	})
	if err != nil {
		log.Fatal(err)
	}
}
