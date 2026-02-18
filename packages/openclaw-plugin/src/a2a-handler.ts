import * as crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  OpenClawPluginApi,
  PluginConfig,
  A2aJsonRpcRequest,
  A2aMessageSendParams,
  A2aTaskSendParams,
  A2aTaskGetParams,
  A2aMessage,
  A2aPart,
  A2aTask,
  A2aTaskState,
} from "./types.js";
import {
  readJsonBody,
  sendJsonRpcError,
  sendJsonRpcResponse,
  PayloadTooLargeError,
  JsonParseError,
  TimeoutError,
} from "./utils.js";
import { dispatchToAgent, handleDispatchTimeout } from "./dispatch.js";
import { TaskStore } from "./task-store.js";

/** Terminal states for A2A tasks */
const TERMINAL_STATES: Set<A2aTaskState> = new Set([
  "completed", "failed", "canceled", "rejected",
]);

export function createA2aHandler(opts: { api: OpenClawPluginApi; config: PluginConfig }) {
  const { api, config } = opts;
  const taskStore = new TaskStore();
  taskStore.start();

  return async (req: IncomingMessage, res: ServerResponse) => {
    // Only accept POST
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Auth gate
    if (!config.auth.allowUnauthenticated && config.auth.token) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      const providedToken = authHeader.slice(7);
      if (providedToken !== config.auth.token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    // Parse JSON-RPC body
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        sendJsonRpcError(res, null, { code: -32700, message: "Request too large" }, 400);
        return;
      }
      if (err instanceof JsonParseError) {
        sendJsonRpcError(res, null, { code: -32700, message: "Parse error" }, 400);
        return;
      }
      sendJsonRpcError(res, null, { code: -32700, message: "Parse error" }, 400);
      return;
    }

    // Validate JSON-RPC structure
    const rpc = body as A2aJsonRpcRequest;
    if (!rpc || rpc.jsonrpc !== "2.0" || !rpc.id || !rpc.method) {
      sendJsonRpcError(
        res,
        (rpc as { id?: string | number })?.id ?? null,
        { code: -32600, message: "Invalid Request" },
        400,
      );
      return;
    }

    // Method dispatch — dual-accept old + new method names
    switch (rpc.method) {
      case "message/send":
      case "tasks/send":
        await handleMessageSend(res, rpc, api, config, taskStore);
        break;
      case "tasks/get":
        handleTasksGet(res, rpc, taskStore);
        break;
      case "tasks/cancel":
        sendJsonRpcError(res, rpc.id, {
          code: -32601,
          message: "tasks/cancel not supported in this version",
        });
        break;
      default:
        sendJsonRpcError(res, rpc.id, { code: -32601, message: "Method not found" });
        break;
    }
  };
}

function resolveSessionKey(
  config: PluginConfig,
  agentId: string,
  taskId: string,
  contextId?: string,
): string {
  const { prefix, strategy } = config.session;
  switch (strategy) {
    case "per-task":
      return `${prefix}:${agentId}:${taskId}`;
    case "per-conversation":
      return `${prefix}:${agentId}:${contextId ?? taskId}`;
    case "shared":
      return `${prefix}:${agentId}:shared`;
  }
}

/** Resolve agentId from skill mapping or fall back to default */
function resolveAgentId(config: PluginConfig, message: A2aMessage): string {
  const skillId = message.metadata?.skill_id as string | undefined;
  if (skillId && config.agents) {
    for (const identity of Object.values(config.agents)) {
      if (identity.skills.some((s) => s.id === skillId)) {
        return identity.agentId;
      }
    }
  }
  return config.session.agentId;
}

/**
 * Extract part discriminator — accept both `kind` (0.3.x) and `type` (legacy).
 * Returns the discriminator value (e.g. "text", "file", "data").
 */
function partKind(part: A2aPart | Record<string, unknown>): string {
  return (part as A2aPart).kind ?? (part as Record<string, unknown>).type as string ?? "unknown";
}

/** Create a dual-format text part (emits both `kind` and `type` for backward compat) */
function dualTextPart(text: string): A2aPart & { type: string } {
  return { kind: "text", type: "text", text } as A2aPart & { type: string };
}

