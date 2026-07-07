import FileModel from "../models/fileModel.js";
import RoomService from "./roomService.js";
import ERROR_CODES from "../constants/errorCodes.js";

class FileService {
  async registerFile({
    roomId,
    ownerId,
    fileName,
    fileSize,
    mimeType,
    totalChunks,
    checksum = ""
  }) {
    const room = await RoomService.getRoom(roomId);

    if (!room) {
      throw new Error(ERROR_CODES.ROOM_NOT_FOUND);
    }

    const file = await FileModel.create({
      roomId,
      ownerId,
      fileName,
      fileSize,
      mimeType,
      totalChunks,
      checksum
    });

    await RoomService.addFile(roomId, file.fileId);

    return file;
  }

  async deleteFile(roomId, fileId, requesterId) {
    const file = await FileModel.get(fileId);

    if (!file) {
      throw new Error(ERROR_CODES.FILE_NOT_FOUND);
    }

    const room = await RoomService.getRoom(roomId);

    if (!room) {
      throw new Error(ERROR_CODES.ROOM_NOT_FOUND);
    }

    const isOwner =
      requesterId === file.ownerId ||
      requesterId === room.ownerId;

    if (!isOwner) {
      throw new Error(ERROR_CODES.FORBIDDEN);
    }

    await RoomService.removeFile(roomId, fileId);

    return true;
  }

  async getFile(fileId) {
    const file = await FileModel.get(fileId);

    if (!file) {
      throw new Error(ERROR_CODES.FILE_NOT_FOUND);
    }

    return file;
  }

  async listFiles(roomId) {
    return await RoomService.getFiles(roomId);
  }

  async renameFile(fileId, requesterId, newName) {
    const file = await FileModel.get(fileId);

    if (!file) {
      throw new Error(ERROR_CODES.FILE_NOT_FOUND);
    }

    if (file.ownerId !== requesterId) {
      throw new Error(ERROR_CODES.FORBIDDEN);
    }

    return await FileModel.rename(fileId, newName);
  }

  async verifyOwner(fileId, userId) {
    const file = await FileModel.get(fileId);

    if (!file) {
      return false;
    }

    return file.ownerId === userId;
  }

  async exists(fileId) {
    return await FileModel.exists(fileId);
  }

  async getOwner(fileId) {
    return await FileModel.getOwner(fileId);
  }

  async getRoom(fileId) {
    return await FileModel.getRoom(fileId);
  }

  async updateChecksum(fileId, checksum) {
    return await FileModel.updateChecksum(fileId, checksum);
  }

  async updateChunkCount(fileId, chunks) {
    return await FileModel.updateChunkCount(fileId, chunks);
  }

  async touch(fileId) {
    return await FileModel.touch(fileId);
  }
}

export default new FileService();