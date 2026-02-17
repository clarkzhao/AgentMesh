import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { OpenClawPluginApi, PluginConfig } from "./types.js";

export function resolvePluginConfig(
  raw: Record<string, unknown>,
  api?: OpenClawPluginApi,
): PluginConfig {
  const enabled = raw.enabled !== false;
  const agentName = typeof raw.agentName === "string" ? raw.agentName : "OpenClaw";
  const agentDescription =
    typeof raw.agentDescription === "string"
      ? raw.agentDescription
      : "An OpenClaw agent exposed via A2A";
  const skills = Array.isArray(raw.skills)
    ? (raw.skills as Array<{ id: string; name: string; description: string }>)
    : [{ id: "chat", name: "Chat", description: "General conversation" }];

  // publicBaseUrl — required, validated
  const publicBaseUrl = validatePublicBaseUrl(raw.publicBaseUrl);

  const mdns = raw.mdns !== false;

  // Auth config
  const rawAuth = (raw.auth as Record<string, unknown>) ?? {};
  const allowUnauthenticated = rawAuth.allowUnauthenticated === true;
  const token = resolveAuthToken(rawAuth, allowUnauthenticated, api);

  // Session config
  const rawSession = (raw.session as Record<string, unknown>) ?? {};
  const strategy = validateStrategy(rawSession.strategy);
  const prefix = typeof rawSession.prefix === "string" ? rawSession.prefix : "a2a";
  const agentId = typeof rawSession.agentId === "string" ? rawSession.agentId : "main";
  const timeoutMs =
    typeof rawSession.timeoutMs === "number" && rawSession.timeoutMs > 0
      ? rawSession.timeoutMs
      : 120_000;

  return {
    enabled,
    agentName,
    agentDescription,
    skills,
    publicBaseUrl,
    mdns,
    auth: { token, allowUnauthenticated },
    session: { strategy, prefix, agentId, timeoutMs },
  };
}

function validatePublicBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("agentmesh-a2a: publicBaseUrl is required");
  }
  try {
    new URL(value);
  } catch {
    throw new Error(`agentmesh-a2a: publicBaseUrl is not a valid URL: ${value}`);
  }
  if (value.endsWith("/")) {
    throw new Error(`agentmesh-a2a: publicBaseUrl must not have a trailing slash: ${value}`);
  }
  return value;
}

function validateStrategy(value: unknown): "per-task" | "per-conversation" | "shared" {
  if (value === "per-task" || value === "per-conversation" || value === "shared") {
    return value;
  }
  return "per-task";
}

function resolveAuthToken(
  rawAuth: Record<string, unknown>,
  allowUnauthenticated: boolean,
  api?: OpenClawPluginApi,
): string | null {
  // Explicit token provided
  if (typeof rawAuth.token === "string" && rawAuth.token.length > 0) {
    return rawAuth.token;
  }

  // Explicitly opted into unauthenticated mode
  if (allowUnauthenticated) {
    return null;
  }

  // Auto-generate and persist token
  if (!api) {
    throw new Error(
      "agentmesh-a2a: No auth.token set, auth.allowUnauthenticated is false, " +
        "and no plugin API available to resolve state directory for auto-generated token",
    );
  }

  let stateDir: string;
  try {
    stateDir = api.runtime.state.resolveStateDir();
  } catch (err) {
    throw new Error(
      `agentmesh-a2a: Cannot resolve state directory for auto-generated token. ` +
        `Set auth.token explicitly or set auth.allowUnauthenticated: true. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const tokenFilePath = path.join(stateDir, "agentmesh-a2a-token");

  // Check for existing token file
  if (fs.existsSync(tokenFilePath)) {
    // Reject symlinks
    const stat = fs.lstatSync(tokenFilePath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `agentmesh-a2a: Token file is a symlink, refusing to read: ${tokenFilePath}`,
      );
    }

    // Check permissions (Unix only)
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      throw new Error(
        `agentmesh-a2a: Token file has insecure permissions (${mode.toString(8)}), ` +
          `expected 0600: ${tokenFilePath}`,
      );
    }

    return fs.readFileSync(tokenFilePath, "utf-8").trim();
  }

  // Generate new token
  const newToken = crypto.randomBytes(32).toString("hex");
  const tmpPath = tokenFilePath + ".tmp";

  try {
    fs.writeFileSync(tmpPath, newToken + "\n", { mode: 0o600 });
    fs.renameSync(tmpPath, tokenFilePath);
  } catch (err) {
    // Clean up tmp file if rename failed
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw new Error(
      `agentmesh-a2a: Cannot write token file to ${tokenFilePath}. ` +
        `Set auth.token explicitly or set auth.allowUnauthenticated: true. ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const fingerprint = newToken.slice(0, 8);
  api.logger.info(`Auto-generated auth token: ${fingerprint}...`);
  return newToken;
}
