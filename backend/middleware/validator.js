import ERROR_CODES from "../constants/errorCodes.js";

function isString(value) {
  return typeof value === "string";
}

function isNonEmptyString(value) {
  return isString(value) && value.trim().length > 0;
}

function isPositiveNumber(value) {
  return typeof value === "number" && value > 0;
}

export function validateConnect(data) {
  if (!isNonEmptyString(data.userId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid userId."
    };
  }

  return { valid: true };
}

export function validateCreateRoom(data) {
  if (!isNonEmptyString(data.ownerId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid ownerId."
    };
  }

  if (!isNonEmptyString(data.password)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_PASSWORD,
      message: "Password cannot be empty."
    };
  }

  return { valid: true };
}

export function validateJoinRoom(data) {
  if (!isNonEmptyString(data.roomId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_ROOM_ID,
      message: "Invalid roomId."
    };
  }

  if (!isNonEmptyString(data.userId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid userId."
    };
  }

  if (!isNonEmptyString(data.password)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_PASSWORD,
      message: "Password required."
    };
  }

  return { valid: true };
}

export function validateFileMetadata(data) {
  if (!isNonEmptyString(data.roomId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_ROOM_ID,
      message: "Invalid room."
    };
  }

  if (!isNonEmptyString(data.ownerId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid owner."
    };
  }

  if (!isNonEmptyString(data.fileName)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_FILE,
      message: "Invalid filename."
    };
  }

  if (!isPositiveNumber(data.fileSize)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_FILE,
      message: "Invalid filesize."
    };
  }

  if (!isPositiveNumber(data.totalChunks)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_CHUNK,
      message: "Invalid chunk count."
    };
  }

  return { valid: true };
}

export function validateDownloadRequest(data) {
  if (!isNonEmptyString(data.fileId)) {
    return {
      valid: false,
      code: ERROR_CODES.FILE_NOT_FOUND,
      message: "Invalid fileId."
    };
  }

  if (!isNonEmptyString(data.senderId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid sender."
    };
  }

  if (!isNonEmptyString(data.receiverId)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid receiver."
    };
  }

  return { valid: true };
}

export function validateSignal(data) {
  if (!isNonEmptyString(data.from)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid sender."
    };
  }

  if (!isNonEmptyString(data.to)) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_USERNAME,
      message: "Invalid receiver."
    };
  }

  return { valid: true };
}

export function validateMessage(data) {
  if (!data || typeof data !== "object") {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_MESSAGE,
      message: "Invalid message."
    };
  }

  if (!data.type) {
    return {
      valid: false,
      code: ERROR_CODES.INVALID_MESSAGE,
      message: "Missing message type."
    };
  }

  return {
    valid: true
  };
}