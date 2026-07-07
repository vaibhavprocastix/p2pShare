import FileService from "../services/fileService.js";
import RoomService from "../services/roomService.js";
import PeerService from "../services/peerService.js";
import MESSAGE_TYPES from "../constants/messageTypes.js";

class FileController {
  async uploadFile(data) {
    const {
      roomId,
      ownerId,
      fileName,
      fileSize,
      mimeType,
      totalChunks,
      checksum
    } = data;

    const file = await FileService.registerFile({
      roomId,
      ownerId,
      fileName,
      fileSize,
      mimeType,
      totalChunks,
      checksum
    });

    const users = await RoomService.getUsers(roomId);

    await PeerService.broadcast(users, {
      type: MESSAGE_TYPES.FILE_ADDED,
      file
    });

    return {
      success: true,
      type: MESSAGE_TYPES.FILE_ADDED,
      file
    };
  }

  async deleteFile(data) {
    const {
      roomId,
      fileId,
      requesterId
    } = data;

    await FileService.deleteFile(
      roomId,
      fileId,
      requesterId
    );

    const users = await RoomService.getUsers(roomId);

    await PeerService.broadcast(users, {
      type: MESSAGE_TYPES.FILE_REMOVED,
      fileId
    });

    return {
      success: true,
      type: MESSAGE_TYPES.FILE_REMOVED,
      fileId
    };
  }

  async renameFile(data) {
    const {
      fileId,
      requesterId,
      newName
    } = data;

    const file = await FileService.renameFile(
      fileId,
      requesterId,
      newName
    );

    const users = await RoomService.getUsers(file.roomId);

    await PeerService.broadcast(users, {
      type: MESSAGE_TYPES.FILE_METADATA,
      file
    });

    return {
      success: true,
      type: MESSAGE_TYPES.FILE_METADATA,
      file
    };
  }

  async listFiles(roomId) {
    const files = await FileService.listFiles(roomId);

    return {
      success: true,
      type: MESSAGE_TYPES.FILE_LIST,
      files
    };
  }

  async getFile(fileId) {
    const file = await FileService.getFile(fileId);

    return {
      success: true,
      file
    };
  }

  async updateChecksum(fileId, checksum) {
    const file = await FileService.updateChecksum(
      fileId,
      checksum
    );

    return {
      success: true,
      file
    };
  }

  async updateChunkCount(fileId, totalChunks) {
    const file = await FileService.updateChunkCount(
      fileId,
      totalChunks
    );

    return {
      success: true,
      file
    };
  }
}

export default new FileController();