/**
 * p2pShare — Ephemeral WebSocket Signaling & Presence Server
 * ------------------------------------------------------------------
 * This server NEVER touches file bytes. Its job is:
 *   1. Room lifecycle management (create / join / leave / destroy)
 *   2. Relaying WebRTC signaling payloads (SDP offers/answers, ICE candidates)
 *      between browsers so they can establish a direct peer-to-peer
 *      RTCDataChannel mesh.
 *   3. Presence bookkeeping in Redis with short TTLs so abandoned rooms
 *      self-clean without any cron job or manual intervention.
 *   4. Tracking which FILES have been shared in a room — metadata only
 *      (fileId/name/size/mimeType/uploader). The actual bytes are only
 *      ever exchanged browser-to-browser, on demand, when a peer clicks
 *      "Download" for a specific file.
 *
 * All tunables (port, Redis URL, room capacity, TTLs, etc.) live in
 * ./config.js — change a value there once and it applies everywhere.
 *
 * Stack: Node.js, Express (HTTP + /health), ws (WebSocket), ioredis (Redis)
 * ------------------------------------------------------------------
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const Redis = require('ioredis');
const CONFIG = require('./config');
const { createApiRouter } = require('./api');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(level, msg, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  if (meta) {
    console.log(line, JSON.stringify(meta));
  } else {
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------
const redis = new Redis(CONFIG.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
  lazyConnect: false,
});

redis.on('connect', () => log('info', 'Redis connected', { url: redacted(CONFIG.REDIS_URL) }));
redis.on('error', (err) => log('error', 'Redis error', { message: err.message }));

function redacted(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return 'redis://***';
  }
}

// ---------------------------------------------------------------------------
// Redis key helpers
//   room:{code}:meta   -> HASH  { hostId, hostName, maxPeers, createdAt }
//   room:{code}:peers  -> HASH  { peerId: JSON({ name, joinedAt, isHost }) }
//   room:{code}:files  -> HASH  { fileId: JSON({ fileName, fileSize, mimeType,
//                                                 uploaderId, uploaderName, sharedAt }) }
// All three keys carry a rolling TTL of ROOM_TTL_SECONDS, refreshed on every
// mutating action so active rooms never expire mid-session while abandoned
// ones vanish automatically.
// ---------------------------------------------------------------------------
const metaKey = (code) => `room:${code}:meta`;
const peersKey = (code) => `room:${code}:peers`;
const filesKey = (code) => `room:${code}:files`;

async function touchRoomTTL(code) {
  const pipeline = redis.pipeline();
  pipeline.expire(metaKey(code), CONFIG.ROOM_TTL_SECONDS);
  pipeline.expire(peersKey(code), CONFIG.ROOM_TTL_SECONDS);
  pipeline.expire(filesKey(code), CONFIG.ROOM_TTL_SECONDS);
  await pipeline.exec();
}

async function roomExists(code) {
  const exists = await redis.exists(metaKey(code));
  return exists === 1;
}

async function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < CONFIG.ROOM_CODE_GENERATION_ATTEMPTS; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(CONFIG.ROOM_CODE_LENGTH);
    for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
      code += CONFIG.ROOM_CODE_ALPHABET[bytes[i] % CONFIG.ROOM_CODE_ALPHABET.length];
    }
    if (!(await roomExists(code))) return code;
  }
  throw new Error(`Failed to allocate a unique room code after ${CONFIG.ROOM_CODE_GENERATION_ATTEMPTS} attempts`);
}

function displayCode(code) {
  return `${CONFIG.ROOM_CODE_PREFIX}${code}`;
}

function normalizeCode(raw) {
  if (!raw) return '';
  const prefix = CONFIG.ROOM_CODE_PREFIX;
  return String(raw).trim().toUpperCase().replace(new RegExp(`^${prefix}`), '');
}

// ---------------------------------------------------------------------------
// In-memory connection registry (process-local; ws sockets cannot be shared
// across instances). For horizontal scaling beyond a single Node process,
// swap this for a Redis Pub/Sub fan-out — see README_ARCHITECTURE.md.
// ---------------------------------------------------------------------------
/** roomCode -> Map<peerId, WebSocket> */
const roomSockets = new Map();
/** ws -> { peerId, roomCode, peerName, isHost } */
const clientState = new WeakMap();

