import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
// Wichtig für die Navigation und die Anzeige der Kinder-Routen
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth'; // Importiere unseren neuen Service
// Importiere alle Angular Material Module, die im Template verwendet werden
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    // Standard-Module
    CommonModule,

    // Routing-Module
    RouterOutlet, // Unverzichtbar, hier werden Dashboard, Chat etc. gerendert
    RouterLink,   // Ermöglicht das Klicken auf Links (z.B. [routerLink]="/dashboard")
    RouterLinkActive, // Hebt den aktiven Link hervor

    // Angular Material Module
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss']
})
export class MainLayoutComponent {
  // Wir injecten den KeycloakService, um auf seine Methoden zugreifen zu können
  constructor(private readonly authService: AuthService) {}

  // Diese Methode wird vom Logout-Button im Template aufgerufen
  logout(): void {
    // Ruft die Logout-URL von Keycloak auf und leitet den Benutzer um
    this.authService.logout();
  }
}
