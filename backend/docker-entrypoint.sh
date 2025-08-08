#!/bin/sh

# Beende das Skript bei Fehlern
set -e

# Führe die Prisma-Migrationen aus, um sicherzustellen, dass die DB auf dem neuesten Stand ist.
echo "▶️ Running Prisma migrations..."
npx prisma migrate deploy

# Jetzt, wo die DB bereit ist, starte die eigentliche Anwendung.
echo "▶️ Starting the application..."
exec "$@"