# Meet-Rub

A real-time meeting and chat application with microservices architecture for scalable communication and notification delivery.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [System Flow](#system-flow)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Running the Application](#running-the-application)
- [Service Management](#service-management)
- [Accessing Services](#accessing-services)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

Meet-Rub is built using a microservices architecture with the following components:

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Layer                         │
│                  (Web/Mobile Applications)                   │
└──────────────────┬─────────────────┬────────────────────────┘
                   │                 │
                   │                 │
        ┌──────────▼─────────┐  ┌───▼──────────────┐
        │   Backend API      │  │   Chat Server    │
        │   (Port 7000)      │  │   (Port 7001)    │
        │   - REST API       │  │   - WebSocket    │
        │   - Authentication │  │   - Real-time    │
        │   - Business Logic │  │   - Messaging    │
        └──────┬─────────┬───┘  └────┬─────────────┘
               │         │            │
               │         │            │
        ┌──────▼─────────▼────────────▼─────┐
        │         RabbitMQ (5672)            │
        │       Message Queue/Broker         │
        │   - Async Task Distribution        │
        │   - Event Publishing               │
        └──────┬────────────────────────────┘
               │
        ┌──────▼────────────┐
        │  Worker Service   │
        │  - Email Sending  │
        │  - Notifications  │
        │  - Async Tasks    │
        └───────────────────┘

        ┌──────────────────────────────────┐
        │   Redis (Port 6378)              │
        │   - Caching                      │
        │   - Session Storage              │
        │   - Queue Management (BullMQ)    │
        └──────────────────────────────────┘
```

### Services

1. **Backend API (Port 7000)**
   - RESTful API server built with Express.js
   - Handles authentication, authorization, and business logic
   - Manages user data, meetings, and application state
   - Publishes events to RabbitMQ for async processing
   - Uses Redis for caching and session management

2. **Chat Server (Port 7001)**
   - WebSocket server using Socket.IO
   - Provides real-time bidirectional communication
   - Handles chat messages, presence, and notifications
   - Integrated with Redis for scaling and session sync

3. **Worker Service**
   - Background job processor
   - Consumes messages from RabbitMQ queues
   - Handles email delivery, push notifications, and async tasks
   - Uses BullMQ for reliable job processing

4. **RabbitMQ (Ports 5672, 15672)**
   - Message broker for async communication
   - Enables decoupled service architecture
   - Ensures reliable message delivery
   - Management UI available at port 15672

5. **Redis (Port 6378)**
   - In-memory data store
   - Caching layer for improved performance
   - Session storage for authenticated users
   - BullMQ queue backend for job processing

## System Flow

### 1. User Authentication Flow
```
User → Backend API (7000) → JWT Token → Store in Redis
                           ↓
                    Send to Client
```

### 2. Meeting Creation Flow
```
User → Backend API (7000) → Create Meeting → Publish Event → RabbitMQ
                           ↓                                    ↓
                    Save to Database                    Worker Service
                           ↓                                    ↓
                    Return Meeting ID            Send Email Notifications
```

### 3. Real-time Chat Flow
```
User → Chat Server (7001) via WebSocket → Validate JWT
                           ↓
                    Store Message → Redis Cache
                           ↓
                    Broadcast to Room Participants
                           ↓
                    Publish to RabbitMQ → Worker → Push Notifications
```

### 4. Notification Flow
```
Event Trigger → Backend/Chat → RabbitMQ Queue → Worker Service
                                                       ↓
                                              Process Notification
                                                       ↓
                                    ┌─────────────────┴─────────────────┐
                                    │                                   │
                              Email Service                      In-App Notification
                            (via Nodemailer)                    (via WebSocket)
```

## Technology Stack

### Backend Services
- **Runtime**: Node.js
- **Framework**: Express.js (v5)
- **Real-time**: Socket.IO (v4)
- **Database**: PostgreSQL (with pg driver)
- **Message Queue**: RabbitMQ (amqplib)
- **Cache**: Redis (ioredis, redis)
- **Job Queue**: BullMQ

### Security & Authentication
- **JWT**: jsonwebtoken
- **Encryption**: bcrypt, crypto-js
- **Security Headers**: helmet
- **Rate Limiting**: express-rate-limit

### Utilities
- **Validation**: Joi
- **File Processing**: multer, jszip
- **Email**: nodemailer
- **Logging**: winston, morgan
- **Scheduling**: node-cron
- **Object Storage**: MinIO

### DevOps
- **Containerization**: Docker & Docker Compose
- **Process Management**: nodemon (dev)
- **API Documentation**: Swagger (swagger-jsdoc, swagger-ui-express)

## Prerequisites

Before running the application, ensure you have the following installed:

### Required Software
- **Docker**: Version 20.10 or higher
  - [Download Docker Desktop](https://docs.docker.com/get-docker/)
- **Docker Compose**: Version 2.0 or higher
  - Included with Docker Desktop

### Verify Installation
```bash
docker --version
docker-compose --version
```

Expected output example:
```
Docker version 24.0.0
Docker Compose version 2.20.0
```

### System Requirements
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: At least 5GB free
- **OS**: Windows 10/11, macOS, or Linux

## Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Meet-Rub
```

### 2. Environment Configuration
Create a `.env` file in the root directory. This file should contain your environment-specific configuration variables for:
- Database credentials
- RabbitMQ credentials
- Redis password
- JWT secrets
- API keys
- Email service configuration

**Note**: Ensure `.env` is added to `.gitignore` and never committed to version control.

### 3. Directory Structure
```
Meet-Rub/
├── backend/              # Backend API service
│   ├── src/             # Source code
│   ├── logs/            # Application logs
│   ├── Dockerfile       # Docker configuration
│   └── package.json     # Dependencies
├── chat-server/          # WebSocket chat service
│   ├── src/             # Source code
│   ├── logs/            # Application logs
│   ├── Dockerfile       # Docker configuration
│   └── package.json     # Dependencies
├── worker/               # Background worker service
│   ├── worker.js        # Main worker file
│   ├── Dockerfile       # Docker configuration
│   └── package.json     # Dependencies
├── docker-compose.yml    # Docker orchestration
├── .env                  # Environment variables (create this)
└── README.md            # This file
```

## Running the Application

### Start All Services

Start all services in detached mode (background):
```bash
docker-compose up -d
```

Start with visible logs (useful for debugging):
```bash
docker-compose up
```

### First-Time Setup
On first run, Docker will:
1. Pull required images (RabbitMQ, Redis)
2. Build custom images for backend, chat-server, and worker
3. Create network and volumes
4. Start all services with health checks

This may take 5-10 minutes depending on your internet connection.

### Check Service Status
```bash
docker-compose ps
```

Expected output:
```
NAME                 STATUS              PORTS
meetrub-backend      Up (healthy)        0.0.0.0:7000->7000/tcp
meetrub-chat         Up (healthy)        0.0.0.0:7001->7001/tcp
meetrub-worker       Up
meetrub-rabbitmq     Up (healthy)        5672/tcp, 15672/tcp
meetrub-redis        Up (healthy)        0.0.0.0:6378->6378/tcp
```

## Service Management

### View Logs

View logs for all services:
```bash
docker-compose logs -f
```

View logs for a specific service:
```bash
docker-compose logs -f backend
docker-compose logs -f chat-server
docker-compose logs -f worker
```

### Stop Services

Stop all services (keeps containers):
```bash
docker-compose stop
```

Stop and remove containers:
```bash
docker-compose down
```

Stop and remove containers with volumes (clears all data):
```bash
docker-compose down -v
```

### Restart Services

Restart all services:
```bash
docker-compose restart
```

Restart a specific service:
```bash
docker-compose restart backend
docker-compose restart chat-server
```

### Rebuild Services

If you make code changes:
```bash
docker-compose up -d --build
```

Rebuild a specific service:
```bash
docker-compose up -d --build backend
```

## Accessing Services

Once all services are running:

### Application Services
- **Backend API**: http://localhost:7000
- **Backend Health Check**: http://localhost:7000/api/v1/health
- **Chat Server**: http://localhost:7001
- **Chat Server Health Check**: http://localhost:7001/health

### Infrastructure Services
- **RabbitMQ Management UI**: http://localhost:15672
  - Access with credentials from your `.env` file
- **Redis**: localhost:6378
  - Requires password from `.env` file

### Health Checks
All services include health check endpoints to monitor status:
```bash
# Backend health
curl http://localhost:7000/api/v1/health

# Chat server health
curl http://localhost:7001/health
```

## Troubleshooting

### Services Won't Start

**Check port conflicts:**
```bash
# Windows
netstat -ano | findstr :7000
netstat -ano | findstr :7001
netstat -ano | findstr :6378

# Linux/Mac
lsof -i :7000
lsof -i :7001
lsof -i :6378
```

**Solution**: Stop any processes using these ports or modify port mappings in `docker-compose.yml`

### View Service Health
```bash
docker-compose ps
```

Check detailed container status:
```bash
docker inspect meetrub-backend
docker inspect meetrub-chat
```

### Access Container Shell

For debugging inside a container:
```bash
docker exec -it meetrub-backend sh
docker exec -it meetrub-chat sh
docker exec -it meetrub-worker sh
```

### Check Container Logs for Errors
```bash
docker-compose logs backend | grep -i error
docker-compose logs chat-server | grep -i error
docker-compose logs worker | grep -i error
```

### RabbitMQ Connection Issues

If services can't connect to RabbitMQ:
1. Check RabbitMQ is healthy: `docker-compose ps rabbitmq`
2. Verify credentials in `.env` file match
3. Recreate containers: `docker-compose down -v && docker-compose up -d`

### Redis Connection Issues

If services can't connect to Redis:
1. Check Redis is healthy: `docker-compose ps redis`
2. Verify Redis password in `.env` file
3. Test connection:
   ```bash
   docker exec -it meetrub-redis redis-cli -p 6378 -a <password> ping
   ```

### Clear All Data and Start Fresh

Complete reset:
```bash
# Stop all services and remove volumes
docker-compose down -v

# Remove all images (optional)
docker-compose down -v --rmi all

# Start fresh
docker-compose up -d --build
```

### Network Issues

All services communicate through `meetrub-network`. If experiencing connectivity:
1. Check network exists: `docker network ls | grep meetrub`
2. Inspect network: `docker network inspect meetrub-network`
3. Recreate: `docker-compose down && docker-compose up -d`

## Data Persistence

The following data is persisted using Docker volumes:

- **RabbitMQ Data**: `rabbitmq-data` volume
  - Stores message queues and exchanges
- **Redis Data**: `redis-data` volume
  - Stores cached data and sessions
- **Application Logs**:
  - `./backend/logs` - Backend API logs
  - `./chat-server/logs` - Chat server logs

### Backup Volumes
```bash
# Backup RabbitMQ data
docker run --rm -v rabbitmq-data:/data -v $(pwd):/backup alpine tar czf /backup/rabbitmq-backup.tar.gz -C /data .

# Backup Redis data
docker run --rm -v redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz -C /data .
```

## Development Mode

For local development with hot-reload:

1. Install dependencies locally in each service:
```bash
cd backend && npm install
cd ../chat-server && npm install
cd ../worker && npm install
```

2. Run services locally:
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Chat Server
cd chat-server && npm run dev

# Terminal 3 - Worker
cd worker && npm run dev
```

3. Ensure RabbitMQ and Redis are still running via Docker:
```bash
docker-compose up -d rabbitmq redis
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [Redis Documentation](https://redis.io/documentation)
