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

export const CAREPLUS_ACCESS_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InJzbWFkaGlhcmFzaUBnbWFpbC5jb20iLCJ1c2VySWQiOiI4MDEyNDM5Zi1lMzY5LTQ1ZGEtYjA4Ni04NjU5ZDM3ODVlNzQiLCJsb2NhdGlvbklkIjoiZXBuTmxPcWxhUHFXQWNCaGVhSE0iLCJ0ZW5hbnRJZCI6ImQzM2M2MDYzLTI2YzgtNDdjMi04OTk1LTBjMWQyNmI1Y2JkMyIsInNlc3Npb25JZCI6IjVlYjNmMzI4LTA5NDgtNDA1MC05ZGRlLWUzYzI2YzdlYjE4YyIsInNpdGVJZCI6ImNhNjA0OGRmLTliNTctNDAzOS1hN2EzLTQ4NTRjOTFiMTlkZiIsImlhdCI6MTc4NjY4NTMzNSwiZXhwIjoxNzg2Njg3MTM1fQ.bpw4SO4XP5DG4GH9Y4Z4DJ7bviU2j2WImFeITyloNh2sgMkQ4p7YMhvSG9OK0qQy3f3oqRZeeWEadg8SQdyUS9NeYZARnff9MoNpRcJrORuZljpyUOsLeprfQdV0tkGvLJ5-DRiUCbPOnbDiS5s1g9h8_7BY4-aYCEdHk2zB7aVxULQKTMAwoiLvDFie-iov5k1DX_ap5g-eqkjCwY5CiPQoh9HIOZHYJkLAtDmd1ZOemA7GaLRfpKBTnAAqAlmDpwR1nZmslr4waOBjoS27WPsEl4lVJ23_4OZvVtTgc34r0LpEPVDOrOwhjSW_yt56uaZl8gUZlHwXtAcmsP-UUQ";

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
