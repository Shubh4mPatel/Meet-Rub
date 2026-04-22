# Chat File Upload Feature Documentation

## Overview
This feature allows users to upload and share files (images, videos, audio, documents) in chat conversations. Files are uploaded to MinIO storage and shared via Socket.IO events.

---

## Architecture Flow

```
1. Client → HTTP POST /api/chat/upload-file (with file) → Backend API
2. Backend validates file (20MB max, all types allowed)
3. Backend uploads to MinIO: chat-files/{chatRoomId}/{timestamp}-{filename}
4. Backend returns file metadata (URL, filename, size, type)
5. Client → Socket.IO 'send-file-message' event (with metadata) → Chat Server
6. Chat Server saves message to PostgreSQL with file_url
7. Chat Server → Socket.IO 'receive-file-message' event → All room participants
```

---

## API Endpoints

### 1. Upload File
**POST** `/api/chat/upload-file`

**Authentication:** Required (JWT token)

**Content-Type:** `multipart/form-data`

**Request Body:**
- `file` (File) - The file to upload
- `chatRoomId` (String) - The chat room ID (format: "smallerId-largerId")

**File Constraints:**
- Max size: 20MB
- Allowed types: All file types

**Success Response (200):**
```json
{
  "status": "success",
  "message": "File uploaded successfully",
  "data": {
    "file_url": "https://presigned-url-to-file.com/...",
    "filename": "document.pdf",
    "file_size": 1048576,
    "file_type": "file",
    "mime_type": "application/pdf",
    "object_name": "chat-files/123-456/1234567890-abc123-document.pdf"
  }
}
```

**File Type Detection:**
- `image`: MIME type starts with `image/`
- `video`: MIME type starts with `video/`
- `audio`: MIME type starts with `audio/`
- `file`: All other types (documents, PDFs, etc.)

**Error Responses:**
- `400 Bad Request`: No file uploaded or missing chatRoomId
- `401 Unauthorized`: Not authenticated
- `413 Payload Too Large`: File exceeds 20MB
- `500 Internal Server Error`: Upload failed

**Example cURL:**
```bash
curl -X POST http://localhost:3000/api/chat/upload-file \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/file.pdf" \
  -F "chatRoomId=123-456"
```

---

## Socket.IO Events

### Client → Server Events

#### 1. send-file-message
Send a file message to a chat room.

**Event Name:** `send-file-message`

**Payload:**
```javascript
{
  recipientId: 456,                    // User ID of recipient
  file_url: "https://...",             // Presigned URL from upload endpoint
  filename: "document.pdf",            // Original filename
  file_size: 1048576,                  // File size in bytes
  file_type: "file",                   // 'image', 'video', 'audio', or 'file'
  message: "Check this out!"           // Optional caption/message
}
```

**Client Example:**
```javascript
socket.emit('send-file-message', {
  recipientId: 456,
  file_url: response.data.file_url,
  filename: response.data.filename,
  file_size: response.data.file_size,
  file_type: response.data.file_type,
  message: 'Here is the document we discussed'
});
```

---

### Server → Client Events

#### 1. receive-file-message
Receive a file message in the chat room.

**Event Name:** `receive-file-message`

**Payload:**
```javascript
{
  id: 789,                             // Message ID
  senderId: 123,                       // Sender user ID
  senderUsername: "John Doe",          // Sender's username
  recipientId: 456,                    // Recipient user ID
  message: "Check this out!",          // Caption/message text
  file_url: "https://...",             // Presigned URL to file
  filename: "document.pdf",            // Original filename
  file_size: 1048576,                  // File size in bytes
  message_type: "file",                // 'image', 'video', 'audio', or 'file'
  timestamp: "2024-04-23T10:30:00Z",  // ISO timestamp
  chatRoomId: "123-456",              // Chat room ID
  isRead: false                        // Read status
}
```

**Client Example:**
```javascript
socket.on('receive-file-message', (data) => {
  console.log(`New ${data.message_type} from ${data.senderUsername}`);
  console.log(`File: ${data.filename} (${data.file_size} bytes)`);
  console.log(`Download: ${data.file_url}`);
  
  // Display in UI based on message_type
  if (data.message_type === 'image') {
    displayImage(data.file_url, data.message);
  } else if (data.message_type === 'video') {
    displayVideo(data.file_url, data.message);
  } else {
    displayFileLink(data.filename, data.file_url, data.file_size);
  }
});
```

---

## Database Schema Updates

### messages Table
Added column:
- `file_url` VARCHAR(255) - Stores the MinIO object path

**Updated INSERT:**
```sql
INSERT INTO messages (
  room_id, 
  sender_id, 
  recipient_id, 
  message, 
  message_type, 
  custom_package_id, 
  deadline_extension_id, 
  file_url,          -- NEW
  created_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
```

**Message Types:**
- `text` - Regular text message
- `image` - Image file
- `video` - Video file
- `audio` - Audio file
- `file` - Document/other file
- `package` - Custom package offer
- `deadline_extension` - Deadline extension request

---

## MinIO Storage Structure

**Bucket:** `meet-rub-assets` (or from `BUCKET_NAME` env variable)

**Folder Structure:**
```
chat-files/
  └── {chatRoomId}/
      ├── {timestamp}-{random}-{sanitized-filename}.ext
      ├── 1714723800000-abc123-document.pdf
      ├── 1714723850000-xyz789-screenshot.png
      └── 1714723900000-def456-video.mp4
```

**File Naming Convention:**
- `{timestamp}`: Unix timestamp in milliseconds
- `{random}`: 6-character random string (alphanumeric)
- `{sanitized-filename}`: Original filename with special characters replaced by underscores

