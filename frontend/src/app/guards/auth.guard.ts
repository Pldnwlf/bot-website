import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth';
import { KeycloakService } from 'keycloak-angular';

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const keycloakService = inject(KeycloakService);
  const router = inject(Router);

  // Prüfen, ob der Benutzer eingeloggt ist
  const isAuthenticated = await keycloakService.isLoggedIn();

  if (isAuthenticated) {
    // Wenn eingeloggt, alles gut.
    return true;
  } else {
    await keycloakService.login({
      redirectUri: window.location.origin + state.url,
    });
    return false;
  }
};
