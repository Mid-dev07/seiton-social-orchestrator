import {
  PerformanceMemory,
  Platform,
  ResearchBrief,
  ResearchBriefSchema,
  getSkillSystemPrompt,
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
    systemPrompt: getSkillSystemPrompt("RESEARCH"),
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
