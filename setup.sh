#!/bin/bash
set -e
FLAG_FILE=".realm_imported"

if [ -f "$FLAG_FILE" ]; then
    echo "✅ Realm wurde bereits importiert. Starte alle Dienste im Produktionsmodus..."

    echo "   -> Pulling latest images from the registry..."
    docker compose pull

    echo "   -> Starting all services..."
    docker compose up
else
    # Wenn nein, führe den einmaligen Import-Prozess durch.
    echo "🚀 Realm wurde noch nicht importiert. Starte den einmaligen Import-Vorgang..."

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