function registerSocket(roomCode, peerId, ws) {
  if (!roomSockets.has(roomCode)) roomSockets.set(roomCode, new Map());
  roomSockets.get(roomCode).set(peerId, ws);
}

function unregisterSocket(roomCode, peerId) {
  const bucket = roomSockets.get(roomCode);
  if (!bucket) return;
  bucket.delete(peerId);
  if (bucket.size === 0) roomSockets.delete(roomCode);
}

function getRoomSocketMap(roomCode) {
  return roomSockets.get(roomCode) || new Map();
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToRoom(roomCode, payload, excludePeerId) {
  const bucket = getRoomSocketMap(roomCode);
  for (const [peerId, sock] of bucket.entries()) {
    if (peerId === excludePeerId) continue;
    safeSend(sock, payload);
  }
}

function sendError(ws, code, message, extra) {
  safeSend(ws, { type: 'ERROR', code, message, ...(extra || {}) });
}

// ---------------------------------------------------------------------------
// Peer / room data access helpers
// ---------------------------------------------------------------------------
async function getRoomMeta(code) {
  const data = await redis.hgetall(metaKey(code));
  if (!data || Object.keys(data).length === 0) return null;
  return {
    hostId: data.hostId,
    hostName: data.hostName,
    maxPeers: parseInt(data.maxPeers, 10),
    createdAt: parseInt(data.createdAt, 10),
  };
}

async function getRoomPeers(code) {
  const data = await redis.hgetall(peersKey(code));
  const peers = [];
  for (const [peerId, json] of Object.entries(data || {})) {
    try {
      peers.push({ peerId, ...JSON.parse(json) });
    } catch {
      /* skip malformed record */
    }
  }
  peers.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  return peers;
}

async function getPeerCount(code) {
  return redis.hlen(peersKey(code));
}

async function addPeer(code, peerId, name, isHost) {
  const record = JSON.stringify({ name, joinedAt: Date.now(), isHost: !!isHost });
  await redis.hset(peersKey(code), peerId, record);
  await touchRoomTTL(code);
}

async function removePeer(code, peerId) {
  await redis.hdel(peersKey(code), peerId);
  await touchRoomTTL(code);
}

async function destroyRoom(code) {
  await redis.del(metaKey(code), peersKey(code), filesKey(code));
}

// ---- File registry (metadata only — never file bytes) ---------------------
async function getRoomFiles(code) {
  const data = await redis.hgetall(filesKey(code));
  const files = [];
  for (const [fileId, json] of Object.entries(data || {})) {
    try {
      files.push({ fileId, ...JSON.parse(json) });
    } catch {
      /* skip malformed record */
    }
  }
  files.sort((a, b) => (a.sharedAt || 0) - (b.sharedAt || 0));
  return files;
}

async function addFile(code, fileId, record) {
  await redis.hset(filesKey(code), fileId, JSON.stringify(record));
  await touchRoomTTL(code);
}

async function getFile(code, fileId) {
  const json = await redis.hget(filesKey(code), fileId);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function removeFile(code, fileId) {
  await redis.hdel(filesKey(code), fileId);
  await touchRoomTTL(code);
}

/** Remove every file uploaded by peerId (called when that peer leaves/disconnects). Returns removed fileIds. */
async function removeFilesByUploader(code, peerId) {
  const files = await getRoomFiles(code);
  const mine = files.filter((f) => f.uploaderId === peerId);
  if (mine.length === 0) return [];
  const pipeline = redis.pipeline();
  mine.forEach((f) => pipeline.hdel(filesKey(code), f.fileId));
  await pipeline.exec();
  return mine.map((f) => f.fileId);
}

// ---------------------------------------------------------------------------
// Express app (HTTP surface: health check only — everything else is WS)
// ---------------------------------------------------------------------------
const app = express();
app.use(cors({ origin: CONFIG.CORS_ORIGIN }));
app.use(express.json());

app.get('/health', async (req, res) => {
  let redisOk = false;
  try {
    redisOk = (await redis.ping()) === 'PONG';
  } catch {
    redisOk = false;
  }
  const activeRooms = roomSockets.size;
  let activeConnections = 0;
  for (const bucket of roomSockets.values()) activeConnections += bucket.size;

  res.status(redisOk ? 200 : 503).json({
    status: redisOk ? 'ok' : 'degraded',
    service: 'p2pshare-signaling',
    redis: redisOk ? 'connected' : 'disconnected',
    roomCapacity: CONFIG.ROOM_CAPACITY,
    activeRooms,
    activeConnections,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({ service: 'p2pShare signaling server', status: 'running' });
});

// Versioned REST API — see api.js for what lives here vs. on the WebSocket.
app.use(
  `/api/${CONFIG.API_VERSION}`,
  createApiRouter({ CONFIG, redis, getRoomMeta, getPeerCount, normalizeCode })
);

const server = http.createServer(app);

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: CONFIG.WS_PATH });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  clientState.set(ws, { peerId: null, roomCode: null, peerName: null, isHost: false });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendError(ws, 'BAD_JSON', 'Message payload must be valid JSON.');
    }
    if (!msg || typeof msg.type !== 'string') {
      return sendError(ws, 'BAD_MESSAGE', 'Message must include a string "type" field.');
    }

    try {
      switch (msg.type) {
        case 'CREATE_ROOM':
          await handleCreateRoom(ws, msg);
          break;
        case 'JOIN_ROOM':
          await handleJoinRoom(ws, msg);
          break;
        case 'LEAVE_ROOM':
          await handleLeaveRoom(ws);
          break;
        case 'DELETE_ROOM':
          await handleDeleteRoom(ws);
          break;
        case 'KICK_PEER':
          await handleKickPeer(ws, msg);
          break;
        case 'SDP_OFFER':
        case 'SDP_ANSWER':
        case 'ICE_CANDIDATE':
          await handleRelay(ws, msg);
          break;
        case 'FILE_SHARE':
          await handleFileShare(ws, msg);
          break;
        case 'FILE_DELETE':
          await handleFileDelete(ws, msg);
          break;
        case 'PING':
          safeSend(ws, { type: 'PONG', ts: Date.now() });
          break;
        default:
          sendError(ws, 'UNKNOWN_TYPE', `Unrecognized message type: ${msg.type}`);
      }
    } catch (err) {
      log('error', 'Handler error', { type: msg.type, message: err.message });
      sendError(ws, 'SERVER_ERROR', 'An internal error occurred while processing your request.');
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws).catch((err) => log('error', 'Disconnect cleanup failed', { message: err.message }));
  });

  ws.on('error', (err) => {
    log('warn', 'WebSocket error', { message: err.message });
  });
});

