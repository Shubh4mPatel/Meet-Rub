# Meet-Rub

A real-time meeting and chat application with notification services.

## Architecture

This application consists of multiple microservices:

- **Backend API**: RESTful API server (Port 5000)
- **Chat Server**: WebSocket server for real-time messaging (Port 4000)
- **Worker Service**: Notification worker for email, in-app notifications, etc.
- **RabbitMQ**: Message queue for async communication (Ports 5672, 15672)
- **Redis**: In-memory cache and session store (Port 6379)

## Quick Start

1. **Clone the repository** (if not already done)
2. **Create a `.env` file** in the root directory (see Environment Setup below)
3. **Start all services:**
   ```bash
   docker-compose up -d
   ```
4. **Check service status:**
   ```bash
   docker-compose ps
   ```
5. **Access the application:**
   - Backend: http://localhost:5000/api/v1/health
   - Chat Server: http://localhost:4000/health
   - RabbitMQ UI: http://localhost:15672

## Prerequisites

Before running the application, ensure you have the following installed:

- [Docker](https://docs.docker.com/get-docker/) (version 20.10 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0 or higher)

Verify installation:
```bash
docker --version
docker-compose --version
```

## Environment Setup

1. Create a `.env` file in the root directory with the following variables:

```env
# RabbitMQ Configuration
RABBITMQ_USER=your_rabbitmq_username
RABBITMQ_PASSWORD=your_rabbitmq_password

# Redis Configuration
REDIS_PASSWORD=your_redis_password

# Database Configuration (if using PostgreSQL)
# POSTGRES_USER=meetrub
# POSTGRES_PASSWORD=your_postgres_password
# POSTGRES_DB=meetrub

# Application Configuration
NODE_ENV=production
PORT=5000

# Add other application-specific environment variables here
# JWT_SECRET=your_jwt_secret
# API_KEY=your_api_key
# etc.
```

2. Update the values with your actual credentials and configuration.

**Important Notes:**
- `RABBITMQ_USER` and `RABBITMQ_PASSWORD` are required for docker-compose
- Special characters in `RABBITMQ_URL` must be URL-encoded (e.g., `@` → `%40`)
- Use `redis` as `REDIS_HOST` (not `127.0.0.1`) for Docker networking
- Use `rabbitmq` as hostname in connection URLs for Docker networking

## Running with Docker Compose

### Start All Services

To start all services in detached mode (background):

```bash
docker-compose up -d
```

To start with logs visible (useful for debugging):

```bash
docker-compose up
```

### Check Service Status

```bash
docker-compose ps
```

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
docker-compose logs -f rabbitmq
docker-compose logs -f redis
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

Stop and remove containers, volumes, and images:
```bash
docker-compose down -v --rmi all
```

### Restart Services

Restart all services:
```bash
docker-compose restart
```

Restart a specific service:
```bash
docker-compose restart backend
```

### Rebuild Services

If you make changes to the code or Dockerfile:

```bash
docker-compose up -d --build
```

Rebuild a specific service:
```bash
docker-compose up -d --build backend
```

## Accessing Services

Once all services are running:

- **Backend API**: http://localhost:5000
- **Backend Health Check**: http://localhost:5000/api/v1/health
- **Chat Server**: http://localhost:4000
- **Chat Health Check**: http://localhost:4000/health
- **RabbitMQ Management UI**: http://localhost:15672
  - Username: Value from `RABBITMQ_USER` in `.env`
  - Password: Value from `RABBITMQ_PASSWORD` in `.env`
- **Redis**: localhost:6379 (requires password from `.env`)

## Troubleshooting

### RabbitMQ Authentication Error

If you see errors like:
```
Error: Handshake terminated by server: 403 (ACCESS-REFUSED)
PLAIN login refused: user 'admin' - invalid credentials
```

**Solutions:**

1. **Ensure `.env` has the required variables:**
   ```env
   RABBITMQ_USER=admin
   RABBITMQ_PASSWORD=admin@123
   RABBITMQ_URL=amqp://admin:admin%40123@rabbitmq:5672/
   ```
   Note: Special characters in passwords must be URL-encoded (e.g., `@` becomes `%40`)

2. **Recreate RabbitMQ container:**
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```
   The `-v` flag removes volumes, which clears old user credentials.

3. **Verify RabbitMQ is using the correct credentials:**
   ```bash
   docker-compose logs rabbitmq | grep -i "default user"
   ```

### Redis Connection Error

If services can't connect to Redis, ensure:

1. **`.env` uses Docker network hostname:**
   ```env
   REDIS_HOST=redis  # NOT 127.0.0.1 or localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=root@123
   ```

2. **Redis is healthy:**
   ```bash
   docker-compose ps redis
   docker exec -it meetrub-redis redis-cli -a root@123 ping
   ```

### Service Won't Start

Check if ports are already in use:
```bash
# Windows
netstat -ano | findstr :5000
netstat -ano | findstr :4000
netstat -ano | findstr :5672
netstat -ano | findstr :6379

# Linux/Mac
lsof -i :5000
lsof -i :4000
lsof -i :5672
lsof -i :6379
```

### View Service Health

Check health status of all services:
```bash
docker-compose ps
```

Inspect a specific container:
```bash
docker inspect meetrub-backend
docker inspect meetrub-chat
docker inspect meetrub-rabbitmq
docker inspect meetrub-redis
```

### Clear All Data and Start Fresh

```bash
# Stop all services
docker-compose down

# Remove volumes (this deletes all data)
docker-compose down -v

# Remove all images
docker-compose down -v --rmi all

# Start fresh
docker-compose up -d --build
```

### Access Container Shell

If you need to debug inside a container:
```bash
docker exec -it meetrub-backend sh
docker exec -it meetrub-chat sh
docker exec -it meetrub-worker sh
docker exec -it meetrub-rabbitmq sh
docker exec -it meetrub-redis sh
```

### Check Container Logs for Errors

```bash
docker-compose logs backend | grep -i error
docker-compose logs chat-server | grep -i error
docker-compose logs worker | grep -i error
```

## Development Mode

For development with hot-reload, you may want to mount your source code as volumes. Add this to your `docker-compose.yml` under each service:

```yaml
volumes:
  - ./backend:/app
  - /app/node_modules
```

## Data Persistence

The following data is persisted using Docker volumes:

- **RabbitMQ**: Message queue data in `rabbitmq-data` volume
- **Redis**: Cache and session data in `redis-data` volume
- **Logs**: Application logs in `./backend/logs` and `./chat-server/logs`

To backup volumes:
```bash
docker run --rm -v rabbitmq-data:/data -v $(pwd):/backup alpine tar czf /backup/rabbitmq-backup.tar.gz -C /data .
docker run --rm -v redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz -C /data .
```

## Network

All services communicate through a shared Docker network called `meetrub-network`. This allows services to communicate using container names as hostnames (e.g., `backend` can connect to `rabbitmq:5672`).

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [Redis Documentation](https://redis.io/documentation)