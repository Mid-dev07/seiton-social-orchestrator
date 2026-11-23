import fs from "node:fs";
import path from "node:path";
import { resolveWorkspaceRoot } from "./paths";

let envLoaded = false;

/**
 * Loads key=value pairs from <workspaceRoot>/.env into process.env without overwriting existing variables.
 */
export function loadWorkspaceEnv(): void {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  const envPath = path.join(resolveWorkspaceRoot(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