// Heartbeat: terminate dead connections, keep NAT/proxy timeouts happy.
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      handleDisconnect(ws).catch(() => {});
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, CONFIG.HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeatTimer));

// ---------------------------------------------------------------------------
// Message handlers — room lifecycle
// ---------------------------------------------------------------------------

async function handleCreateRoom(ws, msg) {
  const state = clientState.get(ws);
  if (state.roomCode) {
    return sendError(ws, 'ALREADY_IN_ROOM', 'This connection is already inside a room.');
  }

  const peerName = sanitizeName(msg.peerName) || 'Host';
  // Room capacity is fixed by server config — clients cannot override it.
  const maxPeers = CONFIG.ROOM_CAPACITY;

  const code = await generateUniqueRoomCode();
  const peerId = crypto.randomUUID();

  await redis.hset(metaKey(code), {
    hostId: peerId,
    hostName: peerName,
    maxPeers: String(maxPeers),
    createdAt: String(Date.now()),
  });
  await addPeer(code, peerId, peerName, true);
  await touchRoomTTL(code);

  state.peerId = peerId;
  state.roomCode = code;
  state.peerName = peerName;
  state.isHost = true;
  registerSocket(code, peerId, ws);

  safeSend(ws, {
    type: 'ROOM_CREATED',
    roomCode: code,
    displayCode: displayCode(code),
    peerId,
    isHost: true,
    maxPeers,
    peers: [{ peerId, name: peerName, isHost: true }],
    files: [],
  });

  log('info', 'Room created', { room: code, host: peerId, maxPeers });
}

