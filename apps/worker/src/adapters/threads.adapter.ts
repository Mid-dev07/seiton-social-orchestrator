import { BasePlatformAdapter } from "./base-adapter";
import { THREADS_SELECTORS } from "./selectors/threads.selectors";

export class ThreadsAdapter extends BasePlatformAdapter {
  readonly platform = "threads" as const;
  readonly selectors = THREADS_SELECTORS;
  protected readonly brandColor = "#6366f1";
}
