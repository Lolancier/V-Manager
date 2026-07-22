import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    entries: ["index.html"]
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/third_party/**"]
    }
  }
});
