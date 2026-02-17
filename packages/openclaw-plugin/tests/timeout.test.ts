import { describe, it, expect } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import { createMockApi, createMockRequest, createMockResponse, validA2aRequest, defaultPluginConfig } from "./helpers.js";
import type { PluginConfig } from "../src/types.js";

type DeliverFn = (payload: { text?: string }, info: { kind: string }) => Promise<void>;

function setupWithDelay(delayMs: number, configOverrides: Partial<PluginConfig> = {}) {
  let capturedDeliver: DeliverFn | null = null;

  const api = createMockApi();
  api.runtime.channel.reply.createReplyDispatcherWithTyping = (opts: { deliver: DeliverFn }) => {
    capturedDeliver = opts.deliver;
    return {
      dispatcher: {
        markComplete: () => {},
        waitForIdle: () => Promise.resolve(),
      },
      replyOptions: {},
      markDispatchIdle: () => {},
    };
  };
  api.runtime.channel.reply.dispatchReplyFromConfig = async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await capturedDeliver?.({ text: "late response" }, { kind: "final" });
  };

  const config = defaultPluginConfig({
    auth: { token: null, allowUnauthenticated: true },
    ...configOverrides,
  });
  const handler = createA2aHandler({ api, config });
  return { handler };
}

describe("timeout", () => {
  it("returns error on per-task timeout", async () => {
    const { handler } = setupWithDelay(200, {
      session: { strategy: "per-task", prefix: "a2a", agentId: "main", timeoutMs: 50 },
    });

    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();
    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toContain("timed out");
  });

  it("completes successfully when within timeout", async () => {
    const { handler } = setupWithDelay(10, {
      session: { strategy: "per-task", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
    });

    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();
    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.result).toBeDefined();
    expect(body.result.status.state).toBe("completed");
  });
});
