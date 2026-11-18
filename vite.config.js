import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds everything (JS, CSS, logo) into one dist/index.html,
// so it works as a local file:// home page and in New Tab Override.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
});
