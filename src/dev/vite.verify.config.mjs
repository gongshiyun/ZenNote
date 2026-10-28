/**
 * Dev-server config used ONLY by scripts/verify-ui.mjs.
 *
 * The normal `npm run dev` (vite.config.ts) is what developers use. During QA
 * runs other agents are actively writing files, and their editors create
 * `.FILE.<pid>.<uuid>.tmpdir/` staging folders inside src/. Vite's watcher tries
 * to watch those locked temp files as they appear and the process dies with
 * `EBUSY: resource busy or locked` — a Windows race, not an app problem.
 *
 * This config is identical to vite.config.ts (same root, React + Tailwind
 * plugins, port 5173) and only adds watch-ignore globs for those transient
 * editor artifacts, so screenshots can be captured while the workspace is
 * being edited concurrently.
 */
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default {
  root,
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/*.tmpdir/**",
        "**/*.tmp",
        "**/*.swp",
        "**/~*",
        "**/.~*",
        "**/artifacts/**",
      ],
    },
  },
};
