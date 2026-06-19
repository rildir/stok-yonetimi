import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiStateService } from '../../services/ui-state.service';
import { AppStateService } from '../../services/app-state.service';

interface Invoice {
  id: string;
  date: string;
  planName: string;
  amount: number;
  status: 'Ödendi' | 'Beklemede';
}

interface SavedCard {
  id: string;
  cardHolder: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header premium-header" style="border:none; padding-bottom:0; margin-bottom: 1.5rem;">
      <div>
        <h1 class="premium-title">Hesap Aboneliği & Fatura</h1>
        <p class="premium-subtitle">Planınızı yönetin, ödeme kartlarınızı kaydedin ve fatura geçmişinizi takip edin.</p>
      </div>
    </header>

    <div class="master-billing-grid">
      <!-- LEFT COLUMN (Main Content) -->
      <div class="billing-main-pane">
        
        <!-- CURRENT SUBSCRIPTION BANNER -->
        <div class="premium-status-banner" [class.pro]="ui.subscription().plan === 'ultra'">
          <div class="banner-glow-effect"></div>
          <div class="banner-body">
            <div class="banner-info">
              <span class="premium-badge-pill" [class.pro-pill]="ui.subscription().plan === 'ultra'">
                {{ ui.subscription().plan === 'ultra' ? 'Ultra' : ui.subscription().plan === 'professional' ? 'Profesyonel' : 'Standart' }} Paket Aktif
              </span>
              <h2>
                {{ ui.subscription().plan === 'ultra' ? 'Ultra Paket Sürümü' : ui.subscription().plan === 'professional' ? 'Profesyonel Sürüm' : 'Standart Sürüm' }}
              </h2>
              <p class="expiry-text">
                Bir sonraki yenilenme tarihi: {{ ui.subscription().expiresAt | date:'dd MMMM yyyy' }}
              </p>
            </div>
            
