import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  splitting: true,
  sourcemap: false,
  dts: true,
  outDir: "dist",
  clean: true,
  minify: true,
});
