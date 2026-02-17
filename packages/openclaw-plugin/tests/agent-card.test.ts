import { describe, it, expect } from "vitest";
import { createAgentCardHandler } from "../src/agent-card.js";
import { createMockRequest, createMockResponse, defaultPluginConfig } from "./helpers.js";

describe("agent-card", () => {
  it("returns valid AgentCard JSON", () => {
    const config = defaultPluginConfig();
    const handler = createAgentCardHandler(config);
    const req = createMockRequest("GET", "");
    req.method = "GET";
    const res = createMockResponse();

    handler(req, res);

    expect(res._status).toBe(200);
    expect(res._headers["Content-Type"]).toBe("application/json");

    const card = JSON.parse(res._body);
    expect(card.name).toBe("TestAgent");
    expect(card.url).toBe("http://localhost:18789/a2a");
    expect(card.version).toBeDefined();
    expect(card.skills).toHaveLength(1);
  });

  it("uses publicBaseUrl, not Host header", () => {
    const config = defaultPluginConfig({ publicBaseUrl: "http://192.168.1.42:18789" });
    const handler = createAgentCardHandler(config);
    const req = createMockRequest("GET", "");
    req.method = "GET";
    (req as { headers: Record<string, string> }).headers = { host: "evil.com" };
    const res = createMockResponse();

    handler(req, res);

    const card = JSON.parse(res._body);
    expect(card.url).toBe("http://192.168.1.42:18789/a2a");
    expect(card.url).not.toContain("evil.com");
  });

  it("includes securitySchemes when auth is enabled", () => {
    const config = defaultPluginConfig({
      auth: { token: "secret", allowUnauthenticated: false },
    });
    const handler = createAgentCardHandler(config);
    const req = createMockRequest("GET", "");
    const res = createMockResponse();

    handler(req, res);

    const card = JSON.parse(res._body);
    expect(card.securitySchemes).toBeDefined();
    expect(card.securitySchemes.bearer.type).toBe("http");
    expect(card.securitySchemes.bearer.scheme).toBe("bearer");
    expect(card.security).toBeDefined();
  });

  it("omits securitySchemes when allowUnauthenticated is true", () => {
    const config = defaultPluginConfig({
      auth: { token: null, allowUnauthenticated: true },
    });
    const handler = createAgentCardHandler(config);
    const req = createMockRequest("GET", "");
    const res = createMockResponse();

    handler(req, res);

    const card = JSON.parse(res._body);
    expect(card.securitySchemes).toBeUndefined();
    expect(card.security).toBeUndefined();
  });
});
