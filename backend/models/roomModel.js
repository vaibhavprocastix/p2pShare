import { nanoid } from "nanoid";
import { getRedis } from "../redis.js";
import config from "../config/config.js";

const ROOM_PREFIX = "room:";

export default class RoomModel {
  static async create(ownerId, password) {
    const redis = getRedis();

    const roomId = nanoid(config.room.roomIdLength);

    const room = {
      roomId,
      ownerId,
      password,
      createdAt: Date.now(),
      users: JSON.stringify([ownerId]),
      files: JSON.stringify([]),
      isActive: true
    };

    await redis.hSet(`${ROOM_PREFIX}${roomId}`, room);

    await redis.expire(
      `${ROOM_PREFIX}${roomId}`,
      config.room.roomTTL
    );

    return this.get(roomId);
  }

  static async get(roomId) {
    const redis = getRedis();

    const room = await redis.hGetAll(`${ROOM_PREFIX}${roomId}`);

    if (!room || Object.keys(room).length === 0) {
      return null;
    }

    return {
      roomId: room.roomId,
      ownerId: room.ownerId,
      password: room.password,
      createdAt: Number(room.createdAt),
      users: JSON.parse(room.users || "[]"),
      files: JSON.parse(room.files || "[]"),
      isActive: room.isActive === "true"
    };
  }

  static async exists(roomId) {
    const redis = getRedis();

    return await redis.exists(`${ROOM_PREFIX}${roomId}`);
  }

  static async addUser(roomId, userId) {
    const room = await this.get(roomId);

    if (!room) return null;

    if (!room.users.includes(userId)) {
      room.users.push(userId);
    }

    const redis = getRedis();

    await redis.hSet(`${ROOM_PREFIX}${roomId}`, {
      users: JSON.stringify(room.users)
    });

    return room;
  }

  static async removeUser(roomId, userId) {
    const room = await this.get(roomId);

    if (!room) return null;

    room.users = room.users.filter(id => id !== userId);

    const redis = getRedis();

    await redis.hSet(`${ROOM_PREFIX}${roomId}`, {
      users: JSON.stringify(room.users)
    });

    return room;
  }

  static async addFile(roomId, fileId) {
    const room = await this.get(roomId);

    if (!room) return null;

    room.files.unshift(fileId);

    const redis = getRedis();

    await redis.hSet(`${ROOM_PREFIX}${roomId}`, {
      files: JSON.stringify(room.files)
    });

    return room;
  }

  static async removeFile(roomId, fileId) {
    const room = await this.get(roomId);

    if (!room) return null;

    room.files = room.files.filter(id => id !== fileId);

    const redis = getRedis();

    await redis.hSet(`${ROOM_PREFIX}${roomId}`, {
      files: JSON.stringify(room.files)
    });

    return room;
  }

  static async verifyPassword(roomId, password) {
    const room = await this.get(roomId);

    if (!room) return false;

    return room.password === password;
  }

  static async isOwner(roomId, userId) {
    const room = await this.get(roomId);

    if (!room) return false;

    return room.ownerId === userId;
  }

  static async destroy(roomId) {
    const redis = getRedis();

    await redis.del(`${ROOM_PREFIX}${roomId}`);
  }

  static async countUsers(roomId) {
    const room = await this.get(roomId);

    if (!room) return 0;

    return room.users.length;
  }

  static async isFull(roomId) {
    const room = await this.get(roomId);

    if (!room) return false;

    return room.users.length >= config.room.maxUsers;
  }

  static async getUsers(roomId) {
    const room = await this.get(roomId);

    return room ? room.users : [];
  }

  static async getFiles(roomId) {
    const room = await this.get(roomId);

    return room ? room.files : [];
  }
}