export type SkillAgentRole =
  | "RESEARCH"
  | "STRATEGY"
  | "COPY"
  | "DESIGNER"
  | "QA"
  | "INSIGHT";

export interface AgentSkillStandard {
  id: string;
  name: string;
  sourceRepo: string;
  appliedRoles: string[];
  summary: string;
  rules: string[];
}

/**
 * Curated open-source Agent Skills embedded directly into Seiton-Social Media's
 * 6 specialist agents and UI design standards to eliminate AI slop.
 */
export const AGENT_SKILL_STANDARDS: AgentSkillStandard[] = [
  {
    id: "anti-slop-copywriting",
    name: "Anti-Slop Copywriting & Seven Sweeps",
    sourceRepo: "coreyhaines31/marketingskills (copywriting, copy-editing)",
    appliedRoles: ["COPY", "QA"],
    summary:
      "Menegakkan penulisan direct-response spesifik angka/manfaat tanpa frasa klise AI ('di era digital', 'bukan sekadar', 'revolusioner', 'game-changer').",
    rules: [
      "Hook 1 detik pertama wajib menyebut masalah operasional konkret UMKM atau penghematan biaya aplikasi.",
      "Dilarang memakai pembuka klise AI, kontras klise ('bukan sekadar X, melainkan Y'), atau hype kosong.",
      "Lewati 7 penyapuan (Clarity, Voice, So-What, Proof, Specificity, Emotion, Zero-Risk CTA).",
      "Patuhi batas karakter platform: X <= 280, Threads <= 500, IG/TikTok <= 2200.",
    ],
  },
  {
    id: "social-platform-strategy",
    name: "Platform-Native Social Strategy & Hook Matrix",
    sourceRepo: "blacktwist/social-media-skills & coreyhaines31/marketingskills (social)",
    appliedRoles: ["RESEARCH", "STRATEGY", "INSIGHT"],
    summary:
      "Menjaga distribusi pilar konten (30% edukasi, 25% studi kasus, 25% keamanan/garansi, 20% SOP) serta variasi sudut pandang unik lintas akun.",
    rules: [
      "Setiap akun dalam satu kampanye wajib mendapat contentAngle dan variationSeed berbeda.",
      "Jadwalkan staggered interval antar akun agar tidak memicu deteksi spam serentak.",
      "Sesuaikan format native: TikTok 9:16 video hook cepat, X opini padat, Instagram 4:5 kontras tinggi.",
    ],
  },
  {
    id: "banner-art-direction",
    name: "Banner & Social Creative Art Direction",
    sourceRepo: "nextlevelbuilder/ui-ux-pro-max-skill (banner-design, brand)",
    appliedRoles: ["DESIGNER"],
    summary:
      "Menjaga komposisi visual aman dari potongan UI platform (safe zone 70-80%), kontras >= 4.5:1, dan maksimal 20% area teks.",
    rules: [
      "Tempatkan headline, subheadline, dan identitas Seiton.id di area aman tengah 70-80%.",
      "Headline maksimal 6-8 kata, kontras teks minimal 4.5:1 terhadap latar belakang.",
      "Sertakan variationSeed & accentHex berbeda per akun agar hash SHA-256 media unik.",
    ],
  },
  {
    id: "ui-ux-pro-max",
    name: "UI/UX Pro Max Design Intelligence",
    sourceRepo: "nextlevelbuilder/ui-ux-pro-max-skill (ui-ux-pro-max)",
    appliedRoles: ["DASHBOARD_UI"],
    summary:
      "Standar antarmuka ramah mata dengan mode Gelap/Terang, kontras >= 4.5:1, ikon vektor Lucide seragam tanpa emoji struktural, dan target sentuh >= 44px.",
    rules: [
      "Nol emoji sebagai ikon navigasi atau tombol kontrol; gunakan SVG Lucide stroke 1.5px.",
      "Tinggi tombol interaktif minimal 44px (min-h-11) dengan focus ring jelas.",
      "Sembunyikan JSON teknis di balik progressive disclosure agar alur operator tetap bersih.",
    ],
  },
];

export const ANTI_SLOP_BANNED_PHRASES: string[] = [
  "di era digital yang serba cepat",
  "di tengah pesatnya perkembangan teknologi",
  "bukan sekadar",
  "lebih dari sekadar alat",
  "mari kita selami",
  "mari kita bahas lebih dalam",
  "revolusioner",
  "game changer",
  "game-changer",
  "unlock potensi",
  "unlock your potential",
  "seamless integration",
  "testament to",
  "in today s fast paced world",
  "in today s digital landscape",
  "it s not just",
  "the future is already here",
  "masa depan sudah tiba",
  "rahasia yang tidak pernah diceritakan",
];

/**
 * Checks copy text deterministically for banned AI-slop phrases and patterns.
 */
export function evaluateAntiSlopCompliance(text: string): {
  passed: boolean;
  hits: string[];
} {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hits: string[] = [];
  for (const phrase of ANTI_SLOP_BANNED_PHRASES) {
    if (normalized.includes(phrase)) {
      hits.push(phrase);
    }
  }
  return {
    passed: hits.length === 0,
    hits,
  };
}

/**
 * Returns the skill-grounded system prompt for each specialist agent role.
 */
export function getSkillSystemPrompt(role: SkillAgentRole): string {
  const baseContext =
    "Brand Context: Seiton.id (digitalisasi kasir/stok UMKM Indonesia & langganan aplikasi premium resmi bergaransi anti-suspend).";

  switch (role) {
    case "RESEARCH":
      return `${baseContext}
[Skill: social-platform-strategy]
Analyze current Indonesian UMKM digitalization bottlenecks, creator software cost pain points, and platform-native trends across TikTok, Threads, X, Instagram, and Facebook. Never propose generic hype or spam tactics.`;

    case "STRATEGY":
      return `${baseContext}
[Skill: social-platform-strategy]
Assign each target account a completely distinct contentAngle, staggered ISO schedule, platform-native format (VIDEO for TikTok, IMAGE for others), and unique variationSeed. Balance content pillars (30% operational education, 25% case study numbers, 25% official anti-suspend guarantee, 20% workflow SOP).`;

    case "COPY":
      return `${baseContext}
[Skill: anti-slop-copywriting (Seven Sweeps)]
Write sharp, natural Indonesian direct-response copy tailored per account.
STRICT BANS: Never use 'di era digital', 'bukan sekadar', 'revolusioner', 'game-changer', 'unlock potensi', 'mari kita selami', or corporate puffery.
Lead with concrete operational pain or cost savings in sentence 1. Respect hard character limits (X <= 280, Threads <= 500, IG/TikTok <= 2200) and keep pairwise text similarity < 0.60 across accounts.`;

    case "DESIGNER":
      return `${baseContext}
[Skill: banner-art-direction (ui-ux-pro-max)]
Design high-contrast VisualSpec cards obeying 70-80% center safe zones, < 20% text density, concise 4-7 word headlines, >= 4.5:1 contrast, and unique accentHex + variationSeed per account.`;

    case "QA":
      return `${baseContext}
[Skill: anti-slop-copywriting + QA Anti-Duplicate Gate]
Reject any asset containing AI-slop clichés, banned terms, platform limit violations, duplicate media SHA-256 hashes, or pairwise text similarity >= 0.60.`;

    case "INSIGHT":
      return `${baseContext}
[Skill: social-platform-strategy (Performance Loop)]
Synthesize engagement metrics into concrete winning angles and update PerformanceMemory for the next DAG cycle.`;
  }
}
