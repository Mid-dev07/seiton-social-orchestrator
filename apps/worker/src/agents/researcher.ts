import {
  PerformanceMemory,
  Platform,
  ResearchBrief,
  ResearchBriefSchema,
} from "@seiton/shared";
import { ModelProvider } from "../models/provider";

export interface ResearcherInput {
  campaignId: string;
  commandPrompt: string;
  targetPlatforms: Platform[];
  performanceMemory: PerformanceMemory;
}

export async function runResearcherAgent(
  provider: ModelProvider,
  input: ResearcherInput
): Promise<{ brief: ResearchBrief; modelUsed: string; tokensUsed: number }> {
  const result = await provider.generateStructured({
    role: "RESEARCH",
    schema: ResearchBriefSchema,
    systemPrompt:
      "You are the Seiton.id Researcher Agent. Analyze platform trends, Indonesian UMKM digitalization pain points, and safe promotional angles for official premium software subscriptions.",
    userPrompt: `Analyze campaign brief: "${input.commandPrompt}" across platforms [${input.targetPlatforms.join(", ")}].`,
    contextData: {
      campaignId: input.campaignId,
      commandPrompt: input.commandPrompt,
      targetPlatforms: input.targetPlatforms,
      priorWinningPatterns: input.performanceMemory.winningPatterns,
    },
  });

  return {
    brief: result.data,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}
