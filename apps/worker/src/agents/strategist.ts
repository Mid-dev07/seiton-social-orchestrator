import {
  AccountRow,
  CampaignPlan,
  CampaignPlanSchema,
  Platform,
  ResearchBrief,
} from "@seiton/shared";
import { ModelProvider } from "../models/provider";

export interface StrategistInput {
  campaignId: string;
  commandPrompt: string;
  researchBrief: ResearchBrief;
  accounts: AccountRow[];
  attempt: number;
}

export async function runStrategistAgent(
  provider: ModelProvider,
  input: StrategistInput
): Promise<{ plan: CampaignPlan; modelUsed: string; tokensUsed: number }> {
  const result = await provider.generateStructured({
    role: "STRATEGY",
    schema: CampaignPlanSchema,
    systemPrompt:
      "You are the Social Media Strategist Agent. Assign each account a distinct content angle, staggered schedule ISO timestamp, media format (IMAGE or VIDEO), and unique variationSeed so zero accounts share duplicate messaging.",
    userPrompt: `Build a cross-account CampaignPlan for ${input.accounts.length} accounts based on research trends.`,
    contextData: {
      campaignId: input.campaignId,
      commandPrompt: input.commandPrompt,
      attempt: input.attempt,
      researchBrief: input.researchBrief,
      accounts: input.accounts.map((acc) => ({
        id: acc.id,
        platform: acc.platform as Platform,
        handle: acc.handle,
        groupTag: acc.groupTag,
        timezone: acc.timezone,
      })),
    },
  });

  return {
    plan: result.data,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}
