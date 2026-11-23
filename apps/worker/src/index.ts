import {
  campaigns,
  getSharedDb,
  isGlobalPaused,
  loadWorkspaceEnv,
} from "@seiton/shared";
import { and, eq } from "drizzle-orm";
import { executeCampaignDag } from "./orchestrator/dag";

export * from "./adapters";
export * from "./agents/copywriter";
export * from "./agents/designer";
export * from "./agents/insight-analyst";
export * from "./agents/qa-gate";
export * from "./agents/researcher";
export * from "./agents/strategist";
export * from "./browser/playwright-launcher";
export * from "./browser/profile-manager";
export * from "./events";
export * from "./media/renderer";
export * from "./models/provider";
export * from "./orchestrator/dag";

let pollingActive = false;

/**
 * Starts a local polling loop that atomically claims QUEUED campaigns in SQLite.
 */
export function startWorkerDaemon(intervalMs = 1500): () => void {
  loadWorkspaceEnv();
  const db = getSharedDb();
  pollingActive = true;
  let runningTick = false;

  const timer = setInterval(async () => {
    if (!pollingActive || runningTick) {
      return;
    }
    runningTick = true;
    try {
      if (isGlobalPaused(db)) {
        return;
      }
      const queued = db
        .select()
        .from(campaigns)
        .where(eq(campaigns.status, "QUEUED"))
        .all();

      for (const camp of queued) {
        if (isGlobalPaused(db)) {
          break;
        }
        const claimed = db
          .update(campaigns)
          .set({ status: "RUNNING" })
          .where(and(eq(campaigns.id, camp.id), eq(campaigns.status, "QUEUED")))
          .run();
        if (claimed.changes === 1) {
          await executeCampaignDag(camp.id, { db });
        }
      }
    } catch (error) {
      console.error("[Seiton Worker Daemon Error]", error);
    } finally {
      runningTick = false;
    }
  }, intervalMs);

  return () => {
    pollingActive = false;
    clearInterval(timer);
  };
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.includes("apps") &&
  process.argv[1]?.includes("worker") &&
  process.argv[1]?.endsWith("index.ts");

if (isDirectExecution) {
  console.log("[Seiton Worker] Starting isolated DAG worker polling SQLite...");
  const stop = startWorkerDaemon();
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
}
