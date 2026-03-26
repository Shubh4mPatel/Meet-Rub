# MeetRub Chat Server — Context Summary

> Use this document as context for your AI code assistant to understand the chat server architecture, Socket.IO event contracts, Redis key conventions, and data flow.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express 5 + Socket.IO 4 |
| Database | PostgreSQL (via `pg` pool) |
| Cache / Presence | Redis 5 |
| Auth | JWT (cookie-based: `AccessToken` + `RefreshToken`) |
| File Storage | MinIO (S3-compatible, presigned URLs) |
| Email | Nodemailer |
| Queue | RabbitMQ (amqplib) |
| Logging | Winston |

**Entry point:** `src/server.js`

---

## Key Files

```
chat-server/
├── src/server.js                  # App entry — HTTP + Socket.IO setup
├── controller/chat.js             # ALL socket event handlers (main file)
├── model/chatmodel.js             # All DB queries (PostgreSQL)
├── middleware/authentication.js   # Socket.IO JWT auth middleware
├── config/dbConfig.js             # pg pool setup
├── config/reddis.js               # Redis client setup
├── utils/helper.js                # createPresignedUrl() for MinIO
├── utils/offerEmails.js           # sendOfferSentEmail / sendOfferReceivedEmail
├── utils/logger.js                # Winston logger
├── consumers/inAppConsumer.js     # RabbitMQ consumer
└── cron/logmanager.js             # Cron jobs
```

---

## Authentication Flow

- Socket connections are authenticated via `middleware/authentication.js` (`socketAuth`)
- Reads `AccessToken` cookie → verifies JWT → attaches decoded payload to `socket.user`
- On expiry, attempts refresh using `RefreshToken` cookie → issues new `AccessToken` (15 min)
- `socket.user` shape:
  ```js
  {
    user_id,   // number — primary user ID
    email,
    name,
    role,      // 'creator' | 'freelancer' | 'admin'
    roleWiseId // creator_id or freelancer_id (role-specific table FK)
  }
  ```

---

## Redis Key Conventions

| Key | Type | Value | TTL |
|-----|------|-------|-----|
| `user:{userId}:socketId` | string | Socket.IO socket ID | 1 hr |
| `user:{userId}:online` | string | `"true"` | 1 hr |
| `user:{userId}:username` | string | display name | 1 hr |
| `user:{userId}:activeRoom` | string | `"{smallerId}-{largerId}"` | 1 hr |
| `typing:{chatRoomId}:{userId}` | string | `"true"` | 5 sec |
| `online_users` | set | all currently online user IDs | — |

---

## Chat Room ID Convention

Room IDs are deterministic — always `"{smallerId}-{largerId}"` (sorted numerically).
Both participants compute the same room ID client-side and server-side.

```js
const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
const chatRoomId = `${smallerId}-${largerId}`;
```

---

## Socket.IO Event Reference

### Client → Server (emit these from frontend)

#### Connection & Room Management
| Event | Payload | Description |
|-------|---------|-------------|
| `join-chat` | `{ recipientId }` | Join a private room, get history + participants |
| `leave-chat` | `{ recipientId }` | Leave room, clear Redis activeRoom |

#### Messaging
| Event | Payload | Description |
|-------|---------|-------------|
| `send-message` | `{ recipientId, message }` | Send a text message |
| `typing` | `{ recipientId, isTyping }` | Broadcast typing indicator |
| `delete-message` | `{ messageId }` | Soft-delete a message (sender only) |
| `mark-as-read` | `{ recipientId }` | Mark all messages in room as read |
| `load-more-messages` | `{ recipientId, offset?, limit? }` | Paginate older messages (default limit: 50) |
| `search-messages` | `{ searchTerm }` | Search across all user's messages |

#### Packages (Offers)
| Event | Payload | Description |
|-------|---------|-------------|
| `custom-package` | `(packageData, recipientId)` | Send a custom package offer |
| `accept-package` | `(packageId, recipientId)` | Accept a package → creates project |
| `reject-package` | `(packageId, recipientId)` | Reject a package offer |
| `revoke-custom-package` | `(packageId, recipientId)` | Revoke your own pending package |

#### Deadline Extensions
| Event | Payload | Description |
|-------|---------|-------------|
| `deadline-extension-request` | `(extensionData, recipientId)` | Freelancer requests extension |
| `accept-deadline-extension` | `(requestId, recipientId)` | Creator accepts extension |
| `reject-deadline-extension` | `(requestId, recipientId)` | Creator rejects extension |

#### Utility
| Event | Payload | Description |
|-------|---------|-------------|
| `get-chat-rooms` | _(none)_ | Get all chat rooms for current user |
| `check-user-status` | `{ targetUserId }` | Check if a user is online |
| `read-notification` | `{ notificationId }` | Mark single notification as read |
| `read-all-notifications` | _(none)_ | Mark all notifications as read |
| `admin-get-chat-history` | `{ roomId, limit?, offset? }` | Admin: fetch any room's history (role=admin only) |

---

### Server → Client (listen for these on frontend)

#### Connection Setup (fires on connect)
| Event | Payload | Description |
|-------|---------|-------------|
| `online-users` | `[userId, ...]` | Full list of online user IDs (broadcast to all) |
| `unread-count` | `{ count }` | Current user's unread message count |
| `initial_notifications` | `[notification, ...]` | Top 5 unread notifications |

