import type { Candle } from "./schemas.ts";
import { safeStorage } from "../lib/safe-storage.ts";
import { refreshAccessToken } from "./api/request.ts";

export type AiPointKind =
  | "bullish"
  | "bearish"
  | "level"
  | "caution"
  | "potential-swing-high"
  | "potential-swing-low"
  | "structure-high"
  | "structure-low";

export interface AiChartPoint {
  time: number;
  price: number;
  kind: AiPointKind;
  label: string;
  explanation: string;
  /** Structure points may remain visible while only major points shape the neon path. */
  major?: boolean;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  symbol: string;
  timeframe: string;
  candles: Array<Pick<Candle, "time" | "open" | "high" | "low" | "close" | "volume">>;
  messages: AiChatMessage[];
}

export interface AiChatResponse {
  reply: string;
  points: AiChartPoint[];
}

export class AiServiceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "AiServiceError";
  }
}

const AI_API_ORIGIN = (import.meta.env.VITE_AI_API_URL ?? "").replace(/\/$/, "");

export async function checkAiService(): Promise<{ configured: boolean }> {
  const response = await fetch(`${AI_API_ORIGIN}/api/ai/health`, { cache: "no-store" });
  if (!response.ok) throw new AiServiceError("AI service health check failed.", response.status);
  const status = (await response.json()) as { configured?: unknown };
  return { configured: status.configured === true };
}

export async function requestAiAnalysis(payload: AiChatRequest): Promise<AiChatResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    let accessToken = safeStorage.getItem("access_token");
    const url = `${AI_API_ORIGIN}/api/ai/chat`;
    const send = (token: string | null) => fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let response = await send(accessToken);
    if (response.status === 401 && accessToken) {
      const refreshedToken = await refreshAccessToken();
      if (!refreshedToken) {
        window.dispatchEvent(new CustomEvent("session:expired"));
        throw new AiServiceError("Your session has expired. Sign in again to use AI analysis.", 401);
      }
      accessToken = refreshedToken;
      response = await send(accessToken);
    }
    const body = (await response.json().catch(() => null)) as
      | (AiChatResponse & { error?: string })
      | null;
    if (!response.ok) {
      const message = body?.error ||
        (response.status === 503
          ? "AI service is not configured yet. Start the AI service and set its server-side provider key."
          : "The AI service could not complete that request.");
      throw new AiServiceError(message, response.status);
    }
    if (!body || typeof body.reply !== "string" || !Array.isArray(body.points)) {
      throw new AiServiceError("The AI service returned an invalid response.");
    }
    return { reply: body.reply, points: body.points };
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiServiceError("The analysis timed out. Please try again.");
    }
    throw new AiServiceError("Could not reach the AI service. Check its URL and try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}
