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
              <p>Temel stok yönetimi işlevleri ve tek kullanıcı desteği</p>
            </div>
            <ul class="deck-features">
              <li>
                <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span><strong>1 Kullanıcı</strong> (Yönetici) Limiti</span>
              </li>
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
              <p>Sınırsız ürün kapasitesi ve çoklu kullanıcı yönetimi</p>
            </div>
            <ul class="deck-features">
              <li>
                <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span><strong>5 Kullanıcı</strong> Limiti</span>
              </li>
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
              <p>Yapay zeka asistanı, sınırsız ürün ve sınırsız kullanıcı</p>
            </div>
            <ul class="deck-features">
              <li>
                <svg class="check-icon pro-check" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <span><strong>Sınırsız Kullanıcı</strong> Limiti</span>
              </li>
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
                  <tr (click)="selectedInvoice.set(inv)" style="cursor: pointer; transition: background-color 0.2s;" title="Fatura Detayını Görüntüle">
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

      <!-- RIGHT COLUMN (Amazon Style Wallet & Actions) -->
      <div class="billing-sidebar-pane amazon-wallet-pane">
        <div class="amazon-wallet-card">
          <h3 class="amazon-title">Ödeme Yöntemleriniz</h3>
          <p class="amazon-subtitle">Banka ve Kredi Kartları</p>
          
          @if (savedCards().length === 0) {
            <div class="amazon-empty-state">
              <div class="amazon-empty-icon">💳</div>
              <h4>Kayıtlı kartınız bulunmuyor</h4>
              <p>Güvenli ve hızlı işlem gerçekleştirmek için bir ödeme yöntemi ekleyin.</p>
            </div>
          } @else {
            <div class="amazon-cards-list">
              @for (c of savedCards(); track c.id) {
                <div class="amazon-card-row" [class.selected]="c.id === selectedCardId()" (click)="selectedCardId.set(c.id)">
                  <div class="amazon-row-top">
                    <!-- Radio Button selector -->
                    <div class="amazon-radio-wrapper">
                      <span class="amazon-custom-radio" [class.checked]="c.id === selectedCardId()"></span>
                    </div>
                    
                    <!-- Card Details -->
                    <div class="amazon-card-info">
                      <div class="amazon-card-brand-display">
                        <!-- Visual brand tag -->
                        <span class="brand-badge" [class.visa]="c.cardNumber.startsWith('4')" [class.master]="!c.cardNumber.startsWith('4')">
                          {{ c.cardNumber.startsWith('4') ? 'Visa' : 'Mastercard' }}
                        </span>
                        <span class="card-digits">son hanesi {{ c.cardNumber.replace(/\s/g, '').slice(-4) }}</span>
                      </div>
                      <div class="amazon-card-meta">
                        <span>Ad: <strong>{{ c.cardHolder }}</strong></span>
                        <span>SKT: <strong>{{ c.cardExpiry }}</strong></span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="amazon-row-actions">
                    <button class="amazon-link-btn danger" (click)="deleteCard($event, c.id)">Kaldır</button>
                  </div>
                </div>
              }
            </div>
          }

          <div class="amazon-actions-footer">
            <button class="btn-amazon-primary add-card-btn" (click)="openCheckout('only_add_card')">
              <span class="plus-icon">+</span> Kredi veya Banka Kartı Ekle
            </button>
            
            @if (ui.subscription().plan !== 'none') {
              <button class="btn-amazon-danger-outline cancel-sub-btn" (click)="confirmCancel()">
                Aboneliği İptal Et
              </button>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- ─── CHECKOUT MODAL ─── -->
    @if (isCheckoutOpen()) {
      <div class="checkout-overlay">
        <div class="checkout-modal amazon-checkout-modal">
          <div class="checkout-header no-print">
            <h3>{{ checkoutPlan === 'only_add_card' ? 'Kredi veya Banka Kartı Ekle' : 'Ödeme Yöntemi Seçin' }}</h3>
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
                <span class="form-group-label" style="font-family:var(--font-heading); font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; display:block;">Kayıtlı Kartlarınızdan Seçin</span>
                <div class="payment-methods-list" style="display:flex; flex-direction:column; gap:8px;">
                  @for (c of savedCards(); track c.id) {
                    <label class="payment-method-row amazon-payment-method-row" [class.selected]="c.id === checkoutCardId()" (click)="checkoutCardId.set(c.id); useNewCard.set(false)">
                      <input type="radio" name="checkoutCard" [value]="c.id" [checked]="c.id === checkoutCardId()" />
                      <span class="card-bullet-text">
                        <strong>{{ c.cardHolder }}</strong> · •••• {{ c.cardNumber.replace(/\s/g, '').slice(-4) }} (SKT: {{ c.cardExpiry }})
                      </span>
                    </label>
                  }
                  <label class="payment-method-row amazon-payment-method-row" [class.selected]="useNewCard()" (click)="useNewCard.set(true); checkoutCardId.set('')">
                    <input type="radio" name="checkoutCard" value="new" [checked]="useNewCard()" />
                    <span class="card-bullet-text">
                      <strong>Yeni Kredi Kartı Ekle ve Öde</strong>
                    </span>
                  </label>
                </div>
              </div>
            }

            <form (ngSubmit)="handlePaymentSubmit()" style="display:flex; flex-direction:column; gap:14px;">
              <!-- Input Fields (If adding card, or choosing to enter new card) -->
              @if (useNewCard() || savedCards().length === 0 || checkoutPlan === 'only_add_card') {
                <div class="amazon-form-group">
                  <label for="cardNumber" class="amazon-form-label">Kart numarası</label>
                  <input id="cardNumber" class="amazon-form-input" type="text" placeholder="5412 7522 3412 7856" [(ngModel)]="cardNumber" (input)="formatCardNumber()" name="cardNumber" maxlength="19" required />
                </div>
                <div class="amazon-form-group">
                  <label for="cardHolder" class="amazon-form-label">Kart üzerindeki ad</label>
                  <input id="cardHolder" class="amazon-form-input" type="text" placeholder="Ahmet Ildır" [(ngModel)]="cardHolder" name="cardHolder" required />
                </div>
                <div class="amazon-form-row">
                  <div class="amazon-form-group" style="flex: 2;">
                    <label class="amazon-form-label">Son kullanma tarihi</label>
                    <div class="amazon-expiry-dropdowns">
                      <select class="amazon-form-select" [(ngModel)]="cardExpiryMonth" name="cardExpiryMonth" required>
                        <option value="" disabled selected>Ay</option>
                        @for (m of months; track m) {
                          <option [value]="m">{{ m }}</option>
                        }
                      </select>
                      <select class="amazon-form-select" [(ngModel)]="cardExpiryYear" name="cardExpiryYear" required>
                        <option value="" disabled selected>Yıl</option>
                        @for (y of years; track y) {
                          <option [value]="y">{{ y }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="amazon-form-group" style="flex: 1; max-width: 100px;">
                    <label for="cardCvv" class="amazon-form-label">CVV/CVC</label>
                    <input id="cardCvv" class="amazon-form-input" type="text" placeholder="CVC" [(ngModel)]="cardCvv" name="cardCvv" maxlength="3" required />
                  </div>
                </div>
              } @else {
                <div class="selected-card-summary" style="padding:1rem; background:rgba(0,0,0,0.02); border:1px dashed var(--secondary); border-radius:8px; font-size:0.8rem; margin-bottom:12px;">
                  Seçilen Kayıtlı Kart <strong>{{ activeCheckoutCard().cardHolder }}</strong> (•••• {{ activeCheckoutCard().cardNumber.replace(/\s/g, '').slice(-4) }}) ile ödeme gerçekleştirilecektir.
                </div>
              }

              <div class="amazon-checkout-actions">
                <button type="button" class="btn-amazon-secondary" (click)="closeCheckout()">İptal Et</button>
                <button type="submit" class="btn-amazon-primary action-btn" [disabled]="isPaying()">
                  @if (isPaying()) {
                    İşlem yapılıyor...
                  } @else {
                    {{ checkoutPlan === 'only_add_card' ? 'Kartı cüzdana ekle' : 'Ödemeyi Yap ve Paketini Başlat' }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }

    <!-- ─── INVOICE DETAIL MODAL ─── -->
    @if (selectedInvoice()) {
      <div class="checkout-overlay">
        <div class="checkout-modal invoice-detail-modal" style="max-width: 650px;">
          <div class="checkout-header no-print">
            <h3>Fatura Detayı</h3>
            <button class="close-btn" (click)="selectedInvoice.set(null)">✕</button>
          </div>
          <div class="checkout-body print-area">
            <!-- PDF Template representation -->
            <div class="pdf-container" style="padding: 1.5rem 0.5rem; font-family: var(--font-body); color: var(--text-primary);">
              <!-- Top Row: Logo & Invoice details -->
              <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--primary); padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 28px; height: 28px; border-radius: 6px; background: var(--primary); color: #0F1111; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem;">E</div>
                    <span style="font-family: var(--font-heading); font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em;">Ecelon</span>
                  </div>
                  <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">
                    Ecelon Teknolojileri A.Ş.<br/>
                    Levent, Büyükdere Cd. No:199, 34394 Şişli/İstanbul<br/>
                    Maslak V.D. / 7720938411
                  </p>
                </div>
                <div style="text-align: right;">
                  <h4 style="font-size: 1rem; text-transform: uppercase; font-weight: 700; color: var(--primary);">E-Fatura</h4>
                  <p style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600; margin-top: 4px;">{{ selectedInvoice()?.id }}</p>
                  <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Tarih: {{ selectedInvoice()?.date }}</p>
                </div>
              </div>

              <!-- Middle Row: Customer Details & Payment Info -->
              <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 2rem; margin-bottom: 1.5rem; font-size: 0.8rem;">
                <div>
                  <h5 style="text-transform: uppercase; font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.05em; font-weight: 700; margin-bottom: 6px;">Müşteri Bilgileri</h5>
                  <p style="font-weight: 600; color: var(--primary);">{{ ui.userProfile()?.fullName || 'Ahmet Ildır' }}</p>
                  <p style="color: var(--text-muted); margin-top: 2px; line-height: 1.4;">
                    Kullanıcı Adı: {{ ui.userProfile()?.username || 'admin' }}<br/>
                    Abonelik Hesabı
                  </p>
                </div>
                <div>
                  <h5 style="text-transform: uppercase; font-size: 0.65rem; color: var(--text-muted); letter-spacing: 0.05em; font-weight: 700; margin-bottom: 6px;">Ödeme Detayı</h5>
                  <p style="font-weight: 600; color: var(--status-instock);">{{ selectedInvoice()?.status }} (Kredi Kartı)</p>
                  <p style="color: var(--text-muted); margin-top: 2px;">Abonelik Planı: {{ selectedInvoice()?.planName }}</p>
                </div>
              </div>

              <!-- Table: Line Items -->
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.8rem;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--secondary);">
                    <th style="padding: 8px 0; background: none; font-size: 0.65rem; text-align: left; font-weight: 700; border-bottom: 1px solid var(--secondary); color: var(--text-muted);">Hizmet / Açıklama</th>
                    <th style="padding: 8px 0; background: none; font-size: 0.65rem; text-align: center; font-weight: 700; width: 60px; border-bottom: 1px solid var(--secondary); color: var(--text-muted);">Miktar</th>
                    <th style="padding: 8px 0; background: none; font-size: 0.65rem; text-align: right; font-weight: 700; width: 90px; border-bottom: 1px solid var(--secondary); color: var(--text-muted);">Birim Fiyat</th>
                    <th style="padding: 8px 0; background: none; font-size: 0.65rem; text-align: right; font-weight: 700; width: 70px; border-bottom: 1px solid var(--secondary); color: var(--text-muted);">KDV (%20)</th>
                    <th style="padding: 8px 0; background: none; font-size: 0.65rem; text-align: right; font-weight: 700; width: 95px; border-bottom: 1px solid var(--secondary); color: var(--text-muted);">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom: 1px solid var(--secondary);">
                    <td style="padding: 12px 0; line-height: 1.4; border-bottom: 1px solid var(--secondary);">
                      <strong>Ecelon - {{ selectedInvoice()?.planName }}</strong><br/>
                      <span style="font-size: 0.7rem; color: var(--text-muted);">1 Aylık Bulut Stok Yönetim Yazılımı Abonelik Hizmeti</span>
                    </td>
                    <td style="padding: 12px 0; text-align: center; font-family: var(--font-mono); border-bottom: 1px solid var(--secondary);">1</td>
                    <td style="padding: 12px 0; text-align: right; font-family: var(--font-mono); border-bottom: 1px solid var(--secondary);">₺{{ getSubtotal(selectedInvoice()?.amount || 0) | number:'1.2-2' }}</td>
                    <td style="padding: 12px 0; text-align: right; font-family: var(--font-mono); border-bottom: 1px solid var(--secondary);">₺{{ getVat(selectedInvoice()?.amount || 0) | number:'1.2-2' }}</td>
                    <td style="padding: 12px 0; text-align: right; font-family: var(--font-mono); font-weight: 600; border-bottom: 1px solid var(--secondary);">₺{{ selectedInvoice()?.amount | number:'1.2-2' }}</td>
                  </tr>
                </tbody>
              </table>

              <!-- Totals row -->
              <div style="display: flex; justify-content: flex-end; font-size: 0.8rem; line-height: 1.6;">
                <div style="width: 220px;">
                  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--secondary); padding-bottom: 4px; margin-bottom: 4px;">
                    <span style="color: var(--text-muted);">Ara Toplam:</span>
                    <span style="font-family: var(--font-mono); font-weight: 500;">₺{{ getSubtotal(selectedInvoice()?.amount || 0) | number:'1.2-2' }}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--secondary); padding-bottom: 4px; margin-bottom: 4px;">
                    <span style="color: var(--text-muted);">KDV (%20):</span>
                    <span style="font-family: var(--font-mono); font-weight: 500;">₺{{ getVat(selectedInvoice()?.amount || 0) | number:'1.2-2' }}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 700; padding-top: 4px;">
                    <span>Genel Toplam:</span>
                    <span style="font-family: var(--font-mono);">₺{{ selectedInvoice()?.amount | number:'1.2-2' }}</span>
                  </div>
                </div>
              </div>

              <!-- Legal notes / footer -->
              <div style="margin-top: 3rem; font-size: 0.65rem; color: var(--text-muted); line-height: 1.4; border-top: 1px solid var(--secondary); padding-top: 1rem;">
                <p><strong>Bilgi:</strong> İşbu belge 213 sayılı Vergi Usul Kanunu uyarınca düzenlenmiş olup, elektronik ortamda imzalanarak iletilmiştir. Faturanın aslı sistem üzerinden indirilebilir.</p>
                <p style="margin-top: 4px;">Ecelon - Akıllı Stok Yönetimi SaaS Platformu. Her hakkı saklıdır.</p>
              </div>
            </div>

            <!-- Print Actions -->
            <div class="checkout-actions no-print" style="margin-top: 1rem;">
              <button class="btn btn-secondary" (click)="selectedInvoice.set(null)">Kapat</button>
              <button class="btn btn-primary" (click)="printInvoice()">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Yazdır
              </button>
            </div>
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
  selectedInvoice = signal<Invoice | null>(null);

  cardHolder = '';
  cardNumber = '';
  cardExpiry = '';
  cardExpiryMonth = '';
  cardExpiryYear = '';
  cardCvv = '';
  isPaying = signal(false);

  months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  years = ['2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033', '2034', '2035'];

  invoices: Invoice[] = [];

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
    const cards = this.savedCards();
    return cards.find(c => c.id === this.selectedCardId()) || cards[0] || null;
  });

  activeCheckoutCard = computed(() => {
    const cards = this.savedCards();
    return cards.find(c => c.id === this.checkoutCardId()) || cards[0] || null;
  });

  ngOnInit() {
    this.loadSavedCards();
    this.loadInvoices();
  }

  loadInvoices() {
    try {
      const saved = localStorage.getItem('smart_inventory_invoices');
      if (saved) {
        this.invoices = JSON.parse(saved) as Invoice[];
      } else {
        // default seed
        this.invoices = [
          { id: 'INV-2026-102', date: '19.06.2026', planName: 'Standart Paket', amount: 0, status: 'Ödendi' }
        ];
        this.saveInvoices();
      }
    } catch (e) {
      console.error('Error loading invoices', e);
    }
  }

  saveInvoices() {
    try {
      localStorage.setItem('smart_inventory_invoices', JSON.stringify(this.invoices));
    } catch (e) {
      console.error('Error saving invoices', e);
    }
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
    this.cardExpiryMonth = '';
    this.cardExpiryYear = '';
    this.isCheckoutOpen.set(true);
  }

  closeCheckout() {
    this.isCheckoutOpen.set(false);
    this.cardHolder = '';
    this.cardNumber = '';
    this.cardExpiry = '';
    this.cardExpiryMonth = '';
    this.cardExpiryYear = '';
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
      if (!this.cardHolder.trim() || this.cardNumber.length < 19 || !this.cardExpiryMonth || !this.cardExpiryYear || this.cardCvv.length < 3) {
        this.ui.showToast('Lütfen kart bilgilerini eksiksiz ve geçerli doldurun.', 'error');
        return;
      }
      this.cardExpiry = `${this.cardExpiryMonth}/${this.cardExpiryYear.slice(-2)}`;
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
        this.saveInvoices();
      }

      this.isPaying.set(false);
      this.closeCheckout();
    }, 1500);
  }

  deleteCard(event: Event, cardId: string) {
    event.stopPropagation();
    this.savedCards.update(list => list.filter(c => c.id !== cardId));
    this.saveSavedCards();
    this.ui.showToast('Ödeme yöntemi cüzdandan kaldırıldı.', 'info');
    
    const remaining = this.savedCards();
    if (remaining.length > 0) {
      if (this.selectedCardId() === cardId) {
        this.selectedCardId.set(remaining[0].id);
        this.checkoutCardId.set(remaining[0].id);
      }
    } else {
      this.selectedCardId.set('');
      this.checkoutCardId.set('');
    }
  }

  confirmCancel() {
    this.ui.openConfirm({
      title: 'Aboneliği İptal Et',
      message: 'Aboneliğinizi iptal etmek istediğinize emin misiniz? Sistemdeki tüm panellere ve verilerinize olan erişiminiz durdurulacaktır.',
      confirmText: 'Aboneliği İptal Et',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        this.ui.cancelSubscription();
      }
    });
  }

  getSubtotal(amount: number): number {
    return amount / 1.20;
  }

  getVat(amount: number): number {
    return amount - (amount / 1.20);
  }

  printInvoice() {
    window.print();
  }
}
