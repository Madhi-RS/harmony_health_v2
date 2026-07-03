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

export const CAREPLUS_ACCESS_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InJzbWFkaGlhcmFzaUBnbWFpbC5jb20iLCJ1c2VySWQiOiI4MDEyNDM5Zi1lMzY5LTQ1ZGEtYjA4Ni04NjU5ZDM3ODVlNzQiLCJsb2NhdGlvbklkIjoiZXBuTmxPcWxhUHFXQWNCaGVhSE0iLCJ0ZW5hbnRJZCI6ImQzM2M2MDYzLTI2YzgtNDdjMi04OTk1LTBjMWQyNmI1Y2JkMyIsInNlc3Npb25JZCI6ImFiYmJjMGFkLTUyMDctNGE2My1iOWJhLTliNmNhZWNkYjM1ZCIsInNpdGVJZCI6ImNhNjA0OGRmLTliNTctNDAzOS1hN2EzLTQ4NTRjOTFiMTlkZiIsImlhdCI6MTc4MzA3MjUxNiwiZXhwIjoxNzgzMDc0MzE2fQ.uUfo7p_8cStG-uQ9_RNBO3Y3mY7Dkq_yNF61WJNlr3jhM5Hf_NsGDV6PFONEME8XKBErGb9ySN0sqiFUACAsfsig4uXk6RF1-2pdEvcWXYK2ajvYXOp989_HUO5tnv3WG2YSPR0MhYbTxndLudxlfECvSAD4A62riJqHc6fpsp_kfzef3YvPIx8ooKrU-dJthCbe2wWbujYhV_c8cbTlMbN1mmX7SiyH1E_dBYJeVHiEkwDFznoj8fo3bjp0jq_VjohAVBQ5Rs99xn8NFB6-DWnZVRsM0b3sJXdmPo8eg28GIS-cfgwdPJnPtxmaZrJHsMwBwayzWFsKlN_gHi7YjQ";

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
