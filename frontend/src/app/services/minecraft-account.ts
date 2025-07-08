import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Wir definieren ein Interface für unsere Account-Daten für Typsicherheit
export interface MinecraftAccount {
  accountId: string;
  loginEmail: string;
  ingameName?: string;
  session?: {
    status: string;
    lastKnownServerAddress?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MinecraftAccountService {
  private readonly apiUrl = 'http://localhost:3000/api'; // Basis-URL unserer API

  constructor(private http: HttpClient) { }

  // Ruft alle Accounts für den eingeloggten Benutzer ab
  getAccounts(): Observable<MinecraftAccount[]> {
    return this.http.get<MinecraftAccount[]>(`${this.apiUrl}/minecraft-accounts`);
  }

  // Fügt einen neuen Account hinzu
  addAccount(data: { loginEmail: string, password: string }): Observable<MinecraftAccount> {
    return this.http.post<MinecraftAccount>(`${this.apiUrl}/minecraft-accounts`, data);
  }

  removeAccount(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/minecraft-accounts/${id}`);
  }

  startMultipleBots(accountIds: string[], serverAddress: string,  accountVersion?: string): Observable<any> {
    const body = {
      accountIds,
      serverAddress,
      ...(accountVersion && { accountVersion })
    };
    return this.http.post(`${this.apiUrl}/bots/startmultiple`, body);
  }

  stopMultipleBots(accountIds: string[]): Observable<any> {
    const body = {accountIds};
    return this.http.post(`${this.apiUrl}/bots/stopmultiple`, body);
  }



}
