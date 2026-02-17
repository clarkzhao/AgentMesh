// Re-export OpenClaw SDK types used by this plugin
export type {
  OpenClawPluginApi,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
} from "openclaw/plugin-sdk";

// -- A2A types --

export interface A2aJsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: A2aTaskSendParams | A2aTaskGetParams;
}

export interface A2aTaskSendParams {
  id: string;
  sessionId?: string;
  message: A2aMessage;
}

export interface A2aTaskGetParams {
  id: string;
}

export interface A2aMessage {
  role: string;
  parts: A2aPart[];
}

export interface A2aTextPart {
  type: "text";
  text: string;
}

export interface A2aOtherPart {
  type: string;
  [key: string]: unknown;
}

export type A2aPart = A2aTextPart | A2aOtherPart;

export interface A2aTask {
  id: string;
  status: { state: "submitted" | "completed" | "failed"; error?: string };
  artifacts?: A2aArtifact[];
  history?: A2aMessage[];
}

export interface A2aArtifact {
  name: string;
  parts: A2aPart[];
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

export interface PluginConfig {
  enabled: boolean;
  agentName: string;
  agentDescription: string;
  skills: Array<{ id: string; name: string; description: string }>;
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
}

// -- Task store --

export interface TaskStoreEntry {
  task: A2aTask;
  createdAt: number;
}
