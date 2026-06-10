import { Injectable, signal, inject } from '@angular/core';
import { AiInventoryService } from '../ai-inventory.service';
import { AiResponseCard } from '../inventory.service';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ExtendedAiResponseCard extends AiResponseCard {
  timestamp: Date;
  id: string;
}

@Injectable({ providedIn: 'root' })
export class UiStateService {
  private aiService = inject(AiInventoryService);

  toasts = signal<Toast[]>([]);
  isAiPanelOpen = signal(false);
  isAiLoading = signal(false);
  
  aiAnswers = signal<ExtendedAiResponseCard[]>([{
    id: 'welcome',
    title: 'Yapay Zeka Asistanı Aktif',
    type: 'list',
    description: 'Stok yönetimi ve satış verileri hakkında doğal dilde sorular sorabilirsiniz. Örnek sorguları aşağıdan seçebilir veya kendiniz yazabilirsiniz.',
    timestamp: new Date()
  }]);

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = Math.random().toString(36).substr(2, 9);
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => { this.removeToast(id); }, 3000);
  }

  removeToast(id: string) {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }

  toggleAiPanel() {
    this.isAiPanelOpen.update(v => !v);
  }

  askQuestion(promptText: string) {
    if (!promptText.trim() || this.isAiLoading()) return;
    this.isAiLoading.set(true);
    this.isAiPanelOpen.set(true);
    
    this.aiService.queryAi(promptText).subscribe({
      next: (res) => {
        this.aiAnswers.update(answers => [{
          ...res,
          timestamp: new Date(),
          id: Math.random().toString(36).substr(2, 9)
        }, ...answers]);
        this.isAiLoading.set(false);
      },
      error: () => {
        this.isAiLoading.set(false);
        this.showToast('Yapay Zeka servisi ile iletişim kurulamadı.', 'error');
      }
    });
  }
}