async function handleJoinRoom(ws, msg) {
  const state = clientState.get(ws);
  if (state.roomCode) {
    return sendError(ws, 'ALREADY_IN_ROOM', 'This connection is already inside a room.');
  }

  const code = normalizeCode(msg.roomCode);
  if (!code || code.length !== CONFIG.ROOM_CODE_LENGTH) {
    return sendError(ws, 'INVALID_CODE', `Room code must be ${CONFIG.ROOM_CODE_LENGTH} characters, e.g. ${displayCode('7X9AK2')}.`);
  }

  const meta = await getRoomMeta(code);
  if (!meta) {
    return sendError(ws, 'ROOM_NOT_FOUND', `Room ${displayCode(code)} does not exist or has expired.`);
  }

  const currentCount = await getPeerCount(code);
  if (currentCount >= CONFIG.ROOM_CAPACITY) {
    return sendError(ws, 'ROOM_FULL', `Room ${displayCode(code)} is full (${CONFIG.ROOM_CAPACITY} peer limit).`);
  }

  const peerName = sanitizeName(msg.peerName) || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  const peerId = crypto.randomUUID();

  const existingPeers = await getRoomPeers(code);
  const existingFiles = await getRoomFiles(code);
  await addPeer(code, peerId, peerName, false);

  state.peerId = peerId;
  state.roomCode = code;
  state.peerName = peerName;
  state.isHost = false;
  registerSocket(code, peerId, ws);

  safeSend(ws, {
    type: 'ROOM_JOINED',
    roomCode: code,
    displayCode: displayCode(code),
    peerId,
    isHost: false,
    maxPeers: CONFIG.ROOM_CAPACITY,
    hostId: meta.hostId,
    peers: existingPeers, // peers already present BEFORE this join — used to initiate mesh offers
    files: existingFiles, // files already shared in the room — rendered immediately with Download buttons
  });

  broadcastToRoom(
    code,
    {
      type: 'PEER_JOINED',
      peerId,
      name: peerName,
      isHost: false,
      peerCount: currentCount + 1,
      maxPeers: CONFIG.ROOM_CAPACITY,
    },
    peerId
  );

  log('info', 'Peer joined room', { room: code, peer: peerId, count: currentCount + 1 });
}

async function handleLeaveRoom(ws) {
  const state = clientState.get(ws);
  if (!state.roomCode) return;
  const { roomCode, peerId, isHost } = state;

  if (isHost) {
    // Host leaving voluntarily (without explicit delete) still tears the room
    // down for everyone, since there is no host hand-off mechanism.
    await teardownRoom(roomCode, 'HOST_LEFT');
  } else {
    await removePeer(roomCode, peerId);
    unregisterSocket(roomCode, peerId);
    await cascadeRemoveFiles(roomCode, peerId);
    const remaining = await getPeerCount(roomCode);
    broadcastToRoom(roomCode, { type: 'PEER_LEFT', peerId, peerCount: remaining }, peerId);
    log('info', 'Peer left room', { room: roomCode, peer: peerId, remaining });
  }

  resetState(ws);
  safeSend(ws, { type: 'LEFT_ROOM' });
}

async function handleDeleteRoom(ws) {
  const state = clientState.get(ws);
  if (!state.roomCode) {
    return sendError(ws, 'NOT_IN_ROOM', 'You are not currently in a room.');
  }
  if (!state.isHost) {
    return sendError(ws, 'FORBIDDEN', 'Only the room host can delete the room.');
  }
  const { roomCode } = state;
  await teardownRoom(roomCode, 'HOST_DELETED');
  resetState(ws);
  log('info', 'Room deleted by host', { room: roomCode });
}

