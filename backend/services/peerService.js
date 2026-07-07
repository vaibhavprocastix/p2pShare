import PresenceService from "./presenceService.js";

class PeerService {
  constructor() {
    this.peers = new Map();
  }

  register(userId, ws) {
    this.peers.set(userId, ws);
  }

  unregister(userId) {
    this.peers.delete(userId);
  }

  getConnection(userId) {
    return this.peers.get(userId) || null;
  }

  isConnected(userId) {
    return this.peers.has(userId);
  }

  async send(userId, message) {
    const ws = this.getConnection(userId);

    if (!ws) {
      return false;
    }

    if (ws.readyState !== ws.OPEN) {
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  async broadcast(roomUsers, message, excludeUser = null) {
    const tasks = [];

    for (const userId of roomUsers) {
      if (userId === excludeUser) {
        continue;
      }

      tasks.push(this.send(userId, message));
    }

    await Promise.all(tasks);
  }

  async relayOffer(fromUser, toUser, offer) {
    return this.send(toUser, {
      type: "OFFER",
      from: fromUser,
      offer
    });
  }

  async relayAnswer(fromUser, toUser, answer) {
    return this.send(toUser, {
      type: "ANSWER",
      from: fromUser,
      answer
    });
  }

  async relayIceCandidate(fromUser, toUser, candidate) {
    return this.send(toUser, {
      type: "ICE_CANDIDATE",
      from: fromUser,
      candidate
    });
  }

  async relayDownloadRequest(fromUser, toUser, payload) {
    return this.send(toUser, {
      type: "DOWNLOAD_REQUEST",
      from: fromUser,
      ...payload
    });
  }

  async relayResumeRequest(fromUser, toUser, payload) {
    return this.send(toUser, {
      type: "RESUME_REQUEST",
      from: fromUser,
      ...payload
    });
  }

  async notifyUserJoined(roomUsers, joinedUser) {
    await this.broadcast(
      roomUsers,
      {
        type: "USER_JOINED",
        userId: joinedUser
      },
      joinedUser
    );
  }

  async notifyUserLeft(roomUsers, leftUser) {
    await this.broadcast(roomUsers, {
      type: "USER_LEFT",
      userId: leftUser
    });
  }

  async heartbeat(userId) {
    await PresenceService.heartbeat(userId);
  }

  getOnlineCount() {
    return this.peers.size;
  }

  getOnlineUsers() {
    return [...this.peers.keys()];
  }

  clear() {
    this.peers.clear();
  }
}

export default new PeerService();