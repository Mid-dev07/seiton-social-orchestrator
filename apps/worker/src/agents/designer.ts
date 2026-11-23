import {
  CampaignPlan,
  CopyBundle,
  VisualSpecBundle,
  VisualSpecBundleSchema,
  getSkillSystemPrompt,
} from "@seiton/shared";
import { MODEL_ROUTING, ModelProvider } from "../models/provider";

export interface DesignerInput {
  campaignId: string;
  plan: CampaignPlan;
  copyBundle: CopyBundle;
  attempt: number;
}

export async function runDesignerAgent(
  provider: ModelProvider,
  input: DesignerInput
): Promise<{
  visualBundle: VisualSpecBundle;
  modelUsed: string;
  tokensUsed: number;
}> {
  const result = await provider.generateStructured({
    role: "DESIGNER",
    schema: VisualSpecBundleSchema,
    systemPrompt: `${getSkillSystemPrompt("DESIGNER")} Image anchor model: ${MODEL_ROUTING.IMAGE}.`,
    userPrompt: `Create VisualSpecBundle for ${input.plan.assignments.length} assignments.`,
    contextData: {
      campaignId: input.campaignId,
      attempt: input.attempt,
      imageAnchorModel: MODEL_ROUTING.IMAGE,
      assignments: input.plan.assignments,
      copyItems: input.copyBundle.items,
    },
  });

  return {
    visualBundle: result.data,
    modelUsed: result.modelUsed,
    tokensUsed: result.tokensUsed,
  };
}
