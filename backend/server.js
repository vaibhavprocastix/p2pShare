import { WebSocketServer } from "ws";
import http from "http";
import crypto from "crypto";
import { redis, connectRedis } from "./redis.js";

await connectRedis();

/* ---------- HTTP SERVER ---------- */
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});
server.listen(8081);

/* ---------- WEBSOCKET ---------- */
const wss = new WebSocketServer({ server });
const sockets = new Map(); // ws -> { userId, roomId, username }

/* ---------- REDIS KEYS ---------- */
/*
room:{roomId} -> {
  ownerId,
  ownerName,
  password,
  alive: "1"
}

room:{roomId}:users -> hash(userId -> username)
room:{roomId}:files -> list(JSON)
*/

wss.on("connection", ws => {

  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    /* ===== CREATE ROOM ===== */
    if (msg.type === "create-room") {
      const { roomId, password, username } = msg;

      if (await redis.exists(`room:${roomId}`)) {
        return ws.send(JSON.stringify({ type: "error", error: "Room already exists" }));
      }

      const ownerId = crypto.randomUUID();

      await redis.hSet(`room:${roomId}`, {
        ownerId,
        ownerName: username,
        password,
        alive: "1"
      });

      await redis.hSet(`room:${roomId}:users`, ownerId, username);

      sockets.set(ws, { userId: ownerId, roomId, username });

      ws.send(JSON.stringify({
        type: "room-state",
        userId: ownerId,
        isOwner: true,
        ownerName: username,
        files: [],
        userCount: 1
      }));

      return;
    }

    /* ===== JOIN ROOM ===== */
    if (msg.type === "join-room") {
      const { roomId, password, username } = msg;

      const room = await redis.hGetAll(`room:${roomId}`);
      if (!room.alive) {
        return ws.send(JSON.stringify({ type: "error", error: "Room does not exist" }));
      }
      if (room.password !== password) {
        return ws.send(JSON.stringify({ type: "error", error: "Wrong password" }));
      }

      const userId = crypto.randomUUID();
      await redis.hSet(`room:${roomId}:users`, userId, username);

      sockets.set(ws, { userId, roomId, username });

      const files = (await redis.lRange(`room:${roomId}:files`, 0, -1))
        .map(JSON.parse);

      const userCount = await redis.hLen(`room:${roomId}:users`);

      ws.send(JSON.stringify({
        type: "room-state",
        userId,
        isOwner: false,
        ownerName: room.ownerName,
        files,
        userCount
      }));

      broadcast(roomId, {
        type: "user-joined",
        userCount
      }, ws);

      return;
    }

    /* ===== ADD FILE ===== */
    if (msg.type === "add-file") {
      const meta = sockets.get(ws);
      if (!meta) return;

      const file = {
        id: msg.fileId,
        name: msg.name,
        size: msg.size,
        type: msg.fileType,
        ownerId: meta.userId,
        ownerName: meta.username,
        timestamp: Date.now()
      };

      await redis.lPush(`room:${meta.roomId}:files`, JSON.stringify(file));

      broadcast(meta.roomId, { type: "file-added", file });
      return;
    }

    /* ===== REMOVE FILE ===== */
    if (msg.type === "remove-file") {
      const meta = sockets.get(ws);
      if (!meta) return;

      const files = await redis.lRange(`room:${meta.roomId}:files`, 0, -1);
      await redis.del(`room:${meta.roomId}:files`);

      for (const f of files) {
        const parsed = JSON.parse(f);
        if (!(parsed.id === msg.fileId && parsed.ownerId === meta.userId)) {
          await redis.rPush(`room:${meta.roomId}:files`, f);
        }
      }

      broadcast(meta.roomId, { type: "file-removed", fileId: msg.fileId });
      return;
    }

    /* ===== SIGNAL ===== */
    if (msg.type === "signal") {
      const meta = sockets.get(ws);
      if (!meta) return;

      for (const [targetWs, targetMeta] of sockets) {
        if (targetMeta.roomId === meta.roomId &&
            targetMeta.userId === msg.target) {
          targetWs.send(JSON.stringify({ ...msg, from: meta.userId }));
          return;
        }
      }

      if (msg.action === "request") {
        ws.send(JSON.stringify({
          type: "signal",
          action: "error",
          error: "Peer not online"
        }));
      }
    }

    /* ===== KILL ROOM ===== */
    if (msg.type === "kill-room") {
      const meta = sockets.get(ws);
      if (!meta) return;

      const room = await redis.hGetAll(`room:${meta.roomId}`);
      if (room.ownerId !== meta.userId) {
        return ws.send(JSON.stringify({ type: "error", error: "Only owner can kill room" }));
      }

      await redis.del(
        `room:${meta.roomId}`,
        `room:${meta.roomId}:users`,
        `room:${meta.roomId}:files`
      );

      destroyRoom(meta.roomId);
    }
  });

  ws.on("close", async () => {
    const meta = sockets.get(ws);
    if (!meta) return;

    await redis.hDel(`room:${meta.roomId}:users`, meta.userId);
    sockets.delete(ws);

    const count = await redis.hLen(`room:${meta.roomId}:users`);
    broadcast(meta.roomId, { type: "user-left", userCount: count });
  });
});

/* ---------- HELPERS ---------- */
function broadcast(roomId, msg, except) {
  for (const [ws, meta] of sockets) {
    if (meta.roomId === roomId && ws !== except) {
      ws.send(JSON.stringify(msg));
    }
  }
}

function destroyRoom(roomId) {
  for (const [ws, meta] of sockets) {
    if (meta.roomId === roomId) {
      ws.send(JSON.stringify({ type: "room-killed" }));
      ws.close();
    }
  }
}
