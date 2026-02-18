import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginConfig } from "../src/types.js";

// Use a loose type for the mock API — the real OpenClawPluginApi has many fields
// we don't need for unit tests. Our source code imports the real type from the SDK.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockApi = any;
type DeliverFn = (payload: { text?: string }, info: { kind: string }) => Promise<void>;
type MockReplyOptions = {
  onToolStart?: (payload: { name?: string; phase?: string }) => Promise<void> | void;
  onReasoningStream?: (payload: { text?: string }) => Promise<void> | void;
  onReasoningEnd?: () => Promise<void> | void;
};
export type StreamingMockEvent =
  | { text: string; kind: string }
  | { type: "tool"; name?: string; phase?: string }
  | { type: "reasoning"; text?: string; ended?: boolean };

export function createMockApi(overrides: Record<string, unknown> = {}): MockApi {
  const events = new EventEmitter();
  const routes: Array<{ path: string; handler: Function }> = [];

  return {
    pluginConfig: {},
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    registerHttpRoute(route: { path: string; handler: Function }) {
      routes.push(route);
    },
    on(event: string, handler: Function) {
      events.on(event, handler as (...args: unknown[]) => void);
    },
    registerService() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerTool() {},
    registerCommand() {},
    registerChannel() {},
    registerProvider() {},
    registerHook() {},
    registerHttpHandler() {},
    resolvePath: (p: string) => p,
    id: "agentmesh-a2a",
    name: "AgentMesh A2A Bridge",
    source: "test",
    config: {},
    runtime: {
      config: {
        loadConfig: () => ({}),
      },
      channel: {
        reply: {
          finalizeInboundContext: (ctx: unknown) => ctx,
          createReplyDispatcherWithTyping: (opts: { deliver: DeliverFn }) => ({
            dispatcher: {
              markComplete: () => {},
              waitForIdle: () => Promise.resolve(),
            },
            replyOptions: {},
            markDispatchIdle: () => {},
          }),
          dispatchReplyFromConfig: async () => {},
        },
      },
      state: {
        resolveStateDir: () => "/tmp/agentmesh-test-state",
      },
      logging: {
        shouldLogVerbose: () => false,
        getChildLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
      },
    },
    ...overrides,
  };
}

export function createMockApiWithReply(
  replyText: string,
  delay = 0,
): MockApi {
  let capturedDeliver: DeliverFn | null = null;

  const api = createMockApi();
  api.runtime.channel.reply.createReplyDispatcherWithTyping = (opts: { deliver: DeliverFn }) => {
    capturedDeliver = opts.deliver;
    return {
      dispatcher: {
        markComplete: () => {},
        waitForIdle: () => Promise.resolve(),
      },
      replyOptions: {},
      markDispatchIdle: () => {},
    };
  };
  api.runtime.channel.reply.dispatchReplyFromConfig = async () => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await capturedDeliver?.({ text: replyText }, { kind: "final" });
  };
  return api;
}

export function createMockApiWithStreamingReply(
  chunks: StreamingMockEvent[],
  delay = 0,
): MockApi {
  let capturedDeliver: DeliverFn | null = null;

  const api = createMockApi();
  api.runtime.channel.reply.createReplyDispatcherWithTyping = (opts: { deliver: DeliverFn }) => {
    capturedDeliver = opts.deliver;
    return {
      dispatcher: {
        markComplete: () => {},
        waitForIdle: () => Promise.resolve(),
      },
      replyOptions: {},
      markDispatchIdle: () => {},
    };
  };
  api.runtime.channel.reply.dispatchReplyFromConfig = async (params: { replyOptions?: MockReplyOptions } = {}) => {
    for (const event of chunks) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if ("kind" in event) {
        await capturedDeliver?.({ text: event.text }, { kind: event.kind });
      } else if (event.type === "tool") {
        await params.replyOptions?.onToolStart?.({ name: event.name, phase: event.phase });
      } else {
        if (event.text !== undefined) {
          await params.replyOptions?.onReasoningStream?.({ text: event.text });
        }
        if (event.ended) {
          await params.replyOptions?.onReasoningEnd?.();
        }
      }
    }
  };
  return api;
}

export function createMockRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): IncomingMessage {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const readable = new Readable();
  readable.push(bodyStr);
  readable.push(null);

  const req = Object.assign(readable, {
    method,
    url: "/a2a",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bodyStr)),
      ...headers,
    },
  });

  return req as unknown as IncomingMessage;
}

export function createMockResponse(): ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
  _chunks: string[];
  _ended: boolean;
} {
  let status = 200;
  let body = "";
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let ended = false;

  const res = {
    _status: status,
    _headers: headers,
    _body: body,
    _chunks: chunks,
    _ended: ended,
    writeHead(code: number, hdrs?: Record<string, string>) {
      res._status = code;
      if (hdrs) Object.assign(res._headers, hdrs);
      return res;
    },
    write(data: string) {
      res._chunks.push(data);
      return true;
    },
    end(data?: string) {
      if (data) res._body = data;
      res._ended = true;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
    },
    on(_event: string, _handler: Function) {
      return res;
    },
  };

  return res as unknown as ServerResponse & {
    _status: number;
    _headers: Record<string, string>;
    _body: string;
    _chunks: string[];
    _ended: boolean;
  };
}

/** New-format A2A request (a2a-sdk 0.3.x) */
export function validA2aRequest(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

/** Legacy M1 wire format request */
export function validLegacyA2aRequest(overrides: Record<string, unknown> = {}) {
  return {
    jsonrpc: "2.0",
    id: "req-1",
    method: "tasks/send",
    params: {
      id: "task-1",
      message: {
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    },
    ...overrides,
  };
}

export function defaultPluginConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    enabled: true,
    agentName: "TestAgent",
    agentDescription: "A test agent",
    skills: [{ id: "chat", name: "Chat", description: "General conversation" }],
    publicBaseUrl: "http://localhost:18789",
    mdns: false,
    auth: { token: "test-token", allowUnauthenticated: false },
    session: {
      strategy: "per-task",
      prefix: "a2a",
      agentId: "main",
      timeoutMs: 5000,
    },
    agents: {
      main: {
        agentId: "main",
        skills: [{ id: "chat", name: "Chat", description: "General conversation" }],
      },
    },
    ...overrides,
  };
}
