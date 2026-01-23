import { WebSocketServer } from "ws";
import crypto from "crypto";
import { redis } from "./redis.js";

const wss = new WebSocketServer({ port: 8081 });
const MAX_USERS = 50;

const clients = new Map(); // ws → { roomId, userId }

wss.on("connection", ws => {

  ws.on("message", async raw => {
    const msg = JSON.parse(raw);

    /* ================= JOIN ROOM ================= */
    if (msg.type === "join-room") {
      const { roomId, password, username } = msg;

      const roomKey = `room:${roomId}`;
      const exists = await redis.exists(roomKey);

      if (!exists) {
        await redis.hSet(roomKey, {
          password,
          owner: username
        });
        await redis.del(`${roomKey}:users`, `${roomKey}:files`);
      }

      const roomPassword = await redis.hGet(roomKey, "password");
      if (roomPassword !== password) {
        ws.send(JSON.stringify({ type: "error", error: "Invalid password" }));
        return;
      }

      const userCount = await redis.sCard(`${roomKey}:users`);
      if (userCount >= MAX_USERS) {
        ws.send(JSON.stringify({ type: "error", error: "Room full" }));
        return;
      }

      const userId = crypto.randomUUID();
      clients.set(ws, { roomId, userId });

      await redis.sAdd(`${roomKey}:users`, userId);
      await redis.hSet(`${roomKey}:presence`, userId, username);

      const files = await redis.lRange(`${roomKey}:files`, 0, -1);
      ws.send(JSON.stringify({
        type: "room-state",
        files: files.map(JSON.parse),
        isOwner: username === await redis.hGet(roomKey, "owner"),
        userId
      }));

      broadcast(roomId, {
        type: "user-joined",
        username
      });
    }

    /* ================= ADD FILE ================= */
    if (msg.type === "add-file") {
      const { roomId } = clients.get(ws);
      const file = {
        id: crypto.randomUUID(),
        name: msg.name,
        ownerId: msg.ownerId,
        ownerName: msg.ownerName,
        ts: Date.now()
      };

      await redis.lPush(`room:${roomId}:files`, JSON.stringify(file));
      broadcast(roomId, { type: "file-added", file });
    }

    /* ================= REMOVE FILE ================= */
    if (msg.type === "remove-file") {
      const { roomId } = clients.get(ws);
      const files = await redis.lRange(`room:${roomId}:files`, 0, -1);
      await redis.del(`room:${roomId}:files`);

      for (const f of files) {
        const obj = JSON.parse(f);
        if (obj.id !== msg.fileId)
          await redis.rPush(`room:${roomId}:files`, f);
      }

      broadcast(roomId, { type: "file-removed", fileId: msg.fileId });
    }

    /* ================= KILL ROOM ================= */
    if (msg.type === "kill-room") {
      const { roomId } = clients.get(ws);
      await redis.del(
        `room:${roomId}`,
        `room:${roomId}:users`,
        `room:${roomId}:files`,
        `room:${roomId}:presence`
      );
      broadcast(roomId, { type: "room-killed" });
    }

    /* ================= SIGNAL ================= */
    if (msg.type === "signal") {
      broadcast(msg.roomId, msg, ws);
    }
  });

  ws.on("close", async () => {
    const meta = clients.get(ws);
    if (!meta) return;

    const { roomId, userId } = meta;
    clients.delete(ws);

    await redis.sRem(`room:${roomId}:users`, userId);
    await redis.hDel(`room:${roomId}:presence`, userId);
  });
});

function broadcast(roomId, msg, except) {
  for (const [ws, meta] of clients) {
    if (meta.roomId === roomId && ws !== except) {
      ws.send(JSON.stringify(msg));
    }
  }
}

console.log("✅ Signaling server running");
