import { BasePlatformAdapter } from "./base-adapter";
import { FACEBOOK_SELECTORS } from "./selectors/facebook.selectors";

export class FacebookAdapter extends BasePlatformAdapter {
  readonly platform = "facebook" as const;
  readonly selectors = FACEBOOK_SELECTORS;
  protected readonly brandColor = "#1877f2";
}
