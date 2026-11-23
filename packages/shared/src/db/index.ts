import Database from "better-sqlite3";
import { count, eq } from "drizzle-orm";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { encryptSecret } from "../crypto";
import { loadWorkspaceEnv } from "../env";
import { ensureDataDirectories, resolveDbPath } from "../paths";
import { PerformanceMemory, PerformanceMemorySchema, Platform } from "../schemas";
import * as schema from "./schema";

export type DbInstance = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

const GLOBAL_PAUSED_KEY = "global_paused";
const PERFORMANCE_MEMORY_KEY = "performance_memory";

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
 * Seeds the 10 Seiton.id accounts across 5 platforms when the accounts table is empty.
 */
export function seedDefaultSeitonAccounts(db: DbInstance): number {
  const rowCount = db.select({ total: count() }).from(schema.accounts).get()?.total ?? 0;
  if (rowCount > 0) {
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

  return DEFAULT_SEITON_ACCOUNTS.length;
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

export { and, desc, eq, inArray } from "drizzle-orm";
export * from "./schema";
