FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV DATA_DIR=/data PORT=8080 TZ=Asia/Kolkata
USER node
CMD ["node", "src/server.js"]
