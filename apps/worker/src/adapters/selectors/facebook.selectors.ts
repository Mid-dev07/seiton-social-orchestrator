// Verified against Facebook Page Composer DOM patterns: 2026-11-23
export const FACEBOOK_SELECTORS = {
  platform: "facebook" as const,
  displayName: "Facebook Page Composer",
  composerUrl: "https://www.facebook.com/",
  composerInput: '[data-testid="fb-composer-input"], div[role="textbox"][aria-label*="mind"]',
  fileInput: 'input[type="file"][data-testid="fb-media-input"], input[type="file"][accept*="image"]',
  publishButton: 'button[data-testid="fb-publish-btn"], div[aria-label="Post"][role="button"]',
  charCounter: '[data-testid="fb-char-counter"]',
  mediaPreview: '[data-testid="fb-media-preview"]',
  loginIndicators: ['input[name="email"]', 'button[name="login"]'],
  challengeIndicators: ['[data-testid="challenge"]', "#checkpoint_title", 'form[action*="checkpoint"]'],
};
