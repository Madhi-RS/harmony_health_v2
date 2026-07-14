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

export const CAREPLUS_ACCESS_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InJzbWFkaGlhcmFzaUBnbWFpbC5jb20iLCJ1c2VySWQiOiI4MDEyNDM5Zi1lMzY5LTQ1ZGEtYjA4Ni04NjU5ZDM3ODVlNzQiLCJ0ZW5hbnRJZCI6ImQzM2M2MDYzLTI2YzgtNDdjMi04OTk1LTBjMWQyNmI1Y2JkMyIsImxvY2F0aW9uSWQiOiJlcG5ObE9xbGFQcVdBY0JoZWFITSIsInNlc3Npb25JZCI6ImE4Y2Q0NTlhLTQ0YzctNDFlNy04YmY4LTQ2MjY2OTg0MTQ1ZiIsInNpdGVJZCI6ImNhNjA0OGRmLTliNTctNDAzOS1hN2EzLTQ4NTRjOTFiMTlkZiIsImlhdCI6MTc4Mzk1MjE0MywiZXhwIjoxNzgzOTUzOTQzfQ.dsIawDSJRdKpItYebCAI9LsjglTJSsSADE641XiK8PzFPhUCoXbvyfcpu8sODw_CANoTTb68K1C-66NNlslAkp-mQqTxd0aGcU5zqmRSM3lHcvsK--Q0-EWUz_dF10GJDSRL8X0hsijHl_YDlgcde9fLsYKnuABNtVV5uxK5C71TqfLVLFkH9lHpshsrvithNsYras3nA5jqf2lY5vJwjnfCF0Jx2--PXoq1ABSBPRpXcvhJA50xrT2drTWVOrq9HYx8c58VlTNwhww06TEl8NevgiU-K5zylgKJi67Ad60Ci6KH39tAjEAfXrocQbcBi7-X3IUYM2F8TvRhSw5cVA";

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
