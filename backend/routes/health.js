import express from "express";
import PeerService from "../services/peerService.js";
import DownloadService from "../services/downloadService.js";
import { getRedis } from "../redis.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const redis = getRedis();

    await redis.ping();

    res.status(200).json({
      success: true,
      application: "P2P Share Backend",
      status: "healthy",
      timestamp: new Date().toISOString(),

      services: {
        redis: "connected",
        websocket: "running"
      },

      statistics: {
        onlineUsers: PeerService.getOnlineCount(),
        activeDownloads: DownloadService.count()
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "unhealthy",
      error: err.message
    });
  }
});

router.get("/ready", async (req, res) => {
  try {
    const redis = getRedis();

    await redis.ping();

    res.status(200).json({
      ready: true
    });
  } catch {
    res.status(503).json({
      ready: false
    });
  }
});

router.get("/live", (req, res) => {
  res.status(200).json({
    alive: true
  });
});

export default router;