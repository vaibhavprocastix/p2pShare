import { WebSocketServer } from "ws";
import crypto from "crypto";
import { connectRedis, redis } from "./redis.js";

await connectRedis();

const wss = new WebSocketServer({ port: 8081 });
const clients = new Map(); // ws -> { roomId, userId, username }

wss.on("connection", ws => {

  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    /* ===== CREATE ROOM ===== */
    if (msg.type === "create-room") {
      const { roomId, password, username } = msg;
      const key = `room:${roomId}`;

      if (await redis.exists(key)) {
        ws.send(JSON.stringify({ type: "error", error: "Room already exists" }));
        return;
      }

      // Ensure clean slate - delete any orphaned data
      await redis.del(key);
      await redis.del(`${key}:users`);
      await redis.del(`${key}:files`);
      await redis.del(`${key}:presence`);

      // Create fresh room
      await redis.hSet(key, { password, owner: username });

      ws.send(JSON.stringify({ type: "room-created" }));
      return;
    }

    /* ===== JOIN ROOM ===== */
    if (msg.type === "join-room") {
      const { roomId, password, username } = msg;
      const key = `room:${roomId}`;

      if (!(await redis.exists(key))) {
        ws.send(JSON.stringify({ type: "error", error: "Room does not exist" }));
        return;
      }

      if ((await redis.hGet(key, "password")) !== password) {
        ws.send(JSON.stringify({ type: "error", error: "Wrong password" }));
        return;
      }

      // Check if username already exists in this room
      const existingUsers = await redis.hGetAll(`${key}:presence`);
      const usernames = Object.values(existingUsers);
      
      if (usernames.includes(username)) {
        ws.send(JSON.stringify({ type: "error", error: "Username already taken in this room" }));
        return;
      }

      const userId = crypto.randomUUID();
      clients.set(ws, { roomId, userId, username });

      await redis.sAdd(`${key}:users`, userId);
      await redis.hSet(`${key}:presence`, userId, username);

      // Get files list
      const filesRaw = await redis.lRange(`${key}:files`, 0, -1);
      const files = filesRaw.map(f => {
        try {
          return JSON.parse(f);
        } catch (e) {
          console.error("Error parsing file:", e);
          return null;
        }
      }).filter(Boolean);

      const ownerName = await redis.hGet(key, "owner");
      const userCount = await redis.sCard(`${key}:users`);

      console.log(`User ${username} joined room ${roomId}, ${files.length} files in room`);

      ws.send(JSON.stringify({
        type: "room-state",
        userId,
        files,
        isOwner: username === ownerName,
        roomId,
        userCount,
        ownerName
      }));

      // Notify others
      broadcast(roomId, { 
        type: "user-joined", 
        username,
        userCount 
      }, ws);

      return;
    }

    /* ===== ADD FILE ===== */
    if (msg.type === "add-file") {
      const meta = clients.get(ws);
      if (!meta) return;

      const key = `room:${meta.roomId}`;
      if (!(await redis.exists(key))) return;

      const file = {
        id: msg.fileId || crypto.randomUUID(),
        name: msg.name,
        size: msg.size,
        type: msg.fileType,
        ownerId: meta.userId,
        ownerName: meta.username,
        timestamp: Date.now()
      };

      await redis.lPush(`${key}:files`, JSON.stringify(file));
      broadcast(meta.roomId, { type: "file-added", file });
      return;
    }

    /* ===== REMOVE FILE ===== */
    if (msg.type === "remove-file") {
      const meta = clients.get(ws);
      if (!meta) return;

      const key = `room:${meta.roomId}`;
      const files = await redis.lRange(`${key}:files`, 0, -1);
      
      const fileToRemove = files.find(f => {
        const parsed = JSON.parse(f);
        return parsed.id === msg.fileId && parsed.ownerId === meta.userId;
      });

      if (fileToRemove) {
        await redis.lRem(`${key}:files`, 1, fileToRemove);
        broadcast(meta.roomId, { 
          type: "file-removed", 
          fileId: msg.fileId 
        });
      }
      return;
    }

    /* ===== SIGNAL (WebRTC) ===== */
    if (msg.type === "signal") {
      const meta = clients.get(ws);
      if (!meta) return;

      // Forward signal to target peer
      let targetFound = false;
      for (const [targetWs, targetMeta] of clients) {
        if (targetMeta.roomId === meta.roomId && 
            targetMeta.userId === msg.target) {
          targetWs.send(JSON.stringify({
            ...msg,
            from: meta.userId
          }));
          targetFound = true;
          break;
        }
      }

      // If target not found and it's a request, send error back
      if (!targetFound && msg.action === "request") {
        ws.send(JSON.stringify({
          type: "signal",
          action: "error",
          error: "Can't download file. Sender not online."
        }));
      }
    }

    /* ===== KILL ROOM ===== */
    if (msg.type === "kill-room") {
      const meta = clients.get(ws);
      if (!meta) return;

      const key = `room:${meta.roomId}`;
      const ownerName = await redis.hGet(key, "owner");
      
      if (meta.username !== ownerName) {
        ws.send(JSON.stringify({ type: "error", error: "Only owner can kill room" }));
        return;
      }

      // Delete all room data from Redis
      await redis.del(key);
      await redis.del(`${key}:users`);
      await redis.del(`${key}:files`);
      await redis.del(`${key}:presence`);
      
      destroyRoom(meta.roomId);
    }
  });

  ws.on("close", async () => {
    const meta = clients.get(ws);
    if (!meta) return;

    const key = `room:${meta.roomId}`;
    await redis.sRem(`${key}:users`, meta.userId);
    await redis.hDel(`${key}:presence`, meta.userId);

    const userCount = await redis.sCard(`${key}:users`);

    // Notify others
    broadcast(meta.roomId, { 
      type: "user-left", 
      username: meta.username,
      userId: meta.userId,
      userCount 
    });

    clients.delete(ws);
  });
});

function broadcast(roomId, msg, except) {
  for (const [ws, meta] of clients) {
    if (meta.roomId === roomId && ws !== except) {
      ws.send(JSON.stringify(msg));
    }
  }
}

function destroyRoom(roomId) {
  for (const [ws, meta] of clients) {
    if (meta.roomId === roomId) {
      ws.send(JSON.stringify({ type: "room-killed" }));
      ws.close();
      clients.delete(ws);
    }
  }
}

console.log("✅ Signaling server running on :8081");