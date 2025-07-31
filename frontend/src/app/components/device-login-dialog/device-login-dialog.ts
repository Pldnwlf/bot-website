import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ClipboardModule, Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MinecraftAccountService } from '../../services/minecraft-account';


export interface DeviceLoginData {
  url: string;
  code: string;
  accountId: string;
}

@Component({
  selector: 'app-device-login-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    ClipboardModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatTooltipModule
  ],
  templateUrl: './device-login-dialog.html',
  styleUrl: './device-login-dialog.scss'
})
export class DeviceLoginDialogComponent {
  public data: DeviceLoginData;
  isFinalizing = false;

  constructor(
    public dialogRef: MatDialogRef<DeviceLoginDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: DeviceLoginData,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar,
    private accountService: MinecraftAccountService
) {
    this.data = data;
  }

  onFinalize(): void {
    this.isFinalizing = true;
    this.accountService.finalizeAddAccount(this.data.accountId).subscribe({
      next: () => {
        this.snackBar.open('Verification successful!', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Verification failed.', 'Close', { duration: 5000, panelClass: ['error-snackbar'] });
        this.isFinalizing = false;
      }
    });
  }


  copyCode(): void {
    this.clipboard.copy(this.data.code);
    this.snackBar.open('Code copied to clipboard!', 'OK', {
      duration: 2500,
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
