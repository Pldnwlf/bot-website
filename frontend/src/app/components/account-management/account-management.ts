import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from '@angular/material/tooltip';

import { MinecraftAccount, MinecraftAccountService, InitiateAddResponse } from '../../services/minecraft-account';
import { WebsocketService, WebSocketMessage } from '../../services/websocket';
import { DeviceLoginDialogComponent } from '../device-login-dialog/device-login-dialog';

@Component({
  selector: 'app-account-management',
  standalone: true,
  imports: [ CommonModule, ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatListModule, MatIconModule, MatProgressBarModule, MatSnackBarModule, MatTooltipModule, NgIf ],
  templateUrl: './account-management.html',
  styleUrls: ['./account-management.scss']
})
export class AccountManagement implements OnInit, OnDestroy {
  accounts: MinecraftAccount[] = [];
  addAccountForm: FormGroup;
  isLoading = false;
  isListLoading = false;
  private wsSubscription: Subscription | undefined;

  constructor(
    private fb: FormBuilder,
    private accountService: MinecraftAccountService,
    private snackBar: MatSnackBar,
    private websocketService: WebsocketService,
    public dialog: MatDialog
  ) {
    this.addAccountForm = this.fb.group({
      loginEmail: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    this.loadAccounts();
    // Der WebSocket-Listener bleibt bestehen. Wenn die Authentifizierung schnell genug ist,
    // schliesst er den Dialog und zeigt eine Erfolgsmeldung an.
    this.wsSubscription = this.websocketService.onMessage().subscribe((msg: WebSocketMessage) => {
      if (msg.type === 'accounts_updated') {
        // Überprüfen, ob noch Dialoge offen sind, bevor eine neue Benachrichtigung angezeigt wird
        if(this.dialog.openDialogs.length > 0) {
          this.dialog.closeAll();
          this.showNotification('Account successfully verified and added!');
        }
        this.loadAccounts();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
  }

  loadAccounts(): void {
    this.isListLoading = true;
    this.accountService.getAccounts().subscribe({
      next: (data) => { this.accounts = data; this.isListLoading = false; },
      error: () => { this.showNotification('Failed to load accounts.', true); this.isListLoading = false; }
    });
  }

  onAddAccountSubmit(): void {
    if (this.addAccountForm.invalid) return;
    this.isLoading = true;
    const email = this.addAccountForm.value.loginEmail;

    this.accountService.initiateAddAccount(email).subscribe({
      next: (response: InitiateAddResponse) => {
        this.isLoading = false;
        this.addAccountForm.reset();

        // ÖFFNE DEN DIALOG
        const dialogRef = this.dialog.open(DeviceLoginDialogComponent, {
          width: '500px',
          data: {
            url: response.auth.url,
            code: response.auth.code,
            accountId: response.accountId
          },
          disableClose: true
        });

        // =================================================================
        // NEUE, ZEITBASIERTE LOGIK
        // =================================================================
        // Setze einen Timer, der den Dialog nach 20 Sekunden schliesst.
        setTimeout(() => {
          // Nur schliessen, wenn er noch offen ist
          if (dialogRef.getState() === 0 /* OPEN */) {
            dialogRef.close();
            this.showNotification('Checking for account status update...');

            // Nach einer weiteren kurzen Verzögerung die Liste neu laden,
            // um zu sehen, ob der Account in der Zwischenzeit hinzugefügt wurde.
            setTimeout(() => this.loadAccounts(), 1500);
          }
        }, 20000); // 20 Sekunden

      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(err.error?.error || 'An unknown error occurred.', true);
        this.isLoading = false;
      }
    });
  }

  deleteAccount(accountId: string, accountName: string | null): void {
    if (!confirm(`Are you sure you want to delete the account: ${accountName || accountId}?`)) return;
    this.accountService.removeAccount(accountId).subscribe({
      next: () => {
        this.showNotification('Account deleted.');
        this.loadAccounts();
      },
      error: (err) => this.showNotification(err.error?.error || 'Failed to delete account.', true),
    });
  }

  showNotification(message: string, isError: boolean = false): void {
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: isError ? ['error-snackbar'] : ['success-snackbar'] });
  }

  get loginEmail() { return this.addAccountForm.get('loginEmail'); }
}
