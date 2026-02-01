import { WebSocketServer } from "ws";
import crypto from "crypto";
import http from "http";

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      rooms: rooms.size,
      clients: clients.size,
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

httpServer.listen(8081, () => {
  console.log("✅ HTTP server running on :8081");
});

const wss = new WebSocketServer({ server: httpServer });
const clients = new Map(); // ws -> { roomId, userId, username }

// In-memory storage (replaces Redis)
const rooms = new Map(); // roomId -> { password, owner, users: Set, files: [], presence: Map }

wss.on("connection", ws => {

  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    /* ===== CREATE ROOM ===== */
    if (msg.type === "create-room") {
      const { roomId, password, username } = msg;

      if (rooms.has(roomId)) {
        ws.send(JSON.stringify({ type: "error", error: "Room already exists" }));
        return;
      }

      // Create new room
      rooms.set(roomId, {
        password,
        owner: username,
        users: new Set(),
        files: [],
        presence: new Map()
      });

      ws.send(JSON.stringify({ type: "room-created" }));
      return;
    }

    /* ===== JOIN ROOM ===== */
    if (msg.type === "join-room") {
      const { roomId, password, username } = msg;

      if (!rooms.has(roomId)) {
        ws.send(JSON.stringify({ type: "error", error: "Room does not exist" }));
        return;
      }

      const room = rooms.get(roomId);

      if (room.password !== password) {
        ws.send(JSON.stringify({ type: "error", error: "Wrong password" }));
        return;
      }

      // Check if username already exists in this room
      const existingUsernames = Array.from(room.presence.values());
      if (existingUsernames.includes(username)) {
        ws.send(JSON.stringify({ type: "error", error: "Username already taken in this room" }));
        return;
      }

      const userId = crypto.randomUUID();
      clients.set(ws, { roomId, userId, username });

      room.users.add(userId);
      room.presence.set(userId, username);

      const userCount = room.users.size;

      console.log(`User ${username} joined room ${roomId}, ${room.files.length} files in room`);

      ws.send(JSON.stringify({
        type: "room-state",
        userId,
        files: room.files,
        isOwner: username === room.owner,
        roomId,
        userCount,
        ownerName: room.owner
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

      const room = rooms.get(meta.roomId);
      if (!room) return;

      const file = {
        id: msg.fileId || crypto.randomUUID(),
        name: msg.name,
        size: msg.size,
        type: msg.fileType,
        ownerId: meta.userId,
        ownerName: meta.username,
        timestamp: Date.now()
      };

      room.files.unshift(file); // Add to beginning (newest first)
      broadcast(meta.roomId, { type: "file-added", file });
      return;
    }

    /* ===== REMOVE FILE ===== */
    if (msg.type === "remove-file") {
      const meta = clients.get(ws);
      if (!meta) return;

      const room = rooms.get(meta.roomId);
      if (!room) return;

      const fileIndex = room.files.findIndex(f => 
        f.id === msg.fileId && f.ownerId === meta.userId
      );

      if (fileIndex !== -1) {
        room.files.splice(fileIndex, 1);
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

      const room = rooms.get(meta.roomId);
      if (!room) return;

      if (meta.username !== room.owner) {
        ws.send(JSON.stringify({ type: "error", error: "Only owner can kill room" }));
        return;
      }

      // Delete room
      rooms.delete(meta.roomId);
      destroyRoom(meta.roomId);
    }
  });

  ws.on("close", () => {
    const meta = clients.get(ws);
    if (!meta) return;

    const room = rooms.get(meta.roomId);
    if (room) {
      room.users.delete(meta.userId);
      room.presence.delete(meta.userId);

      const userCount = room.users.size;

      // Notify others
      broadcast(meta.roomId, { 
        type: "user-left", 
        username: meta.username,
        userId: meta.userId,
        userCount 
      });

      // Delete room if empty
      if (room.users.size === 0) {
        rooms.delete(meta.roomId);
        console.log(`Room ${meta.roomId} deleted (empty)`);
      }
    }

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