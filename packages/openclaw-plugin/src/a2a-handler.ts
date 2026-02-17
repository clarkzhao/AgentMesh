import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  OpenClawPluginApi,
  PluginConfig,
  A2aJsonRpcRequest,
  A2aTaskSendParams,
  A2aTaskGetParams,
  A2aMessage,
  A2aPart,
  A2aTask,
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

    // Method dispatch
    switch (rpc.method) {
      case "tasks/send":
        await handleTasksSend(res, rpc, api, config, taskStore);
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
  taskId: string,
  a2aSessionId?: string,
): string {
  const { prefix, agentId, strategy } = config.session;
  switch (strategy) {
    case "per-task":
      return `${prefix}:${agentId}:${taskId}`;
    case "per-conversation":
      return `${prefix}:${agentId}:${a2aSessionId ?? taskId}`;
    case "shared":
      return `${prefix}:${agentId}:shared`;
  }
}

async function handleTasksSend(
  res: ServerResponse,
  rpc: A2aJsonRpcRequest,
  api: OpenClawPluginApi,
  config: PluginConfig,
  taskStore: TaskStore,
): Promise<void> {
  const params = rpc.params as A2aTaskSendParams | undefined;

  // Validate params
  if (!params?.id || !params.message) {
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

  // Extract text from parts
  const textParts: string[] = [];
  for (const part of params.message.parts) {
    if (part.type === "text" && "text" in part) {
      textParts.push(part.text as string);
    } else {
      console.warn(`agentmesh-a2a: Skipping non-text part type: ${part.type}`);
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
  const taskId = params.id;
  const sessionKey = resolveSessionKey(config, taskId, params.sessionId);

  // Mark task as submitted
  taskStore.set(taskId, {
    id: taskId,
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
    });

    const userMessage: A2aMessage = {
      role: "user",
      parts: params.message.parts,
    };
    const agentParts: A2aPart[] = [{ type: "text", text: replyText }];
    const agentMessage: A2aMessage = { role: "agent", parts: agentParts };

    const task: A2aTask = {
      id: taskId,
      status: { state: "completed" },
      artifacts: [{ name: "response", parts: agentParts }],
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
  const params = rpc.params as A2aTaskGetParams | undefined;

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
