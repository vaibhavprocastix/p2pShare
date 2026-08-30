/**
 * api.js
 * ------------------------------------------------------------------
 * Versioned REST surface, mounted at /api/{CONFIG.API_VERSION} (currently
 * /api/v1). Real-time room lifecycle (create/join/leave/kick), presence,
 * and WebRTC signaling relay stay on the WebSocket — they're inherently
 * push-based and REST/polling would only add latency there. Everything
 * that's naturally request/response lives here instead:
 *
 *   GET  /api/v1/health        — versioned health check (mirrors /health)
 *   GET  /api/v1/ice-servers   — STUN + (optionally) time-limited TURN credentials
 *   GET  /api/v1/rooms/:code   — check if a room exists without joining it
 *
 * Future breaking changes get a new /api/v2 mounted alongside this one —
 * existing v1 clients keep working untouched.
 * ------------------------------------------------------------------
 */
'use strict';

const express = require('express');
const { buildIceServers } = require('./turn');

/**
 * @param {object} deps
 * @param {object} deps.CONFIG
 * @param {import('ioredis').Redis} deps.redis
 * @param {(code: string) => Promise<object|null>} deps.getRoomMeta
 * @param {(code: string) => Promise<number>} deps.getPeerCount
 * @param {(raw: string) => string} deps.normalizeCode
 */
function createApiRouter({ CONFIG, redis, getRoomMeta, getPeerCount, normalizeCode }) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    let redisOk = false;
    try {
      redisOk = (await redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }
    res.status(redisOk ? 200 : 503).json({
      status: redisOk ? 'ok' : 'degraded',
      service: 'p2pshare-signaling',
      version: CONFIG.API_VERSION,
      redis: redisOk ? 'connected' : 'disconnected',
      roomCapacity: CONFIG.ROOM_CAPACITY,
      timestamp: new Date().toISOString(),
    });
  });

  // Vends ICE servers (STUN always; TURN too if configured — see turn.js). The frontend
  // fetches this once per session instead of hardcoding servers/credentials in the JS
  // bundle, so TURN credentials can rotate/expire without a frontend redeploy.
  router.get('/ice-servers', (req, res) => {
    const { iceServers, ttlSeconds, turnEnabled } = buildIceServers(CONFIG);
    res.json({ iceServers, ttlSeconds, turnEnabled });
  });

  // Read-only existence/capacity check — lets a client validate a room code before
  // attempting to join. Deliberately returns no peer names or other room contents.
  router.get('/rooms/:code', async (req, res) => {
    const code = normalizeCode(req.params.code);
    if (!code || code.length !== CONFIG.ROOM_CODE_LENGTH) {
      return res.status(400).json({ error: 'INVALID_CODE', message: `Room code must be ${CONFIG.ROOM_CODE_LENGTH} characters.` });
    }
    const meta = await getRoomMeta(code);
    if (!meta) {
      return res.status(404).json({ exists: false });
    }
    const peerCount = await getPeerCount(code);
    res.json({
      exists: true,
      peerCount,
      maxPeers: CONFIG.ROOM_CAPACITY,
      full: peerCount >= CONFIG.ROOM_CAPACITY,
    });
  });

  return router;
}

module.exports = { createApiRouter };
