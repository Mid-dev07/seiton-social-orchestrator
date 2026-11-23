// Verified against TikTok Web Studio DOM patterns: 2026-11-23
export const TIKTOK_SELECTORS = {
  platform: "tiktok" as const,
  displayName: "TikTok Creator Studio",
  composerUrl: "https://www.tiktok.com/creator-center/upload",
  composerInput: '[data-testid="tiktok-caption-editor"], div[contenteditable="true"].public-DraftEditor-content',
  fileInput: 'input[type="file"][data-testid="tiktok-media-input"], input[type="file"][accept*="video"]',
  publishButton: 'button[data-testid="tiktok-publish-btn"], button[data-e2e="post_video_button"]',
  charCounter: '[data-testid="tiktok-char-counter"]',
  mediaPreview: '[data-testid="tiktok-media-preview"]',
  loginIndicators: ['[data-e2e="login-button"]', 'a[href*="/login"]'],
  challengeIndicators: ['[data-testid="challenge"]', "#captcha-box", ".captcha_verify_container"],
};
