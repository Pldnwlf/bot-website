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
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatIcon, MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MinecraftAccount, MinecraftAccountService } from '../../services/minecraft-account';
import { WebsocketService, WebSocketMessage } from '../../services/websocket';
import { Subscription } from 'rxjs';
import { DeviceLoginDialogComponent, DeviceLoginData } from '../device-login-dialog/device-login-dialog';

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
    MatDialogModule,
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard implements OnInit, OnDestroy {
  accounts: MinecraftAccount[] = [];
  serverAddress: string = "";
  accountVersion: string = "";
  isLoading: { [accountId: string]: boolean } = {};
  private wsSubscription: Subscription | undefined;

  selection: SelectionModel<MinecraftAccount>;
  private connectionTimeouts = new Map<string, number>();

  constructor(
    private accountService: MinecraftAccountService,
    private websocketService: WebsocketService,
    private snackBar: MatSnackBar,
  public dialog: MatDialog
  ) {
    this.selection = new SelectionModel<MinecraftAccount>(true, []);
  }

  ngOnInit(): void {
    this.loadAccounts();
    this.listenToWebsocket();
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
    this.connectionTimeouts.forEach(timeout => clearTimeout(timeout));
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

      let isTerminalStatus = false; // Flag to check if the connection process is over

      if (!account.session) {
        account.session = { status: 'offline' };
      }

      switch (msg.type) {
        case 'device_login_prompt':
          account.session.status = 'Waiting for device login...';
          this.isLoading[account.accountId] = false; // Ist kein "laden", sondern "warten"
          this.handleDeviceLogin(msg.payload.accountId, msg.payload.message);
          isTerminalStatus = true;
          break;

        case 'status':
          if (msg.payload.status === 'offline' && msg.payload.reason) {
            account.session.status = `Offline (${msg.payload.reason})`;
            isTerminalStatus = true; // 'offline' is a terminal state
          } else {
            account.session.status = msg.payload.status;
          }

          // A status containing 'online' or 'failed' is also terminal
          if (msg.payload.status.includes('online') || msg.payload.status.toLowerCase().includes('failed') || msg.payload.status.toLowerCase().includes('error')) {
            isTerminalStatus = true;
          }

          // Update loading state, but don't mark as terminal here
          this.isLoading[account.accountId] = msg.payload.status.includes('connecting');
          break;

        case 'kicked':
          account.session.status = `Kicked: ${msg.payload.reason}`;
          this.isLoading[account.accountId] = false;
          isTerminalStatus = true; // 'kicked' is a terminal state
          break;
      }

      // If we received a terminal status, the connection attempt is over.
      // We must cancel the timeout.
      if (isTerminalStatus && this.connectionTimeouts.has(account.accountId)) {
        clearTimeout(this.connectionTimeouts.get(account.accountId));
        this.connectionTimeouts.delete(account.accountId);
        this.isLoading[account.accountId] = false; // Ensure loading is stopped
      }
    });
  }

  handleDeviceLogin(accountId: string, message: string): void {
    const urlRegex = /(https:\/\/www\.microsoft\.com\/link)/;
    const codeRegex = /enter the code ([A-Z0-9]+)/;

    const urlMatch = message.match(urlRegex);
    const codeMatch = message.match(codeRegex);

    if (urlMatch && codeMatch) {
      const loginData: DeviceLoginData = {
        url: urlMatch[1],
        code: codeMatch[1]
      };
      this.dialog.open(DeviceLoginDialogComponent, {
        width: '500px',
        data: loginData,
        disableClose: true // Verhindert das Schließen durch Klick außerhalb
      });
    } else {
      // Fallback, falls das Parsing fehlschlägt
      this.showNotification(`Login required for account ${accountId}: ${message}`, true);
    }
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

    selectedAccounts.forEach(account => {
      // 1. Immediately update the status for instant user feedback
      if (!account.session) account.session = { status: 'offline' };
      account.session.status = 'Connecting...';
      this.isLoading[account.accountId] = true;

      const timeoutId = setTimeout(() => {
        // This only runs if NO terminal message was received in 10s
        if (this.connectionTimeouts.has(account.accountId)) {
          if (account.session?.status === 'Connecting...') {
            account.session.status = 'Failed (Timeout)';
          }
          this.isLoading[account.accountId] = false;
          this.connectionTimeouts.delete(account.accountId);
        }
      }, 20 * 1000);

      this.connectionTimeouts.set(account.accountId, timeoutId);
    });


    const accountIdsToStart = selectedAccounts.map((acc: any) => acc.accountId);
    this.accountService.startMultipleBots(
      accountIdsToStart,
      this.serverAddress,
      this.accountVersion
    ).subscribe({
      next: (response) => {
        let successMsg = `Command sent. Success: ${response.success.length}, Failed: ${response.failed.length}.`;
        this.showNotification(successMsg);
        response.failed.forEach((failure: any) => {
          const account = this.accounts.find(acc => acc.accountId === failure.accountId);
          if (account) {
            if (account.session) account.session.status = `Failed: ${failure.reason}`;
            this.isLoading[failure.accountId] = false;
            if (this.connectionTimeouts.has(failure.accountId)) {
              clearTimeout(this.connectionTimeouts.get(failure.accountId));
              this.connectionTimeouts.delete(failure.accountId);
            }
          }
        });
        this.selection.clear();
      },
      error: (err: HttpErrorResponse) => {
        // Handle a total API failure (e.g., server is down)
        accountIdsToStart.forEach(id => {
          const account = this.accounts.find(acc => acc.accountId === id);
          if (account && account.session?.status === 'Connecting...') {
            account.session.status = 'Failed (API Error)';
          }
          this.isLoading[id] = false;
          if (this.connectionTimeouts.has(id)) {
            clearTimeout(this.connectionTimeouts.get(id));
            this.connectionTimeouts.delete(id);
          }
        });
        this.showNotification(`Error: ${err.error.error || 'Failed to start bots.'}`, true);
      }
    });
  }

  stopSelected(): void {
    const selectedAccounts = this.selection.selected;
    if (selectedAccounts.length === 0) {
      this.showNotification('Please select at least one account to stop.');
      return;
    }

    selectedAccounts.forEach(account => {
      if (!account.session) account.session = { status: 'offline' };
      account.session.status = 'Stopping...';
      this.isLoading[account.accountId] = true;
    });

    const accountIdsToStop = selectedAccounts.map((acc: any) => acc.accountId);
    this.accountService.stopMultipleBots(accountIdsToStop).subscribe({
      next: (response) => {
        let successMsg = `Stop command sent. Stopped: ${response.success.length}. Not running/Failed: ${response.failed.length}.`;
        this.showNotification(successMsg);
        this.selection.clear();
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(`Error: ${err.error.error || 'Failed to stop bots.'}`, true);
        selectedAccounts.forEach(account => {
          this.isLoading[account.accountId] = false;
          // We don't know the previous state, so a generic error is best
          if(account.session) account.session.status = 'Error stopping';
        });
      }
    });
  }

  showNotification(message: string, isError: boolean = false): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: isError ? ['error-snackbar'] : ['success-snackbar']
    });
  }


  isErrorStatus(status: string | undefined): boolean {
    if (!status) {
      return false; // Wenn kein Status da ist, ist es auch kein Fehler.
    }
    const lowerCaseStatus = status.toLowerCase();
    return lowerCaseStatus.includes('kicked') || lowerCaseStatus.includes('failed');
  };
}
