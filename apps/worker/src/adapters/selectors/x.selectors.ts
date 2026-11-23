// Verified against X (Twitter) Web Composer DOM patterns: 2026-11-23
export const X_SELECTORS = {
  platform: "x" as const,
  displayName: "X (Twitter) Post Composer",
  composerUrl: "https://x.com/compose/post",
  composerInput: '[data-testid="tweetTextarea_0"]',
  fileInput: 'input[type="file"][data-testid="fileInput"]',
  publishButton: 'button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]',
  charCounter: '[data-testid="x-char-counter"]',
  mediaPreview: '[data-testid="attachments"]',
  loginIndicators: ['a[data-testid="loginButton"]', 'input[autocomplete="username"]'],
  challengeIndicators: ['[data-testid="challenge"]', "#arkose", 'iframe[src*="arkoselabs"]'],
};
