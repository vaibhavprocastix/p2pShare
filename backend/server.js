import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";

import healthRoutes from "./routes/health.js";
import { initRedis } from "./redis.js";
import { setupWebSocket } from "./websocket/websocket.js";

dotenv.config();

const app = express();

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
  })
);

app.use(cors());

app.use(compression());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({
    success: true,
    application: "P2P Share Backend",
    version: "2.0.0",
    status: "Running"
  });
});

app.use("/health", healthRoutes);

const PORT = process.env.PORT || 8081;

const server = http.createServer(app);

async function startServer() {
  try {
    await initRedis();

    setupWebSocket(server);

    server.listen(PORT, "0.0.0.0", () => {
      console.log("");
      console.log("======================================");
      console.log(" P2P Share Backend Started");
      console.log("======================================");
      console.log(`HTTP Server : http://localhost:${PORT}`);
      console.log(`WebSocket   : ws://localhost:${PORT}`);
      console.log("======================================");
    });
  } catch (err) {
    console.error("Startup Failed");
    console.error(err);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", () => {
  console.log("\nGracefully shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("\nGracefully shutting down...");
  server.close(() => process.exit(0));
});