/** Broadcasts ROOM_DESTROYED to every participant, clears sockets & Redis state. */
async function teardownRoom(roomCode, reason) {
  broadcastToRoom(roomCode, { type: 'ROOM_DESTROYED', roomCode, reason });
  const bucket = getRoomSocketMap(roomCode);
  for (const [, sock] of bucket.entries()) {
    const s = clientState.get(sock);
    if (s) resetState(sock);
    if (sock.readyState === WebSocket.OPEN) {
      sock.close(4000, reason);
    }
  }
  roomSockets.delete(roomCode);
  await destroyRoom(roomCode);
}

/**
 * Host-only: forcibly remove one specific peer from the room. Unlike DELETE_ROOM,
 * the room itself survives — only the targeted peer is evicted. Mirrors the same
 * cleanup a voluntary LEAVE_ROOM triggers (peer record removed, their shared files
 * cascade-removed, remaining peers notified) plus a distinct KICKED notice sent to
 * the removed peer so their client can show why they landed back on the Landing screen.
 */
async function handleKickPeer(ws, msg) {
  const state = clientState.get(ws);
  if (!state.roomCode) {
    return sendError(ws, 'NOT_IN_ROOM', 'You are not currently in a room.');
  }
  if (!state.isHost) {
    return sendError(ws, 'FORBIDDEN', 'Only the room host can remove peers.');
  }
  const { targetPeerId } = msg;
  if (!targetPeerId) {
    return sendError(ws, 'BAD_MESSAGE', 'targetPeerId is required.');
  }
  if (targetPeerId === state.peerId) {
    return sendError(ws, 'BAD_MESSAGE', 'Use Delete Room to end the session for everyone, including yourself.');
  }

  const { roomCode } = state;
  const bucket = getRoomSocketMap(roomCode);
  const targetSocket = bucket.get(targetPeerId);
  if (!targetSocket) {
    return sendError(ws, 'PEER_NOT_FOUND', 'That peer is not connected to this room.');
  }

  safeSend(targetSocket, { type: 'KICKED', roomCode, reason: 'HOST_REMOVED_YOU' });

  await removePeer(roomCode, targetPeerId);
  unregisterSocket(roomCode, targetPeerId);
  await cascadeRemoveFiles(roomCode, targetPeerId);
  resetState(targetSocket);
  if (targetSocket.readyState === WebSocket.OPEN) {
    targetSocket.close(4001, 'KICKED');
  }

  const remaining = await getPeerCount(roomCode);
  broadcastToRoom(roomCode, { type: 'PEER_LEFT', peerId: targetPeerId, peerCount: remaining });

  log('info', 'Peer kicked by host', { room: roomCode, kicked: targetPeerId, host: state.peerId });
}

async function handleRelay(ws, msg) {
  const state = clientState.get(ws);
  if (!state.roomCode || !state.peerId) {
    return sendError(ws, 'NOT_IN_ROOM', 'You must join a room before signaling.');
  }
  const { targetPeerId } = msg;
  if (!targetPeerId) {
    return sendError(ws, 'BAD_MESSAGE', 'targetPeerId is required for signaling relay.');
  }
  const bucket = getRoomSocketMap(state.roomCode);
  const targetSocket = bucket.get(targetPeerId);
  if (!targetSocket) {
    return sendError(ws, 'PEER_NOT_FOUND', `Peer ${targetPeerId} is not connected to this room.`);
  }

  // Forward as-is, stamping the true sender so the recipient cannot be spoofed.
  const forwarded = { ...msg, fromPeerId: state.peerId };
  delete forwarded.targetPeerId;
  forwarded.targetPeerId = targetPeerId;
  safeSend(targetSocket, forwarded);
  await touchRoomTTL(state.roomCode);
}

// ---------------------------------------------------------------------------
// Message handlers — shared file registry (metadata only; bytes go over WebRTC)
// ---------------------------------------------------------------------------

