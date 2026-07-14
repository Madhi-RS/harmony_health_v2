/**
 * Voice configuration — single source for all voice-related constants.
 *
 * Rules:
 * 1. Keep the existing hardcoded auth token value (imported from @/lib/token).
 * 2. Do NOT scatter the token across multiple files.
 * 3. Every voice API call must read the token from this config.
 * 4. AI Sales Layer auth token ≠ LiveKit room token — do not mix them.
 */

import { getAccessToken } from "@/lib/token";

export const VOICE_CONFIG = {
  /** AI Sales Layer base URL for voice REST endpoints. */
  aiSalesLayerBaseUrl:
    process.env.NEXT_PUBLIC_AI_SALES_LAYER_BASE_URL || "http://localhost:8000",

  /** API prefix for all voice endpoints. */
  apiPrefix: "/api/v1",

  /** Whether voice is enabled in the frontend. */
  voiceEnabled: true,

  /** Default site ID — fallback if the JWT cannot provide one. */
  defaultSiteId: "ca6048df-9b57-4039-a7a3-4854c91b19df",

  /** Default business type sent to AI Sales Layer. */
  defaultBusinessType: "default",

  /** Default agent name. */
  defaultAgentName: "Alex",
} as const;

/** Return the complete voice base URL: http://localhost:8000/api/v1/voice */
export function getVoiceBaseUrl(): string {
  return `${VOICE_CONFIG.aiSalesLayerBaseUrl}${VOICE_CONFIG.apiPrefix}/voice`;
}

/**
 * Return headers for every AI Sales Layer voice REST call.
 * Always includes the hardcoded Authorization bearer token.
 */
export function getVoiceHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Resolve the site id to send with a voice session request.
 *
 * The voice worker uses site_id (+ tenant_id) for RAG retrieval, so we pass it
 * explicitly instead of null. Preference order:
 *   1. `siteId` claim decoded from the active JWT.
 *   2. VOICE_CONFIG.defaultSiteId fallback.
 */
export function getSiteId(): string {
  const fromToken = decodeSiteIdFromJwt(getAccessToken());
  return fromToken || VOICE_CONFIG.defaultSiteId;
}

/** Best-effort decode of the `siteId` claim from a JWT payload. */
function decodeSiteIdFromJwt(token: string): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    // Base64url → base64, then decode.
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob !== "undefined"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    const payload = JSON.parse(json);
    return payload?.siteId || payload?.site_id || null;
  } catch {
    return null;
  }
}
