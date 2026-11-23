import {
  InsightReport,
  InsightReportSchema,
  PerformanceMemory,
  Platform,
  getSkillSystemPrompt,
} from "@seiton/shared";
import { ModelProvider } from "../models/provider";

export interface ScrapedJobMetric {
  publishJobId: string;
  accountId: string;
  platform: Platform;
  views: number;
  likes: number;
  replies: number;
  shares: number;
}

export interface InsightAnalystInput {
  campaignId: string;
  metrics: ScrapedJobMetric[];
  previousMemory: PerformanceMemory;
}

export async function runInsightAnalystAgent(
  provider: ModelProvider,
  input: InsightAnalystInput
): Promise<{
  report: InsightReport;
  nextMemory: PerformanceMemory;
  modelUsed: string;
  tokensUsed: number;
}> {
  const result = await provider.generateStructured({
    role: "INSIGHT",
    schema: InsightReportSchema,
    systemPrompt: getSkillSystemPrompt("INSIGHT"),
    userPrompt: `Analyze ${input.metrics.length} publish job metrics for campaign ${input.campaignId}.`,
    contextData: {
      campaignId: input.campaignId,
      jobs: input.metrics,
      previousWinningPatterns: input.previousMemory.winningPatterns,
    },
  });

  const platformHighlights: Record<string, string> = {
    ...input.previousMemory.platformHighlights,
  };
  for (const item of result.data.metrics) {
    platformHighlights[item.platform] = item.winningPatternSummary;
  }

  const combinedPatterns = Array.from(
    new Set([
      ...result.data.topWinningPatterns,
      ...input.previousMemory.winningPatterns,
    ])
  ).slice(0, 8);

  const nextMemory: PerformanceMemory = {
    updatedAt: Date.now(),
    winningPatterns: combinedPatterns,
    platformHighlights,
    lastCampaignId: input.campaignId,
  };

  return {
    report: result.data,
    nextMemory,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}
