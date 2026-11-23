import {
  AGENT_SKILL_STANDARDS,
  AccountRow,
  agentRuns,
  accounts,
  campaigns,
  contentAssets,
  decryptSecret,
  getPerformanceMemory,
  getSafeMuseSettings,
  getSharedDb,
  insights,
  isGlobalPaused,
  maskProxyDisplay,
  publishJobs,
} from "@seiton/shared";
import { desc } from "drizzle-orm";

export interface SafeAccountDto {
  id: string;
  platform: string;
  handle: string;
  groupTag: string;
  profileDir: string;
  proxyDisplay: string;
  hasSession: boolean;
  isDummyAccount: boolean;
  timezone: string;
  dailyPostLimit: number;
  postsToday: number;
  status: string;
  lastActiveAt: number | null;
}

function detectDummyAccount(row: AccountRow): boolean {
  if (!row.encryptedSession) {
    return false;
  }
  try {
    const raw = decryptSecret(row.encryptedSession);
    const parsed = JSON.parse(raw) as { isDummySeed?: boolean; seededAt?: string };
    return Boolean(parsed.isDummySeed || parsed.seededAt === "2026-11-23T00:00:00.000Z");
  } catch {
    return false;
  }
}

export function serializeAccount(row: AccountRow): SafeAccountDto {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    groupTag: row.groupTag,
    profileDir: row.profileDir,
    proxyDisplay: maskProxyDisplay(row.encryptedProxy),
    hasSession: Boolean(row.encryptedSession),
    isDummyAccount: detectDummyAccount(row),
    timezone: row.timezone,
    dailyPostLimit: row.dailyPostLimit,
    postsToday: row.postsToday,
    status: row.status,
    lastActiveAt: row.lastActiveAt,
  };
}

export function buildDashboardState() {
  const db = getSharedDb();
  const accountRows = db.select().from(accounts).all().map(serializeAccount);
  const campaignRows = db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt))
    .limit(20)
    .all();
  const agentRunRows = db
    .select()
    .from(agentRuns)
    .orderBy(desc(agentRuns.createdAt))
    .limit(80)
    .all();
  const assetRows = db
    .select()
    .from(contentAssets)
    .orderBy(desc(contentAssets.createdAt))
    .limit(80)
    .all();
  const jobRows = db
    .select()
    .from(publishJobs)
    .orderBy(desc(publishJobs.scheduledAt))
    .limit(80)
    .all();
  const insightRows = db
    .select()
    .from(insights)
    .orderBy(desc(insights.collectedAt))
    .limit(60)
    .all();

  const museSettings = getSafeMuseSettings(db);
  const providerMode = museSettings.hasApiKey
    ? "MetaMuseProvider (Live)"
    : "MockModelProvider";

  return {
    globalPaused: isGlobalPaused(db),
    dryRunDefault: process.env.DRY_RUN !== "false",
    providerMode,
    runtimeMode: "local" as const,
    museSettings,
    agentSkills: AGENT_SKILL_STANDARDS,
    accounts: accountRows,
    campaigns: campaignRows,
    agentRuns: agentRunRows,
    contentAssets: assetRows,
    publishJobs: jobRows,
    insights: insightRows,
    performanceMemory: getPerformanceMemory(db),
  };
}
