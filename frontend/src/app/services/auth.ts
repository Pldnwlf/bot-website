import { Injectable } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Hier ist es OK, den Service zu injecten, da dies ein 'root'-Service ist
  // und Zugriff auf die globale Konfiguration hat.
  constructor(private readonly keycloakService: KeycloakService) {}

  async init(): Promise<boolean> {
    return this.keycloakService.init({
      config: {
        url: 'http://localhost:8080', // Deine Keycloak-URL
        realm: 'minecraft-dashboard',          // Dein Realm
        clientId: 'angular-frontend'    // Deine Client-ID
      },
      initOptions: {
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/assets/silent-check-sso.html'
      },
      enableBearerInterceptor: true,
      bearerPrefix: 'Bearer'
    });
  }

  logout(): void {
    this.keycloakService.logout(window.location.origin);
  }

  getUsername(): string {
    return this.keycloakService.getUsername();
  }

  isAuthenticated(): boolean {
    return this.keycloakService.isLoggedIn();
  }
}
