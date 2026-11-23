import Database from "better-sqlite3";
import { count, eq, inArray } from "drizzle-orm";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { decryptSecret, encryptSecret } from "../crypto";
import { loadWorkspaceEnv } from "../env";
import { ensureDataDirectories, resolveDbPath } from "../paths";
import {
  MuseConfigInput,
  MuseConfigInputSchema,
  PerformanceMemory,
  PerformanceMemorySchema,
  Platform,
} from "../schemas";
import * as schema from "./schema";

export type DbInstance = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

const GLOBAL_PAUSED_KEY = "global_paused";
const PERFORMANCE_MEMORY_KEY = "performance_memory";
const MUSE_CONFIG_KEY = "muse_ai_config";
const SEED_FLAG_KEY = "seeded_accounts_initialized";

const MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    group_tag TEXT NOT NULL,
    profile_dir TEXT NOT NULL,
    encrypted_proxy TEXT,
    encrypted_session TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    daily_post_limit INTEGER NOT NULL DEFAULT 5,
    posts_today INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'IDLE',
    last_active_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    command_prompt TEXT NOT NULL,
    target_platforms TEXT NOT NULL,
    target_group_tag TEXT NOT NULL DEFAULT 'all',
    dry_run INTEGER NOT NULL DEFAULT 1,
    max_token_budget INTEGER NOT NULL DEFAULT 50000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    model_used TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 1,
    input_json TEXT NOT NULL,
    output_json TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    error_message TEXT,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS content_assets (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    hook TEXT NOT NULL,
    caption TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'IMAGE',
    aspect_ratio TEXT NOT NULL DEFAULT '1:1',
    media_path TEXT,
    media_sha256 TEXT,
    similarity_score REAL NOT NULL DEFAULT 0,
    qa_status TEXT NOT NULL DEFAULT 'PENDING',
    qa_notes TEXT,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS publish_jobs (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
    scheduled_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    published_url TEXT,
    screenshot_path TEXT,
    error_message TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    publish_job_id TEXT NOT NULL REFERENCES publish_jobs(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    replies INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    winning_pattern_summary TEXT NOT NULL,
    collected_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_agent_runs_campaign ON agent_runs(campaign_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_content_assets_campaign ON content_assets(campaign_id, account_id);`,
  `CREATE INDEX IF NOT EXISTS idx_publish_jobs_campaign ON publish_jobs(campaign_id, account_id);`,
  `CREATE INDEX IF NOT EXISTS idx_insights_account ON insights(account_id, collected_at);`,
];

/**
 * Applies idempotent SQLite DDL migrations.
 */
export function runMigrations(sqlite: Database.Database): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  for (const statement of MIGRATION_STATEMENTS) {
    sqlite.exec(statement);
  }
}

/**
 * Creates a SQLite Drizzle connection, runs migrations, and ensures system_state defaults exist.
 */
export function createDbConnection(customDbPath?: string): DbInstance {
  loadWorkspaceEnv();
  if (customDbPath !== ":memory:") {
    ensureDataDirectories();
  }
  const dbPath = resolveDbPath(customDbPath);
  const sqlite = new Database(dbPath);
  runMigrations(sqlite);
  const db = drizzle(sqlite, { schema }) as DbInstance;

  const existingPause = db
    .select()
    .from(schema.systemState)
    .where(eq(schema.systemState.key, GLOBAL_PAUSED_KEY))
    .get();
  if (!existingPause) {
    db.insert(schema.systemState)
      .values({
        key: GLOBAL_PAUSED_KEY,
        value: JSON.stringify({ paused: false, reason: "initial" }),
        updatedAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  }

  return db;
}

let sharedDb: DbInstance | null = null;

/**
 * Returns a singleton database connection initialized with migrations and default Seiton accounts.
 */
export function getSharedDb(): DbInstance {
  if (!sharedDb) {
    sharedDb = createDbConnection();
    seedDefaultSeitonAccounts(sharedDb);
  }
  return sharedDb;
}

interface SeedAccountSpec {
  id: string;
  platform: Platform;
  handle: string;
  groupTag: "seiton-umkm" | "seiton-premium";
  proxyNodeIndex: number;
}

const DEFAULT_SEITON_ACCOUNTS: SeedAccountSpec[] = [
  {
    id: "acc-tiktok-umkm",
    platform: "tiktok",
    handle: "@seiton.umkm.id",
    groupTag: "seiton-umkm",
    proxyNodeIndex: 1,
  },
  {
    id: "acc-tiktok-premium",
    platform: "tiktok",
    handle: "@seiton.appvault",
    groupTag: "seiton-premium",
    proxyNodeIndex: 2,
  },
  {
    id: "acc-threads-umkm",
    platform: "threads",
    handle: "@seiton.digital.umkm",
    groupTag: "seiton-umkm",
    proxyNodeIndex: 3,
  },
  {
    id: "acc-threads-premium",
    platform: "threads",
    handle: "@seiton.premium.hub",
    groupTag: "seiton-premium",
    proxyNodeIndex: 4,
  },
  {
    id: "acc-x-umkm",
    platform: "x",
    handle: "@seiton_umkm",
    groupTag: "seiton-umkm",
    proxyNodeIndex: 5,
  },
  {
    id: "acc-x-premium",
    platform: "x",
    handle: "@seiton_premium",
    groupTag: "seiton-premium",
    proxyNodeIndex: 6,
  },
  {
    id: "acc-ig-umkm",
    platform: "instagram",
    handle: "@seiton.id.official",
    groupTag: "seiton-umkm",
    proxyNodeIndex: 7,
  },
  {
    id: "acc-ig-premium",
    platform: "instagram",
    handle: "@seiton.pro.store",
    groupTag: "seiton-premium",
    proxyNodeIndex: 8,
  },
  {
    id: "acc-fb-umkm",
    platform: "facebook",
    handle: "Seiton UMKM Digital Indonesia",
    groupTag: "seiton-umkm",
    proxyNodeIndex: 9,
  },
  {
    id: "acc-fb-premium",
    platform: "facebook",
    handle: "Seiton Premium App Solutions",
    groupTag: "seiton-premium",
    proxyNodeIndex: 10,
  },
];

/**
 * Seeds the 10 Seiton.id starter accounts once when the database is brand new (never re-seeds after purge).
 */
export function seedDefaultSeitonAccounts(db: DbInstance): number {
  const seedFlag = db
    .select()
    .from(schema.systemState)
    .where(eq(schema.systemState.key, SEED_FLAG_KEY))
    .get();
  if (seedFlag) {
    return 0;
  }

  const rowCount = db.select({ total: count() }).from(schema.accounts).get()?.total ?? 0;
  if (rowCount > 0) {
    db.insert(schema.systemState)
      .values({ key: SEED_FLAG_KEY, value: "existing", updatedAt: Date.now() })
      .onConflictDoNothing()
      .run();
    return 0;
  }

  for (const spec of DEFAULT_SEITON_ACCOUNTS) {
    const encryptedProxy = encryptSecret(
      `http://seiton_op_${spec.proxyNodeIndex}:localvault_${spec.proxyNodeIndex}@proxy-node-${spec.proxyNodeIndex}.seiton.local:8080`
    );
    const encryptedSession = encryptSecret(
      JSON.stringify({
        platform: spec.platform,
        handle: spec.handle,
        authenticated: true,
        isDummySeed: true,
        seededAt: "2026-11-23T00:00:00.000Z",
      })
    );
    db.insert(schema.accounts)
      .values({
        id: spec.id,
        platform: spec.platform,
        handle: spec.handle,
        groupTag: spec.groupTag,
        profileDir: `./data/profiles/${spec.platform}-${spec.id}`,
        encryptedProxy,
        encryptedSession,
        timezone: "Asia/Jakarta",
        dailyPostLimit: 5,
        postsToday: 0,
        status: "IDLE",
        lastActiveAt: null,
      })
      .run();
  }

  db.insert(schema.systemState)
    .values({ key: SEED_FLAG_KEY, value: "seeded", updatedAt: Date.now() })
    .onConflictDoNothing()
    .run();

  return DEFAULT_SEITON_ACCOUNTS.length;
}

/**
 * Removes all seeded dummy accounts so the operator works strictly with real connected accounts.
 */
export function purgeDummyAccounts(db: DbInstance): number {
  const dummyIds = DEFAULT_SEITON_ACCOUNTS.map((a) => a.id);
  const res = db
    .delete(schema.accounts)
    .where(inArray(schema.accounts.id, dummyIds))
    .run();

  db.insert(schema.systemState)
    .values({ key: SEED_FLAG_KEY, value: "purged", updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.systemState.key,
      set: { value: "purged", updatedAt: Date.now() },
    })
    .run();

  return res.changes;
}

/**
 * Checks whether the global kill switch is currently active.
 */
export function isGlobalPaused(db: DbInstance): boolean {
  const row = db
    .select()
    .from(schema.systemState)
    .where(eq(schema.systemState.key, GLOBAL_PAUSED_KEY))
    .get();
  if (!row) {
    return false;
  }
  try {
    const parsed = JSON.parse(row.value) as { paused?: boolean };
    return Boolean(parsed.paused);
  } catch {
    return false;
  }
}

/**
 * Sets or clears the global kill switch flag in SQLite and pauses active/queued campaigns when paused=true.
 */
export function setGlobalPaused(
  db: DbInstance,
  paused: boolean,
  reason = "operator_action"
): { paused: boolean; updatedAt: number; pausedCampaigns: number } {
  const updatedAt = Date.now();
  const payload = JSON.stringify({ paused, reason, updatedAt });

  db.insert(schema.systemState)
    .values({
      key: GLOBAL_PAUSED_KEY,
      value: payload,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.systemState.key,
      set: { value: payload, updatedAt },
    })
    .run();

  let pausedCampaigns = 0;
  if (paused) {
    const running = db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.status, "RUNNING"))
      .all();
    const queued = db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.status, "QUEUED"))
      .all();
    for (const c of [...running, ...queued]) {
      db.update(schema.campaigns)
        .set({ status: "PAUSED" })
        .where(eq(schema.campaigns.id, c.id))
        .run();
      pausedCampaigns += 1;
    }
  }

  return { paused, updatedAt, pausedCampaigns };
}

