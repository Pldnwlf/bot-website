import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

export interface WebSocketMessage {
  type: string;
  payload: any;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket$: WebSocketSubject<any> | undefined;
  private messages$: Subject<WebSocketMessage> = new Subject<WebSocketMessage>();

  public connect(): void {
    if (!this.socket$ || this.socket$.closed) {
      this.socket$ = webSocket('ws://localhost:3000'); // Deine WebSocket-URL

      this.socket$.subscribe({
        next: (msg) => {
          console.log('Received WebSocket message:', msg);
          this.messages$.next(msg as WebSocketMessage);
        },
        error: (err) => {
          console.error('WebSocket error:', err);
          // Hier könnte eine Logik zum automatischen Wiederverbinden implementiert werden
          this.socket$ = undefined; // Verbindung als geschlossen markieren
        },
        complete: () => {
          console.log('WebSocket connection closed.');
          this.socket$ = undefined; // Verbindung als geschlossen markieren
        }
      });
    }
  }

  // Methode, die Komponenten nutzen, um auf Nachrichten zu lauschen
  public onMessage(): Observable<WebSocketMessage> {
    return this.messages$.asObservable();
  }

  public close(): void {
    this.socket$?.complete();
  }
}
