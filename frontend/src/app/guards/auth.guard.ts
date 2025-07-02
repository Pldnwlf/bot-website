import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';

export const authGuard: CanActivateFn = async (route, state) => {
  // 1. Hole die notwendigen Services per Dependency Injection
  const keycloakService = inject(KeycloakService);
  const router = inject(Router);

  // 2. Prüfe, ob der Benutzer authentifiziert ist
  const isAuthenticated = await keycloakService.isLoggedIn();

  if (isAuthenticated) {
    // 3a. Benutzer ist eingeloggt -> Zugriff erlauben
    return true;
  } else {
    // 3b. Benutzer ist nicht eingeloggt -> Login-Prozess starten
    await keycloakService.login({
      // Nach dem Login soll der Benutzer zu der Seite weitergeleitet werden,
      // die er ursprünglich aufrufen wollte.
      redirectUri: window.location.origin + state.url,
    });
    // Verhindere die Navigation, da der Redirect zum Login stattfindet.
    return false;
  }
};
