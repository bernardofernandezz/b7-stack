import { existsSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server and tests read .env into process.env. In Docker, compose.yaml sets the variables. Existing variables win.
if (existsSync(".env")) process.loadEnvFile();

export default defineConfig({
  server: { port: 3000 },
  plugins: [tailwindcss(), tanstackStart(), react()],
});
