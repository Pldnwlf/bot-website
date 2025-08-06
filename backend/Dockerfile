FROM node:20
WORKDIR /app
COPY backend/ .
RUN npm install --production
CMD ["node", "server.js"]
