# p2pShare v2.0 Architecture (Final)

## Goal

A room-based P2P file sharing workspace where:

-   Users manually enter Room ID and Password
-   Maximum 10 users per room
-   Server stores only metadata
-   Actual files remain only in the owner's browser
-   Downloads happen over WebRTC P2P
-   If the owner is offline, the file remains visible but is not
    downloadable
-   Rooms are automatically cleaned when the last user leaves (after a
    grace period)

------------------------------------------------------------------------

# High-Level Architecture

``` text
Browser
   │
WebSocket Signaling
   │
Express + ws Server
   │
 ├── RoomService
 ├── FileService
 └── Redis (metadata only)

Owner Browser <---- WebRTC DataChannel ----> Receiver Browser
```

------------------------------------------------------------------------

# Backend Layers

``` text
Frontend
   ↓
WebSocket
   ↓
signaling.js
   ↓
Controllers
   ↓
Services
   ↓
Redis
```

Each layer has one responsibility.

------------------------------------------------------------------------

# Room Lifecycle

## Create Room

-   CREATE_ROOM
-   Validate
-   Create Redis keys
-   Owner joins automatically
-   ROOM_CREATED

## Join Room

-   JOIN_ROOM
-   Validate room
-   Validate password
-   Check capacity (10 users)
-   ROOM_STATE returned

## Leave Room

-   Remove user
-   Remove presence
-   If last user leaves, start a 30-second cleanup timer
-   Delete room only if still empty after the timer

------------------------------------------------------------------------

# Workspace

The server stores only metadata:

-   Users
-   File metadata
-   Presence

Actual file contents never leave the owner's browser except during P2P
transfer.

------------------------------------------------------------------------

# Download Flow

1.  User clicks Download.
2.  Backend receives DOWNLOAD_REQUEST.
3.  Backend checks if owner is online.
4.  If offline → SENDER_OFFLINE.
5.  If online → notify owner.
6.  Perform WebRTC Offer / Answer / ICE exchange.
7.  Transfer over DataChannel.
8.  Close the connection.

------------------------------------------------------------------------

# WebSocket Message Format

``` json
{
  "type": "...",
  "roomId": "...",
  "payload": {}
}
```

------------------------------------------------------------------------

# Message Types

## Room

-   CREATE_ROOM
-   JOIN_ROOM
-   LEAVE_ROOM
-   ROOM_CREATED
-   ROOM_JOINED
-   ROOM_LEFT
-   ROOM_STATE
-   ROOM_KILLED

## Files

-   ADD_FILE
-   FILE_ADDED
-   REMOVE_FILE
-   FILE_REMOVED
-   FILE_LIST

## Presence

-   HEARTBEAT
-   USER_JOINED
-   USER_LEFT
-   USER_ONLINE
-   USER_OFFLINE

## Download

-   DOWNLOAD_REQUEST
-   DOWNLOAD_ACCEPTED
-   DOWNLOAD_DENIED
-   SENDER_OFFLINE

## WebRTC

-   WEBRTC_OFFER
-   WEBRTC_ANSWER
-   ICE_CANDIDATE

------------------------------------------------------------------------

# Redis Schema

``` text
room:<roomId>
  ownerId
  ownerName
  passwordHash
  createdAt

room:<roomId>:users
  userIds

room:<roomId>:presence
  userId -> timestamp

room:<roomId>:files
  fileIds

file:<fileId>
  id
  roomId
  name
  size
  mimeType
  ownerId
  ownerName
  uploadedAt
  online
```

------------------------------------------------------------------------

# Heartbeat

-   Every 15 seconds
-   Timeout after 45 seconds
-   User marked offline
-   File metadata remains visible

------------------------------------------------------------------------

# Permissions

## Owner

-   Kill room
-   Remove any file

## Uploader

-   Remove own file

## Others

-   Download only

------------------------------------------------------------------------

# File Transfer

-   One RTCPeerConnection per download
-   No permanent mesh

Chunk transfer:

-   256 KB chunks
-   Sliding window
-   ACK based
-   Retransmission on failure

------------------------------------------------------------------------

# Security

-   bcrypt password hashing
-   Backend validation for:
    -   Room ID
    -   Password
    -   Username
    -   Filename
    -   MIME type
    -   File size
    -   Permissions

------------------------------------------------------------------------

# Deployment

``` text
Nginx
 ↓
Express
 ↓
Redis
 ↓
Coturn
 ↓
Docker Compose
```

------------------------------------------------------------------------

# Logging

Use:

-   logger.info()
-   logger.warn()
-   logger.error()

Avoid direct console.log().

------------------------------------------------------------------------

# Frontend Modules

-   app.js
-   workspace.js
-   websocket.js
-   webrtc.js
-   files.js
-   dragdrop.js
-   ui.js

------------------------------------------------------------------------

# Recommended Additional Service

## downloadService.js

Responsibilities:

-   Validate download requests
-   Check owner availability
-   Send DOWNLOAD_REQUEST
-   Track active download sessions
-   Clean up completed or abandoned downloads
