import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UiStateService } from './services/ui-state.service';
import { SocketService } from './services/socket.service';
import { DateInputLocaleService } from './services/date-input-locale.service';
import { TranslatePipe } from './i18n';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    <router-outlet></router-outlet>

    <!-- ─── Global toasts: bottom-right stack, status stripe + icon ─── -->
    <div class="toast-container" aria-live="polite">
      @for (toast of ui.toasts(); track toast.id) {
        <div class="toast" [class.toast-success]="toast.type === 'success'" [class.toast-error]="toast.type === 'error'" [class.toast-info]="toast.type === 'info'" [attr.role]="toast.type === 'error' ? 'alert' : 'status'">
          <div class="toast-icon" aria-hidden="true">
            @if (toast.type === 'success') { <svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg> }
            @else if (toast.type === 'error') { <svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.01"/></svg> }
            @else { <svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg> }
          </div>
          <div class="toast-message">{{ toast.message }}</div>
          <button type="button" class="toast-close" (click)="ui.removeToast(toast.id)" [attr.aria-label]="'common.close' | t">
            <svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
      }
    </div>
  `
})
export class App {
  ui = inject(UiStateService);
  private socketService = inject(SocketService);

  constructor() {
    this.socketService.init();
    inject(DateInputLocaleService).init();
  }
}
