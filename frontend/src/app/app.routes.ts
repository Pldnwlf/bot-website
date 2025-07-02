import { Routes } from '@angular/router';
import { Dashboard } from './components/dashboard/dashboard';
import { AccountManagement } from './components/account-management/account-management';
import { Chat } from './components/chat/chat';
import { authGuard } from './guards/auth.guard';
// Importiere die Layout-Komponente
import { MainLayoutComponent } from './components/layout/main-layout';

export const routes: Routes = [
  {
    path: '',
    // Lade das Haupt-Layout
    component: MainLayoutComponent,
    // Schütze das Layout und alle seine Kinder
    canActivate: [authGuard],
    // Definiere die Seiten, die INNERHALB des Layouts angezeigt werden
    children: [
      {
        path: 'dashboard',
        component: Dashboard,
        title: 'Dashboard'
      },
      {
        path: 'accounts',
        component: AccountManagement,
        title: 'Account Management'
      },
      {
        path: 'chat',
        component: Chat,
        title: 'Bot Chat'
      },
      // Standard-Weiterleitung, wenn man / aufruft
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // Die Fallback-Route bleibt außerhalb, um Endlosschleifen zu vermeiden
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