**Example:**
- Original: `My Document (final).pdf`
- Stored as: `chat-files/123-456/1714723800000-abc123-My_Document__final_.pdf`

---

## Frontend Implementation Guide

### Complete Upload Flow

```javascript
// 1. Upload file to backend API
async function uploadChatFile(file, chatRoomId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('chatRoomId', chatRoomId);

  try {
    const response = await fetch('/api/chat/upload-file', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return await response.json();
  } catch (error) {
    console.error('File upload error:', error);
    throw error;
  }
}

// 2. Send file message via Socket.IO
function sendFileMessage(recipientId, fileData, caption = '') {
  socket.emit('send-file-message', {
    recipientId: recipientId,
    file_url: fileData.data.file_url,
    filename: fileData.data.filename,
    file_size: fileData.data.file_size,
    file_type: fileData.data.file_type,
    message: caption
  });
}

// 3. Complete flow with user interaction
async function handleFileUpload(event, recipientId, chatRoomId) {
  const file = event.target.files[0];
  
  if (!file) return;
  
  // Check file size on client side
  if (file.size > 20 * 1024 * 1024) {
    alert('File size must be less than 20MB');
    return;
  }

  try {
    // Show loading state
    showUploadProgress(true);
    
    // Upload file
    const uploadResult = await uploadChatFile(file, chatRoomId);
    
    // Send message
    const caption = prompt('Add a caption (optional):') || '';
    sendFileMessage(recipientId, uploadResult, caption);
    
    // Hide loading state
    showUploadProgress(false);
    
    console.log('File sent successfully!');
  } catch (error) {
    console.error('Error:', error);
    alert('Failed to upload file');
    showUploadProgress(false);
  }
}

// 4. Listen for incoming file messages
socket.on('receive-file-message', (data) => {
  addFileMessageToChat(data);
});

function addFileMessageToChat(data) {
  const messageElement = document.createElement('div');
  messageElement.className = data.senderId === currentUserId ? 'message-sent' : 'message-received';
  
  let content = '';
  
  switch (data.message_type) {
    case 'image':
      content = `
        <img src="${data.file_url}" alt="${data.filename}" class="chat-image" />
        <p>${data.message}</p>
      `;
      break;
      
    case 'video':
      content = `
        <video controls class="chat-video">
          <source src="${data.file_url}" type="video/mp4">
        </video>
        <p>${data.message}</p>
      `;
      break;
      
    case 'audio':
      content = `
        <audio controls class="chat-audio">
          <source src="${data.file_url}" type="audio/mpeg">
        </audio>
        <p>${data.message}</p>
      `;
      break;
      
    default: // 'file'
      const fileSizeMB = (data.file_size / (1024 * 1024)).toFixed(2);
      content = `
        <div class="file-attachment">
          <a href="${data.file_url}" download="${data.filename}" target="_blank">
            📎 ${data.filename} (${fileSizeMB} MB)
          </a>
        </div>
        <p>${data.message}</p>
      `;
  }
  
  messageElement.innerHTML = `
    <div class="message-header">
      <span class="sender">${data.senderUsername}</span>
      <span class="timestamp">${formatTimestamp(data.timestamp)}</span>
    </div>
    <div class="message-content">
      ${content}
    </div>
  `;
  
  chatContainer.appendChild(messageElement);
  scrollToBottom();
}
```

---

## Security Considerations

1. **Authentication**: All requests require valid JWT token
2. **File Size Limit**: 20MB enforced on both client and server
3. **Storage Isolation**: Files stored per chat room in separate folders
4. **Presigned URLs**: 24-hour expiry for security
5. **Filename Sanitization**: Special characters removed to prevent path traversal
6. **Chat Room Validation**: TODO - Verify user has access to chat room

---

## Testing Checklist

- [ ] Upload image file (JPG, PNG)
- [ ] Upload video file (MP4)
- [ ] Upload audio file (MP3)
- [ ] Upload document (PDF, DOCX)
- [ ] Test 20MB file size limit
- [ ] Test file exceeding 20MB (should fail)
- [ ] Test upload without authentication (should fail with 401)
- [ ] Test upload without file (should fail with 400)
- [ ] Test upload without chatRoomId (should fail with 400)
- [ ] Verify file appears in MinIO storage
- [ ] Verify presigned URL is valid
- [ ] Verify message saved in database with file_url
- [ ] Verify receive-file-message event broadcasts to both users
- [ ] Verify chat history includes file messages with file_url
- [ ] Test file with special characters in filename
- [ ] Test concurrent uploads

---

## Environment Variables

Add to `.env` file:

```env
# MinIO Configuration (if not already present)
BUCKET_NAME=meet-rub-assets
MINIO_ENDPOINT=your-minio-endpoint
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_USE_SSL=false
```

---

## Troubleshooting

### Issue: "File upload failed" error
- Check MinIO connection and credentials
- Verify BUCKET_NAME exists in MinIO
- Check server logs for detailed error

### Issue: "File size exceeds limit"
- Ensure file is under 20MB
- Check both client-side and server-side validation

### Issue: "File URL not accessible"
- Verify presigned URL hasn't expired (24 hour limit)
- Check MinIO permissions and public access settings

### Issue: "File message not appearing in chat history"
- Verify file_url column exists in messages table
- Check getChatHistory query includes m.file_url in SELECT

---

## Future Enhancements

- [ ] Add progress tracking for large file uploads
- [ ] Generate thumbnails for images and videos
- [ ] Add virus scanning for uploaded files
- [ ] Support drag-and-drop file upload
- [ ] Add file preview before sending
- [ ] Support multiple file uploads at once
- [ ] Add file type icons for different document types
- [ ] Implement file compression for large images
- [ ] Add ability to delete/revoke sent files
- [ ] Add download count tracking
