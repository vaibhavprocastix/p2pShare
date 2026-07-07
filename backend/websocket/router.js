import MESSAGE_TYPES from "../constants/messageTypes.js";

import PeerController from "../controllers/peerController.js";
import RoomController from "../controllers/roomController.js";
import FileController from "../controllers/fileController.js";
import DownloadController from "../controllers/downloadController.js";

class WebSocketRouter {
  async handle(ws, message) {
    try {
      switch (message.type) {

        // ==========================
        // Connection
        // ==========================

        case MESSAGE_TYPES.HEARTBEAT:
          return await PeerController.heartbeat(message.userId);

        // ==========================
        // Room
        // ==========================

        case MESSAGE_TYPES.CREATE_ROOM:
          return await RoomController.createRoom(message);

        case MESSAGE_TYPES.JOIN_ROOM:
          return await RoomController.joinRoom(message);

        case MESSAGE_TYPES.LEAVE_ROOM:
          return await RoomController.leaveRoom(message);

        case MESSAGE_TYPES.KILL_ROOM:
          return await RoomController.killRoom(message);

        case MESSAGE_TYPES.ROOM_STATE:
          return await RoomController.getRoomState(
            message.roomId
          );

        // ==========================
        // Files
        // ==========================

        case MESSAGE_TYPES.FILE_METADATA:
          return await FileController.uploadFile(message);

        case MESSAGE_TYPES.FILE_LIST:
          return await FileController.listFiles(
            message.roomId
          );

        case MESSAGE_TYPES.FILE_REMOVED:
          return await FileController.deleteFile(message);

        // ==========================
        // Downloads
        // ==========================

        case MESSAGE_TYPES.DOWNLOAD_REQUEST:
          return await DownloadController.requestDownload(
            message
          );

        case MESSAGE_TYPES.DOWNLOAD_ACCEPT:
          return await DownloadController.acceptDownload(
            message
          );

        case MESSAGE_TYPES.DOWNLOAD_REJECT:
          return await DownloadController.rejectDownload(
            message
          );

        case MESSAGE_TYPES.RESUME_REQUEST:
          return await DownloadController.resumeDownload(
            message
          );

        case MESSAGE_TYPES.CHUNK_ACK:
          return await DownloadController.acknowledgeChunk(
            message
          );

        case MESSAGE_TYPES.DOWNLOAD_COMPLETED:
          return await DownloadController.completeDownload(
            message
          );

        case MESSAGE_TYPES.DOWNLOAD_CANCELLED:
          return await DownloadController.cancelDownload(
            message
          );

        // ==========================
        // WebRTC Signaling
        // ==========================

        case MESSAGE_TYPES.OFFER:
          return await PeerController.relayOffer(message);

        case MESSAGE_TYPES.ANSWER:
          return await PeerController.relayAnswer(message);

        case MESSAGE_TYPES.ICE_CANDIDATE:
          return await PeerController.relayIceCandidate(
            message
          );

        default:
          return {
            success: false,
            message: `Unknown message type: ${message.type}`
          };
      }
    } catch (err) {
      console.error(err);

      return {
        success: false,
        message: err.message
      };
    }
  }
}

export default new WebSocketRouter();