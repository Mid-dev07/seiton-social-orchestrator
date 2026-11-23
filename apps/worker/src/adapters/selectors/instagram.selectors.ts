// Verified against Instagram Web Create Modal DOM patterns: 2026-11-23
export const INSTAGRAM_SELECTORS = {
  platform: "instagram" as const,
  displayName: "Instagram Web Publisher",
  composerUrl: "https://www.instagram.com/",
  composerInput: 'textarea[aria-label="Write a caption..."], [data-testid="ig-caption-input"]',
  fileInput: 'input[type="file"][data-testid="ig-media-input"], form input[type="file"]',
  publishButton: 'button[data-testid="ig-share-btn"], div[role="button"]:has-text("Share")',
  charCounter: '[data-testid="ig-char-counter"]',
  mediaPreview: '[data-testid="ig-media-preview"]',
  loginIndicators: ['input[name="username"]', 'button[type="submit"]:has-text("Log in")'],
  challengeIndicators: ['[data-testid="challenge"]', "#captcha-box", 'form[action*="challenge"]'],
};