async function handleMessageSend(
  res: ServerResponse,
  rpc: A2aJsonRpcRequest,
  api: OpenClawPluginApi,
  config: PluginConfig,
  taskStore: TaskStore,
): Promise<void> {
  // Accept both new (A2aMessageSendParams) and legacy (A2aTaskSendParams) shapes
  const params = rpc.params as (A2aMessageSendParams & A2aTaskSendParams) | undefined;

  // Resolve task ID: legacy `params.id` or generate from RPC id
  const taskId = params?.id ?? String(rpc.id);

  // Validate message exists
  if (!params?.message) {
    sendJsonRpcError(res, rpc.id, {
      code: -32602,
      message: "Invalid params: missing id or message",
    });
    return;
  }

  if (!params.message.role || !Array.isArray(params.message.parts)) {
    sendJsonRpcError(res, rpc.id, {
      code: -32602,
      message: "Invalid params: message must have role and parts",
    });
    return;
  }

  // Extract text from parts — dual-accept `kind` and `type` discriminators
  const textParts: string[] = [];
  for (const part of params.message.parts) {
    const pk = partKind(part);
    if (pk === "text" && "text" in part) {
      textParts.push((part as { text: string }).text);
    } else {
      console.warn(`agentmesh-a2a: Skipping non-text part type: ${pk}`);
    }
  }

  if (textParts.length === 0) {
    sendJsonRpcError(res, rpc.id, {
      code: -32602,
      message: "Invalid params: message has no text parts",
    });
    return;
  }

  const message = textParts.join("\n");

  // Resolve context_id: prefer `context_id`, fall back to `sessionId`, then taskId
  const contextId = params.message.context_id ?? params.sessionId ?? taskId;

  // Resolve agent identity
  const agentId = resolveAgentId(config, params.message);
  const sessionKey = resolveSessionKey(config, agentId, taskId, contextId);

  // Generate message_id for the user message if not provided
  const messageId = params.message.message_id ?? crypto.randomUUID();

  // Mark task as submitted
  taskStore.set(taskId, {
    id: taskId,
    kind: "task",
    context_id: contextId,
    status: { state: "submitted" },
  });

  const isSharedSession =
    config.session.strategy === "per-conversation" || config.session.strategy === "shared";

  try {
    const replyText = await dispatchToAgent({
      api,
      config,
      message,
      sessionKey,
      taskId,
      agentId,
    });

    const userMessage: A2aMessage = {
      message_id: messageId,
      kind: "message",
      role: "user",
      parts: params.message.parts,
      context_id: contextId,
    };
    const agentParts = [dualTextPart(replyText)];
    const agentMessage: A2aMessage = {
      message_id: crypto.randomUUID(),
      kind: "message",
      role: "agent",
      parts: agentParts as A2aPart[],
      context_id: contextId,
    };

    const task: A2aTask & { sessionId?: string } = {
      id: taskId,
      kind: "task",
      context_id: contextId,
      // Dual-format: also include sessionId for legacy clients
      sessionId: contextId,
      status: { state: "completed" },
      artifacts: [{ name: "response", parts: agentParts as A2aPart[] }],
      history: [userMessage, agentMessage],
    };

    taskStore.set(taskId, task);

    sendJsonRpcResponse(res, {
      jsonrpc: "2.0",
      id: rpc.id,
      result: task,
    });
  } catch (err) {
    if (err instanceof TimeoutError) {
      if (!isSharedSession) {
        taskStore.set(taskId, {
          id: taskId,
          kind: "task",
          context_id: contextId,
          status: { state: "failed", error: "Task timed out" },
        });
      }

      sendJsonRpcError(res, rpc.id, {
        code: -32000,
        message: "Task timed out",
        data: { state: "failed" },
      });
      return;
    }

    taskStore.set(taskId, {
      id: taskId,
      kind: "task",
      context_id: contextId,
      status: { state: "failed", error: err instanceof Error ? err.message : String(err) },
    });

    sendJsonRpcError(res, rpc.id, {
      code: -32000,
      message: err instanceof Error ? err.message : "Agent error",
    });
  }
}

function handleTasksGet(
  res: ServerResponse,
  rpc: A2aJsonRpcRequest,
  taskStore: TaskStore,
): void {
  const params = rpc.params as { id?: string } | undefined;

  if (!params?.id) {
    sendJsonRpcError(res, rpc.id, {
      code: -32602,
      message: "Invalid params: missing id",
    });
    return;
  }

  const task = taskStore.get(params.id);
  if (!task) {
    sendJsonRpcError(res, rpc.id, {
      code: -32001,
      message: "Task not found",
    });
    return;
  }

  sendJsonRpcResponse(res, {
    jsonrpc: "2.0",
    id: rpc.id,
    result: task,
  });
}