async function handleFileShare(ws, msg) {
  const state = clientState.get(ws);
  if (!state.roomCode || !state.peerId) {
    return sendError(ws, 'NOT_IN_ROOM', 'You must join a room before sharing a file.');
  }
  const { fileId, fileName, fileSize, mimeType } = msg;
  if (!fileId || !fileName || typeof fileSize !== 'number') {
    return sendError(ws, 'BAD_MESSAGE', 'fileId, fileName, and numeric fileSize are required.');
  }

  const record = {
    fileName: String(fileName).slice(0, 255),
    fileSize,
    mimeType: mimeType || 'application/octet-stream',
    uploaderId: state.peerId,
    uploaderName: state.peerName,
    sharedAt: Date.now(),
  };
  await addFile(state.roomCode, fileId, record);

  broadcastToRoom(state.roomCode, { type: 'FILE_SHARED', fileId, ...record }, state.peerId);
  log('info', 'File shared', { room: state.roomCode, fileId, uploader: state.peerId, fileName: record.fileName });
}

async function handleFileDelete(ws, msg) {
  const state = clientState.get(ws);
  if (!state.roomCode || !state.peerId) {
    return sendError(ws, 'NOT_IN_ROOM', 'You must join a room before deleting a file.');
  }
  const { fileId } = msg;
  if (!fileId) {
    return sendError(ws, 'BAD_MESSAGE', 'fileId is required.');
  }
  const record = await getFile(state.roomCode, fileId);
  if (!record) {
    return sendError(ws, 'FILE_NOT_FOUND', 'That file no longer exists in this room.');
  }
  if (record.uploaderId !== state.peerId) {
    return sendError(ws, 'FORBIDDEN', 'Only the uploader can delete this file.');
  }
  await removeFile(state.roomCode, fileId);
  broadcastToRoom(state.roomCode, { type: 'FILE_REMOVED', fileId }, state.peerId);
  log('info', 'File deleted', { room: state.roomCode, fileId, uploader: state.peerId });
}

/** When a peer leaves/disconnects, their shared files are no longer downloadable — remove & notify. */
async function cascadeRemoveFiles(roomCode, peerId) {
  const removedIds = await removeFilesByUploader(roomCode, peerId);
  removedIds.forEach((fileId) => {
    broadcastToRoom(roomCode, { type: 'FILE_REMOVED', fileId });
  });
  return removedIds;
}

// ---------------------------------------------------------------------------
// Disconnect handling
// ---------------------------------------------------------------------------
async function handleDisconnect(ws) {
  const state = clientState.get(ws);
  if (!state || !state.roomCode) return;
  const { roomCode, peerId, isHost } = state;

  if (isHost) {
    await teardownRoom(roomCode, 'HOST_DISCONNECTED');
  } else {
    await removePeer(roomCode, peerId);
    unregisterSocket(roomCode, peerId);
    await cascadeRemoveFiles(roomCode, peerId);
    const remaining = await getPeerCount(roomCode).catch(() => 0);
    broadcastToRoom(roomCode, { type: 'PEER_LEFT', peerId, peerCount: remaining }, peerId);
    log('info', 'Peer disconnected', { room: roomCode, peer: peerId });
  }
  resetState(ws);
}

function resetState(ws) {
  clientState.set(ws, { peerId: null, roomCode: null, peerName: null, isHost: false });
}

function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, CONFIG.MAX_NAME_LENGTH).replace(/[<>"'`]/g, '');
}

// ---------------------------------------------------------------------------
// Boot & graceful shutdown
// ---------------------------------------------------------------------------
server.listen(CONFIG.PORT, () => {
  log('info', `p2pShare signaling server listening on :${CONFIG.PORT}`, {
    roomTtl: CONFIG.ROOM_TTL_SECONDS,
    roomCapacity: CONFIG.ROOM_CAPACITY,
  });
});

function shutdown(signal) {
  log('info', `Received ${signal}, shutting down gracefully...`);
  clearInterval(heartbeatTimer);
  wss.clients.forEach((ws) => ws.close(1001, 'SERVER_SHUTDOWN'));
  server.close(() => {
    redis.quit().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
