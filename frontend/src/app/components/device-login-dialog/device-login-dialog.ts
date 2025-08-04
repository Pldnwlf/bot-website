import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ClipboardModule, Clipboard } from '@angular/cdk/clipboard';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
// Der MinecraftAccountService wird hier nicht mehr benötigt.

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
  // isFinalizing wird nicht mehr benötigt
  // isFinalizing = false;

  constructor(
    public dialogRef: MatDialogRef<DeviceLoginDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: DeviceLoginData,
    private clipboard: Clipboard,
    private snackBar: MatSnackBar
    // MinecraftAccountService wird hier nicht mehr injiziert
  ) {
    this.data = data;
  }

  // Die onFinalize-Methode wird vollständig entfernt.
  // onFinalize(): void { ... }

  copyCode(): void {
    this.clipboard.copy(this.data.code);
    this.snackBar.open('Code copied to clipboard!', 'OK', {
      duration: 2500,
    });
  }

  onClose(): void {
    // Wenn der Benutzer den Dialog schliesst, bricht er den Vorgang ab.
    // Das Backend wird den PENDING-Account nach einem Timeout selbst aufräumen.
    this.dialogRef.close();
  }
}
