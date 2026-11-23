# Technical Specification — Architecture, Database & Agent Contracts

## 1. Arsitektur Sistem (Local-First Monorepo)
```text
/
├── apps/
│   ├── web/          # Next.js (App Router) Dashboard + API Routes + SSE Stream
│   └── worker/       # Node.js DAG Orchestrator, Agent Runners, Media Renderer, Playwright Pool
├── packages/
│   └── shared/       # Zod Schemas, TypeScript Types, Crypto Helpers, Similarity Gate
├── data/
│   ├── app.db        # SQLite database (WAL mode enabled)
│   ├── profiles/     # Persistent Chromium userDataDir per account
│   ├── media/        # Rendered PNG/MP4 assets per account
│   └── logs/         # Dry-run & challenge screenshots
└── docs/             # PROJECT_BRIEF.md, TECH_SPEC.md, RISK_MITIGATION.md
```

## 2. Skema Database SQLite (Drizzle ORM)
1. **`accounts`**:
   - `id` (TEXT PK), `platform` (`tiktok|threads|x|instagram|facebook`), `handle` (TEXT), `group_tag` (TEXT), `profile_dir` (TEXT), `encrypted_proxy` (TEXT), `encrypted_session` (TEXT), `timezone` (TEXT), `daily_post_limit` (INTEGER), `posts_today` (INTEGER), `status` (`IDLE|ACTIVE|CHALLENGE_PAUSED|RATE_LIMITED|DISABLED`), `last_active_at` (INTEGER).
2. **`campaigns`**:
   - `id` (TEXT PK), `command_prompt` (TEXT), `target_platforms` (JSON), `target_group_tag` (TEXT), `dry_run` (INTEGER default 1), `max_token_budget` (INTEGER), `tokens_used` (INTEGER), `status` (`QUEUED|RUNNING|PAUSED|COMPLETED|FAILED`), `created_at` (INTEGER).
3. **`agent_runs`**:
   - `id` (TEXT PK), `campaign_id` (TEXT FK), `stage` (`RESEARCH|STRATEGY|COPY|MEDIA|QA|INSIGHT`), `model_used` (TEXT), `attempt` (INTEGER), `input_json` (TEXT), `output_json` (TEXT), `tokens_used` (INTEGER), `status` (`RUNNING|SUCCESS|FAILED`), `error_message` (TEXT), `created_at` (INTEGER).
4. **`content_assets`**:
   - `id` (TEXT PK), `campaign_id` (TEXT FK), `account_id` (TEXT FK), `platform` (TEXT), `hook` (TEXT), `caption` (TEXT), `media_type` (`NONE|IMAGE|CAROUSEL|VIDEO`), `media_path` (TEXT), `media_sha256` (TEXT), `similarity_score` (REAL), `qa_status` (`PENDING|PASSED|REJECTED`), `qa_notes` (TEXT).
5. **`publish_jobs`**:
   - `id` (TEXT PK), `campaign_id` (TEXT FK), `account_id` (TEXT FK), `asset_id` (TEXT FK), `scheduled_at` (INTEGER), `status` (`PENDING|RUNNING|DRY_RUN_OK|PUBLISHED|CHALLENGE_PAUSED|FAILED`), `published_url` (TEXT), `screenshot_path` (TEXT), `error_message` (TEXT).
6. **`insights`**:
   - `id` (TEXT PK), `publish_job_id` (TEXT FK), `account_id` (TEXT FK), `platform` (TEXT), `views` (INTEGER), `likes` (INTEGER), `replies` (INTEGER), `shares` (INTEGER), `winning_pattern_summary` (TEXT), `collected_at` (INTEGER).

## 3. Kontrak JSON Antar Agen (Zod)
- **`ResearchBrief`**: `{ trends: Array<{ topic, hookAngle, platform, confidence }>, audiencePainPoints: string[], bannedAngles: string[], priorWinningPatterns: string[] }`
- **`CampaignPlan`**: `{ assignments: Array<{ accountId, platform, scheduledIso, contentAngle, format, variationSeed }> }`
- **`CopyBundle`**: `{ items: Array<{ accountId, platform, hook, body, cta, hashtags: string[], variantLabel }> }`
- **`VisualSpec`**: `{ accountId, format: "IMAGE"|"VIDEO", aspectRatio: "9:16"|"4:5"|"1:1", headline, subheadline, accentHex, durationSec?, variationSeed }`

## 4. Konfigurasi Environment (`.env`)
```env
NODE_ENV=development
DATABASE_URL=./data/app.db
MASTER_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
META_API_BASE_URL=https://api.meta.ai/v1
META_API_KEY=mock
META_MODEL_ORCHESTRATOR=muse-wonder-1.0
META_MODEL_SPECIALIST=muse-spark-1.3
META_MODEL_GUARD=muse-ember-1.0
META_MODEL_IMAGE=muse-image-1.0
DRY_RUN=true
MAX_CONCURRENT_BROWSERS=2
```
