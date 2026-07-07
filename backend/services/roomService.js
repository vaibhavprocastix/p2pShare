import RoomModel from "../models/roomModel.js";
import FileModel from "../models/fileModel.js";
import ERROR_CODES from "../constants/errorCodes.js";
import config from "../config/config.js";

class RoomService {
  async createRoom(ownerId, password) {
    if (!password || password.length < config.room.passwordMinLength) {
      throw new Error(ERROR_CODES.INVALID_PASSWORD);
    }

    return await RoomModel.create(ownerId, password);
  }

  async joinRoom(roomId, userId, password) {
    const room = await RoomModel.get(roomId);

    if (!room) {
      throw new Error(ERROR_CODES.ROOM_NOT_FOUND);
    }

    if (!room.isActive) {
      throw new Error(ERROR_CODES.ROOM_CLOSED);
    }

    if (!(await RoomModel.verifyPassword(roomId, password))) {
      throw new Error(ERROR_CODES.ROOM_PASSWORD_INCORRECT);
    }

    if (await RoomModel.isFull(roomId)) {
      throw new Error(ERROR_CODES.ROOM_FULL);
    }

    if (!room.users.includes(userId)) {
      await RoomModel.addUser(roomId, userId);
    }

    return await this.getRoomState(roomId);
  }

  async leaveRoom(roomId, userId) {
    const room = await RoomModel.get(roomId);

    if (!room) {
      return;
    }

    await RoomModel.removeUser(roomId, userId);

    const updatedRoom = await RoomModel.get(roomId);

    // Auto destroy if empty
    if (updatedRoom.users.length === 0) {
      await this.destroyRoom(roomId);
    }
  }

  async killRoom(roomId, ownerId) {
    const room = await RoomModel.get(roomId);

    if (!room) {
      throw new Error(ERROR_CODES.ROOM_NOT_FOUND);
    }

    if (!(await RoomModel.isOwner(roomId, ownerId))) {
      throw new Error(ERROR_CODES.ROOM_OWNER_REQUIRED);
    }

    await this.destroyRoom(roomId);
  }

  async destroyRoom(roomId) {
    const room = await RoomModel.get(roomId);

    if (!room) {
      return;
    }

    for (const fileId of room.files) {
      await FileModel.delete(fileId);
    }

    await RoomModel.destroy(roomId);
  }

  async addFile(roomId, fileId) {
    return await RoomModel.addFile(roomId, fileId);
  }

  async removeFile(roomId, fileId) {
    await FileModel.delete(fileId);

    return await RoomModel.removeFile(roomId, fileId);
  }

  async getRoom(roomId) {
    return await RoomModel.get(roomId);
  }

  async roomExists(roomId) {
    return await RoomModel.exists(roomId);
  }

  async getUsers(roomId) {
    return await RoomModel.getUsers(roomId);
  }

  async getFiles(roomId) {
    const room = await RoomModel.get(roomId);

    if (!room) {
      return [];
    }

    return await FileModel.list(room.files);
  }

  async getRoomState(roomId) {
    const room = await RoomModel.get(roomId);

    if (!room) {
      throw new Error(ERROR_CODES.ROOM_NOT_FOUND);
    }

    const files = await FileModel.list(room.files);

    return {
      roomId: room.roomId,
      ownerId: room.ownerId,
      users: room.users,
      files,
      createdAt: room.createdAt
    };
  }

  async isOwner(roomId, userId) {
    return await RoomModel.isOwner(roomId, userId);
  }

  async verifyPassword(roomId, password) {
    return await RoomModel.verifyPassword(roomId, password);
  }

  async userCount(roomId) {
    return await RoomModel.countUsers(roomId);
  }

  async isFull(roomId) {
    return await RoomModel.isFull(roomId);
  }
}

export default new RoomService();