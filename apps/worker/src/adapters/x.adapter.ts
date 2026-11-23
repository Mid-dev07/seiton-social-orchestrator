import { BasePlatformAdapter } from "./base-adapter";
import { X_SELECTORS } from "./selectors/x.selectors";

export class XAdapter extends BasePlatformAdapter {
  readonly platform = "x" as const;
  readonly selectors = X_SELECTORS;
  protected readonly brandColor = "#0ea5e9";
}