#### Room / Chat
| Event | Payload | Description |
|-------|---------|-------------|
| `chat-joined` | `{ chatRoomId, recipientId, chatHistory, participants }` | Response to `join-chat` |
| `chat-rooms-list` | `{ chatRooms }` | Response to `get-chat-rooms` |
| `services-list` | `{ freelancerId, services }` | Freelancer's services (fires on join-chat) |
| `projects-list` | `{ projects }` | Freelancer's projects with this creator (freelancer only) |
| `pending-payments` | `{ payments }` | Creator's pending payments with this freelancer (creator only) |

#### Messages
| Event | Payload | Description |
|-------|---------|-------------|
| `receive-message` | `{ id, senderId, senderUsername, recipientId, message, timestamp, chatRoomId, isRead }` | New text message |
| `older-messages` | `{ chatRoomId, messages, offset, hasMore }` | Paginated older messages |
| `search-results` | `{ results }` | Message search results |
| `message-deleted` | `{ messageId, roomId }` | A message was deleted |
| `messages-read` | `{ userId, chatRoomId }` | Recipient read the messages |
| `user-typing` | `{ userId, username, isTyping }` | Typing indicator |
| `unread-count` | `{ count }` | Updated unread count (after mark-as-read) |

#### Packages
| Event | Payload | Description |
|-------|---------|-------------|
| `receive-custom-package` | `{ id, senderId, senderUsername, recipientId, message, timestamp, chatRoomId, isRead, customPackage }` | New package offer |
| `package-accepted` | `{ packageId, chatRoomId, acceptedBy, package, project }` | Package was accepted |
| `package-rejected` | `{ packageId, chatRoomId, rejectedBy, package }` | Package was rejected |
| `custom-package-revoked` | `{ packageId, chatRoomId, revokedBy, package }` | Package was revoked |
| `payment-required` | `{ project_id, amount, chatRoomId, message, customPackage }` | Sent to creator after package acceptance |

#### Deadline Extensions
| Event | Payload | Description |
|-------|---------|-------------|
| `receive-deadline-extension-request` | `{ id, senderId, senderUsername, recipientId, message, timestamp, chatRoomId, isRead, deadlineExtension, project }` | New extension request |
| `deadline-extension-accepted` | `{ requestId, chatRoomId, acceptedBy, deadlineExtension, project }` | Extension accepted |
| `deadline-extension-rejected` | `{ requestId, chatRoomId, rejectedBy, deadlineExtension }` | Extension rejected |

#### Notifications
| Event | Payload | Description |
|-------|---------|-------------|
| `notification` | `{ id, event_type, title, body, action_type, action_route, is_read, created_at }` | Live in-app notification |
| `user-status` | `{ userId, isOnline }` | Response to `check-user-status` |
| `admin-chat-history` | `{ roomId, chatHistory, offset, hasMore, participants }` | Response to admin event |
| `error` | `{ message }` | Error from any event handler |

---

## Notification Event Types (`event_type`)

| Value | Triggered When |
|-------|---------------|
| `new_message` | Text message received (skipped if recipient is in same room) |
| `hire_request` | Creator sends a custom package |
| `package_sent` | Freelancer sends a custom package |
| `package_accepted` | Package offer accepted |
| `package_rejected` | Package offer rejected |
| `deadline_extension` | Freelancer requests deadline extension |
| `deadline_extension_accepted` | Creator accepts extension |
| `deadline_extension_rejected` | Creator rejects extension |

`action_type` is always `'link'`; `action_route` is the `chatRoomId`.

---

## Role-Based Logic Summary

| Role | Special Behavior |
|------|----------------|
| `freelancer` | Receives `projects-list` on join; can send `deadline-extension-request`; sends packages that trigger offer emails |
| `creator` | Receives `pending-payments` on join; only role that can `accept-deadline-extension`; receives `payment-required` after package accepted |
| `admin` | Only role allowed to use `admin-get-chat-history` |

---

## Data Flow: Package Lifecycle

```
Freelancer sends "custom-package"
  → saveCustomPackage() in DB
  → saveMessage(type="package") in DB
  → emit "receive-custom-package" to chatRoom
  → sendOfferSentEmail() to freelancer
  → sendOfferReceivedEmail() to creator
  → emitWebNotification(package_sent) to creator

Creator sends "accept-package"
  → acceptPackage() in DB
  → createProjectFromPackage() → creates project
  → emit "package-accepted" to chatRoom
  → emit "payment-required" directly to creator's socket
  → emitWebNotification(package_accepted) to freelancer
```

---

## DB Tables (inferred from model)

- `users` — `id`, `user_email`, `user_name`, `user_role`
- `chat_rooms` — `room_id` (PK, format: `"{id1}-{id2}"`), `user1_id`, `user2_id`
- `messages` — `id`, `room_id`, `sender_id`, `recipient_id`, `message`, `message_type`, `custom_package_id`, `deadline_extension_id`, `created_at`
- `custom_packages` — `id`, `room_id`, `sender_id`, `recipient_id`, `service_type`, `price`, `delivery_days`, `status` (pending/accepted/rejected/revoked)
- `projects` — `id`, `creator_id`, `amount`, created from accepted packages
- `deadline_extensions` — `id`, `project_id`, `room_id`, `sender_id`, `recipient_id`, `status`
- `web_notifications` — `id`, `recipient_id`, `sender_id`, `event_type`, `title`, `body`, `action_type`, `action_route`, `is_read`, `created_at`

---

## Message Types (`message_type`)

| Type | Description |
|------|-------------|
| `text` | Regular chat message |
| `package` | Custom package offer (references `custom_package_id`) |
| `deadline_extension` | Extension request (references `deadline_extension_id`) |
