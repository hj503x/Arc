import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works when served from a GitHub Pages
// project subpath (https://username.github.io/repo-name/) without
// needing to hardcode the repo name here.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
