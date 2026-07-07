import dotenv from "dotenv";

dotenv.config();

export default {
  app: {
    name: process.env.APP_NAME || "P2P Share",
    env: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 8081)
  },

  redis: {
    url: process.env.REDIS_URL || "redis://redis:6379"
  },

  room: {
    maxUsers: Number(process.env.MAX_ROOM_USERS || 50),
    passwordMinLength: 4,
    roomIdLength: 8,
    roomTTL: Number(process.env.ROOM_TTL || 86400) // 24 hours
  },

  websocket: {
    heartbeatInterval: Number(process.env.HEARTBEAT_INTERVAL || 30000),
    clientTimeout: Number(process.env.CLIENT_TIMEOUT || 90000),
    maxPayload: Number(process.env.MAX_PAYLOAD || 10 * 1024 * 1024)
  },

  rtc: {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      },
      {
        urls: "stun:stun1.l.google.com:19302"
      }
    ]
  },

  transfer: {
    chunkSize: Number(process.env.CHUNK_SIZE || 262144), //256KB

    maxBufferedAmount: Number(
      process.env.MAX_BUFFERED_AMOUNT || 16 * 1024 * 1024
    ),

    ackWindow: Number(process.env.ACK_WINDOW || 64),

    resendTimeout: Number(process.env.RESEND_TIMEOUT || 5000),

    maxParallelTransfers: Number(
      process.env.MAX_PARALLEL_TRANSFERS || 3
    )
  },

  security: {
    aesEnabled: process.env.AES_ENABLED === "true",
    tokenExpiry: Number(process.env.TOKEN_EXPIRY || 3600)
  },

  logging: {
    level: process.env.LOG_LEVEL || "info"
  }
};