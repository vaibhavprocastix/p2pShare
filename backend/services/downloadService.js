import { nanoid } from "nanoid";
import ERROR_CODES from "../constants/errorCodes.js";
import FileService from "./fileService.js";
import PresenceService from "./presenceService.js";

class DownloadService {
  constructor() {
    this.activeDownloads = new Map();
  }

  async createDownload({
    fileId,
    senderId,
    receiverId
  }) {
    const file = await FileService.getFile(fileId);

    if (!file) {
      throw new Error(ERROR_CODES.FILE_NOT_FOUND);
    }

    if (!(await PresenceService.isOnline(senderId))) {
      throw new Error(ERROR_CODES.FILE_OWNER_OFFLINE);
    }

    if (!(await PresenceService.isOnline(receiverId))) {
      throw new Error(ERROR_CODES.USER_OFFLINE);
    }

    const downloadId = nanoid(12);

    const download = {
      downloadId,
      fileId,
      senderId,
      receiverId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      totalChunks: file.totalChunks,
      receivedChunks: new Set(),
      status: "PENDING",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.activeDownloads.set(downloadId, download);

    return download;
  }

  get(downloadId) {
    return this.activeDownloads.get(downloadId) || null;
  }

  exists(downloadId) {
    return this.activeDownloads.has(downloadId);
  }

  start(downloadId) {
    const download = this.get(downloadId);

    if (!download) {
      throw new Error(ERROR_CODES.DOWNLOAD_NOT_FOUND);
    }

    download.status = "RUNNING";
    download.updatedAt = Date.now();

    return download;
  }

  acknowledgeChunk(downloadId, chunkIndex) {
    const download = this.get(downloadId);

    if (!download) {
      throw new Error(ERROR_CODES.DOWNLOAD_NOT_FOUND);
    }

    download.receivedChunks.add(chunkIndex);
    download.updatedAt = Date.now();

    return {
      received: download.receivedChunks.size,
      total: download.totalChunks,
      completed:
        download.receivedChunks.size === download.totalChunks
    };
  }

  getMissingChunks(downloadId) {
    const download = this.get(downloadId);

    if (!download) {
      throw new Error(ERROR_CODES.DOWNLOAD_NOT_FOUND);
    }

    const missing = [];

    for (let i = 0; i < download.totalChunks; i++) {
      if (!download.receivedChunks.has(i)) {
        missing.push(i);
      }
    }

    return missing;
  }

  getProgress(downloadId) {
    const download = this.get(downloadId);

    if (!download) {
      throw new Error(ERROR_CODES.DOWNLOAD_NOT_FOUND);
    }

    const received = download.receivedChunks.size;

    return {
      receivedChunks: received,
      totalChunks: download.totalChunks,
      percentage:
        download.totalChunks === 0
          ? 0
          : Math.floor((received / download.totalChunks) * 100)
    };
  }

  complete(downloadId) {
    const download = this.get(downloadId);

    if (!download) {
      throw new Error(ERROR_CODES.DOWNLOAD_NOT_FOUND);
    }

    download.status = "COMPLETED";
    download.updatedAt = Date.now();

    return download;
  }

  cancel(downloadId) {
    const download = this.get(downloadId);

    if (!download) {
      throw new Error(ERROR_CODES.DOWNLOAD_NOT_FOUND);
    }

    download.status = "CANCELLED";
    download.updatedAt = Date.now();

    return download;
  }

  remove(downloadId) {
    this.activeDownloads.delete(downloadId);
  }

  cleanupExpired(maxAge = 1000 * 60 * 60) {
    const now = Date.now();

    for (const [id, download] of this.activeDownloads.entries()) {
      if (now - download.updatedAt > maxAge) {
        this.activeDownloads.delete(id);
      }
    }
  }

  getDownloadsForUser(userId) {
    return [...this.activeDownloads.values()].filter(
      d => d.senderId === userId || d.receiverId === userId
    );
  }

  getRunningDownloads() {
    return [...this.activeDownloads.values()].filter(
      d => d.status === "RUNNING"
    );
  }

  count() {
    return this.activeDownloads.size;
  }
}

export default new DownloadService();