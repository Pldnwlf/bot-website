import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms'; // Wichtig für Formulare
import { MinecraftAccount, MinecraftAccountService } from '../../services/minecraft-account';

// Angular Material Module
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar'; // Für Ladeanzeigen
import {MatSnackBar, MatSnackBarModule} from "@angular/material/snack-bar";
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-account-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule, // Hinzufügen!
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule
  ],
  templateUrl: './account-management.html',
  styleUrls: ['./account-management.scss']
})
export class AccountManagement implements OnInit {
  accounts: MinecraftAccount[] = [];
  addAccountForm: FormGroup;
  isLoading = false; // Für Ladeanzeigen
  selectedFile: File | null = null;
  isUploading = false;

  constructor(
    private fb: FormBuilder,
    private accountService: MinecraftAccountService,
    private snackBar: MatSnackBar
  ) {
    // Formular mit Validierungsregeln initialisieren
    this.addAccountForm = this.fb.group({
      loginEmail: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.isLoading = true;
    this.accountService.getAccounts().subscribe({
      next: (data: MinecraftAccount[]) => {
        this.accounts = data;
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.showError('Failed to load accounts.');
        this.isLoading = false;
      }
    });
  }

  onAddAccountSubmit(): void {
    if (this.addAccountForm.invalid) {
      this.showError('Please fill out the form correctly.');
      return;
    }
    this.isLoading = true;

    this.accountService.addAccount(this.addAccountForm.value).subscribe({
      next: (newAccount) => {
        this.accounts.push(newAccount);
        // Formular für die nächste Eingabe zurücksetzen
        this.addAccountForm.reset();
        // Erfolgsmeldung anzeigen
        this.snackBar.open('Account added successfully!', 'OK', { duration: 3000 });
        this.isLoading = false; // Ladezustand beenden
      },
      error: (err) => {
        // Zeige die Fehlermeldung vom Backend, oder eine generische.
        this.showError(err.error?.error || 'An unknown error occurred.');
        this.isLoading = false;
      }
    });
  }


  deleteAccount(accountId: string, accountName: string | undefined): void {
    const confirmation = confirm(`Are you sure you want to permanently delete the account "${accountName || 'this account'}"? This action cannot be undone.`);

    if (!confirmation) {
      return;
    }

    this.isLoading = true;

    this.accountService.removeAccount(accountId).subscribe({
      next: () => {
        this.accounts = this.accounts.filter(acc => acc.accountId !== accountId);
        this.showNotification('Account deleted successfully.');
        this.isLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(`Error: ${err.error.error || 'Failed to delete account.'}`, true);
        this.isLoading = false;
      }
    });
  }
  // Deine bestehende showNotification Methode
  showNotification(message: string, isError: boolean = false): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: isError ? ['error-snackbar'] : ['success-snackbar']
    });
  }

  get loginEmail() { return this.addAccountForm.get('loginEmail'); }
  get password() { return this.addAccountForm.get('password'); }

  showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['error-snackbar']
    });
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    } else {
      this.selectedFile = null;
    }
  }
  onBulkImportSubmit(): void {
    if (!this.selectedFile) {
      this.showNotification('Please select a file to upload.', true);
      return;
    }

    this.isUploading = true;
    this.accountService.bulkImportAccounts(this.selectedFile).subscribe({
      next: (response) => {
        const message = `Import complete: ${response.success} added, ${response.failed} failed.`;
        this.showNotification(message);

        // Optionally, show detailed errors
        if (response.errors && response.errors.length > 0) {
          const errorDetails = response.errors.map((e: any) => `${e.email}: ${e.reason}`).join('\n');
          // Using console.error is a good way to show detailed info without cluttering the UI.
          console.error('Bulk import errors:\n', errorDetails);
          alert('Some accounts failed to import. Check the browser console (F12) for details.');
        }

        // Refresh the account list to show the new accounts
        this.loadAccounts();
        this.selectedFile = null; // Clear the selection
        this.isUploading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.showNotification(err.error?.error || 'Failed to upload file.', true);
        this.isUploading = false;
      }
    });
  }
}
