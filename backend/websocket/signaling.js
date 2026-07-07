import PeerService from "../services/peerService.js";
import PresenceService from "../services/presenceService.js";
import MESSAGE_TYPES from "../constants/messageTypes.js";

class SignalingService {
  async offer({ from, to, offer }) {
    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        type: MESSAGE_TYPES.ERROR,
        message: "Target peer is offline."
      };
    }

    await PeerService.relayOffer(from, to, offer);

    return {
        success: true
    };
  }

  async answer({ from, to, answer }) {
    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        type: MESSAGE_TYPES.ERROR,
        message: "Target peer is offline."
      };
    }

    await PeerService.relayAnswer(from, to, answer);

    return {
        success: true
    };
  }

  async iceCandidate({ from, to, candidate }) {
    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        type: MESSAGE_TYPES.ERROR,
        message: "Target peer is offline."
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

  async downloadRequest({
    from,
    to,
    downloadId,
    file
  }) {
    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        type: MESSAGE_TYPES.ERROR,
        message: "Peer is offline."
      };
    }

    await PeerService.relayDownloadRequest(
      from,
      to,
      {
        downloadId,
        file
      }
    );

    return {
        success: true
    };
  }

  async resumeRequest({
    from,
    to,
    downloadId,
    missingChunks
  }) {
    if (!(await PresenceService.isOnline(to))) {
      return {
        success: false,
        type: MESSAGE_TYPES.ERROR,
        message: "Peer is offline."
      };
    }

    await PeerService.relayResumeRequest(
      from,
      to,
      {
        downloadId,
        missingChunks
      }
    );

    return {
        success: true
    };
  }

  async broadcastRoom(roomUsers, payload) {
    await PeerService.broadcast(
      roomUsers,
      payload
    );

    return {
        success: true
    };
  }
}

export default new SignalingService();