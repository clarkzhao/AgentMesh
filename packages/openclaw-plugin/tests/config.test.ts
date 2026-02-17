import { describe, it, expect } from "vitest";
import { resolvePluginConfig } from "../src/config.js";

describe("config", () => {
  it("uses defaults for missing fields", () => {
    const config = resolvePluginConfig(
      { publicBaseUrl: "http://localhost:18789", auth: { allowUnauthenticated: true } },
    );

    expect(config.enabled).toBe(true);
    expect(config.agentName).toBe("OpenClaw");
    expect(config.mdns).toBe(true);
    expect(config.session.strategy).toBe("per-task");
    expect(config.session.prefix).toBe("a2a");
    expect(config.session.agentId).toBe("main");
    expect(config.session.timeoutMs).toBe(120_000);
    expect(config.skills).toHaveLength(1);
    expect(config.skills[0].id).toBe("chat");
  });

  it("throws when publicBaseUrl is missing", () => {
    expect(() =>
      resolvePluginConfig({ auth: { allowUnauthenticated: true } }),
    ).toThrow("publicBaseUrl is required");
  });

  it("throws when publicBaseUrl is invalid URL", () => {
    expect(() =>
      resolvePluginConfig({
        publicBaseUrl: "not-a-url",
        auth: { allowUnauthenticated: true },
      }),
    ).toThrow("not a valid URL");
  });

  it("throws when publicBaseUrl has trailing slash", () => {
    expect(() =>
      resolvePluginConfig({
        publicBaseUrl: "http://localhost:18789/",
        auth: { allowUnauthenticated: true },
      }),
    ).toThrow("trailing slash");
  });

  it("respects enabled: false", () => {
    const config = resolvePluginConfig({
      enabled: false,
      publicBaseUrl: "http://localhost:18789",
      auth: { allowUnauthenticated: true },
    });

    expect(config.enabled).toBe(false);
  });

  it("uses explicit token when provided", () => {
    const config = resolvePluginConfig({
      publicBaseUrl: "http://localhost:18789",
      auth: { token: "my-secret" },
    });

    expect(config.auth.token).toBe("my-secret");
  });

  it("returns null token when allowUnauthenticated is true", () => {
    const config = resolvePluginConfig({
      publicBaseUrl: "http://localhost:18789",
      auth: { allowUnauthenticated: true },
    });

    expect(config.auth.token).toBeNull();
  });

  it("throws when no token, not allowUnauthenticated, and no API", () => {
    expect(() =>
      resolvePluginConfig({
        publicBaseUrl: "http://localhost:18789",
        auth: { allowUnauthenticated: false },
      }),
    ).toThrow("no plugin API available");
  });

  it("accepts valid session strategy", () => {
    const config = resolvePluginConfig({
      publicBaseUrl: "http://localhost:18789",
      auth: { allowUnauthenticated: true },
      session: { strategy: "per-conversation" },
    });

    expect(config.session.strategy).toBe("per-conversation");
  });

  it("falls back to per-task for invalid strategy", () => {
    const config = resolvePluginConfig({
      publicBaseUrl: "http://localhost:18789",
      auth: { allowUnauthenticated: true },
      session: { strategy: "invalid" },
    });

    expect(config.session.strategy).toBe("per-task");
  });
});
