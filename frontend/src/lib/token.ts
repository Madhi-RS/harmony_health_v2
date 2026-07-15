/**
 * SINGLE source for the access token used across the entire app.
 *
 * Replace the value below with the CarePlus access token.
 * Every API call (text chat, voice, LiveKit, WebSocket) will use THIS token.
 *
 * ── HOW TO REPLACE ──
 * 1. Paste the CarePlus JWT below
 * 2. No other code changes needed anywhere
 */

export const CAREPLUS_ACCESS_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InJzbWFkaGlhcmFzaUBnbWFpbC5jb20iLCJ1c2VySWQiOiI4MDEyNDM5Zi1lMzY5LTQ1ZGEtYjA4Ni04NjU5ZDM3ODVlNzQiLCJsb2NhdGlvbklkIjoiZXBuTmxPcWxhUHFXQWNCaGVhSE0iLCJ0ZW5hbnRJZCI6ImQzM2M2MDYzLTI2YzgtNDdjMi04OTk1LTBjMWQyNmI1Y2JkMyIsInNlc3Npb25JZCI6IjY1NTVjMzlhLTM0ZWMtNDYwMC04NDk2LWVlMGM0NmI1NDkxYyIsInNpdGVJZCI6ImNhNjA0OGRmLTliNTctNDAzOS1hN2EzLTQ4NTRjOTFiMTlkZiIsImlhdCI6MTc4NDEwOTIxMSwiZXhwIjoxNzg0MTExMDExfQ.OORrelXTv4eDH1pErGJ4WR7mHkGcl3KPPWWU-eyuKUEl15IoDqRJFInj8eMd4pNM465ARxTrP3opOyGeJEbLlRDsseeOzGzP6Rj_dmncaZVl_w7rihX5e5CScS9ytB4bBjUNT08NTNscpKr6Adbiwen1U4pEWA9k-jWC1PPG7Nox3CMzW0C2f3gF8ai0RkQ0tGvYO7dz0Av0CAEVx79nNQ1X2fA7FSloGPzOQwIGPQCZ9MZbV0vlM3RdlowVe9X8asQ7Zwk0s51LSXymaiFGeAUqN1lK6H60ZiLTlBCd_jV7vcMwGhZm_3mB0S-ORwvGNVlwNkd7_5mqt4lHnsDhbg";

/** Return the active access token for all API calls. */
export function getAccessToken(): string {
  // ── Use the hardcoded CarePlus token when available ──
  if (CAREPLUS_ACCESS_TOKEN) {
    return CAREPLUS_ACCESS_TOKEN;
  }

  // ── Fallback: read from Zustand localStorage (Harmony login) ──
  try {
    const stored = localStorage.getItem("auth-storage");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.tokens?.access_token || "";
    }
  } catch {
    // ignore
  }
  return "";
}