/**
 * Reads PerformanceMemory for the next Research/Strategy DAG cycle.
 */
export function getPerformanceMemory(db: DbInstance): PerformanceMemory {
  const row = db
    .select()
    .from(schema.systemState)
    .where(eq(schema.systemState.key, PERFORMANCE_MEMORY_KEY))
    .get();
  if (!row) {
    return {
      updatedAt: 0,
      winningPatterns: [
        "Studi kasus UMKM hemat waktu pembukuan & desain dengan Seiton.id",
        "Perbandingan biaya langganan aplikasi premium resmi Seiton vs harga reguler",
      ],
      platformHighlights: {
        tiktok: "Video 9:16 singkat dengan hook angka efisiensi UMKM",
        threads: "Diskusi tanya-jawab produktivitas owner UMKM",
        x: "Thread ringkas micro-tips tools bisnis digital",
        instagram: "Visual 4:5 kontras tinggi dengan CTA cek bio Seiton.id",
        facebook: "Narasi studi kasus ROI operasional toko lokal",
      },
    };
  }
  try {
    const parsed = PerformanceMemorySchema.safeParse(JSON.parse(row.value));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Fall through to default memory if stored JSON is invalid
  }
  return {
    updatedAt: 0,
    winningPatterns: [],
    platformHighlights: {},
  };
}

