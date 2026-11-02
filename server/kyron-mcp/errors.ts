import type { ApiErrorCode } from "@/types/api";

export type KyronMcpErrorCode = Extract<
  ApiErrorCode,
  | "KYRON_MCP_NOT_CONFIGURED"
  | "KYRON_MCP_NOT_CONNECTED"
  | "KYRON_MCP_TOOL_NOT_ALLOWED"
  | "KYRON_MCP_UNAVAILABLE"
  | "KYRON_INVALID_RESPONSE"
>;

export class KyronMcpError extends Error {
  readonly code: KyronMcpErrorCode;
  readonly retryable: boolean;

  constructor(code: KyronMcpErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "KyronMcpError";
    this.code = code;
    this.retryable = retryable;
  }
}
