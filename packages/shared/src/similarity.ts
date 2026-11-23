import { AspectRatio, PLATFORM_LIMITS, Platform } from "./schemas";

const HARD_BANNED_TERMS = [
  "judi online",
  "slot gacor",
  "aplikasi bajakan",
  "crack gratis",
  "carding",
  "akun curian",
  "penipuan cepat kaya",
];

/**
 * Normalizes text by lowercasing, removing URLs and punctuation, and collapsing whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter(Boolean);
}

function buildShingleSet(tokens: string[]): Set<string> {
  const shingles = new Set<string>(tokens);
  for (let i = 0; i <= tokens.length - 3; i += 1) {
    shingles.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return shingles;
}

/**
 * Computes Jaccard similarity (0..1) over normalized tokens and 3-word shingles.
 */
export function computeJaccardSimilarity(a: string, b: string): number {
  const setA = buildShingleSet(tokenize(a));
  const setB = buildShingleSet(tokenize(b));
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) {
    return 0;
  }
  return Number((intersection / union).toFixed(4));
}

/**
 * Computes Cosine similarity (0..1) over normalized term-frequency vectors.
 */
export function computeCosineSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 && tokensB.length === 0) {
    return 1;
  }
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const token of tokensA) {
    freqA.set(token, (freqA.get(token) ?? 0) + 1);
  }
  for (const token of tokensB) {
    freqB.set(token, (freqB.get(token) ?? 0) + 1);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [token, countA] of freqA.entries()) {
    magA += countA * countA;
    const countB = freqB.get(token) ?? 0;
    dot += countA * countB;
  }
  for (const countB of freqB.values()) {
    magB += countB * countB;
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return Number((dot / (Math.sqrt(magA) * Math.sqrt(magB))).toFixed(4));
}

/**
 * Returns the maximum of Jaccard and Cosine similarity (strictly conservative gate).
 */
export function computeCombinedSimilarity(a: string, b: string): number {
  return Math.max(computeJaccardSimilarity(a, b), computeCosineSimilarity(a, b));
}

export interface AntiDuplicateCandidate {
  accountId: string;
  platform: Platform;
  fullText: string;
  aspectRatio: AspectRatio;
  mediaSha256: string;
}

export interface AntiDuplicateItemResult {
  accountId: string;
  passed: boolean;
  similarityScore: number;
  notes: string[];
}

export interface AntiDuplicateBatchResult {
  allPassed: boolean;
  results: AntiDuplicateItemResult[];
}

export const SIMILARITY_THRESHOLD = 0.6;

/**
 * Validates character limits, aspect ratios, banned terms, pairwise text similarity (< 0.60),
 * and media SHA-256 uniqueness across all accounts in a campaign.
 */
export function evaluateCampaignAntiDuplicate(
  items: AntiDuplicateCandidate[],
  bannedAngles: string[] = []
): AntiDuplicateBatchResult {
  const normalizedBanned = [
    ...HARD_BANNED_TERMS,
    ...bannedAngles.map((term) => normalizeText(term)).filter((t) => t.length >= 4),
  ];

  const hashOwners = new Map<string, string[]>();
  for (const item of items) {
    if (item.mediaSha256) {
      const owners = hashOwners.get(item.mediaSha256) ?? [];
      owners.push(item.accountId);
      hashOwners.set(item.mediaSha256, owners);
    }
  }

  const results: AntiDuplicateItemResult[] = items.map((item, idx) => {
    const notes: string[] = [];
    const limits = PLATFORM_LIMITS[item.platform];
    const trimmed = item.fullText.trim();

    if (trimmed.length === 0) {
      notes.push("Caption kosong tidak diizinkan");
    }
    if (trimmed.length > limits.maxChars) {
      notes.push(
        `Melebihi batas karakter ${item.platform}: ${trimmed.length}/${limits.maxChars}`
      );
    }
    if (!limits.allowedAspectRatios.includes(item.aspectRatio)) {
      notes.push(
        `Rasio aspek ${item.aspectRatio} tidak didukung untuk ${item.platform}`
      );
    }

    const normalizedContent = normalizeText(trimmed);
    for (const banned of normalizedBanned) {
      if (banned && normalizedContent.includes(banned)) {
        notes.push(`Mengandung frasa terlarang: "${banned}"`);
      }
    }

    let maxSim = 0;
    for (let j = 0; j < items.length; j += 1) {
      if (idx === j) {
        continue;
      }
      const peer = items[j];
      if (!peer) {
        continue;
      }
      const score = computeCombinedSimilarity(trimmed, peer.fullText);
      if (score > maxSim) {
        maxSim = score;
      }
      if (score >= SIMILARITY_THRESHOLD) {
        notes.push(
          `Skor kemiripan ${score.toFixed(2)} >= ${SIMILARITY_THRESHOLD.toFixed(2)} dengan akun ${peer.accountId}`
        );
      }
    }

    if (!item.mediaSha256) {
      notes.push("Hash SHA-256 media tidak ditemukan");
    } else {
      const owners = hashOwners.get(item.mediaSha256) ?? [];
      if (owners.length > 1) {
        notes.push(
          `Hash SHA-256 media identik dengan akun lain (${owners.join(", ")})`
        );
      }
    }

    return {
      accountId: item.accountId,
      passed: notes.length === 0,
      similarityScore: Number(maxSim.toFixed(4)),
      notes,
    };
  });

  return {
    allPassed: results.every((r) => r.passed),
    results,
  };
}
