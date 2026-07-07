import { getRedis } from "../redis.js";

const ONLINE_PREFIX = "online:";
const SOCKET_PREFIX = "socket:";

class PresenceService {
  async setOnline(userId, socketId, roomId = null) {
    const redis = getRedis();

    await redis.hSet(`${ONLINE_PREFIX}${userId}`, {
      userId,
      socketId,
      roomId: roomId || "",
      connectedAt: String(Date.now()),
      lastSeen: String(Date.now())
    });

    await redis.set(`${SOCKET_PREFIX}${socketId}`, userId);
  }

  async setOffline(userId) {
    const redis = getRedis();

    const info = await this.getUser(userId);

    if (info) {
      await redis.del(`${SOCKET_PREFIX}${info.socketId}`);
    }

    await redis.del(`${ONLINE_PREFIX}${userId}`);
  }

  async updateRoom(userId, roomId) {
    const redis = getRedis();

    const info = await this.getUser(userId);

    if (!info) return;

    await redis.hSet(`${ONLINE_PREFIX}${userId}`, {
      roomId,
      lastSeen: String(Date.now())
    });
  }

  async leaveRoom(userId) {
    const redis = getRedis();

    const info = await this.getUser(userId);

    if (!info) return;

    await redis.hSet(`${ONLINE_PREFIX}${userId}`, {
      roomId: "",
      lastSeen: String(Date.now())
    });
  }

  async heartbeat(userId) {
    const redis = getRedis();

    const exists = await this.isOnline(userId);

    if (!exists) return;

    await redis.hSet(`${ONLINE_PREFIX}${userId}`, {
      lastSeen: String(Date.now())
    });
  }

  async isOnline(userId) {
    const redis = getRedis();

    return Boolean(await redis.exists(`${ONLINE_PREFIX}${userId}`));
  }

  async getUser(userId) {
    const redis = getRedis();

    const data = await redis.hGetAll(`${ONLINE_PREFIX}${userId}`);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      userId: data.userId,
      socketId: data.socketId,
      roomId: data.roomId || null,
      connectedAt: Number(data.connectedAt),
      lastSeen: Number(data.lastSeen)
    };
  }

  async getUserBySocket(socketId) {
    const redis = getRedis();

    const userId = await redis.get(`${SOCKET_PREFIX}${socketId}`);

    if (!userId) return null;

    return this.getUser(userId);
  }

  async getSocketId(userId) {
    const user = await this.getUser(userId);

    return user ? user.socketId : null;
  }

  async getRoomId(userId) {
    const user = await this.getUser(userId);

    return user ? user.roomId : null;
  }

  async disconnectSocket(socketId) {
    const user = await this.getUserBySocket(socketId);

    if (!user) return null;

    await this.setOffline(user.userId);

    return user;
  }
}

export default new PresenceService();