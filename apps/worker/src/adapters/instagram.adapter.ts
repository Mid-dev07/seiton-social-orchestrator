import { BasePlatformAdapter } from "./base-adapter";
import { INSTAGRAM_SELECTORS } from "./selectors/instagram.selectors";

export class InstagramAdapter extends BasePlatformAdapter {
  readonly platform = "instagram" as const;
  readonly selectors = INSTAGRAM_SELECTORS;
  protected readonly brandColor = "#e1306c";
}