            <div class="banner-stats">
              @if (ui.subscription().plan === 'ultra') {
                <div class="radial-stat">
                  <span class="stat-icon">✦</span>
                  <div class="stat-text">
                    <span class="label">Yapay Zeka Asistanı</span>
                    <span class="value">Açık (Sınırsız Sorgu)</span>
                  </div>
                </div>
              } @else {
                <div class="radial-stat locked">
                  <span class="stat-icon">✕</span>
                  <div class="stat-text">
                    <span class="label">Yapay Zeka Asistanı</span>
                    <span class="value locked-text">Kilitli (Ultra Paket Gerekli)</span>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- COMPARISON GRID -->
        <div class="pricing-deck">
          <!-- Standard Plan Card -->
          <div class="deck-card" [class.active-card]="ui.subscription().plan === 'standard'">
            <div class="deck-header">
              <h3>Standart Paket</h3>
              <div class="deck-price">₺299<span>/ay</span></div>
              <p>Küçük ölçekli stok yönetimleri için temel işlevler</p>
            </div>
            <ul class="deck-features">
              <li>
                <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>Maksimum 1,000 Ürün</span>
              </li>
              <li class="disabled-feature">
                <svg class="cross-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                <span>Yapay Zeka Asistanı (Yok)</span>
              </li>
              <li>
                <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>E-posta Desteği</span>
              </li>
            </ul>
            @if (ui.subscription().plan === 'standard') {
              <button class="deck-btn current" disabled>Aktif Planınız</button>
            } @else {
              <button class="deck-btn" (click)="openCheckout('standard')">Standart Plana Geç</button>
            }
          </div>

          <!-- Professional Plan Card -->
          <div class="deck-card" [class.active-card]="ui.subscription().plan === 'professional'">
            <div class="deck-header">
              <h3>Profesyonel Paket</h3>
              <div class="deck-price">₺599<span>/ay</span></div>
              <p>Sınırsız ürün kapasitesi ve standart öncelikli destek</p>
            </div>
            <ul class="deck-features">
              <li>
                <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>Sınırsız Ürün Kapasitesi</span>
              </li>
              <li class="disabled-feature">
                <svg class="cross-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                <span>Yapay Zeka Asistanı (Yok)</span>
              </li>
              <li>
                <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>Öncelikli E-posta Desteği</span>
              </li>
            </ul>
            @if (ui.subscription().plan === 'professional') {
              <button class="deck-btn current" disabled>Aktif Planınız</button>
            } @else {
              <button class="deck-btn" (click)="openCheckout('professional')">Profesyonel Plana Geç</button>
            }
          </div>

          <!-- Ultra Plan Card (Glowing Flagship Card) -->
          <div class="deck-card premium-deck-card" [class.active-card]="ui.subscription().plan === 'ultra'">
            <div class="card-neon-border"></div>
            <div class="deck-badge">En Gelişmiş</div>
            <div class="deck-header">
              <h3>Ultra Paket</h3>
              <div class="deck-price">₺999<span>/ay</span></div>
              <p>Yapay zeka asistanı ve gelişmiş analiz modülü</p>
            </div>
            <ul class="deck-features">
              <li>
                <svg class="check-icon pro-check" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>Sınırsız Ürün Kapasitesi</span>
              </li>
              <li>
                <svg class="check-icon pro-check" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>Sınırsız AI Asistan Sorgusu</span>
              </li>
              <li>
                <svg class="check-icon pro-check" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>7/24 Canlı Öncelikli Destek</span>
              </li>
              <li>
                <svg class="check-icon pro-check" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span>Gelişmiş AI Analiz & Öngörüler</span>
              </li>
            </ul>
            @if (ui.subscription().plan === 'ultra') {
              <button class="deck-btn premium current" disabled>Aktif Planınız</button>
            } @else {
              <button class="deck-btn premium-btn" (click)="openCheckout('ultra')">Ultra Plana Yükselt</button>
            }
          </div>
        </div>

        <!-- INVOICE LIST -->
        <div class="premium-invoices-card">
          <h3 class="pane-title">Fatura Geçmişi</h3>
          <div class="ledger-table-wrapper">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>Fatura ID</th>
                  <th>Tarih</th>
                  <th>Abonelik Planı</th>
                  <th>Tutar</th>
                  <th>Ödeme Durumu</th>
                </tr>
              </thead>
              <tbody>
                @for (inv of invoices; track inv.id) {
                  <tr>
                    <td class="id-cell">{{ inv.id }}</td>
                    <td>{{ inv.date }}</td>
                    <td>{{ inv.planName }}</td>
                    <td class="amount-cell">₺{{ inv.amount }}</td>
                    <td>
                      <span class="status-pill success">
                        <span class="status-dot"></span> {{ inv.status }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- RIGHT COLUMN (Billing Card Wallet & Actions) -->
      <div class="billing-sidebar-pane">
        <div class="premium-card-container">
          <h3 class="pane-title">Kayıtlı Ödeme Yöntemi</h3>
          
          <!-- Modern Credit Card Representation -->
          <div class="master-credit-card">
            <div class="card-reflection"></div>
            <div class="card-inner">
              <div class="card-top">
                <div class="card-contactless">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h.01M8.66 8.66a5 5 0 0 1 0 6.68M11.9 5.42a9 9 0 0 1 0 13.16M15.14 2.18a13 13 0 0 1 0 19.64"/></svg>
                </div>
                <div class="card-network-logo">
                  <span class="logo-circle primary-c"></span>
                  <span class="logo-circle secondary-c"></span>
                </div>
              </div>
              <div class="card-chip"></div>
              <div class="card-details">
                <div class="card-num-display">{{ activeCard().cardNumber || '•••• •••• •••• ••••' }}</div>
                <div class="card-bottom-row">
                  <div class="holder">
                    <span class="lbl">Kart Sahibi</span>
                    <span class="val">{{ activeCard().cardHolder || 'Ahmet Ildır' }}</span>
                  </div>
                  <div class="expiry">
                    <span class="lbl">Skt</span>
                    <span class="val">{{ activeCard().cardExpiry || '12/29' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Cards Wallet Manager -->
          <div class="saved-cards-list-container">
            <span class="lbl-small">Kartlarım ({{ savedCards().length }})</span>
            <div class="mini-cards-flex">
              @for (c of savedCards(); track c.id) {
                <div class="mini-card-item" [class.selected]="c.id === selectedCardId()" (click)="selectedCardId.set(c.id)">
                  <span class="mini-num">•••• {{ c.cardNumber.replace(/\s/g, '').slice(-4) }}</span>
                  @if (savedCards().length > 1) {
                    <button class="delete-mini-card" (click)="deleteCard($event, c.id)" title="Kartı Sil">✕</button>
                  }
                </div>
              }
            </div>
          </div>

          <div class="sidebar-action-list">
            <button class="btn-master-action secondary" (click)="openCheckout('only_add_card')">
              Yeni Ödeme Kartı Ekle
            </button>
            @if (ui.subscription().plan !== 'standard') {
              <button class="btn-master-action danger" (click)="confirmCancel()">
                Aboneliği İptal Et (Standart Plana Düşür)
              </button>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- ─── CHECKOUT MODAL ─── -->
    @if (isCheckoutOpen()) {
      <div class="checkout-overlay">
        <div class="checkout-modal">
          <div class="checkout-header">
            <h3>{{ checkoutPlan === 'only_add_card' ? 'Yeni Kart Ekle' : 'Güvenli Ödeme Simülasyonu' }}</h3>
            <button class="close-btn" (click)="closeCheckout()">✕</button>
          </div>
          <div class="checkout-body">
            @if (checkoutPlan !== 'only_add_card') {
              <div class="order-summary-box">
                <span>Seçilen Plan:</span>
                <strong>
                  {{ checkoutPlan === 'standard' ? 'Standart Paket (₺299/ay)' : checkoutPlan === 'professional' ? 'Profesyonel Paket (₺599/ay)' : 'Ultra Paket (₺999/ay)' }}
                </strong>
              </div>
            }

            <!-- Selector: Saved Cards vs New Card -->
            @if (checkoutPlan !== 'only_add_card' && savedCards().length > 0) {
              <div class="payment-selection-box" style="margin-bottom: 16px;">
                <span class="form-group-label" style="font-family:var(--font-heading); font-size:0.65rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px; display:block;">ÖDEME YÖNTEMİ SEÇİN</span>
                <div class="payment-methods-list" style="display:flex; flex-direction:column; gap:12px;">
                  @for (c of savedCards(); track c.id) {
                    <label class="payment-method-row" [class.selected]="c.id === checkoutCardId()" (click)="checkoutCardId.set(c.id); useNewCard.set(false)">
                      <input type="radio" name="checkoutCard" [value]="c.id" [checked]="c.id === checkoutCardId()" />
                      <span class="card-bullet-text">
                        <strong>{{ c.cardHolder }}</strong> · •••• {{ c.cardNumber.replace(/\s/g, '').slice(-4) }} (Skt: {{ c.cardExpiry }})
                      </span>
                    </label>
                  }
                  <label class="payment-method-row" [class.selected]="useNewCard()" (click)="useNewCard.set(true); checkoutCardId.set('')">
                    <input type="radio" name="checkoutCard" value="new" [checked]="useNewCard()" />
                    <span class="card-bullet-text">
                      <strong>Yeni Kredi Kartı Ekle ve Öde</strong>
                    </span>
                  </label>
                </div>
              </div>
            }

            <form (ngSubmit)="handlePaymentSubmit()" style="display:flex; flex-direction:column; gap:12px;">
              <!-- Input Fields (If adding card, or choosing to enter new card) -->
              @if (useNewCard() || savedCards().length === 0 || checkoutPlan === 'only_add_card') {
                <div class="form-field">
                  <input id="cardHolder" class="form-input" [class.has-value]="!!cardHolder" type="text" placeholder="Ahmet Ildır" [(ngModel)]="cardHolder" name="cardHolder" required />
                  <label for="cardHolder" class="form-label">Kart Sahibi</label>
                </div>
                <div class="form-field">
                  <input id="cardNumber" class="form-input" [class.has-value]="!!cardNumber" type="text" placeholder="5412 7522 3412 7856" [(ngModel)]="cardNumber" (input)="formatCardNumber()" name="cardNumber" maxlength="19" required />
                  <label for="cardNumber" class="form-label">Kart Numarası</label>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="form-field">
                    <input id="cardExpiry" class="form-input" [class.has-value]="!!cardExpiry" type="text" placeholder="AA/YY" [(ngModel)]="cardExpiry" (input)="formatCardExpiry()" name="cardExpiry" maxlength="5" required />
                    <label for="cardExpiry" class="form-label">Son Kullanma</label>
                  </div>
                  <div class="form-field">
                    <input id="cardCvv" class="form-input" [class.has-value]="!!cardCvv" type="text" placeholder="CVC" [(ngModel)]="cardCvv" name="cardCvv" maxlength="3" required />
                    <label for="cardCvv" class="form-label">CVV / CVC</label>
                  </div>
                </div>
              } @else {
                <div class="selected-card-summary" style="padding:1rem; background:rgba(0,0,0,0.02); border:1px dashed var(--secondary); border-radius:8px; font-size:0.8rem; margin-bottom:12px;">
                  Seçilen Kayıtlı Kart <strong>{{ activeCheckoutCard().cardHolder }}</strong> (•••• {{ activeCheckoutCard().cardNumber.replace(/\s/g, '').slice(-4) }}) ile ödeme gerçekleştirilecektir.
                </div>
              }

              <div class="checkout-actions">
                <button type="button" class="btn btn-secondary" (click)="closeCheckout()">Vazgeç</button>
                <button type="submit" class="btn btn-primary" [disabled]="isPaying()">
                  @if (isPaying()) {
                    İşlem Gerçekleştiriliyor...
                  } @else {
                    {{ checkoutPlan === 'only_add_card' ? 'Kartı Cüzdana Kaydet' : 'Güvenli Ödeme Yap' }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }
  `
})
export class BillingComponent implements OnInit {
  ui = inject(UiStateService);
  state = inject(AppStateService);

  isCheckoutOpen = signal(false);
  checkoutPlan: 'standard' | 'professional' | 'ultra' | 'only_add_card' = 'standard';
  useNewCard = signal(false);

  savedCards = signal<SavedCard[]>([]);
  selectedCardId = signal<string>('');
  checkoutCardId = signal<string>(''); // Currently selected card during checkout selection

  cardHolder = '';
  cardNumber = '';
  cardExpiry = '';
  cardCvv = '';
  isPaying = signal(false);

  invoices: Invoice[] = [
    { id: 'INV-2026-102', date: '19.06.2026', planName: 'Standart Paket', amount: 0, status: 'Ödendi' }
  ];

  daysRemaining = computed(() => {
    const sub = this.ui.subscription();
    if (!sub || !sub.expiresAt) return 0;
    const diffTime = new Date(sub.expiresAt).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  });

  usagePercentage = computed(() => {
    const sub = this.ui.subscription();
    if (!sub || sub.aiQueriesLimit === 0) return 0;
    return Math.min(100, Math.round((sub.aiQueriesUsed / sub.aiQueriesLimit) * 100));
  });

  activeCard = computed(() => {
    return this.savedCards().find(c => c.id === this.selectedCardId()) || this.savedCards()[0] || null;
  });

  activeCheckoutCard = computed(() => {
    return this.savedCards().find(c => c.id === this.checkoutCardId()) || this.savedCards()[0] || null;
  });

  ngOnInit() {
    this.loadSavedCards();
  }

  loadSavedCards() {
    try {
      const saved = localStorage.getItem('smart_inventory_saved_cards');
      if (saved) {
        const list = JSON.parse(saved) as SavedCard[];
        if (list.length > 0) {
          this.savedCards.set(list);
          this.selectedCardId.set(list[0].id);
          this.checkoutCardId.set(list[0].id);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading saved cards', e);
    }
    
    // Seed default payment card
    const defaultCard: SavedCard = {
      id: 'card_default',
      cardHolder: 'Ahmet Ildır',
      cardNumber: '5412 7522 3412 7856',
      cardExpiry: '12/29',
      cardCvv: '123'
    };
    this.savedCards.set([defaultCard]);
    this.selectedCardId.set('card_default');
    this.checkoutCardId.set('card_default');
    this.saveSavedCards();
  }

  saveSavedCards() {
    try {
      localStorage.setItem('smart_inventory_saved_cards', JSON.stringify(this.savedCards()));
    } catch (e) {
      console.error('Error saving cards', e);
    }
  }

  openCheckout(plan: 'standard' | 'professional' | 'ultra' | 'only_add_card') {
    this.checkoutPlan = plan;
    this.useNewCard.set(plan === 'only_add_card');
    if (this.savedCards().length > 0) {
      this.checkoutCardId.set(this.selectedCardId());
    }
    this.isCheckoutOpen.set(true);
  }

  closeCheckout() {
    this.isCheckoutOpen.set(false);
    this.cardHolder = '';
    this.cardNumber = '';
    this.cardExpiry = '';
    this.cardCvv = '';
    this.useNewCard.set(false);
  }

  formatCardNumber() {
    let val = this.cardNumber.replace(/\D/g, '');
    let parts = [];
    for (let i = 0; i < val.length; i += 4) {
      parts.push(val.substring(i, i + 4));
    }
    this.cardNumber = parts.join(' ');
  }

  formatCardExpiry() {
    let val = this.cardExpiry.replace(/\D/g, '');
    if (val.length >= 2) {
      this.cardExpiry = val.substring(0, 2) + '/' + val.substring(2, 4);
    } else {
      this.cardExpiry = val;
    }
  }

  handlePaymentSubmit() {
    if (this.useNewCard() || this.checkoutPlan === 'only_add_card' || this.savedCards().length === 0) {
      if (!this.cardHolder.trim() || this.cardNumber.length < 19 || this.cardExpiry.length < 5 || this.cardCvv.length < 3) {
        this.ui.showToast('Lütfen kart bilgilerini eksiksiz ve geçerli doldurun.', 'error');
        return;
      }
    }

    this.isPaying.set(true);
    setTimeout(() => {
      // Save new card if it was typed
      if (this.useNewCard() || this.checkoutPlan === 'only_add_card') {
        const newCardId = 'card_' + Math.random().toString(36).substr(2, 9);
        const newCard: SavedCard = {
          id: newCardId,
          cardHolder: this.cardHolder,
          cardNumber: this.cardNumber,
          cardExpiry: this.cardExpiry,
          cardCvv: this.cardCvv
        };
        this.savedCards.update(c => [...c, newCard]);
        this.selectedCardId.set(newCardId);
        this.checkoutCardId.set(newCardId);
        this.saveSavedCards();
        this.ui.showToast('Yeni ödeme kartı cüzdanınıza başarıyla eklendi.', 'success');
      }

      // Process plan upgrade if not only adding a card
      if (this.checkoutPlan !== 'only_add_card') {
        this.ui.purchasePlan(this.checkoutPlan as 'standard' | 'professional' | 'ultra');
        
        const today = new Date().toLocaleDateString('tr-TR');
        const invoiceId = 'INV-2026-' + Math.floor(100 + Math.random() * 900);
        const planPrice = this.checkoutPlan === 'standard' ? 299 : this.checkoutPlan === 'professional' ? 599 : 999;
        
        this.invoices = [
          {
            id: invoiceId,
            date: today,
            planName: this.checkoutPlan === 'standard' ? 'Standart Paket' : this.checkoutPlan === 'professional' ? 'Profesyonel Paket' : 'Ultra Paket',
            amount: planPrice,
            status: 'Ödendi'
          },
          ...this.invoices
        ];
      }

      this.isPaying.set(false);
      this.closeCheckout();
    }, 1500);
  }

  deleteCard(event: Event, cardId: string) {
    event.stopPropagation();
    if (this.savedCards().length <= 1) {
      this.ui.showToast('Cüzdanınızdaki son kartı silemezsiniz.', 'error');
      return;
    }
    this.savedCards.update(list => list.filter(c => c.id !== cardId));
    this.saveSavedCards();
    this.ui.showToast('Ödeme yöntemi cüzdandan kaldırıldı.', 'info');
    
    if (this.selectedCardId() === cardId) {
      this.selectedCardId.set(this.savedCards()[0].id);
      this.checkoutCardId.set(this.savedCards()[0].id);
    }
  }

  confirmCancel() {
    this.ui.openConfirm({
      title: 'Aboneliği İptal Et',
      message: 'Aboneliğinizi iptal etmek istediğinize emin misiniz? Yapay Zeka Asistanı ve Sınırsız Ürün kapasitesine olan erişiminizi hemen kaybedeceksiniz.',
      confirmText: 'Standart Plana Düşür',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        this.ui.cancelSubscription();
      }
    });
  }
}
