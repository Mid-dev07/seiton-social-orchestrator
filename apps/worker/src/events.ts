import { EventEmitter } from "node:events";

export interface PipelineEventPayload {
  type:
    | "campaign:update"
    | "agent_run:update"
    | "asset:update"
    | "publish_job:update"
    | "account:update"
    | "kill_switch:update"
    | "insight:update";
  campaignId?: string;
  accountId?: string;
  stage?: string;
  status?: string;
  message: string;
  timestamp: number;
}

const globalKey = "__seitonPipelineEvents" as const;

type GlobalWithEvents = typeof globalThis & {
  [globalKey]?: EventEmitter;
};

function getOrCreateEmitter(): EventEmitter {
  const g = globalThis as GlobalWithEvents;
  if (!g[globalKey]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    g[globalKey] = emitter;
  }
  return g[globalKey];
}

export const pipelineEvents = getOrCreateEmitter();

export function emitPipelineEvent(event: Omit<PipelineEventPayload, "timestamp">): void {
  const payload: PipelineEventPayload = {
    ...event,
    timestamp: Date.now(),
  };
  pipelineEvents.emit("pipeline", payload);
}
