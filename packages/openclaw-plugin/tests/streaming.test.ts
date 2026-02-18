import { describe, it, expect, vi } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import {
  createMockApiWithReply,
  createMockApiWithStreamingReply,
  createMockRequest,
  createMockResponse,
  validA2aRequest,
  validLegacyA2aRequest,
  defaultPluginConfig,
} from "./helpers.js";
import type { PluginConfig } from "../src/types.js";

function setup(configOverrides: Partial<PluginConfig> = {}, replyText = "Streamed response") {
  const config = defaultPluginConfig({
    auth: { token: null, allowUnauthenticated: true },
    ...configOverrides,
  });
  const api = createMockApiWithReply(replyText);
  const handler = createA2aHandler({ api, config });
  return { handler, config };
}

function setupStreaming(
  chunks: Array<{ text: string; kind: string }>,
  configOverrides: Partial<PluginConfig> = {},
) {
  const config = defaultPluginConfig({
    auth: { token: null, allowUnauthenticated: true },
    ...configOverrides,
  });
  const api = createMockApiWithStreamingReply(chunks);
  const handler = createA2aHandler({ api, config });
  return { handler, config };
}

function parseChunks(res: ReturnType<typeof createMockResponse>): unknown[] {
  return res._chunks
    .map((c) => c.replace(/^data: /, "").replace(/\n\n$/, ""))
    .filter((c) => c.length > 0)
    .map((c) => JSON.parse(c));
}

describe("streaming (message/stream)", () => {
  it("sets SSE content-type headers", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._headers["Content-Type"]).toBe("text/event-stream");
    expect(res._headers["Cache-Control"]).toBe("no-cache");
    expect(res._headers["Connection"]).toBe("keep-alive");
    expect(res._ended).toBe(true);
  });

  it("sends initial working event", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const res = createMockResponse();

    await handler(req, res);

    const events = parseChunks(res);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const first = events[0] as Record<string, unknown>;
    expect(first.kind).toBe("status-update");
    expect((first.status as Record<string, unknown>).state).toBe("working");
    expect(first.final).toBe(false);
  });

  it("sends completed status-update and artifact-update for final event", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const res = createMockResponse();

    await handler(req, res);

    const events = parseChunks(res);

    // Find the completed status-update
    const completedEvent = events.find(
      (e) => (e as Record<string, unknown>).kind === "status-update" &&
        ((e as Record<string, unknown>).status as Record<string, unknown>).state === "completed",
    ) as Record<string, unknown> | undefined;
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.final).toBe(true);

    // Find the artifact-update
    const artifactEvent = events.find(
      (e) => (e as Record<string, unknown>).kind === "artifact-update",
    ) as Record<string, unknown> | undefined;
    expect(artifactEvent).toBeDefined();
    expect(artifactEvent!.last_chunk).toBe(true);
    const artifact = artifactEvent!.artifact as Record<string, unknown>;
    expect((artifact.parts as Array<Record<string, unknown>>)[0].text).toBe("Streamed response");
  });

  it("sends intermediate chunks for streaming delivery", async () => {
    const { handler } = setupStreaming([
      { text: "Hello ", kind: "partial" },
      { text: "Hello world", kind: "final" },
    ]);
    const req = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const res = createMockResponse();

    await handler(req, res);

    const events = parseChunks(res);

    // Should have: initial working, intermediate chunk, completed, artifact
    expect(events.length).toBeGreaterThanOrEqual(4);

    // Find intermediate working chunk
    const intermediateEvents = events.filter(
      (e) => (e as Record<string, unknown>).kind === "status-update" &&
        ((e as Record<string, unknown>).status as Record<string, unknown>).state === "working" &&
        (e as Record<string, unknown>).final === false &&
        ((e as Record<string, unknown>).status as Record<string, unknown>).message !== undefined,
    );
    expect(intermediateEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("handles errors with failed status-update", async () => {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
    });
    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply.dispatchReplyFromConfig = async () => {
      throw new Error("Agent exploded");
    };
    const handler = createA2aHandler({ api, config });

    const req = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const res = createMockResponse();

    await handler(req, res);

    const events = parseChunks(res);
    const failedEvent = events.find(
      (e) => (e as Record<string, unknown>).kind === "status-update" &&
        ((e as Record<string, unknown>).status as Record<string, unknown>).state === "failed",
    ) as Record<string, unknown> | undefined;
    expect(failedEvent).toBeDefined();
    expect(failedEvent!.final).toBe(true);
    expect(res._ended).toBe(true);
  });

  it("routes legacy tasks/sendSubscribe to streaming handler", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      ...validLegacyA2aRequest(),
      method: "tasks/sendSubscribe",
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._headers["Content-Type"]).toBe("text/event-stream");
    const events = parseChunks(res);
    expect(events.length).toBeGreaterThan(0);
  });

  it("updates task store throughout streaming lifecycle", async () => {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
    });
    const api = createMockApiWithReply("Final response");
    const handler = createA2aHandler({ api, config });

    // Stream a request
    const streamReq = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const streamRes = createMockResponse();
    await handler(streamReq, streamRes);

    // Now tasks/get should return completed task
    const getReq = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-2",
      method: "tasks/get",
      params: { id: "task-1" },
    });
    const getRes = createMockResponse();
    await handler(getReq, getRes);

    const body = JSON.parse(getRes._body);
    expect(body.result.status.state).toBe("completed");
  });

  it("includes task_id and context_id in events", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      ...validA2aRequest(),
      method: "message/stream",
    });
    const res = createMockResponse();

    await handler(req, res);

    const events = parseChunks(res);
    for (const event of events) {
      const e = event as Record<string, unknown>;
      expect(e.task_id).toBe("task-1");
      expect(e.context_id).toBeDefined();
    }
  });
});
