FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy bot files
COPY bot.js .
COPY config/ ./config/

# Create data directory for persistence
RUN mkdir -p data

# Create .env file from environment variables at runtime
CMD sh -c 'echo "DISCORD_TOKEN=${DISCORD_TOKEN}" > .env && \
             echo "CLIENT_ID=${CLIENT_ID}" >> .env && \
             echo "GUILD_ID=${GUILD_ID}" >> .env && \
             npm start'
