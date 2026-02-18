// Re-export OpenClaw SDK types used by this plugin
export type {
  OpenClawPluginApi,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
} from "openclaw/plugin-sdk";

// -- A2A types (aligned with a2a-sdk 0.3.x) --

export type A2aTaskState =
  | "submitted"
  | "working"
  | "input_required"
  | "completed"
  | "canceled"
  | "failed"
  | "rejected"
  | "auth_required"
  | "unknown";

export interface A2aTaskStatus {
  state: A2aTaskState;
  message?: A2aMessage;
  timestamp?: string;
  error?: string;
}

export interface A2aTextPart {
  kind: "text";
  text: string;
  metadata?: Record<string, unknown>;
}

export interface A2aFilePart {
  kind: "file";
  file: {
    bytes?: string;
    uri?: string;
    name?: string;
    mimeType?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface A2aDataPart {
  kind: "data";
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type A2aPart = A2aTextPart | A2aFilePart | A2aDataPart;

export interface A2aMessage {
  message_id?: string;
  kind?: "message";
  role: "user" | "agent";
  parts: A2aPart[];
  task_id?: string;
  context_id?: string;
  metadata?: Record<string, unknown>;
}

export interface A2aArtifact {
  artifact_id?: string;
  name: string;
  description?: string;
  parts: A2aPart[];
  metadata?: Record<string, unknown>;
}

export interface A2aTask {
  id: string;
  kind?: "task";
  context_id?: string;
  status: A2aTaskStatus;
  artifacts?: A2aArtifact[];
  history?: A2aMessage[];
  metadata?: Record<string, unknown>;
}

export interface A2aTaskStatusUpdateEvent {
  kind: "status-update";
  task_id: string;
  context_id?: string;
  status: A2aTaskStatus;
  final: boolean;
  metadata?: Record<string, unknown>;
}

export interface A2aTaskArtifactUpdateEvent {
  kind: "artifact-update";
  task_id: string;
  context_id?: string;
  artifact: A2aArtifact;
  append?: boolean;
  last_chunk?: boolean;
  metadata?: Record<string, unknown>;
}

// -- JSON-RPC --

export interface A2aJsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: A2aMessageSendParams | A2aTaskSendParams | A2aTaskGetParams | A2aTaskCancelParams;
}

export interface A2aMessageSendParams {
  message: A2aMessage;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Legacy alias — M1 wire format with `id` and `sessionId` on params */
export interface A2aTaskSendParams {
  id?: string;
  sessionId?: string;
  message: A2aMessage;
}

export interface A2aTaskGetParams {
  id: string;
}

export interface A2aTaskCancelParams {
  id: string;
  metadata?: Record<string, unknown>;
}

export interface A2aJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: A2aTask;
  error?: A2aJsonRpcError;
}

export interface A2aJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// -- Plugin config --

export interface AgentIdentity {
  agentId: string;
  skills: Array<{ id: string; name: string; description: string; tags?: string[] }>;
}

export interface PluginConfig {
  enabled: boolean;
  agentName: string;
  agentDescription: string;
  skills: Array<{ id: string; name: string; description: string; tags?: string[] }>;
  publicBaseUrl: string;
  mdns: boolean;
  auth: {
    token: string | null;
    allowUnauthenticated: boolean;
  };
  session: {
    strategy: "per-task" | "per-conversation" | "shared";
    prefix: string;
    agentId: string;
    timeoutMs: number;
  };
  agents: Record<string, AgentIdentity>;
}

// -- Task store --

export interface TaskStoreEntry {
  task: A2aTask;
  createdAt: number;
}
