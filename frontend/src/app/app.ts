import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { WebsocketService } from './services/websocket';

@Component({
  selector: 'app-root',
  standalone: true,
  // Wichtig: Nur noch RouterOutlet importieren
  imports: [CommonModule, RouterOutlet],
  template: '<router-outlet></router-outlet>', // Nur der RouterOutlet
  styleUrls: ['./app.scss']
})
export class App {
  constructor(
    private readonly keycloak: KeycloakService,
    private websocketService: WebsocketService // Injizieren
  ) {
    // Sobald die App-Komponente geladen wird, verbinden wir uns.
    this.websocketService.connect();
  }

  // ...
}
