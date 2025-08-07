import { Injectable } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(private readonly keycloakService: KeycloakService) {}

  async init(): Promise<boolean> {
    return this.keycloakService.init({
      config: {
        url: 'https://keycloak.paladinwolfi.ch',
        realm: 'minecraft-dashboard',
        clientId: 'angular-frontend'
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
