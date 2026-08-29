/**
 * config.js — SINGLE SOURCE OF TRUTH for backend configuration.
 * ------------------------------------------------------------------
 * Every tunable value the signaling server uses lives here, sourced
 * from environment variables with sane local-dev defaults. server.js
 * (and any future module) requires() this file instead of reading
 * process.env directly — change a value once, here, and it reflects
 * everywhere the server runs (local, Docker Compose, Render, etc).
 * ------------------------------------------------------------------
 */
'use strict';

require('dotenv').config();

const CONFIG = {
  // Network
  PORT: parseInt(process.env.PORT || '8080', 10),
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  WS_PATH: '/ws',

  // Room lifecycle
  ROOM_TTL_SECONDS: parseInt(process.env.ROOM_TTL_SECONDS || '3600', 10),

  // Fixed room capacity — every room holds exactly this many peers max.
  ROOM_CAPACITY: parseInt(process.env.ROOM_CAPACITY || '5', 10),

  // Connection health
  HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),

  // Room codes
  ROOM_CODE_LENGTH: 6,
  // Ambiguous characters (0/O, 1/I/L) removed to keep codes easy to read & type aloud.
  ROOM_CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  ROOM_CODE_PREFIX: 'P2P-',

  // Misc limits
  MAX_NAME_LENGTH: 32,
  ROOM_CODE_GENERATION_ATTEMPTS: 20,

  // ---- REST API ----
  API_VERSION: 'v1',

  // ---- ICE / TURN ----
  // STUN alone cannot traverse every NAT combination — notably symmetric NAT, which is
  // common on mobile carrier networks and phone WiFi hotspots. Without a TURN relay,
  // two peers behind incompatible NATs will show "connection failed" even though
  // signaling succeeds. Configure TURN_URLS + either TURN_SECRET (time-limited HMAC
  // credentials, recommended) or TURN_STATIC_USERNAME/TURN_STATIC_CREDENTIAL to fix this.
  // Leave TURN_URLS empty to keep STUN-only behavior.
  STUN_URLS: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  TURN_URLS: (process.env.TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  TURN_SECRET: process.env.TURN_SECRET || '',
  TURN_STATIC_USERNAME: process.env.TURN_STATIC_USERNAME || '',
  TURN_STATIC_CREDENTIAL: process.env.TURN_STATIC_CREDENTIAL || '',
  // Time-limited credentials expire after this many seconds (coturn REST API convention).
  TURN_CREDENTIAL_TTL_SECONDS: parseInt(process.env.TURN_CREDENTIAL_TTL_SECONDS || '3600', 10),
};

module.exports = CONFIG;
