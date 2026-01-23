import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8081 });
const rooms = new Map();

wss.on("connection", (ws) => {

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "create-room") {
      rooms.set(data.roomId, ws);
      ws.roomId = data.roomId;
    }

    if (data.type === "join-room") {
      const sender = rooms.get(data.roomId);
      if (!sender) return;

      sender.peer = ws;
      ws.peer = sender;

      // 🔥 IMPORTANT: notify sender that receiver joined
      sender.send(JSON.stringify({ type: "peer-joined" }));
    }

    if (data.type === "signal") {
      if (ws.peer) {
        ws.peer.send(JSON.stringify(data));
      }
    }
  });

  ws.on("close", () => {
    if (ws.roomId) rooms.delete(ws.roomId);
  });
});

console.log("✅ Signaling server running on ws://localhost:8081");
