import type { IncomingMessage, ServerResponse } from "node:http";
import type { A2aJsonRpcError, A2aJsonRpcResponse } from "./types.js";

const DEFAULT_MAX_BYTES = 1_000_000; // 1MB

export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<unknown> {
  // Check Content-Length header first
  const contentLength = req.headers["content-length"];
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new PayloadTooLargeError(`Request body exceeds ${maxBytes} bytes`);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(new PayloadTooLargeError(`Request body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(JSON.parse(body));
      } catch {
        reject(new JsonParseError("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonParseError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "Task timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function sendJsonRpcResponse(
  res: ServerResponse,
  response: A2aJsonRpcResponse,
  httpStatus = 200,
): void {
  res.writeHead(httpStatus, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));
}

export function sendJsonRpcError(
  res: ServerResponse,
  id: string | number | null,
  error: A2aJsonRpcError,
  httpStatus = 200,
): void {
  sendJsonRpcResponse(
    res,
    { jsonrpc: "2.0", id: id ?? "", error },
    httpStatus,
  );
}
