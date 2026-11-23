import { Platform } from "@seiton/shared";
import { PlatformAdapter } from "./base-adapter";
import { FacebookAdapter } from "./facebook.adapter";
import { InstagramAdapter } from "./instagram.adapter";
import { ThreadsAdapter } from "./threads.adapter";
import { TikTokAdapter } from "./tiktok.adapter";
import { XAdapter } from "./x.adapter";

const ADAPTER_REGISTRY: Record<Platform, PlatformAdapter> = {
  tiktok: new TikTokAdapter(),
  threads: new ThreadsAdapter(),
  x: new XAdapter(),
  instagram: new InstagramAdapter(),
  facebook: new FacebookAdapter(),
};

export function getPlatformAdapter(platform: Platform): PlatformAdapter {
  const adapter = ADAPTER_REGISTRY[platform];
  if (!adapter) {
    throw new Error(`Unsupported platform adapter requested: ${platform}`);
  }
  return adapter;
}

export * from "./base-adapter";
export * from "./facebook.adapter";
export * from "./instagram.adapter";
export * from "./threads.adapter";
export * from "./tiktok.adapter";
export * from "./x.adapter";
