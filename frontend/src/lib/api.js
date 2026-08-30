/**
 * api.js
 * ------------------------------------------------------------------
 * Thin fetch wrapper for the backend's versioned REST surface
 * (CONFIG.API_BASE_URL, currently .../api/v1). Pure functions, no
 * React — components/hooks call these directly.
 * ------------------------------------------------------------------
 */
import { CONFIG } from '../config.js';

async function request(path, options = {}) {
  const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body, ignore */
    }
    const err = new Error(body?.message || `Request to ${path} failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

/** GET /api/v1/ice-servers — STUN + (if configured on the backend) time-limited TURN. */
export function fetchIceServers() {
  return request('/ice-servers');
}

/** GET /api/v1/rooms/:code — existence/capacity check without joining. */
export function fetchRoomStatus(code) {
  return request(`/rooms/${encodeURIComponent(code)}`);
}

/** GET /api/v1/health */
// export function fetchHealth() {
//   return request('/health');
// }
export function fetchHealth(options = {}) {
  return request('/health', options);
}

export default { fetchIceServers, fetchRoomStatus, fetchHealth };
