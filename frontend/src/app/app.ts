import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  // Wichtig: Nur noch RouterOutlet importieren
  imports: [CommonModule, RouterOutlet],
  template: '<router-outlet></router-outlet>', // Nur der RouterOutlet
  styleUrls: ['./app.scss']
})
export class App {
  title = 'frontend';
}
