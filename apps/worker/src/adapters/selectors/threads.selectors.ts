// Verified against Threads Web Composer DOM patterns: 2026-11-23
export const THREADS_SELECTORS = {
  platform: "threads" as const,
  displayName: "Threads Web Composer",
  composerUrl: "https://www.threads.net/",
  composerInput: '[data-testid="threads-composer-input"], div[role="textbox"][aria-label*="thread"]',
  fileInput: 'input[type="file"][data-testid="threads-media-input"], input[type="file"][accept*="image"]',
  publishButton: 'button[data-testid="threads-publish-btn"], div[role="button"]:has-text("Post")',
  charCounter: '[data-testid="threads-char-counter"]',
  mediaPreview: '[data-testid="threads-media-preview"]',
  loginIndicators: ['a[href*="/login"]', 'button:has-text("Log in with Instagram")'],
  challengeIndicators: ['[data-testid="challenge"]', "#captcha-box", 'form[action*="challenge"]'],
};
