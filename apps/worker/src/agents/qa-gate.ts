import {
  AntiDuplicateBatchResult,
  AntiDuplicateCandidate,
  QAEvaluation,
  QAEvaluationSchema,
  evaluateCampaignAntiDuplicate,
  getSkillSystemPrompt,
} from "@seiton/shared";
import { ModelProvider } from "../models/provider";

export interface QaGateInput {
  campaignId: string;
  candidates: AntiDuplicateCandidate[];
  bannedAngles: string[];
  attempt: number;
}

export interface QaGateOutput {
  deterministic: AntiDuplicateBatchResult;
  evaluation: QAEvaluation;
  modelUsed: string;
  tokensUsed: number;
}

export async function runQaGateAgent(
  provider: ModelProvider,
  input: QaGateInput
): Promise<QaGateOutput> {
  const deterministic = evaluateCampaignAntiDuplicate(
    input.candidates,
    input.bannedAngles
  );
  const flaggedAccountIds = deterministic.results
    .filter((r) => !r.passed)
    .map((r) => r.accountId);

  const guardResult = await provider.generateStructured({
    role: "QA",
    schema: QAEvaluationSchema,
    systemPrompt: getSkillSystemPrompt("QA"),
    userPrompt: `Evaluate QA batch for campaign ${input.campaignId} (attempt ${input.attempt}).`,
    contextData: {
      campaignId: input.campaignId,
      attempt: input.attempt,
      deterministicPassed: deterministic.allPassed,
      flaggedAccountIds,
      results: deterministic.results,
    },
  });

  const finalPassed = deterministic.allPassed && guardResult.data.overallPassed;

  return {
    deterministic,
    evaluation: {
      ...guardResult.data,
      overallPassed: finalPassed,
      flaggedAccountIds:
        flaggedAccountIds.length > 0
          ? flaggedAccountIds
          : guardResult.data.flaggedAccountIds,
    },
    modelUsed: guardResult.modelUsed,
    tokensUsed: guardResult.tokensUsed,
  };
}
