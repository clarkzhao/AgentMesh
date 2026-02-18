import type { OpenClawPluginApi, PluginConfig } from "./types.js";
import { TimeoutError } from "./utils.js";

const GATEWAY_CEILING_MS = 300_000; // 5 min hard ceiling for shared/per-conversation

export interface DispatchParams {
  api: OpenClawPluginApi;
  config: PluginConfig;
  message: string;
  sessionKey: string;
  taskId: string;
  agentId?: string;
  signal?: AbortSignal;
}

export interface StreamChunk {
  text: string;
  isFinal: boolean;
}

export class AbortError extends Error {
  constructor(message = "Dispatch aborted") {
    super(message);
    this.name = "AbortError";
  }
}

function validateReplyApi(api: OpenClawPluginApi) {
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
  return reply;
}

function buildRawCtx(params: DispatchParams) {
  const { config, message, sessionKey, taskId } = params;
  const effectiveAgentId = params.agentId ?? config.session.agentId;
  return {
    Body: message,
    CommandBody: message,
    From: "a2a:remote",
    To: `agent:${effectiveAgentId}`,
    SessionKey: sessionKey,
    ChatType: "direct" as const,
    CommandAuthorized: false,
    MessageSid: taskId,
    Provider: "a2a" as const,
    Surface: "a2a" as const,
    Timestamp: Date.now(),
    WasMentioned: true,
    OriginatingChannel: "a2a" as const,
    OriginatingTo: `agent:${effectiveAgentId}`,
  };
}

function getEffectiveTimeout(config: PluginConfig): number {
  const isSharedSession =
    config.session.strategy === "per-conversation" || config.session.strategy === "shared";
  return isSharedSession ? GATEWAY_CEILING_MS : config.session.timeoutMs;
}

export async function dispatchToAgent(params: DispatchParams): Promise<string> {
  const { api, config, signal } = params;
  const reply = validateReplyApi(api);

  const rawCtx = buildRawCtx(params);
  const ctx = reply.finalizeInboundContext(rawCtx);

  const replyParts: string[] = [];
  let timedOut = false;

  const deliver = async (
    payload: { text?: string },
    info: { kind: string },
  ) => {
    if (timedOut) return;
    if (info.kind === "final" && payload.text) {
      replyParts.push(payload.text);
    }
  };

  const { dispatcher, replyOptions, markDispatchIdle } =
    reply.createReplyDispatcherWithTyping({ deliver });

  const cfg = api.runtime.config.loadConfig();
  const effectiveTimeout = getEffectiveTimeout(config);

  const promises: Promise<string>[] = [
    (async () => {
      await reply.dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyOptions });
      dispatcher.markComplete();
      await dispatcher.waitForIdle();
      markDispatchIdle();
      return replyParts.join("\n\n");
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new TimeoutError());
      }, effectiveTimeout),
    ),
  ];

  if (signal) {
    promises.push(
      new Promise<never>((_, reject) => {
        if (signal.aborted) {
          reject(new AbortError());
          return;
        }
        signal.addEventListener("abort", () => reject(new AbortError()), { once: true });
      }),
    );
  }

  return Promise.race(promises);
}

export async function* dispatchToAgentStreaming(params: DispatchParams): AsyncGenerator<StreamChunk> {
  const { api, config, signal } = params;
  const reply = validateReplyApi(api);

  const rawCtx = buildRawCtx(params);
  const ctx = reply.finalizeInboundContext(rawCtx);

  // AsyncQueue for delivering chunks from the callback to the generator
  const queue: Array<StreamChunk | Error> = [];
  let resolve: (() => void) | null = null;
  let done = false;

  function enqueue(item: StreamChunk | Error) {
    queue.push(item);
    if (resolve) {
      resolve();
      resolve = null;
    }
  }

  async function dequeue(): Promise<StreamChunk | Error> {
    while (queue.length === 0) {
      await new Promise<void>((r) => { resolve = r; });
    }
    return queue.shift()!;
  }

  const deliver = async (
    payload: { text?: string },
    info: { kind: string },
  ) => {
    if (done) return;
    if (payload.text) {
      enqueue({ text: payload.text, isFinal: info.kind === "final" });
    }
  };

  const { dispatcher, replyOptions, markDispatchIdle } =
    reply.createReplyDispatcherWithTyping({ deliver });

  const cfg = api.runtime.config.loadConfig();
  const effectiveTimeout = getEffectiveTimeout(config);

  // Start dispatch in background
  const dispatchPromise = (async () => {
    try {
      await reply.dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyOptions });
      dispatcher.markComplete();
      await dispatcher.waitForIdle();
      markDispatchIdle();
    } catch (err) {
      enqueue(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  // Timeout watcher
  const timeoutId = setTimeout(() => {
    enqueue(new TimeoutError());
  }, effectiveTimeout);

  // Abort signal watcher
  const abortHandler = signal ? () => {
    enqueue(new AbortError());
  } : null;
  if (abortHandler && signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      done = true;
      throw new AbortError();
    }
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    while (!done) {
      const item = await dequeue();
      if (item instanceof Error) {
        throw item;
      }
      yield item;
      if (item.isFinal) {
        done = true;
      }
    }
  } finally {
    done = true;
    clearTimeout(timeoutId);
    if (abortHandler && signal) {
      signal.removeEventListener("abort", abortHandler);
    }
    await dispatchPromise;
  }
}

// Re-export for use in timeout error handling
export function handleDispatchTimeout() {
  // placeholder for timeout cleanup if needed
}
