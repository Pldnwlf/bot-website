import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MinecraftAccount {
  accountId: string;
  loginEmail: string;
  ingameName: string | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  session?: {
    status: string;
    lastKnownServerAddress: string | null;
  };
}

export interface InitiateAddResponse {
  accountId: string;
  prompt: string;
}

@Injectable({ providedIn: 'root' })
export class MinecraftAccountService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getAccounts(): Observable<MinecraftAccount[]> {
    return this.http.get<MinecraftAccount[]>(`${this.apiUrl}/accounts`);
  }

  initiateAddAccount(loginEmail: string): Observable<InitiateAddResponse> {
    return this.http.post<InitiateAddResponse>(`${this.apiUrl}/accounts/initiate-add`, { loginEmail });
  }

  startBots(accountIds: string[], serverAddress: string, accountVersion: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/bots/start`, { accountIds, serverAddress, accountVersion });
  }

  stopBots(accountIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/bots/stop`, { accountIds });
  }

  removeAccount(accountId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/accounts/${accountId}`);
  }
  finalizeAddAccount(accountId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/accounts/finalize-add/${accountId}`, {});
  }
}
