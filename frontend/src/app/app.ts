import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { KeycloakService } from 'keycloak-angular';
import { WebsocketService } from './services/websocket';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styleUrls: ['./app.scss']
})
export class App {
  constructor(
    private readonly keycloak: KeycloakService,
  ) {}
}
