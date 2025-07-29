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
import { DeviceLoginDialogComponent, DeviceLoginData } from '../device-login-dialog/device-login-dialog';

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
    this.wsSubscription = this.websocketService.onMessage().subscribe((msg: WebSocketMessage) => {
      if (msg.type === 'accounts_updated') {
        this.dialog.closeAll();
        this.showNotification('Account successfully verified and added!');
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
        this.openDeviceLoginDialog(response.prompt, response.accountId);
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(err.error?.error || 'An unknown error occurred.', true);
        this.isLoading = false;
      }
    });
  }

  openDeviceLoginDialog(prompt: string, accountId: string): void {
    const urlRegex = /(https:\/\/www\.microsoft\.com\/link)/;
    const codeRegex = /enter the code ([A-Z0-9]+)/;
    const urlMatch = prompt.match(urlRegex);
    const codeMatch = prompt.match(codeRegex);

    if (urlMatch && codeMatch) {
      this.dialog.open(DeviceLoginDialogComponent, {
        width: '500px',
        data: { url: urlMatch[1], code: codeMatch[1], accountId: accountId },
        disableClose: true
      });
    } else {
      this.showNotification('Could not parse login link from server.', true);
    }
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
