import { Injectable } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Hier ist es OK, den Service zu injecten, da dies ein 'root'-Service ist
  // und Zugriff auf die globale Konfiguration hat.
  constructor(private readonly keycloakService: KeycloakService) {}

  logout(): void {
    this.keycloakService.logout(window.location.origin);
  }

  getUsername(): string {
    return this.keycloakService.getUsername();
  }

  // Füge hier weitere Methoden hinzu, wenn du sie brauchst,
  // z.B. um Rollen zu prüfen etc.
}
