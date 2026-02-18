import { describe, it, expect } from "vitest";
import { dispatchToAgent } from "../src/dispatch.js";
import { createMockApiWithReply, defaultPluginConfig } from "./helpers.js";

interface CapturedCtx {
  Body: string;
  SessionKey: string;
  ChatType: string;
  CommandAuthorized: boolean;
  MessageSid: string;
  Provider: string;
  Surface: string;
  To: string;
}

describe("dispatch", () => {
  it("builds MsgContext correctly", async () => {
    let capturedCtx: CapturedCtx | null = null;

    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
      capturedCtx = ctx as CapturedCtx;
      return ctx;
    };

    await dispatchToAgent({
      api,
      config: defaultPluginConfig(),
      message: "Hello",
      sessionKey: "a2a:main:task-123",
      taskId: "task-123",
    });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.Body).toBe("Hello");
    expect(capturedCtx!.SessionKey).toBe("a2a:main:task-123");
    expect(capturedCtx!.ChatType).toBe("direct");
    expect(capturedCtx!.CommandAuthorized).toBe(false);
    expect(capturedCtx!.MessageSid).toBe("task-123");
    expect(capturedCtx!.Provider).toBe("a2a");
    expect(capturedCtx!.Surface).toBe("a2a");
  });

  it("uses explicit agentId when provided", async () => {
    let capturedCtx: CapturedCtx | null = null;

    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
      capturedCtx = ctx as CapturedCtx;
      return ctx;
    };

    await dispatchToAgent({
      api,
      config: defaultPluginConfig(),
      message: "Hello",
      sessionKey: "a2a:support:task-123",
      taskId: "task-123",
      agentId: "support",
    });

    expect(capturedCtx!.To).toBe("agent:support");
  });

  it("falls back to config agentId when none provided", async () => {
    let capturedCtx: CapturedCtx | null = null;

    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply.finalizeInboundContext = (ctx: unknown) => {
      capturedCtx = ctx as CapturedCtx;
      return ctx;
    };

    await dispatchToAgent({
      api,
      config: defaultPluginConfig(),
      message: "Hello",
      sessionKey: "a2a:main:task-123",
      taskId: "task-123",
    });

    expect(capturedCtx!.To).toBe("agent:main");
  });

  it("returns reply text", async () => {
    const api = createMockApiWithReply("Hello from agent!");
    const result = await dispatchToAgent({
      api,
      config: defaultPluginConfig(),
      message: "Hello",
      sessionKey: "a2a:main:task-1",
      taskId: "task-1",
    });

    expect(result).toBe("Hello from agent!");
  });

  it("throws on missing runtime API", async () => {
    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply = undefined as never;

    await expect(
      dispatchToAgent({
        api,
        config: defaultPluginConfig(),
        message: "Hello",
        sessionKey: "a2a:main:task-1",
        taskId: "task-1",
      }),
    ).rejects.toThrow("api.runtime.channel.reply is missing");
  });
});
