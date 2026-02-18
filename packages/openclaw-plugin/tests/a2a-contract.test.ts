import { describe, it, expect } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import {
  createMockApiWithReply,
  createMockRequest,
  createMockResponse,
  validA2aRequest,
  validLegacyA2aRequest,
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

  it("message/send response has required fields", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe("req-1");

    const result = body.result;
    expect(result.id).toBe("task-1");
    expect(result.kind).toBe("task");
    expect(result.status).toBeDefined();
    expect(result.status.state).toBe("completed");
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts[0].parts[0].kind).toBe("text");
    expect(typeof result.artifacts[0].parts[0].text).toBe("string");
  });

  it("message/send response includes history with message_id and kind", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    const history = body.result.history;
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[0].kind).toBe("message");
    expect(history[0].message_id).toBeDefined();
    expect(history[1].role).toBe("agent");
    expect(history[1].kind).toBe("message");
    expect(history[1].message_id).toBeDefined();
  });

  it("tasks/send (legacy) still works", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", validLegacyA2aRequest());
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.result.status.state).toBe("completed");
    expect(body.result.artifacts[0].parts[0].text).toBe("Contract test response");
  });

  it("tasks/get returns task state after message/send", async () => {
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

  it("tasks/cancel returns -32601 (not yet implemented)", async () => {
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
      method: "message/send",
      params: {}, // Invalid — missing message
    });
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.error).toBeDefined();
    expect(typeof body.error.code).toBe("number");
    expect(Number.isInteger(body.error.code)).toBe(true);
    expect(typeof body.error.message).toBe("string");
  });

  it("per-conversation session with context_id on message", async () => {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
      session: { strategy: "per-conversation", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
    });
    const api = createMockApiWithReply("ok");
    let capturedSessionKey = "";
    api.runtime.channel.reply.finalizeInboundContext = (ctx: Record<string, unknown>) => {
      capturedSessionKey = ctx.SessionKey as string;
      return ctx;
    };
    const handler = createA2aHandler({ api, config });

    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        id: "task-abc",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Hi" }],
          context_id: "fixed-session-42",
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(capturedSessionKey).toBe("a2a:main:fixed-session-42");
  });

  it("per-conversation session with legacy sessionId", async () => {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
      session: { strategy: "per-conversation", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
    });
    const api = createMockApiWithReply("ok");
    let capturedSessionKey = "";
    api.runtime.channel.reply.finalizeInboundContext = (ctx: Record<string, unknown>) => {
      capturedSessionKey = ctx.SessionKey as string;
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

  it("response includes dual-format output for backward compat", async () => {
    const { handler } = setup();
    const req = createMockRequest("POST", validA2aRequest());
    const res = createMockResponse();

    await handler(req, res);

    const body = JSON.parse(res._body);
    const result = body.result;

    // Dual-format: both kind and type on parts
    expect(result.artifacts[0].parts[0].kind).toBe("text");
    expect(result.artifacts[0].parts[0].type).toBe("text");

    // Dual-format: sessionId present alongside context_id
    // (sessionId mirrors context_id for legacy clients)
    expect(result.sessionId).toBeDefined();
  });

  it("response includes protocol_version via AgentCard", async () => {
    // This is a card-level test, but let's verify the agent-card builder
    const { buildAgentCard } = await import("../src/agent-card.js");
    const config = defaultPluginConfig();
    const card = buildAgentCard(config);
    expect(card.protocol_version).toBe("0.3.0");
    expect(card.version).toBe("0.2.0");
  });
});
