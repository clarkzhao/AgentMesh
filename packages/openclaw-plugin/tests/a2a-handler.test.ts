import { describe, it, expect, vi } from "vitest";
import { createA2aHandler } from "../src/a2a-handler.js";
import {
  createMockApiWithReply,
  createMockRequest,
  createMockResponse,
  validA2aRequest,
  validLegacyA2aRequest,
  defaultPluginConfig,
} from "./helpers.js";
import type { PluginConfig } from "../src/types.js";

function setup(configOverrides: Partial<PluginConfig> = {}, replyText = "Hello back!") {
  const config = defaultPluginConfig(configOverrides);
  const api = createMockApiWithReply(replyText);
  const handler = createA2aHandler({ api, config });
  return { handler, config };
}

describe("a2a-handler", () => {
  describe("JSON-RPC parsing", () => {
    it("handles valid message/send request", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe("req-1");
      expect(body.result.id).toBe("task-1");
      expect(body.result.status.state).toBe("completed");
      expect(body.result.artifacts).toHaveLength(1);
      expect(body.result.artifacts[0].parts[0].text).toBe("Hello back!");
    });

    it("handles valid tasks/send request (legacy)", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validLegacyA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.result.status.state).toBe("completed");
      expect(body.result.artifacts[0].parts[0].text).toBe("Hello back!");
    });

    it("rejects malformed JSON", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", "not json{{{");
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe(-32700);
    });

    it("rejects missing jsonrpc field", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", { id: "1", method: "message/send" });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe(-32600);
    });

    it("rejects missing params.message", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {},
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe(-32602);
    });

    it("returns -32601 for unknown method", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "tasks/unknown",
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toBe("Method not found");
    });

    it("returns -32602 for tasks/cancel without id", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "tasks/cancel",
        params: {},
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.error.code).toBe(-32602);
    });

    it("rejects non-POST requests", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("GET", "");
      req.method = "GET";
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
    });

    it("warns about unknown part types and skips them", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [
              { kind: "text", text: "Hello" },
              { kind: "unknown-future-type" },
            ],
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping unknown part type: unknown-future-type"),
      );
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.result.status.state).toBe("completed");
      warnSpy.mockRestore();
    });

    it("accepts file-only messages", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [{ kind: "file", file: { uri: "https://example.com/doc.pdf", name: "doc.pdf" } }],
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.status.state).toBe("completed");
    });

    it("accepts data-only messages", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [{ kind: "data", data: { key: "value" } }],
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.status.state).toBe("completed");
    });

    it("rejects message with no parts at all", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [],
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain("no parts");
    });

    it("converts file parts to [File: name] in agent message", async () => {
      let capturedBody = "";
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: Record<string, unknown>) => {
        capturedBody = ctx.Body as string;
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [
              { kind: "text", text: "Check this file" },
              { kind: "file", file: { name: "report.pdf", uri: "https://example.com/report.pdf" } },
            ],
          },
        },
      });
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedBody).toBe("Check this file\n[File: report.pdf]");
    });

    it("converts data parts to [Data: json] in agent message", async () => {
      let capturedBody = "";
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: Record<string, unknown>) => {
        capturedBody = ctx.Body as string;
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [{ kind: "data", data: { count: 42 } }],
          },
        },
      });
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedBody).toBe('[Data: {"count":42}]');
    });

    it("preserves original parts in task history", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [
              { kind: "text", text: "See attached" },
              { kind: "file", file: { name: "doc.pdf" } },
            ],
          },
        },
      });
      const res = createMockResponse();
      await handler(req, res);

      const body = JSON.parse(res._body);
      const userHistory = body.result.history[0];
      expect(userHistory.parts).toHaveLength(2);
      expect(userHistory.parts[0].kind).toBe("text");
      expect(userHistory.parts[1].kind).toBe("file");
    });
  });

  describe("backward compat — legacy `type` discriminator", () => {
    it("accepts parts with `type` discriminator via tasks/send", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validLegacyA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.status.state).toBe("completed");
    });

    it("accepts parts with `type` discriminator via message/send", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "req-1",
        method: "message/send",
        params: {
          id: "task-1",
          message: {
            role: "user",
            parts: [{ type: "text", text: "Hello via legacy type" }],
          },
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.status.state).toBe("completed");
    });

    it("resolves sessionId from legacy params", async () => {
      let capturedCtx: { SessionKey: string } | null = null;
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
        capturedCtx = ctx as { SessionKey: string };
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
        session: {
          strategy: "per-conversation",
          prefix: "a2a",
          agentId: "main",
          timeoutMs: 5000,
        },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "req-1",
        method: "tasks/send",
        params: {
          id: "task-1",
          sessionId: "legacy-session-42",
          message: {
            role: "user",
            parts: [{ type: "text", text: "Hi" }],
          },
        },
      });
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedCtx?.SessionKey).toBe("a2a:main:legacy-session-42");
    });

    it("emits output with kind discriminator only (legacy type stripped)", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      const agentPart = body.result.artifacts[0].parts[0];
      expect(agentPart.kind).toBe("text");
      expect(agentPart.type).toBeUndefined();
    });
  });

  describe("auth", () => {
    it("passes with valid token", async () => {
      const { handler } = setup({ auth: { token: "secret", allowUnauthenticated: false } });
      const req = createMockRequest("POST", validA2aRequest(), {
        authorization: "Bearer secret",
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.result).toBeDefined();
    });

    it("rejects missing token with 401", async () => {
      const { handler } = setup({ auth: { token: "secret", allowUnauthenticated: false } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
    });

    it("rejects wrong token with 401", async () => {
      const { handler } = setup({ auth: { token: "secret", allowUnauthenticated: false } });
      const req = createMockRequest("POST", validA2aRequest(), {
        authorization: "Bearer wrong-token",
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
    });

    it("bypasses auth when allowUnauthenticated is true", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
    });
  });

  describe("session key generation", () => {
    it("generates per-task session key", async () => {
      let capturedCtx: { SessionKey: string } | null = null;
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
        capturedCtx = ctx as { SessionKey: string };
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
        session: { strategy: "per-task", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedCtx?.SessionKey).toBe("a2a:main:task-1");
    });

    it("generates per-conversation session key with context_id", async () => {
      let capturedCtx: { SessionKey: string } | null = null;
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
        capturedCtx = ctx as { SessionKey: string };
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
        session: {
          strategy: "per-conversation",
          prefix: "a2a",
          agentId: "main",
          timeoutMs: 5000,
        },
      });
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
            context_id: "conv-42",
          },
        },
      });
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedCtx?.SessionKey).toBe("a2a:main:conv-42");
    });

    it("generates per-conversation key with legacy sessionId", async () => {
      let capturedCtx: { SessionKey: string } | null = null;
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
        capturedCtx = ctx as { SessionKey: string };
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
        session: {
          strategy: "per-conversation",
          prefix: "a2a",
          agentId: "main",
          timeoutMs: 5000,
        },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", {
        ...validA2aRequest(),
        params: {
          ...validA2aRequest().params,
          sessionId: "conv-42",
        },
      });
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedCtx?.SessionKey).toBe("a2a:main:conv-42");
    });

    it("generates per-conversation key falling back to taskId when no context", async () => {
      let capturedCtx: { SessionKey: string } | null = null;
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
        capturedCtx = ctx as { SessionKey: string };
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
        session: {
          strategy: "per-conversation",
          prefix: "a2a",
          agentId: "main",
          timeoutMs: 5000,
        },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedCtx?.SessionKey).toBe("a2a:main:task-1");
    });

    it("generates shared session key", async () => {
      let capturedCtx: { SessionKey: string } | null = null;
      const api = createMockApiWithReply("ok");
      api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
        capturedCtx = ctx as { SessionKey: string };
        return ctx;
      };
      const config = defaultPluginConfig({
        auth: { token: null, allowUnauthenticated: true },
        session: { strategy: "shared", prefix: "a2a", agentId: "main", timeoutMs: 5000 },
      });
      const handler = createA2aHandler({ api, config });

      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();
      await handler(req, res);

      expect(capturedCtx?.SessionKey).toBe("a2a:main:shared");
    });
  });

  describe("A2A error response format", () => {
    it("returns proper JSON-RPC error structure", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", {
        jsonrpc: "2.0",
        id: "1",
        method: "tasks/unknown",
      });
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe("1");
      expect(body.error).toBeDefined();
      expect(typeof body.error.code).toBe("number");
      expect(typeof body.error.message).toBe("string");
    });
  });

  describe("A2A response structure", () => {
    it("includes history with user and agent messages", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      const result = body.result;
      expect(result.history).toHaveLength(2);
      expect(result.history[0].role).toBe("user");
      expect(result.history[1].role).toBe("agent");
      expect(result.history[1].parts[0].kind).toBe("text");
    });

    it("includes artifacts with text parts", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.artifacts).toHaveLength(1);
      expect(body.result.artifacts[0].name).toBe("response");
      expect(body.result.artifacts[0].parts[0].kind).toBe("text");
    });

    it("includes kind:'task' and context_id in response", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.kind).toBe("task");
    });

    it("includes message_id and kind:'message' in history", async () => {
      const { handler } = setup({ auth: { token: null, allowUnauthenticated: true } });
      const req = createMockRequest("POST", validA2aRequest());
      const res = createMockResponse();

      await handler(req, res);

      const body = JSON.parse(res._body);
      expect(body.result.history[0].kind).toBe("message");
      expect(body.result.history[0].message_id).toBeDefined();
      expect(body.result.history[1].kind).toBe("message");
      expect(body.result.history[1].message_id).toBeDefined();
    });
  });
});
