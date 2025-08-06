# STAGE 1: Build-Umgebung
# Wir verwenden ein Node.js-Image, um die Angular-Anwendung zu bauen.
# Verwenden Sie eine spezifische Version, die zu Ihrem Projekt passt.
FROM node:20-alpine AS builder

# Arbeitsverzeichnis im Container setzen
WORKDIR /app

# package.json und package-lock.json kopieren, um Caching zu nutzen
COPY package*.json ./
# Abhängigkeiten installieren (npm ci ist für CI/CD-Umgebungen oft besser)
RUN npm ci

# Den restlichen Quellcode kopieren
COPY . .

# Die Angular-Anwendung für die Produktion bauen.
# Der Output wird im Verzeichnis /app/dist/your-app-name/browser sein.
# Ersetzen Sie "your-app-name" durch den tatsächlichen Namen Ihres Projekts aus der angular.json.
RUN npm run build -- --configuration production


# STAGE 2: Produktions-Umgebung
# Wir verwenden ein schlankes Nginx-Image, um die gebauten Dateien auszuliefern.
FROM nginx:stable-alpine

# WICHTIG: Die gebauten statischen Dateien aus der "builder"-Stage in das
# Standard-Verzeichnis von Nginx kopieren.
# Passen Sie "your-app-name" an den Namen Ihres Angular-Projekts an.
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Unsere benutzerdefinierte Nginx-Konfiguration kopieren.
# Diese Datei muss sich im selben Verzeichnis wie das Dockerfile befinden.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Port 80 verfügbar machen, auf dem Nginx standardmäßig lauscht.
EXPOSE 80

# Der Standard-Befehl des Nginx-Images startet den Server automatisch.
