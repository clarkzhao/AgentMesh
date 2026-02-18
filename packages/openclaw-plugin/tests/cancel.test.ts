import { describe, it, expect } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import {
  createMockApi,
  createMockApiWithReply,
  createMockRequest,
  createMockResponse,
  validA2aRequest,
  defaultPluginConfig,
} from "./helpers.js";
import type { PluginConfig } from "../src/types.js";

type DeliverFn = (payload: { text?: string }, info: { kind: string }) => Promise<void>;

function setup(configOverrides: Partial<PluginConfig> = {}) {
  const config = defaultPluginConfig({
    auth: { token: null, allowUnauthenticated: true },
    ...configOverrides,
  });
  const api = createMockApiWithReply("Response");
  const handler = createA2aHandler({ api, config });
  return { handler };
}

describe("tasks/cancel", () => {
  it("returns -32001 for unknown task", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/cancel",
      params: { id: "nonexistent" },
    });
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toBe("Task not found");
  });

  it("returns -32602 for missing params.id", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/cancel",
      params: {},
    });
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error.code).toBe(-32602);
  });

  it("returns completed task as-is when canceling completed task", async () => {
    const { handler } = setup();

    // Send a task first
    const sendReq = createMockRequest("POST", validA2aRequest());
    const sendRes = createMockResponse();
    await handler(sendReq, sendRes);
    expect(JSON.parse(sendRes._body).result.status.state).toBe("completed");

    // Cancel it
    const cancelReq = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-cancel",
      method: "tasks/cancel",
      params: { id: "task-1" },
    });
    const cancelRes = createMockResponse();
    await handler(cancelReq, cancelRes);

    const body = JSON.parse(cancelRes._body);
    expect(body.result.status.state).toBe("completed");
  });

  it("cancels an in-flight task", async () => {
    // Create a handler with a slow dispatch
    let capturedDeliver: DeliverFn | null = null;
    let resolveDispatch: (() => void) | null = null;

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
    api.runtime.channel.reply.dispatchReplyFromConfig = () => {
      return new Promise<void>((resolve) => {
        resolveDispatch = resolve;
      });
    };

    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
      session: { strategy: "per-task", prefix: "a2a", agentId: "main", timeoutMs: 30000 },
    });
    const handler = createA2aHandler({ api, config });

    // Start a task (don't await — it will hang waiting for dispatch)
    const sendReq = createMockRequest("POST", validA2aRequest());
    const sendRes = createMockResponse();
    const sendPromise = handler(sendReq, sendRes);

    // Wait a tick for the handler to start dispatch
    await new Promise((r) => setTimeout(r, 10));

    // Cancel it
    const cancelReq = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-cancel",
      method: "tasks/cancel",
      params: { id: "task-1" },
    });
    const cancelRes = createMockResponse();
    await handler(cancelReq, cancelRes);

    const body = JSON.parse(cancelRes._body);
    expect(body.result.status.state).toBe("canceled");

    // Let the dispatch resolve to clean up
    resolveDispatch?.();
    await sendPromise;
  });
});
