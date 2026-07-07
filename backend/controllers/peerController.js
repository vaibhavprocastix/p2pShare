import PeerService from "../services/peerService.js";
import PresenceService from "../services/presenceService.js";
import RoomService from "../services/roomService.js";
import ERROR_CODES from "../constants/errorCodes.js";

class PeerController {
  async relayOffer(data) {
    const { from, to, offer } = data;

    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        code: ERROR_CODES.PEER_OFFLINE
      };
    }

    await PeerService.relayOffer(from, to, offer);

    return {
      success: true
    };
  }

  async relayAnswer(data) {
    const { from, to, answer } = data;

    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        code: ERROR_CODES.PEER_OFFLINE
      };
    }

    await PeerService.relayAnswer(from, to, answer);

    return {
      success: true
    };
  }

  async relayIceCandidate(data) {
    const { from, to, candidate } = data;

    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        code: ERROR_CODES.PEER_OFFLINE
      };
    }

    await PeerService.relayIceCandidate(
      from,
      to,
      candidate
    );

    return {
      success: true
    };
  }

  async userConnected(userId, ws) {
    PeerService.register(userId, ws);

    return {
      success: true
    };
  }

  async userDisconnected(userId) {
    const roomId = await PresenceService.getRoomId(userId);

    PeerService.unregister(userId);

    await PresenceService.setOffline(userId);

    if (roomId) {
      await RoomService.leaveRoom(roomId, userId);

      const users = await RoomService.getUsers(roomId);

      await PeerService.notifyUserLeft(users, userId);
    }

    return {
      success: true
    };
  }

  async heartbeat(userId) {
    await PeerService.heartbeat(userId);

    return {
      success: true,
      timestamp: Date.now()
    };
  }

  async getOnlineUsers() {
    return {
      success: true,
      users: PeerService.getOnlineUsers(),
      count: PeerService.getOnlineCount()
    };
  }
}

export default new PeerController();