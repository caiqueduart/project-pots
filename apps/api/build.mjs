// Empacota a API num arquivo só. @pots/shared (código TS do monorepo) entra no pacote;
// as demais dependências ficam em node_modules.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@pots/"));

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: external.flatMap((d) => [d, `${d}/*`]),
  sourcemap: true,
  logLevel: "info",
});
