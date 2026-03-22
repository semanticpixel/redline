import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin/index.tsx"],
  format: ["esm"],
  target: "node20",
  outDir: "dist/bin",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: ["react", "ink", "ink-text-input"],
});
