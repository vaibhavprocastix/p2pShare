import DownloadService from "../services/downloadService.js";
import FileService from "../services/fileService.js";
import PeerService from "../services/peerService.js";
import MESSAGE_TYPES from "../constants/messageTypes.js";

class DownloadController {
  async requestDownload(data) {
    const {
      fileId,
      senderId,
      receiverId
    } = data;

    const download = await DownloadService.createDownload({
      fileId,
      senderId,
      receiverId
    });

    const file = await FileService.getFile(fileId);

    await PeerService.relayDownloadRequest(
      receiverId,
      senderId,
      {
        type: MESSAGE_TYPES.DOWNLOAD_REQUEST,
        downloadId: download.downloadId,
        file
      }
    );

    return {
      success: true,
      downloadId: download.downloadId
    };
  }

  async acceptDownload(data) {
    const {
      downloadId,
      senderId,
      receiverId
    } = data;

    const download = DownloadService.start(downloadId);

    await PeerService.send(receiverId, {
      type: MESSAGE_TYPES.DOWNLOAD_ACCEPT,
      downloadId,
      senderId,
      receiverId
    });

    return {
      success: true,
      type: MESSAGE_TYPES.DOWNLOAD_ACCEPT,
      download
    };
  }

  async rejectDownload(data) {
    const {
      downloadId,
      receiverId
    } = data;

    const download = DownloadService.cancel(downloadId);

    await PeerService.send(download.senderId, {
      type: MESSAGE_TYPES.DOWNLOAD_REJECT,
      downloadId
    });

    return {
      success: true
    };
  }

  async acknowledgeChunk(data) {
    const {
      downloadId,
      chunkIndex
    } = data;

    const progress =
      DownloadService.acknowledgeChunk(
        downloadId,
        chunkIndex
      );

    return {
      success: true,
      type: MESSAGE_TYPES.CHUNK_ACK,
      ...progress
    };
  }

  async resumeDownload(data) {
    const {
      downloadId,
      receiverId
    } = data;

    const download =
      DownloadService.get(downloadId);

    const missing =
      DownloadService.getMissingChunks(
        downloadId
      );

    await PeerService.relayResumeRequest(
      receiverId,
      download.senderId,
      {
        type: MESSAGE_TYPES.RESUME_REQUEST,
        downloadId,
        missingChunks: missing
      }
    );

    return {
      success: true,
      missingChunks: missing
    };
  }

  async completeDownload(data) {
    const { downloadId } = data;

    const download =
      DownloadService.complete(downloadId);

    await PeerService.send(download.senderId, {
      type: MESSAGE_TYPES.DOWNLOAD_COMPLETED,
      downloadId
    });

    await PeerService.send(download.receiverId, {
      type: MESSAGE_TYPES.DOWNLOAD_COMPLETED,
      downloadId
    });

    return {
      success: true
    };
  }

  async cancelDownload(data) {
    const { downloadId } = data;

    const download =
      DownloadService.cancel(downloadId);

    await PeerService.send(download.senderId, {
      type: MESSAGE_TYPES.DOWNLOAD_CANCELLED,
      downloadId
    });

    await PeerService.send(download.receiverId, {
      type: MESSAGE_TYPES.DOWNLOAD_CANCELLED,
      downloadId
    });

    return {
      success: true
    };
  }

  async progress(downloadId) {
    return {
      success: true,
      ...DownloadService.getProgress(downloadId)
    };
  }

  async activeDownloads(userId) {
    return {
      success: true,
      downloads:
        DownloadService.getDownloadsForUser(
          userId
        )
    };
  }
}

export default new DownloadController();