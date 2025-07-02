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


  deleteAccount(id: string): void {
    if (!confirm('Are you sure you want to delete this account?')) {
      return;
    }
    this.isLoading = true;

    this.accountService.removeAccount(id).subscribe({
      next: () => {
        // Die UI aktualisieren, indem der gelöschte Account aus der Liste gefiltert wird
        this.accounts = this.accounts.filter(acc => acc.accountId !== id);

        this.snackBar.open('Account deleted successfully!', 'OK', { duration: 3000 });
        this.isLoading = false;
      },
      // Diese Funktion wird ausgeführt, wenn die API einen Fehler zurückgibt
      error: (err) => {
        this.showError(err.error?.error || 'Failed to delete account.');
        this.isLoading = false;
      }
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
}
