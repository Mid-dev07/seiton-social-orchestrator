import { PipelineEventPayload, pipelineEvents } from "@seiton/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (eventName: string, data: unknown) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      send("connected", {
        type: "connected",
        message: "SSE Live Pipeline Stream aktif",
        timestamp: Date.now(),
      });

      const onPipeline = (payload: PipelineEventPayload) => {
        send("pipeline", payload);
      };

      pipelineEvents.on("pipeline", onPipeline);

      const keepalive = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        pipelineEvents.off("pipeline", onPipeline);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
