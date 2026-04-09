import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist/bin",
  clean: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  // Bundle the React runtime and reconciler so the ESM build does not emit
  // dynamic `require("react")` calls under Node 22.
  noExternal: ["react", "react-dom", "react-reconciler", "scheduler"],
});
