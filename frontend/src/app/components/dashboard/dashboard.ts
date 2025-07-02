import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { SelectionModel } from '@angular/cdk/collections';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {MatSnackBar} from "@angular/material/snack-bar";
import { MatIcon } from '@angular/material/icon';
import { MinecraftAccount, MinecraftAccountService } from '../../services/minecraft-account';
import { WebsocketService, WebSocketMessage } from '../../services/websocket';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    FormsModule,
    MatIcon,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})



export class Dashboard implements OnInit, OnDestroy {
  accounts: MinecraftAccount[] = [];
  serverAddress: string = "";
  isLoading: { [accountId: string]: boolean } = {}; // Ladezustand pro Bot
  private wsSubscription: Subscription | undefined;
  protected selection: any;


  constructor(
    private accountService: MinecraftAccountService,
    private websocketService: WebsocketService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadAccounts();
    this.listenToWebsocket();
  }

  ngOnDestroy(): void {
    // Wichtig: Immer Subscriptions beenden, um Memory Leaks zu vermeiden!
    this.wsSubscription?.unsubscribe();
  }

  loadAccounts(): void {
    this.accountService.getAccounts().subscribe(data => {
      this.accounts = data;
    });
  }

  listenToWebsocket(): void {
    this.wsSubscription = this.websocketService.onMessage().subscribe((msg: WebSocketMessage) => {
      const account = this.accounts.find(acc => acc.accountId === msg.payload.accountId);
      if (!account) return;

      // Finde den betroffenen Account und aktualisiere seinen Status
      switch (msg.type) {
        case 'status':
          if (account.session) {
            account.session.status = msg.payload.status;
          } else {
            account.session = { status: msg.payload.status };
          }
          // Ladeanzeige beenden, wenn der Bot online/offline ist
          this.isLoading[account.accountId] = msg.payload.status.includes('connecting');
          break;
        case 'kicked':
          if (account.session) {
            account.session.status = `Kicked: ${msg.payload.reason}`;
          }
          this.isLoading[account.accountId] = false;
          break;
        // Zukünftig für Chat: case 'chat': ...
      }
    });
  }

  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.accounts.length;
    return numSelected === numRows;
  }

  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.accounts);
  }

  startSelected(): void {
    const selectedAccounts = this.selection.selected;

    if (selectedAccounts.length === 0) {
      this.showNotification('Please select at least one account to start.');
      return;
    }
    if (!this.serverAddress.trim()) {
      this.showNotification('Please enter a server address.');
      return;
    }

    const accountIdsToStart = selectedAccounts.map((acc: any) => acc.accountId);
    console.log(`Starting bots for accounts: [${accountIdsToStart.join(', ')}] on ${this.serverAddress}`);

    this.accountService.startMultipleBots(accountIdsToStart, this.serverAddress).subscribe({
      next: (response) => {
        let successMsg = `Command sent. Success: ${response.success.length}, Failed: ${response.failed.length}.`;
        this.showNotification(successMsg);
        // Optional: Auswahl nach dem Start aufheben
        this.selection.clear();
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(`Error: ${err.error.error || 'Failed to start bots.'}`, true);
      }
    });
  }

// in dashboard.component.ts
  stopSelected(): void {
    const selectedAccounts = this.selection.selected;

    if (selectedAccounts.length === 0) {
      this.showNotification('Please select at least one account to stop.');
      return;
    }

    const accountIdsToStop = selectedAccounts.map((acc: any) => acc.accountId);
    console.log(`Stopping bots for accounts: [${accountIdsToStop.join(', ')}]`);

    this.accountService.stopMultipleBots(accountIdsToStop).subscribe({
      next: (response) => {
        let successMsg = `Stop command sent. Stopped: ${response.success.length}. Not running/Failed: ${response.failed.length}.`;
        this.showNotification(successMsg);
        this.selection.clear();
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(`Error: ${err.error.error || 'Failed to stop bots.'}`, true);
      }
    });
  }


  showNotification(message: string, isError: boolean = false): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: isError ? ['error-snackbar'] : ['success-snackbar'] // (Styling optional in styles.scss)
    });
  }
}
