import type { OpenClawPluginApi, PluginConfig } from "./types.js";
import { TimeoutError } from "./utils.js";

const GATEWAY_CEILING_MS = 300_000; // 5 min hard ceiling for shared/per-conversation

export interface DispatchParams {
  api: OpenClawPluginApi;
  config: PluginConfig;
  message: string;
  sessionKey: string;
  taskId: string;
}

export async function dispatchToAgent(params: DispatchParams): Promise<string> {
  const { api, config, message, sessionKey, taskId } = params;

  // Validate runtime API exists
  const reply = api.runtime?.channel?.reply;
  if (!reply) {
    throw new Error("OpenClaw runtime API not available (api.runtime.channel.reply is missing)");
  }
  if (typeof reply.finalizeInboundContext !== "function") {
    throw new Error("OpenClaw API missing: finalizeInboundContext");
  }
  if (typeof reply.createReplyDispatcherWithTyping !== "function") {
    throw new Error("OpenClaw API missing: createReplyDispatcherWithTyping");
  }
  if (typeof reply.dispatchReplyFromConfig !== "function") {
    throw new Error("OpenClaw API missing: dispatchReplyFromConfig");
  }

  // 1. Build MsgContext with all required fields
  const rawCtx = {
    Body: message,
    CommandBody: message,
    From: "a2a:remote",
    To: `agent:${config.session.agentId}`,
    SessionKey: sessionKey,
    ChatType: "direct" as const,
    CommandAuthorized: false,
    MessageSid: taskId,
    Provider: "a2a" as const,
    Surface: "a2a" as const,
    Timestamp: Date.now(),
    WasMentioned: true,
    OriginatingChannel: "a2a" as const,
    OriginatingTo: `agent:${config.session.agentId}`,
  };

  // 2. Finalize inbound context
  const ctx = reply.finalizeInboundContext(rawCtx);

  // 3. Create reply dispatcher with deliver callback
  const replyParts: string[] = [];
  let timedOut = false;

  // deliver signature: (payload: ReplyPayload, info: { kind }) => Promise<void>
  const deliver = async (
    payload: { text?: string },
    info: { kind: string },
  ) => {
    if (timedOut) return; // Discard late writes for per-task
    if (info.kind === "final" && payload.text) {
      replyParts.push(payload.text);
    }
  };

  const { dispatcher, replyOptions, markDispatchIdle } =
    reply.createReplyDispatcherWithTyping({ deliver });

  // 4. Load config
  const cfg = api.runtime.config.loadConfig();

  // 5. Determine timeout
  const isSharedSession =
    config.session.strategy === "per-conversation" || config.session.strategy === "shared";
  const effectiveTimeout = isSharedSession ? GATEWAY_CEILING_MS : config.session.timeoutMs;

  // 6. Execute with timeout
  const result = await Promise.race([
    (async () => {
      await reply.dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyOptions });
      dispatcher.markComplete();
      await dispatcher.waitForIdle();
      markDispatchIdle();
      return replyParts.join("\n\n");
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError()), effectiveTimeout),
    ),
  ]);

  return result;
}

// Re-export for use in timeout error handling
export function handleDispatchTimeout() {
  // placeholder for timeout cleanup if needed
}
