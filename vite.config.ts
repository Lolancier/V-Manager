import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rendererEntryPages = [
  "index.html",
  "startup.html",
  "settings.html",
  "scale.html",
  "composer.html",
  "chat.html",
  "bubble.html",
  "expressions.html",
  "code.html"
];

export default defineConfig({
  // Electron loads the production renderer through file://. Relative bundle
  // URLs keep scripts and styles inside dist instead of resolving from C:\.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@framework": path.resolve(__dirname, "third_party/live2d/CubismSdkForWeb-5-r.5/Framework/src")
    }
  },
  optimizeDeps: {
    entries: rendererEntryPages
  },
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        rendererEntryPages.map((page) => [page.replace(/\.html$/, ""), path.resolve(__dirname, page)])
      )
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/third_party/**"]
    }
  }
});
