import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MinecraftAccount, MinecraftAccountService } from '../../services/minecraft-account';
import { HttpErrorResponse } from '@angular/common/http';

// Angular Material Module
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgIf } from '@angular/common';


@Component({
  selector: 'app-account-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    NgIf
  ],
  templateUrl: './account-management.html',
  styleUrls: ['./account-management.scss']
})
export class AccountManagement implements OnInit {
  accounts: MinecraftAccount[] = [];
  addAccountForm: FormGroup;
  isLoading = false;      // Für den "Add"-Button
  isListLoading = false; // Für die Account-Liste

  constructor(
    private fb: FormBuilder,
    private accountService: MinecraftAccountService,
    private snackBar: MatSnackBar
  ) {
    // Formular ohne Passwortfeld initialisieren
    this.addAccountForm = this.fb.group({
      loginEmail: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.isListLoading = true;
    this.accountService.getAccounts().subscribe({
      next: (data: MinecraftAccount[]) => {
        this.accounts = data;
        this.isListLoading = false;
      },
      error: () => {
        this.showNotification('Failed to load accounts.', true);
        this.isListLoading = false;
      }
    });
  }

  onAddAccountSubmit(): void {
    if (this.addAccountForm.invalid) {
      this.showNotification('Please enter a valid email address.', true);
      return;
    }
    this.isLoading = true;

    // Wir übergeben jetzt ein leeres Passwort, da es vom Backend nicht mehr benötigt wird.
    const accountData = {
      loginEmail: this.addAccountForm.value.loginEmail,
      password: 'dummy_password' // Dieser Wert wird vom Backend ignoriert, ist aber für die Methode nötig
    };

    this.accountService.addAccount(accountData).subscribe({
      next: (newAccount) => {
        // Da die API nicht mehr das volle Objekt zurückgibt, laden wir die Liste neu.
        this.loadAccounts();
        this.addAccountForm.reset();
        // Setzt den 'touched'-Status zurück, damit keine Fehler direkt angezeigt werden
        Object.keys(this.addAccountForm.controls).forEach(key => {
          this.addAccountForm.get(key)?.setErrors(null) ;
        });
        this.showNotification('Account added successfully!', false);
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(err.error?.error || 'An unknown error occurred.', true);
        this.isLoading = false;
      }
    });
  }


  deleteAccount(accountId: string, accountName: string | undefined): void {
    const confirmation = confirm(`Are you sure you want to permanently delete the account "${accountName || 'this account'}"? This action cannot be undone.`);
    if (!confirmation) {
      return;
    }
    this.isListLoading = true;

    this.accountService.removeAccount(accountId).subscribe({
      next: () => {
        this.accounts = this.accounts.filter(acc => acc.accountId !== accountId);
        this.showNotification('Account deleted successfully.');
        this.isListLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(`Error: ${err.error.error || 'Failed to delete account.'}`, true);
        this.isListLoading = false;
      }
    });
  }

  showNotification(message: string, isError: boolean = false): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: isError ? ['error-snackbar'] : ['success-snackbar']
    });
  }

  get loginEmail() { return this.addAccountForm.get('loginEmail'); }
}
