import {
  CampaignPlan,
  CopyBundle,
  CopyBundleSchema,
  ResearchBrief,
} from "@seiton/shared";
import { ModelProvider } from "../models/provider";

export interface CopywriterInput {
  campaignId: string;
  commandPrompt: string;
  researchBrief: ResearchBrief;
  plan: CampaignPlan;
  attempt: number;
  qaFeedback?: string;
}

export async function runCopywriterAgent(
  provider: ModelProvider,
  input: CopywriterInput
): Promise<{ copyBundle: CopyBundle; modelUsed: string; tokensUsed: number }> {
  const result = await provider.generateStructured({
    role: "COPY",
    schema: CopyBundleSchema,
    systemPrompt:
      "You are the Copywriter Agent for Seiton.id. Write natural Indonesian copy per account respecting platform character limits (X <= 280, Threads <= 500, IG/TikTok <= 2200) and ensuring Jaccard/Cosine similarity across accounts remains strictly < 0.60.",
    userPrompt: input.qaFeedback
      ? `Rewrite copy bundle resolving QA feedback: ${input.qaFeedback}`
      : `Generate distinct CopyBundle items for ${input.plan.assignments.length} scheduled assignments.`,
    contextData: {
      campaignId: input.campaignId,
      commandPrompt: input.commandPrompt,
      attempt: input.attempt,
      qaFeedback: input.qaFeedback,
      bannedAngles: input.researchBrief.bannedAngles,
      assignments: input.plan.assignments,
    },
  });

  return {
    copyBundle: result.data,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}
