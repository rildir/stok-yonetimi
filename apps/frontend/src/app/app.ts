import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UiStateService } from './services/ui-state.service';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <router-outlet></router-outlet>

    <!-- ─── Global Toast Container ─── -->
    <div class="toast-container">
      @for (toast of ui.toasts(); track toast.id) {
        <div class="toast" [class.toast-success]="toast.type === 'success'" [class.toast-error]="toast.type === 'error'" [class.toast-info]="toast.type === 'info'">
          <div class="toast-icon">
            @if (toast.type === 'success') { <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> }
            @else if (toast.type === 'error') { <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg> }
            @else { <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> }
          </div>
          <div class="toast-message">{{ toast.message }}</div>
          <button class="toast-close" (click)="ui.removeToast(toast.id)">✕</button>
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
  }
}
