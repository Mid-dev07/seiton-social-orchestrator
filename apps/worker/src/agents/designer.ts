import {
  CampaignPlan,
  CopyBundle,
  VisualSpecBundle,
  VisualSpecBundleSchema,
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
    systemPrompt: `You are the Designer & Animator Agent for Seiton.id (anchored with ${MODEL_ROUTING.IMAGE}). Produce VisualSpec JSON per account with platform-safe aspect ratios (9:16, 4:5, or 1:1), distinct hex accent colors, crisp headlines, and unique variationSeeds for deterministic local rendering.`,
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
