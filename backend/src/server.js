import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

const wss = new WebSocketServer({ port: 8081 });
const rooms = new Map();

wss.on("connection", (ws) => {
  ws.id = uuidv4();

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "create-room") {
      rooms.set(data.roomId, ws);
    }

    if (data.type === "join-room") {
      const sender = rooms.get(data.roomId);
      if (sender) {
        sender.receiver = ws;
        ws.sender = sender;
      }
    }

    if (data.type === "signal") {
      const peer = ws.sender || ws.receiver;
      if (peer) peer.send(JSON.stringify(data));
    }
  });

  ws.on("close", () => {
    rooms.forEach((v, k) => v === ws && rooms.delete(k));
  });
});

console.log("Backend signaling running on :8081");
