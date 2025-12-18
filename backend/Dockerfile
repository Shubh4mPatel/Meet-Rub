# Use the official Node.js 18 LTS (Long Term Support) image as the base
# Alpine variant is chosen because it's lightweight (~5MB vs ~900MB for full version)
# This reduces image size, download time, and attack surface
FROM node:18-alpine

# Set the working directory inside the container to /app
# All subsequent commands will be executed from this directory
# This keeps the container filesystem organized
WORKDIR /app

# Copy package.json and package-lock.json first (before other files)
# This is done separately to leverage Docker's layer caching
# If dependencies haven't changed, Docker will use cached layers
# and skip npm install, making rebuilds much faster
COPY package*.json ./

# Install only production dependencies
# --production flag skips devDependencies (like nodemon)
# --frozen-lockfile ensures exact versions from package-lock.json are installed
# This guarantees consistency between development and production environments
RUN npm ci --production --frozen-lockfile

# Copy the rest of the application code
# This is done AFTER npm install to maximize cache efficiency
# If code changes but dependencies don't, the npm install layer is reused
COPY . .

# Add a non-root user for security
# Running as root inside containers is a security risk
# If the container is compromised, the attacker gets root privileges
# Alpine uses 'addgroup' and 'adduser' instead of 'groupadd' and 'useradd'
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Change ownership of the /app directory to the nodejs user
# This ensures the backend process can read/write files if needed
RUN chown -R nodejs:nodejs /app

# Switch to the non-root user
# All subsequent commands and the final process will run as this user
USER nodejs

# Expose port 7000 for the backend API server
# This is documentation - it doesn't actually publish the port
# Actual port publishing happens with 'docker run -p' or docker-compose ports
EXPOSE 7000

# Set environment to production
# Some npm packages behave differently in production vs development
# This can affect logging, error handling, and performance optimizations
ENV NODE_ENV=production

# The command to run when the container starts
# Uses node directly instead of npm for better signal handling
# src/server.js is your main entry point
CMD ["nodemon", "src/server.js"]

# Health check (optional but recommended)
# Docker will periodically check if the container is healthy
# If health checks fail, orchestrators like Kubernetes can restart the container
# Adjust the endpoint, interval and timeout based on your API's behavior
# Uncomment if you add a health endpoint to your backend
# HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
