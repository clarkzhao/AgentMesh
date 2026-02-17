import { describe, it, expect } from "vitest";
import { dispatchToAgent } from "../src/dispatch.js";
import { createMockApiWithReply, defaultPluginConfig } from "./helpers.js";
import type { MsgContext } from "../src/types.js";

describe("dispatch", () => {
  it("builds MsgContext correctly", async () => {
    let capturedCtx: MsgContext | null = null;

    const api = createMockApiWithReply("ok");
    api.runtime.channel.reply.finalizeInboundContext = (ctx) => {
      capturedCtx = ctx;
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
