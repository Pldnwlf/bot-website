#!/bin/bash
set -e

echo "➡️ Lade Umgebungsvariablen aus der .env-Datei..."
if [ -f .env ]; then
  # exportiert die Variablen, ignoriert Kommentare und leere Zeilen
  export $(cat .env | sed 's/#.*//g' | xargs)
fi

FLAG_FILE=".realm_imported"

if [ -f "$FLAG_FILE" ]; then
    echo "✅ Realm wurde bereits importiert. Starte alle Dienste im Produktionsmodus..."

    echo "   -> Pulling latest images from the registry..."
    docker compose pull

    echo "   -> Starting all services..."
    docker compose up -d

else
    echo "🚀 Erstmaliger Start. Führe den Realm-Import-Prozess durch..."

    #Prüfen, ob jq installiert ist
    if ! command -v jq &> /dev/null
    then
        echo "❌ Fehler: 'jq' ist nicht installiert. Bitte installieren Sie es mit 'sudo apt-get update && sudo apt-get install -y jq' und versuchen Sie es erneut."
        exit 1
    fi

    echo "   -> Patche die Realm-Datei mit dem Secret aus der .env-Datei..."
    REALM_FILE="./keycloak-config/realm-export.json"
    TEMP_FILE="./keycloak-config/realm-export.tmp.json"

    # Überprüfen, ob das Secret in der .env-Datei auch wirklich gesetzt ist
    if [ -z "$KEYCLOAK_CLIENT_SECRET" ]; then
        echo "❌ Fehler: KEYCLOAK_CLIENT_SECRET ist in der .env-Datei nicht gesetzt."
        exit 1
    fi

    jq --arg secret "$KEYCLOAK_CLIENT_SECRET" '(.clients[] | select(.clientId=="minecraft-dashboard").secret) |= $secret' "$REALM_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$REALM_FILE"

   echo "   -> Realm-Datei erfolgreich gepatcht."

    echo "   -> Ziehe die benötigten Images..."
    docker compose pull

    echo "   -> Starte Keycloak im Import-Modus..."
    docker compose -f docker-compose.yml -f docker-compose.import.yml up -d keycloak

    # Schritt 2: Warte, bis der Import im Log bestätigt wird.
    echo "   -> Warte auf die Bestätigung des Imports im Log..."
    docker compose logs -f keycloak | grep -m 1 "Import finished successfully"

    # Schritt 3: Stoppe die temporären Dienste.
    echo "   -> Import erfolgreich! Stoppe die temporären Dienste..."
    docker compose down

    # Schritt 4: Erstelle die Flag-Datei, damit dieser Block nicht erneut ausgeführt wird.
    echo "   -> Erstelle die .realm_imported Flag-Datei."
    touch "$FLAG_FILE"

    # Schritt 5: Starte die gesamte Anwendung im normalen Produktionsmodus.
    echo "✅ Setup abgeschlossen. Starte alle Dienste im Produktionsmodus..."
    docker compose up -d
fi

echo "🎉 Alle Dienste sind gestartet. Sie können die Logs mit 'docker compose logs -f' verfolgen."