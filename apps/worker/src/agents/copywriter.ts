import {
  CampaignPlan,
  CopyBundle,
  CopyBundleSchema,
  ResearchBrief,
  getSkillSystemPrompt,
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
    systemPrompt: getSkillSystemPrompt("COPY"),
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
