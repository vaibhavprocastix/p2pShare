# p2pShare Architecture Modules

## Backend Modules

### `roomService.js`

Responsible only for room lifecycle management.

**Functions** - `createRoom()` -- Creates a new room after validating
room ID, password, and owner. - `joinRoom()` -- Validates password,
checks the 10-user limit, registers the user, and returns the current
room state. - `leaveRoom()` -- Removes a user from the room and updates
presence. - `killRoom()` -- Deletes the room, notifies connected users,
and removes all Redis data. - `cleanup()` -- Removes inactive rooms
after a grace period (e.g., 30 seconds after the last user leaves).

### `fileService.js`

Responsible only for workspace file metadata.

**Functions** - `addFile()` - `removeFile()` - `getFiles()` -
`updatePresence()`

### `peerService.js`

Responsible only for peer-to-peer file transfers.

**Responsibilities** - Handle download requests - Forward WebRTC Offer -
Forward WebRTC Answer - Relay ICE candidates - Handle disconnects and
cleanup

### `websocket.js`

Responsible only for WebSocket connection management.

**Responsibilities** - Accept incoming connections - Register clients -
Handle disconnects - Maintain heartbeat/ping-pong - Broadcast room
events

> No business logic should exist here.

### `signaling.js`

Routes incoming WebSocket messages.

**Supported Messages** - CREATE_ROOM - JOIN_ROOM - LEAVE_ROOM -
ADD_FILE - REMOVE_FILE - DOWNLOAD_REQUEST - WEBRTC_OFFER -
WEBRTC_ANSWER - ICE_CANDIDATE - KILL_ROOM

## Frontend Modules

### `app.js`

-   Create Room
-   Join Room
-   Form validation
-   Store session details
-   Redirect to workspace

### `workspace.js`

-   Load workspace
-   Leave room
-   Kill room
-   Listen for workspace updates

### `files.js`

-   Upload file
-   Download file
-   Remove file
-   Render file list
-   Update timestamps
-   Show owner status

### `dragdrop.js`

-   Drag enter
-   Drag leave
-   Drag over
-   Drop
-   Browse file picker

### `websocket.js`

-   Connect
-   Disconnect
-   Send
-   Reconnect
-   Heartbeat

### `webrtc.js`

-   Create Offer
-   Create Answer
-   Exchange ICE candidates
-   Create DataChannel
-   Chunked file transfer

### `ui.js`

-   Toast notifications
-   Progress bars
-   Loading indicators
-   Confirmation dialogs
-   Online/offline badges

## Redis Keys

``` text
room:<id>
room:<id>:users
room:<id>:files
room:<id>:presence
```

## Room Model

``` text
Room
├── id
├── passwordHash
├── owner
├── createdAt
├── users
└── files
```

## File Model

``` text
File
├── id
├── ownerId
├── ownerName
├── filename
├── size
├── mime
└── uploadedAt
```

## Project Limits

``` text
MAX_USERS = 10
MAX_ROOM_NAME = 50 characters
MAX_PASSWORD = 128 characters
Heartbeat = 15 seconds
Offline timeout = 45 seconds
Room cleanup = 30 seconds after the last user leaves
```
