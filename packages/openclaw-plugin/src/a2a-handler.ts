import * as crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  OpenClawPluginApi,
  PluginConfig,
  A2aJsonRpcRequest,
  A2aMessageSendParams,
  A2aTaskSendParams,
  A2aTaskGetParams,
  A2aTaskCancelParams,
  A2aMessage,
  A2aPart,
  A2aTextPart,
  A2aTask,
  A2aTaskState,
  A2aTaskStatusUpdateEvent,
  A2aTaskArtifactUpdateEvent,
} from "./types.js";
import {
  readJsonBody,
  sendJsonRpcError,
  sendJsonRpcResponse,
  PayloadTooLargeError,
  JsonParseError,
  TimeoutError,
} from "./utils.js";
import { dispatchToAgent, dispatchToAgentStreaming, AbortError } from "./dispatch.js";
import { TaskStore } from "./task-store.js";

export function createA2aHandler(opts: { api: OpenClawPluginApi; config: PluginConfig }) {
  const { api, config } = opts;
  const taskStore = new TaskStore();
  taskStore.start();

  /** Active dispatches for cancellation support */
  const activeDispatches = new Map<string, AbortController>();

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
        await handleMessageSend(res, rpc, api, config, taskStore, activeDispatches);
        break;
      case "message/stream":
      case "tasks/sendSubscribe":
        await handleMessageStream(res, rpc, api, config, taskStore, activeDispatches);
        break;
      case "tasks/get":
        handleTasksGet(res, rpc, taskStore);
        break;
      case "tasks/cancel":
        handleTasksCancel(res, rpc, taskStore, activeDispatches);
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
 */
function partKind(part: A2aPart | Record<string, unknown>): string {
  return (part as A2aPart).kind ?? (part as Record<string, unknown>).type as string ?? "unknown";
}

/** Create a text part */
function textPart(text: string): A2aTextPart {
  return { kind: "text", text };
}

/** Parse and validate send params (shared between sync and streaming handlers) */
function parseSendParams(rpc: A2aJsonRpcRequest, config: PluginConfig, res: ServerResponse): {
  taskId: string;
  message: string;
  contextId: string;
  agentId: string;
  sessionKey: string;
  messageId: string;
  userParts: A2aPart[];
} | null {
  const params = rpc.params as (A2aMessageSendParams & A2aTaskSendParams) | undefined;
  const taskId = params?.id ?? String(rpc.id);

  if (!params?.message) {
    sendJsonRpcError(res, rpc.id, {
      code: -32602,
      message: "Invalid params: missing id or message",
    });
    return null;
  }

  if (!params.message.role || !Array.isArray(params.message.parts)) {
    sendJsonRpcError(res, rpc.id, {
      code: -32602,
      message: "Invalid params: message must have role and parts",
    });
    return null;
  }

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
    return null;
  }

  const message = textParts.join("\n");
  const contextId = params.message.context_id ?? params.sessionId ?? taskId;
  const agentId = resolveAgentId(config, params.message);
  const sessionKey = resolveSessionKey(config, agentId, taskId, contextId);
  const messageId = params.message.message_id ?? crypto.randomUUID();

  return { taskId, message, contextId, agentId, sessionKey, messageId, userParts: params.message.parts };
}

