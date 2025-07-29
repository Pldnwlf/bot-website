import { Routes } from '@angular/router';
import { MainLayoutComponent } from './components/layout/main-layout';
import { Dashboard } from './components/dashboard/dashboard';
import { AccountManagement } from './components/account-management/account-management';
import { Chat } from './components/chat/chat';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'accounts', component: AccountManagement },
      { path: 'chat', component: Chat },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ]
  },
  { path: '**', redirectTo: '' }
];
