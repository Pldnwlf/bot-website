import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { SelectionModel } from '@angular/cdk/collections';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';

import { MinecraftAccount, MinecraftAccountService } from '../../services/minecraft-account';
import { WebsocketService, WebSocketMessage } from '../../services/websocket';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ CommonModule, FormsModule, MatCardModule, MatButtonModule, MatListModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatIconModule ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard implements OnInit, OnDestroy {
  allAccounts: MinecraftAccount[] = [];
  serverAddress: string = "";
  accountVersion: string = "";
  selection: SelectionModel<MinecraftAccount>;
  private wsSubscription: Subscription | undefined;

  constructor(
    private accountService: MinecraftAccountService,
    private websocketService: WebsocketService,
    private snackBar: MatSnackBar,
  ) {
    this.selection = new SelectionModel<MinecraftAccount>(true, []);
  }

  get activeAccounts(): MinecraftAccount[] {
    return this.allAccounts.filter(acc => acc.status === 'ACTIVE');
  }

  ngOnInit(): void {
    this.loadAccounts();
    this.listenToWebsocket();
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
  }

  loadAccounts(): void {
    this.accountService.getAccounts().subscribe(data => {
      this.allAccounts = data;
      const currentSelection = this.selection.selected;
      const activeIds = this.activeAccounts.map(a => a.accountId);
      const newSelection = currentSelection.filter(s => activeIds.includes(s.accountId));
      this.selection.clear();
      this.selection.select(...newSelection);
    });
  }

  listenToWebsocket(): void {
    this.wsSubscription = this.websocketService.onMessage().subscribe((msg: WebSocketMessage) => {
      if (msg.type === 'accounts_updated') {
        this.loadAccounts();
        return;
      }

      const account = this.allAccounts.find(acc => acc.accountId === msg.payload.accountId);
      if (!account) return;
      if (!account.session) account.session = { status: 'offline', lastKnownServerAddress: null };

      switch (msg.type) {
        case 'status_update': account.session.status = msg.payload.status; break;
        case 'bot_kicked': account.session.status = `Kicked: ${msg.payload.reason}`; break;
        case 'bot_error': account.session.status = `Error: ${msg.payload.error}`; break;
      }
    });
  }

  isAllSelected(): boolean {
    return this.activeAccounts.length > 0 && this.selection.selected.length === this.activeAccounts.length;
  }

  toggleAllRows(): void {
    this.isAllSelected() ? this.selection.clear() : this.selection.select(...this.activeAccounts);
  }

  startSelected(): void {
    const accountIdsToStart = this.selection.selected.map(acc => acc.accountId);
    if (accountIdsToStart.length === 0 || !this.serverAddress.trim()) return;

    this.selection.selected.forEach(acc => { if(acc.session) acc.session.status = 'Connecting...'; });

    this.accountService.startBots(accountIdsToStart, this.serverAddress, this.accountVersion)
      .subscribe({
        next: () => this.showNotification('Start command sent.'),
        error: (err) => this.showNotification(err.error?.error || 'Failed to send start command.', true)
      });

    this.selection.clear();
  }

  stopSelected(): void {
    const accountIdsToStop = this.selection.selected.map(acc => acc.accountId);
    if (accountIdsToStop.length === 0) return;

    this.accountService.stopBots(accountIdsToStop)
      .subscribe({
        next: () => this.showNotification('Stop command sent.'),
        error: (err) => this.showNotification(err.error?.error || 'Failed to send stop command.', true)
      });

    this.selection.clear();
  }

  showNotification(message: string, isError: boolean = false): void {
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: isError ? ['error-snackbar'] : ['success-snackbar'] });
  }

  isErrorStatus(status: string | undefined): boolean {
    if (!status) return false;
    const lowerCaseStatus = status.toLowerCase();
    return lowerCaseStatus.includes('kicked') || lowerCaseStatus.includes('failed') || lowerCaseStatus.includes('error');
  }
}
