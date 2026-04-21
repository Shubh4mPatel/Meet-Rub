Support Chat Assignment - Functional Flow
1. Prerequisites Setup
Admin Identification

Mark admin users in users table (role = 'admin' or is_admin flag)
Initialize Redis counters for each admin: admin:{adminId}:assigned_count = 0

Database Objects

New table: support_assignments (tracks user-to-admin mapping)
Reuse existing: chat_rooms table for support conversations
Reuse existing: messages table for chat history


2. User Initiates Support Contact
Trigger: User clicks "Contact Admin" button
System Actions:

Query support_assignments with user_id
Branch A - Existing Assignment Found:

Retrieve stored admin_id and room_id
Load existing chat room
Display chat interface
End flow


Branch B - No Assignment (First Time):

Proceed to assignment logic




3. Admin Assignment Logic (First Time Only)
Step 1: Fetch all admin user IDs from database
Step 2: Query Redis for each admin's assignment count

Key: admin:{adminId}:assigned_count
Default to 0 if not exists

Step 3: Select admin with minimum count

If tie (multiple admins with same count) → pick first/random

Step 4: Increment selected admin's counter in Redis
Step 5: Generate room_id = support_{userId}_{adminId}
Step 6: Create chat room entry

Insert into chat_rooms (user1_id, user2_id, room_id)
Respect constraint: user1_id < user2_id

Step 7: Save assignment mapping

Insert into support_assignments (user_id, admin_id, room_id)


4. Notification & Chat Activation
To Admin:

Send real-time notification (Socket.IO) to assigned admin
Payload: user details, room_id

To User:

Open chat interface with assigned admin
Chat ready for messaging


5. Ongoing Communication
All Future Sessions:

User clicks "Contact Admin" → Step 2 (Branch A) → same admin, same room
No reassignment ever
Chat history persists in messages table

Message Flow:

Use existing Socket.IO chat infrastructure
Room identifier: room_id from support_assignments
Both parties see full history


6. Edge Cases
Admin Deleted/Deactivated:

Foreign key CASCADE deletes assignment
Next time user contacts → new assignment cycle

User Deleted:

CASCADE deletes assignment + chat room + messages

Redis Counter Lost (server restart):

Rebuild counters from support_assignments count per admin
Or accept temporary imbalance (self-corrects with new assignments)

