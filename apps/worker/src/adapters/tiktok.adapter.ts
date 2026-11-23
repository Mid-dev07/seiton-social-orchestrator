import { BasePlatformAdapter } from "./base-adapter";
import { TIKTOK_SELECTORS } from "./selectors/tiktok.selectors";

export class TikTokAdapter extends BasePlatformAdapter {
  readonly platform = "tiktok" as const;
  readonly selectors = TIKTOK_SELECTORS;
  protected readonly brandColor = "#fe2c55";
}
