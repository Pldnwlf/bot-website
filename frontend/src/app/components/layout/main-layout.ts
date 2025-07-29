import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

// Services
import { AuthService } from '../../services/auth';
import { WebsocketService } from '../../services/websocket';

import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,

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
export class MainLayoutComponent implements OnInit {
  constructor(
    private readonly authService: AuthService,
    private readonly websocketService: WebsocketService
  ) {}

  ngOnInit(): void {
    // Hier wird die WebSocket-Verbindung nach erfolgreichem Login aufgebaut.
    this.websocketService.connect();
  }

  logout(): void {
    this.authService.logout();
  }
}