async function handleMessageSend(
  res: ServerResponse,
  rpc: A2aJsonRpcRequest,
  api: OpenClawPluginApi,
  config: PluginConfig,
  taskStore: TaskStore,
  activeDispatches: Map<string, AbortController>,
): Promise<void> {
  const parsed = parseSendParams(rpc, config, res);
  if (!parsed) return;

  const { taskId, message, contextId, agentId, sessionKey, messageId, userParts } = parsed;

  taskStore.set(taskId, {
    id: taskId,
    kind: "task",
    context_id: contextId,
    status: { state: "submitted" },
  });

  const isSharedSession =
    config.session.strategy === "per-conversation" || config.session.strategy === "shared";

  const abortController = new AbortController();
  activeDispatches.set(taskId, abortController);

  try {
    const replyText = await dispatchToAgent({
      api,
      config,
      message,
      sessionKey,
      taskId,
      agentId,
      signal: abortController.signal,
    });

    const userMessage: A2aMessage = {
      message_id: messageId,
      kind: "message",
      role: "user",
      parts: userParts,
      context_id: contextId,
    };
    const agentParts = [textPart(replyText)];
    const agentMessage: A2aMessage = {
      message_id: crypto.randomUUID(),
      kind: "message",
      role: "agent",
      parts: agentParts as A2aPart[],
      context_id: contextId,
    };

    const task: A2aTask = {
      id: taskId,
      kind: "task",
      context_id: contextId,
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
    if (err instanceof AbortError) {
      taskStore.set(taskId, {
        id: taskId,
        kind: "task",
        context_id: contextId,
        status: { state: "canceled" },
      });
      sendJsonRpcError(res, rpc.id, {
        code: -32000,
        message: "Task canceled",
        data: { state: "canceled" },
      });
      return;
    }

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
  } finally {
    activeDispatches.delete(taskId);
  }
}

/** Send an SSE event */
function sendSseEvent(res: ServerResponse, data: unknown): boolean {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

async function handleMessageStream(
  res: ServerResponse,
  rpc: A2aJsonRpcRequest,
  api: OpenClawPluginApi,
  config: PluginConfig,
  taskStore: TaskStore,
  activeDispatches: Map<string, AbortController>,
): Promise<void> {
  const parsed = parseSendParams(rpc, config, res);
  if (!parsed) return;

  const { taskId, message, contextId, agentId, sessionKey, messageId, userParts } = parsed;

  // Record initial state
  taskStore.set(taskId, {
    id: taskId,
    kind: "task",
    context_id: contextId,
    status: { state: "submitted" },
  });

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  // Mark as working
  taskStore.set(taskId, {
    id: taskId,
    kind: "task",
    context_id: contextId,
    status: { state: "working" },
  });

  // Send initial working status-update
  const initialEvent: A2aTaskStatusUpdateEvent = {
    kind: "status-update",
    task_id: taskId,
    context_id: contextId,
    status: { state: "working" },
    final: false,
  };
  sendSseEvent(res, initialEvent);

  const abortController = new AbortController();
  activeDispatches.set(taskId, abortController);

  // Track client disconnect
  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
    abortController.abort();
  });

  try {
    const allChunks: string[] = [];

    for await (const chunk of dispatchToAgentStreaming({
      api,
      config,
      message,
      sessionKey,
      taskId,
      agentId,
      signal: abortController.signal,
    })) {
      if (clientDisconnected) break;

      allChunks.push(chunk.text);

      if (!chunk.isFinal) {
        // Intermediate chunk: status-update with working state
        const statusEvent: A2aTaskStatusUpdateEvent = {
          kind: "status-update",
          task_id: taskId,
          context_id: contextId,
          status: {
            state: "working",
            message: {
              role: "agent",
              parts: [textPart(chunk.text)] as A2aPart[],
            },
          },
          final: false,
        };
        sendSseEvent(res, statusEvent);
      } else {
        // Final chunk
        const fullText = allChunks.join("");
        const agentParts = [textPart(fullText)];

        const userMessage: A2aMessage = {
          message_id: messageId,
          kind: "message",
          role: "user",
          parts: userParts,
          context_id: contextId,
        };
        const agentMessage: A2aMessage = {
          message_id: crypto.randomUUID(),
          kind: "message",
          role: "agent",
          parts: agentParts as A2aPart[],
          context_id: contextId,
        };

        const completedTask: A2aTask = {
          id: taskId,
          kind: "task",
          context_id: contextId,
          status: { state: "completed" },
          artifacts: [{ name: "response", parts: agentParts as A2aPart[] }],
          history: [userMessage, agentMessage],
        };

        taskStore.set(taskId, completedTask);

        // Send completed status-update
        const completedEvent: A2aTaskStatusUpdateEvent = {
          kind: "status-update",
          task_id: taskId,
          context_id: contextId,
          status: { state: "completed" },
          final: true,
        };
        sendSseEvent(res, completedEvent);

        // Send artifact-update
        const artifactEvent: A2aTaskArtifactUpdateEvent = {
          kind: "artifact-update",
          task_id: taskId,
          context_id: contextId,
          artifact: { name: "response", parts: agentParts as A2aPart[] },
          last_chunk: true,
        };
        sendSseEvent(res, artifactEvent);
      }
    }
  } catch (err) {
    if (clientDisconnected) {
      // Client disconnected — mark task as failed in store, clean up silently
      taskStore.set(taskId, {
        id: taskId,
        kind: "task",
        context_id: contextId,
        status: { state: "failed", error: "Client disconnected" },
      });
    } else if (err instanceof AbortError) {
      taskStore.set(taskId, {
        id: taskId,
        kind: "task",
        context_id: contextId,
        status: { state: "canceled" },
      });
      const cancelEvent: A2aTaskStatusUpdateEvent = {
        kind: "status-update",
        task_id: taskId,
        context_id: contextId,
        status: { state: "canceled" },
        final: true,
      };
      sendSseEvent(res, cancelEvent);
    } else {
      const errorMsg = err instanceof Error ? err.message : String(err);
      taskStore.set(taskId, {
        id: taskId,
        kind: "task",
        context_id: contextId,
        status: { state: "failed", error: errorMsg },
      });

      const failedEvent: A2aTaskStatusUpdateEvent = {
        kind: "status-update",
        task_id: taskId,
        context_id: contextId,
        status: { state: "failed", error: errorMsg },
        final: true,
      };
      sendSseEvent(res, failedEvent);
    }
  } finally {
    activeDispatches.delete(taskId);
    res.end();
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

function handleTasksCancel(
  res: ServerResponse,
  rpc: A2aJsonRpcRequest,
  taskStore: TaskStore,
  activeDispatches: Map<string, AbortController>,
): void {
  const params = rpc.params as A2aTaskCancelParams | undefined;

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

  // If already terminal, return current task unchanged
  const terminalStates: Set<A2aTaskState> = new Set(["completed", "failed", "canceled", "rejected"]);
  if (terminalStates.has(task.status.state)) {
    sendJsonRpcResponse(res, {
      jsonrpc: "2.0",
      id: rpc.id,
      result: task,
    });
    return;
  }

  // Abort active dispatch if present
  const controller = activeDispatches.get(params.id);
  if (controller) {
    controller.abort();
  }

  // Mark task as canceled
  taskStore.set(params.id, {
    ...task,
    status: { state: "canceled" },
  });

  const updatedTask = taskStore.get(params.id);
  sendJsonRpcResponse(res, {
    jsonrpc: "2.0",
    id: rpc.id,
    result: updatedTask!,
  });
}
