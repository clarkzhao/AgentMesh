import { describe, it, expect } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import {
  createMockApiWithReply,
  createMockRequest,
  createMockResponse,
  defaultPluginConfig,
} from "./helpers.js";
import type { PluginConfig } from "../src/types.js";

function setupMultiAgent() {
  const config = defaultPluginConfig({
    auth: { token: null, allowUnauthenticated: true },
    agents: {
      main: {
        agentId: "main",
        skills: [{ id: "chat", name: "Chat", description: "General conversation" }],
      },
      support: {
        agentId: "support-bot",
        skills: [{ id: "support", name: "Support", description: "Customer support" }],
      },
    },
  });
  let capturedTo = "";
  const api = createMockApiWithReply("ok");
  api.runtime.channel.reply.finalizeInboundContext = (ctx: Record<string, unknown>) => {
    capturedTo = ctx.To as string;
    return ctx;
  };
  const handler = createA2aHandler({ api, config });
  return { handler, getCapturedTo: () => capturedTo };
}

describe("multi-agent routing", () => {
  it("routes to matching agent based on skill_id in message metadata", async () => {
    const { handler, getCapturedTo } = setupMultiAgent();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        id: "task-1",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Help me" }],
          metadata: { skill_id: "support" },
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(getCapturedTo()).toBe("agent:support-bot");
  });

  it("falls back to default agent for unknown skill_id", async () => {
    const { handler, getCapturedTo } = setupMultiAgent();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        id: "task-1",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Hello" }],
          metadata: { skill_id: "nonexistent" },
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(getCapturedTo()).toBe("agent:main");
  });

  it("falls back to default agent when no skill_id is provided", async () => {
    const { handler, getCapturedTo } = setupMultiAgent();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        id: "task-1",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Hello" }],
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(getCapturedTo()).toBe("agent:main");
  });

  it("uses session key with resolved agentId", async () => {
    let capturedSessionKey = "";
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
      session: { strategy: "per-task", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
      agents: {
        main: {
          agentId: "main",
          skills: [{ id: "chat", name: "Chat", description: "General conversation" }],
        },
        support: {
          agentId: "support-bot",
          skills: [{ id: "support", name: "Support", description: "Customer support" }],
        },
      },
    });
    const api = createMockApiWithReply("ok");
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
        id: "task-1",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Help" }],
          metadata: { skill_id: "support" },
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(capturedSessionKey).toBe("a2a:support-bot:task-1");
  });

  it("works with single-agent backward compat config", async () => {
    let capturedTo = "";
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
    });
    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply.finalizeInboundContext = (ctx: Record<string, unknown>) => {
      capturedTo = ctx.To as string;
      return ctx;
    };
    const handler = createA2aHandler({ api, config });

    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        id: "task-1",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Hello" }],
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(capturedTo).toBe("agent:main");
  });

  it("routes streaming to correct agent", async () => {
    const { handler, getCapturedTo } = setupMultiAgent();
    const req = createMockRequest("POST", {
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/stream",
      params: {
        id: "task-1",
        message: {
          role: "user",
          parts: [{ kind: "text", text: "Help me stream" }],
          metadata: { skill_id: "support" },
        },
      },
    });
    const res = createMockResponse();
    await handler(req, res);

    expect(getCapturedTo()).toBe("agent:support-bot");
  });
});