/**
 * Persists updated PerformanceMemory produced by the Insight Analyst Agent.
 */
export function savePerformanceMemory(db: DbInstance, memory: PerformanceMemory): void {
  const validated = PerformanceMemorySchema.parse(memory);
  const updatedAt = Date.now();
  db.insert(schema.systemState)
    .values({
      key: PERFORMANCE_MEMORY_KEY,
      value: JSON.stringify(validated),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.systemState.key,
      set: { value: JSON.stringify(validated), updatedAt },
    })
    .run();
}

export interface MuseRuntimeSettings {
  baseUrl: string;
  apiKey: string;
  orchestratorModel: string;
  specialistModel: string;
  guardModel: string;
  imageModel: string;
  livePlatformAutomation: boolean;
  liveProxyEnabled: boolean;
}

export interface SafeMuseSettings {
  baseUrl: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  orchestratorModel: string;
  specialistModel: string;
  guardModel: string;
  imageModel: string;
  livePlatformAutomation: boolean;
  liveProxyEnabled: boolean;
}

/**
 * Reads Muse AI runtime settings (decrypting the stored API key for server/worker execution only).
 */
export function getMuseRuntimeSettings(db: DbInstance): MuseRuntimeSettings {
  const defaults: MuseRuntimeSettings = {
    baseUrl: process.env.META_API_BASE_URL || "https://api.meta.ai/v1",
    apiKey: (process.env.META_API_KEY ?? "").trim(),
    orchestratorModel: process.env.META_MODEL_ORCHESTRATOR || "muse-wonder-1.0",
    specialistModel: process.env.META_MODEL_SPECIALIST || "muse-spark-1.3",
    guardModel: process.env.META_MODEL_GUARD || "muse-ember-1.0",
    imageModel: process.env.META_MODEL_IMAGE || "muse-image-1.0",
    livePlatformAutomation: process.env.LIVE_PLATFORM_AUTOMATION === "true",
    liveProxyEnabled: process.env.LIVE_PROXY_ENABLED === "true",
  };

  const row = db
    .select()
    .from(schema.systemState)
    .where(eq(schema.systemState.key, MUSE_CONFIG_KEY))
    .get();

  if (!row) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<MuseRuntimeSettings> & {
      encryptedApiKey?: string | null;
    };
    let decryptedKey = defaults.apiKey;
    if (parsed.encryptedApiKey) {
      decryptedKey = decryptSecret(parsed.encryptedApiKey);
    }
    return {
      baseUrl: parsed.baseUrl || defaults.baseUrl,
      apiKey: decryptedKey,
      orchestratorModel: parsed.orchestratorModel || defaults.orchestratorModel,
      specialistModel: parsed.specialistModel || defaults.specialistModel,
      guardModel: parsed.guardModel || defaults.guardModel,
      imageModel: parsed.imageModel || defaults.imageModel,
      livePlatformAutomation:
        parsed.livePlatformAutomation ?? defaults.livePlatformAutomation,
      liveProxyEnabled: parsed.liveProxyEnabled ?? defaults.liveProxyEnabled,
    };
  } catch {
    return defaults;
  }
}

