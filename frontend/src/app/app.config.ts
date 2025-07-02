import { ApplicationConfig, importProvidersFrom, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
// Wichtig: Wir brauchen wieder withInterceptorsFromDi, da das Modul den Interceptor auf diese Weise bereitstellt
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { KeycloakAngularModule, KeycloakService } from 'keycloak-angular';

// Diese Initialisierungsfunktion ist der saubere Weg, um die App-Initialisierung
// mit dem KeycloakService zu verknüpfen.
function initializeKeycloak(keycloak: KeycloakService) {
  return () =>
    keycloak.init({
      config: {
        url: 'http://localhost:8080',
        realm: 'minecraft-dashboard',
        clientId: 'angular-frontend'
      },
      initOptions: {
        onLoad: 'login-required',
        // silentCheckSsoRedirectUri ist optional, aber gute Praxis.
        // Stelle sicher, dass du eine leere silent-check-sso.html Datei in /src/assets/ hast.
        silentCheckSsoRedirectUri:
          window.location.origin + '/assets/silent-check-sso.html'
      },
      // Dies weist den Interceptor an, das Token bei JEDER Anfrage anzuhängen.
      // Wir müssen keine URLs ausschließen, solange wir keine Anfragen an externe APIs machen,
      // die kein Token benötigen.
      loadUserProfileAtStartUp: true,
      bearerExcludedUrls: ['/assets']
    });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // Wir importieren die Provider aus dem alten Modul.
    // Das ist der korrekte Weg, um Modul-basierte Provider in einer Standalone-App zu verwenden.
    // Dies stellt den KeycloakService UND den notwendigen HTTP-Interceptor bereit.
    importProvidersFrom(KeycloakAngularModule),

    // Wir müssen den KeycloakService hier explizit bereitstellen, damit der APP_INITIALIZER ihn finden kann.
    KeycloakService,

    // Wir verwenden den APP_INITIALIZER, um sicherzustellen, dass Keycloak initialisiert ist,
    // BEVOR die Anwendung startet.
    {
      provide: APP_INITIALIZER,
      useFactory: initializeKeycloak,
      multi: true,
      deps: [KeycloakService]
    },

    // Wir verwenden `withInterceptorsFromDi`, weil KeycloakAngularModule den Interceptor
    // auf die "alte" Weise bereitstellt, die eine Dependency Injection (DI) erfordert.
    provideHttpClient(withInterceptorsFromDi())
  ]
};
