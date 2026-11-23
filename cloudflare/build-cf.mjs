import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(import.meta.dirname, "..");
const outDir = path.join(rootDir, "cloudflare", "dist");

function findCssFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCssFiles(full));
    } else if (entry.name.endsWith(".css")) {
      results.push(full);
    }
  }
  return results;
}

function loadEsbuild() {
  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");
  const candidatePaths = [rootDir];
  if (fs.existsSync(pnpmDir)) {
    for (const folder of fs.readdirSync(pnpmDir)) {
      if (folder.startsWith("esbuild@")) {
        candidatePaths.push(path.join(pnpmDir, folder, "node_modules"));
      }
    }
  }
  const resolved = require.resolve("esbuild", { paths: candidatePaths });
  return require(resolved);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Ensure compiled Tailwind CSS exists from Next.js build
  const nextStaticDir = path.join(rootDir, "apps", "web", ".next", "static");
  let cssFiles = findCssFiles(nextStaticDir);
  if (cssFiles.length === 0) {
    console.log("[cf-build] Running @seiton/web build to generate compiled Tailwind CSS...");
    execSync("pnpm --filter @seiton/web build", { cwd: rootDir, stdio: "inherit" });
    cssFiles = findCssFiles(nextStaticDir);
  }
  if (cssFiles.length === 0) {
    throw new Error("Could not find compiled CSS inside apps/web/.next/static");
  }
  const combinedCss = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  fs.writeFileSync(path.join(outDir, "app.css"), combinedCss, "utf8");

  // 2. Bundle React DashboardClient via esbuild
  const esbuild = loadEsbuild();
  await esbuild.build({
    entryPoints: [path.join(rootDir, "cloudflare", "entry.tsx")],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2022"],
    jsx: "automatic",
    outfile: path.join(outDir, "app.js"),
    nodePaths: [
      path.join(rootDir, "apps", "web", "node_modules"),
      path.join(rootDir, "node_modules"),
    ],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  // 3. Emit index.html
  const html = `<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Seiton-Social Media | 1-Pintu Multi-Agent Orchestrator</title>
  <link rel="stylesheet" href="/app.css" />
</head>
<body class="min-h-screen bg-[#070b14] text-slate-100 antialiased">
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
  console.log(`[cf-build] Built cloudflare/dist successfully (app.js, app.css, index.html)`);
}

main().catch((err) => {
  console.error("[cf-build] Error:", err);
  process.exit(1);
});