/**
 * Returns non-secret Muse AI settings safe for sending to UI / API clients.
 */
export function getSafeMuseSettings(db: DbInstance): SafeMuseSettings {
  const rt = getMuseRuntimeSettings(db);
  const hasRealKey = Boolean(rt.apiKey && rt.apiKey !== "mock");
  const maskedApiKey = hasRealKey
    ? `${rt.apiKey.slice(0, 6)}••••${rt.apiKey.slice(-4)}`
    : "Belum dikonfigurasi (Fallback / Edge AI)";

  return {
    baseUrl: rt.baseUrl,
    hasApiKey: hasRealKey,
    maskedApiKey,
    orchestratorModel: rt.orchestratorModel,
    specialistModel: rt.specialistModel,
    guardModel: rt.guardModel,
    imageModel: rt.imageModel,
    livePlatformAutomation: rt.livePlatformAutomation,
    liveProxyEnabled: rt.liveProxyEnabled,
  };
}

/**
 * Saves Muse AI settings into SQLite system_state, encrypting the API key with AES-256-GCM.
 */
export function saveMuseSettings(
  db: DbInstance,
  input: MuseConfigInput
): SafeMuseSettings {
  const validated = MuseConfigInputSchema.parse(input);
  const current = getMuseRuntimeSettings(db);
  const nextApiKey =
    validated.apiKey !== undefined && validated.apiKey.length > 0
      ? validated.apiKey
      : current.apiKey;

  const encryptedApiKey =
    nextApiKey && nextApiKey !== "mock" ? encryptSecret(nextApiKey) : null;

  const stored = {
    baseUrl: validated.baseUrl,
    encryptedApiKey,
    orchestratorModel: validated.orchestratorModel,
    specialistModel: validated.specialistModel,
    guardModel: validated.guardModel,
    imageModel: validated.imageModel,
    livePlatformAutomation: validated.livePlatformAutomation,
    liveProxyEnabled: validated.liveProxyEnabled,
  };

  db.insert(schema.systemState)
    .values({
      key: MUSE_CONFIG_KEY,
      value: JSON.stringify(stored),
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: schema.systemState.key,
      set: { value: JSON.stringify(stored), updatedAt: Date.now() },
    })
    .run();

  return getSafeMuseSettings(db);
}

export { and, desc, eq, inArray } from "drizzle-orm";
export * from "./schema";
