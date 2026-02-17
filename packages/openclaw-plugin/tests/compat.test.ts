import { describe, it, expect } from "vitest";
import { createMockApi } from "./helpers.js";

describe("compat", () => {
  it("api.runtime.channel.reply has expected methods", () => {
    const api = createMockApi();
    const reply = api.runtime.channel.reply;

    expect(typeof reply.finalizeInboundContext).toBe("function");
    expect(typeof reply.createReplyDispatcherWithTyping).toBe("function");
    expect(typeof reply.dispatchReplyFromConfig).toBe("function");
  });

  it("api.runtime.config has loadConfig", () => {
    const api = createMockApi();
    expect(typeof api.runtime.config.loadConfig).toBe("function");
  });

  it("api.runtime.state has resolveStateDir", () => {
    const api = createMockApi();
    expect(typeof api.runtime.state.resolveStateDir).toBe("function");
  });
});
