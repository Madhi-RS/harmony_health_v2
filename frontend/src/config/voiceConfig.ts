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

/** Tunable voice-pipeline timing constants. Single source of truth. */
export const VOICE_TIMING = {
  /** Minimum sustained local speech before an interruption is honored. */
  bargeInMinSpeechMs: 400,
  /** Ignore likely speaker echo immediately after the greeting. */
  bargeInCooldownMs: 500,
  /** Optional gapless hand-off look-ahead. Start conservatively. */
  chunkLookaheadMs: 120,
  /** Delay before handing the floor back to the user. */
  listeningDebounceMs: 300,
  /** Missing-next-chunk tolerance; validate before changing. */
  generationCompleteMs: 800,
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

// ── JWT payload decoding ──

/** Reusable base64url JWT payload decoder. Returns parsed claims or null. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob !== "undefined"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Extract `siteId` / `site_id` from the JWT. */
function decodeSiteIdFromJwt(token: string): string | null {
  const p = decodeJwtPayload(token);
  if (!p) return null;
  return (p.siteId as string) || (p.site_id as string) || null;
}

/** Extract `tenantId` / `tenant_id` from the JWT. */
export function decodeTenantIdFromJwt(token: string): string | null {
  const p = decodeJwtPayload(token);
  if (!p) return null;
  return (p.tenantId as string) || (p.tenant_id as string) || null;
}

/** Extract `userId` / `user_id` from the JWT. */
export function decodeUserIdFromJwt(token: string): string | null {
  const p = decodeJwtPayload(token);
  if (!p) return null;
  return (p.userId as string) || (p.user_id as string) || null;
}

/** Extract `email` from the JWT. */
export function decodeEmailFromJwt(token: string): string | null {
  const p = decodeJwtPayload(token);
  if (!p) return null;
  return (p.email as string) || null;
}

/**
 * Return all participant metadata required by the voice agent's
 * `parse_voice_metadata()` for tenant context resolution.
 *
 * Fields: tenant_id, user_id, email, site_id.
 * Falls back to config defaults where the JWT doesn't carry a claim.
 */
export function getVoiceSessionMetadata(): {
  tenant_id: string | null;
  user_id: string | null;
  email: string | null;
  site_id: string | null;
} {
  const token = getAccessToken();
  return {
    tenant_id: decodeTenantIdFromJwt(token) || null,
    user_id: decodeUserIdFromJwt(token) || null,
    email: decodeEmailFromJwt(token) || null,
    site_id: decodeSiteIdFromJwt(token) || VOICE_CONFIG.defaultSiteId,
  };
}
