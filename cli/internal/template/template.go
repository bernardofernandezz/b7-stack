// Package template embeds ../templates, copied here by `go generate` (the copy is gitignored).
package template

//go:generate go run ./copy

import (
	"embed"
	"io/fs"
)

//go:embed all:templates
var files embed.FS

// FS is the templates directory: one subdirectory per template.
var FS, _ = fs.Sub(files, "templates")
