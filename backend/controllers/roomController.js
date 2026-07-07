import RoomService from "../services/roomService.js";
import PresenceService from "../services/presenceService.js";
import PeerService from "../services/peerService.js";
import MESSAGE_TYPES from "../constants/messageTypes.js";

class RoomController {
  async createRoom({ ownerId, password }) {
    const room = await RoomService.createRoom(ownerId, password);

    await PresenceService.updateRoom(ownerId, room.roomId);

    return {
      success: true,
      type: MESSAGE_TYPES.ROOM_CREATED,
      room
    };
  }

  async joinRoom({ roomId, userId, password }) {
    const room = await RoomService.joinRoom(
      roomId,
      userId,
      password
    );

    await PresenceService.updateRoom(userId, roomId);

    await PeerService.notifyUserJoined(
      room.users,
      userId
    );

    return {
      success: true,
      type: MESSAGE_TYPES.ROOM_JOINED,
      room
    };
  }

  async leaveRoom({ roomId, userId }) {
    const users = await RoomService.getUsers(roomId);

    await RoomService.leaveRoom(roomId, userId);

    await PresenceService.leaveRoom(userId);

    await PeerService.notifyUserLeft(
      users.filter(id => id !== userId),
      userId
    );

    return {
      success: true,
      type: MESSAGE_TYPES.ROOM_LEFT
    };
  }

  async killRoom({ roomId, ownerId }) {
    const room = await RoomService.getRoom(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    await RoomService.killRoom(roomId, ownerId);

    await PeerService.broadcast(room.users, {
      type: MESSAGE_TYPES.ROOM_KILLED,
      roomId
    });

    for (const userId of room.users) {
      await PresenceService.leaveRoom(userId);
    }

    return {
      success: true,
      type: MESSAGE_TYPES.ROOM_KILLED
    };
  }

  async getRoomState(roomId) {
    const room = await RoomService.getRoomState(roomId);

    return {
      success: true,
      type: MESSAGE_TYPES.ROOM_STATE,
      room
    };
  }

  async listUsers(roomId) {
    const users = await RoomService.getUsers(roomId);

    return {
      success: true,
      users
    };
  }

  async listFiles(roomId) {
    const files = await RoomService.getFiles(roomId);

    return {
      success: true,
      files
    };
  }

  async roomExists(roomId) {
    const exists = await RoomService.roomExists(roomId);

    return {
      success: true,
      exists
    };
  }

  async userCount(roomId) {
    const count = await RoomService.userCount(roomId);

    return {
      success: true,
      count
    };
  }
}

export default new RoomController();