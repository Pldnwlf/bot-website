FROM node:22-alpine AS builder

# Arbeitsverzeichnis im Container
WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Prisma Client generieren (wichtig für die Typensicherheit)
RUN npx prisma generate

RUN npm run build


# =========================================================================
# STAGE 2: Production - Erstellt das finale, schlanke Image
# =========================================================================
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

# Nur die package.json und package-lock.json kopieren
COPY package*.json ./

# NUR Produktions-Abhängigkeiten installieren (kleineres Image)

COPY --from=builder /app/node_modules ./node_modules
# Die kompilierten JavaScript-Dateien aus dem "builder"-Stage kopieren
COPY --from=builder /app/dist ./dist

# Das Prisma-Schema kopieren, damit der Client es zur Laufzeit findet
COPY prisma ./prisma

COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client

COPY keycloak.json ./

EXPOSE 3000

CMD [ "node", "dist/index.js" ]