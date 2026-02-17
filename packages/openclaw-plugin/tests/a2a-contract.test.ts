import { describe, it, expect } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import {
  createMockApiWithReply,
  createMockRequest,
  createMockResponse,
  validA2aRequest,
  defaultPluginConfig,
} from "./helpers.js";

describe("a2a-contract", () => {
  function setup() {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
    });
    const api = createMockApiWithReply("Contract test response");
    const handler = createA2aHandler({ api, config });
    return { handler };
  }

  it("tasks/send response has required fields", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe("req-1");

    const result = body.result;
    expect(result.id).toBe("task-1");
    expect(result.status).toBeDefined();
    expect(result.status.state).toBe("completed");
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts[0].parts[0].type).toBe("text");
    expect(typeof result.artifacts[0].parts[0].text).toBe("string");
  });

  it("tasks/send response includes history with user and agent messages", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    const history = body.result.history;
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("agent");
  });

  it("tasks/get returns task state after tasks/send", async () => {
    const { handler } = setup();

    // First: send a task
    const sendReq = createMockRequest("POST", validA2aRequest());
    const sendRes = createMockResponse();
    await handler(sendReq, sendRes);

    // Then: get the task
    const getReq = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-2",
      method: "tasks/get",
      params: { id: "task-1" },
    });
    const getRes = createMockResponse();
    await handler(getReq, getRes);

    const body = JSON.parse(getRes._body);
    expect(body.result).toBeDefined();
    expect(body.result.id).toBe("task-1");
    expect(body.result.status.state).toBe("completed");
  });

  it("tasks/get returns -32001 for unknown task", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/get",
      params: { id: "nonexistent" },
    });
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toBe("Task not found");
  });

  it("tasks/cancel returns -32601 (honestly unsupported)", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/cancel",
    });
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error.code).toBe(-32601);
  });

  it("error responses have code (integer) and message (string)", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/send",
      params: {}, // Invalid — missing id and message
    });
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error).toBeDefined();
    expect(typeof body.error.code).toBe("number");
    expect(Number.isInteger(body.error.code)).toBe(true);
    expect(typeof body.error.message).toBe("string");
  });

  it("per-conversation session with fixed sessionId", async () => {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
      session: { strategy: "per-conversation", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
    });
    const api = createMockApiWithReply("ok");
    let capturedSessionKey = "";
    api.runtime.channel.reply.finalizeInboundContext = (ctx) => {
      capturedSessionKey = ctx.SessionKey;
      return ctx;
    };
    const handler = createA2aHandler({ api, config });

    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/send",
      params: {
        id: "task-abc",
        sessionId: "fixed-session-42",
        message: { role: "user", parts: [{ type: "text", text: "Hi" }] },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(capturedSessionKey).toBe("a2a:main:fixed-session-42");
  });
});
