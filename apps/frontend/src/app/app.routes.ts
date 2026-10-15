import { Route } from '@angular/router';
import { authGuard, guestGuard, adminGuard } from './guards/auth.guard';

export const appRoutes: Route[] = [
  { 
    path: 'login', 
    canActivate: [guestGuard],
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'invite/:token',
    loadComponent: () => import('./components/login/account-setup.component').then(m => m.AccountSetupComponent)
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    loadComponent: () => import('./components/login/account-setup.component').then(m => m.AccountSetupComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'products', loadComponent: () => import('./components/products/products.component').then(m => m.ProductsComponent) },
      { path: 'stock-movements', loadComponent: () => import('./components/stock-movements/stock-movements.component').then(m => m.StockMovementsComponent) },
      { path: 'suppliers', loadComponent: () => import('./components/suppliers/suppliers.component').then(m => m.SuppliersComponent) },
      { path: 'purchase-orders', loadComponent: () => import('./components/purchase-orders/purchase-orders.component').then(m => m.PurchaseOrdersComponent) },
      { path: 'customers', loadComponent: () => import('./components/customers/customers.component').then(m => m.CustomersComponent) },
      { path: 'orders', loadComponent: () => import('./components/orders/orders.component').then(m => m.OrdersComponent) },
      { path: 'settings', loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'reports', loadComponent: () => import('./components/reports/reports.component').then(m => m.ReportsComponent) },
      { path: 'stock-count', loadComponent: () => import('./components/stock-count/stock-count.component').then(m => m.StockCountComponent) },
      { path: 'warehouses', loadComponent: () => import('./components/warehouses/warehouses.component').then(m => m.WarehousesComponent) },
      { path: 'audit-log', canActivate: [adminGuard], loadComponent: () => import('./components/audit-log/audit-log.component').then(m => m.AuditLogComponent) },
      { path: 'integrations', canActivate: [adminGuard], loadComponent: () => import('./components/integrations/integrations.component').then(m => m.IntegrationsComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
