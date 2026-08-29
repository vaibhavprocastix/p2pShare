/**
 * config.js — SINGLE SOURCE OF TRUTH for frontend configuration.
 * ------------------------------------------------------------------
 * Every tunable value the React app uses lives here. Every module
 * imports CONFIG from this file instead of hardcoding values —
 * change a number once, here, and it applies everywhere.
 *
 * SIGNALING_URL resolution order:
 *   1. VITE_SIGNALING_URL env var at build time (set in .env or your
 *      hosting provider's dashboard) — use this for split deployments
 *      where the frontend and backend live on different domains
 *      (e.g. Cloudflare Pages + Render).
 *   2. Same-origin inference: wss://<current host>/ws — this is what
 *      you want for the Docker Compose stack in this repo, where
 *      Nginx proxies /ws straight through to the backend container,
 *      and for any single-domain deployment behind one reverse proxy.
 * ------------------------------------------------------------------
 */

function resolveSignalingUrl() {
  const fromEnv = import.meta.env.VITE_SIGNALING_URL;
  if (fromEnv) return fromEnv;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export const CONFIG = {
  // ---- REST API ----
  // Only needed for SPLIT deployments (frontend/backend on different domains) — see
  // VITE_API_BASE_URL in .env.example. Unset infers same-origin /api/v1, which Nginx
  // proxies to the backend in this repo's Docker Compose stack.
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.host}/api/v1`,

  // ---- Signaling transport ----
  SIGNALING_URL: resolveSignalingUrl(),
  RECONNECT_MAX_DELAY_MS: 8000,
  HEARTBEAT_PING_INTERVAL_MS: 25000,

  // ---- WebRTC ----
  // Fallback ICE servers used only if the /api/v1/ice-servers fetch fails (e.g. the
  // very first paint, or the backend being briefly unreachable). Once that fetch
  // succeeds, its result — which may include a TURN relay — takes over. STUN alone
  // cannot traverse every NAT combination (symmetric NAT, common on mobile hotspots,
  // is the classic failure case) — configuring TURN on the backend (see
  // backend/.env.example) is what actually fixes "connection failed" between such peers.
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  DATA_CHANNEL_LABEL: 'p2pshare-file-transfer',

  // ---- File transfer / backpressure ----
  CHUNK_SIZE: 64 * 1024, // 64KB per RTCDataChannel message
  BUFFERED_AMOUNT_HIGH_WATER: 1 * 1024 * 1024, // 1MB ceiling → pause sending
  BUFFERED_AMOUNT_LOW_WATER: 256 * 1024, // 256KB → resume sending
  PROGRESS_EMIT_INTERVAL_MS: 120, // UI progress-bar update throttle

  // Every RTCDataChannel message is already encrypted and integrity-protected in
  // transit by mandatory WebRTC DTLS — this is not optional and needs no extra
  // configuration. This SHA-256 check is a second, application-level guarantee shown
  // to the user ("Verified"), bounded to files this size or smaller so hashing an
  // entire file client-side stays cheap. Larger files skip it and rely on DTLS alone.
  INTEGRITY_CHECK_MAX_BYTES: 100 * 1024 * 1024, // 100MB

  // ---- Room rules (must match backend/config.js ROOM_CAPACITY) ----
  MAX_ROOM_CAPACITY: 5,
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_PREFIX: 'P2P-',

  // ---- UI ----
  TOAST_DURATION_MS: 4200,
  MAX_NAME_LENGTH: 32,
};

export default CONFIG;
