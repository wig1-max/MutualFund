FROM node:20-slim

WORKDIR /app

# Copy everything
COPY . .

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Install frontend dependencies and build
WORKDIR /app/frontend
RUN npm install && npm run build

# Back to backend for runtime
WORKDIR /app/backend

EXPOSE 3001

CMD ["node", "server.js"]
