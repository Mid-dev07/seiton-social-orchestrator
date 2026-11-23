import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  groupTag: text("group_tag").notNull(),
  profileDir: text("profile_dir").notNull(),
  encryptedProxy: text("encrypted_proxy"),
  encryptedSession: text("encrypted_session"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  dailyPostLimit: integer("daily_post_limit").notNull().default(5),
  postsToday: integer("posts_today").notNull().default(0),
  status: text("status").notNull().default("IDLE"),
  lastActiveAt: integer("last_active_at"),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  commandPrompt: text("command_prompt").notNull(),
  targetPlatforms: text("target_platforms").notNull(),
  targetGroupTag: text("target_group_tag").notNull().default("all"),
  dryRun: integer("dry_run").notNull().default(1),
  maxTokenBudget: integer("max_token_budget").notNull().default(50000),
  tokensUsed: integer("tokens_used").notNull().default(0),
  status: text("status").notNull().default("QUEUED"),
  createdAt: integer("created_at").notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  modelUsed: text("model_used").notNull(),
  attempt: integer("attempt").notNull().default(1),
  inputJson: text("input_json").notNull(),
  outputJson: text("output_json").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  status: text("status").notNull().default("RUNNING"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
});

export const contentAssets = sqliteTable("content_assets", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  hook: text("hook").notNull(),
  caption: text("caption").notNull(),
  mediaType: text("media_type").notNull().default("IMAGE"),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  mediaPath: text("media_path"),
  mediaSha256: text("media_sha256"),
  similarityScore: real("similarity_score").notNull().default(0),
  qaStatus: text("qa_status").notNull().default("PENDING"),
  qaNotes: text("qa_notes"),
  createdAt: integer("created_at").notNull(),
});

export const publishJobs = sqliteTable("publish_jobs", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  assetId: text("asset_id")
    .notNull()
    .references(() => contentAssets.id, { onDelete: "cascade" }),
  scheduledAt: integer("scheduled_at").notNull(),
  status: text("status").notNull().default("PENDING"),
  publishedUrl: text("published_url"),
  screenshotPath: text("screenshot_path"),
  errorMessage: text("error_message"),
});

export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  publishJobId: text("publish_job_id")
    .notNull()
    .references(() => publishJobs.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  replies: integer("replies").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  winningPatternSummary: text("winning_pattern_summary").notNull(),
  collectedAt: integer("collected_at").notNull(),
});

export const systemState = sqliteTable("system_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type AccountRow = typeof accounts.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type ContentAssetRow = typeof contentAssets.$inferSelect;
export type PublishJobRow = typeof publishJobs.$inferSelect;
export type InsightRow = typeof insights.$inferSelect;
export type SystemStateRow = typeof systemState.$inferSelect;
