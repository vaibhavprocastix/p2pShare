import { nanoid } from "nanoid";
import { getRedis } from "../redis.js";

const FILE_PREFIX = "file:";

export default class FileModel {
  static async create({
    roomId,
    ownerId,
    fileName,
    fileSize,
    mimeType,
    totalChunks,
    checksum = ""
  }) {
    const redis = getRedis();

    const fileId = nanoid(12);

    const file = {
      fileId,
      roomId,
      ownerId,
      fileName,
      fileSize: String(fileSize),
      mimeType,
      totalChunks: String(totalChunks),
      checksum,
      uploadedAt: String(Date.now())
    };

    await redis.hSet(`${FILE_PREFIX}${fileId}`, file);

    return this.get(fileId);
  }

  static async get(fileId) {
    const redis = getRedis();

    const file = await redis.hGetAll(`${FILE_PREFIX}${fileId}`);

    if (!file || Object.keys(file).length === 0) {
      return null;
    }

    return {
      fileId: file.fileId,
      roomId: file.roomId,
      ownerId: file.ownerId,
      fileName: file.fileName,
      fileSize: Number(file.fileSize),
      mimeType: file.mimeType,
      totalChunks: Number(file.totalChunks),
      checksum: file.checksum,
      uploadedAt: Number(file.uploadedAt)
    };
  }

  static async exists(fileId) {
    const redis = getRedis();

    return Boolean(await redis.exists(`${FILE_PREFIX}${fileId}`));
  }

  static async delete(fileId) {
    const redis = getRedis();

    await redis.del(`${FILE_PREFIX}${fileId}`);
  }

  static async rename(fileId, newName) {
    const redis = getRedis();

    await redis.hSet(`${FILE_PREFIX}${fileId}`, {
      fileName: newName
    });

    return this.get(fileId);
  }

  static async getOwner(fileId) {
    const file = await this.get(fileId);

    return file ? file.ownerId : null;
  }

  static async getRoom(fileId) {
    const file = await this.get(fileId);

    return file ? file.roomId : null;
  }

  static async list(fileIds = []) {
    const files = [];

    for (const id of fileIds) {
      const file = await this.get(id);

      if (file) {
        files.push(file);
      }
    }

    files.sort((a, b) => b.uploadedAt - a.uploadedAt);

    return files;
  }

  static async touch(fileId) {
    const redis = getRedis();

    await redis.hSet(`${FILE_PREFIX}${fileId}`, {
      uploadedAt: String(Date.now())
    });

    return this.get(fileId);
  }

  static async updateChecksum(fileId, checksum) {
    const redis = getRedis();

    await redis.hSet(`${FILE_PREFIX}${fileId}`, {
      checksum
    });

    return this.get(fileId);
  }

  static async updateChunkCount(fileId, totalChunks) {
    const redis = getRedis();

    await redis.hSet(`${FILE_PREFIX}${fileId}`, {
      totalChunks: String(totalChunks)
    });

    return this.get(fileId);
  }
}