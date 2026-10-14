import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { tap } from 'rxjs/operators';
import { InventoryService } from '../../inventory.service';
import { Customer } from '../../models/inventory.models';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { I18nService, TranslatePipe, NumberFormatPipe, AppDatePipe } from '../../i18n';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, NumberFormatPipe, AppDatePipe],
  styleUrls: ['../../drawer.css'],
  styles: [`
    .cust-sub { font-size: var(--text-2xs); color: var(--color-text-muted); margin-top: 2px; }
    .link { color: var(--color-primary-text); text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .drawer-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .ml-auto { margin-left: auto; margin-right: var(--space-2); }
    .upper { text-transform: uppercase; }
    @media (max-width: 640px) { .form-row { gap: var(--space-3); } }
  `],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'customers.title' | t }}</h1>
        <p>{{ 'customers.subtitle' | t }}</p>
      </div>
      @if (canEdit()) {
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openDrawer()">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'customers.new' | t }}
          </button>
        </div>
      }
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'customers.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="skeleton-wrap" [attr.aria-label]="'common.loading' | t">
          @for (s of [1,2,3,4,5]; track s) { <div class="skeleton skeleton-row"></div> }
        </div>
      } @else if (customers().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <p class="empty-state-title">{{ 'customers.empty' | t }}</p>
          @if (canEdit()) {
            <button class="btn btn-primary" (click)="openDrawer()">{{ 'customers.addFirst' | t }}</button>
          }
        </div>
      } @else if (filteredCustomers().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
          <p class="empty-state-title">{{ 'customers.noResults' | t }}</p>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'customers.col.name' | t }}</th>
                <th>{{ 'customers.col.type' | t }}</th>
                <th>{{ 'customers.col.email' | t }}</th>
                <th>{{ 'customers.col.phone' | t }}</th>
                <th>{{ 'customers.col.location' | t }}</th>
                <th>{{ 'finance.currency' | t }}</th>
                <th class="num">{{ 'customers.col.orderCount' | t }}</th>
                <th>{{ 'customers.col.lastOrder' | t }}</th>
                @if (canEdit()) { <th class="th-actions">{{ 'common.actions' | t }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (c of filteredCustomers(); track c.id) {
                <tr>
                  <td [attr.data-label]="'customers.col.name' | t">
                    <strong>{{ c.name }}</strong>
                    @if (c.taxNumber) { <div class="cust-sub">{{ 'customers.col.taxNumber' | t }}: {{ c.taxNumber }}</div> }
                  </td>
                  <td [attr.data-label]="'customers.col.type' | t">
                    <span class="badge" [class.badge-primary]="c.type === 'company'" [class.badge-neutral]="c.type !== 'company'">
                      {{ (c.type === 'company' ? 'customers.type.company' : 'customers.type.individual') | t }}
                    </span>
                  </td>
                  <td [attr.data-label]="'customers.col.email' | t">
                    @if (c.email) { <a href="mailto:{{ c.email }}" class="link">{{ c.email }}</a> } @else { - }
                  </td>
                  <td [attr.data-label]="'customers.col.phone' | t">
                    @if (c.phone) { <a href="tel:{{ c.phone }}" class="link">{{ c.phone }}</a> } @else { - }
                  </td>
                  <td [attr.data-label]="'customers.col.location' | t">{{ location(c) || '-' }}</td>
                  <td [attr.data-label]="'finance.currency' | t">{{ c.currency || '-' }}</td>
                  <td class="num" [attr.data-label]="'customers.col.orderCount' | t">{{ (c.orderCount ?? 0) | num }}</td>
                  <td [attr.data-label]="'customers.col.lastOrder' | t">{{ c.lastOrderDate ? (c.lastOrderDate | appDate) : '-' }}</td>
                  @if (canEdit()) {
                    <td class="td-actions">
                      <button class="icon-btn edit-btn" [title]="'common.edit' | t" [attr.aria-label]="'common.edit' | t" (click)="openDrawer(c)">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                      </button>
                      @if (canDelete()) {
                        <button class="icon-btn delete-btn" [title]="'common.delete' | t" [attr.aria-label]="'common.delete' | t" (click)="deleteCustomer(c)">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>
                        </button>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editId() ? 'customers.editTitle' : 'customers.addTitle') | t }}</span>
            @if (editId() && canDelete()) {
              <button type="button" class="btn btn-secondary btn-sm ml-auto" (click)="router.navigate(['/audit-log'], { queryParams: { entityType: 'customers', entityId: editId() } })">{{ 'auditLog.history' | t }}</button>
            }
            <button class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()" class="drawer-form">
            <div class="drawer-body">
              <div class="form-field">
                <input id="custName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" />
                <label for="custName" class="form-label">{{ 'customers.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">{{ 'customers.form.nameRequired' | t }}</div> }
              </div>

              <div class="form-field">
                <select id="custType" formControlName="type" class="form-input has-value">
                  <option value="individual">{{ 'customers.type.individual' | t }}</option>
                  <option value="company">{{ 'customers.type.company' | t }}</option>
                </select>
                <label for="custType" class="form-label">{{ 'customers.form.type' | t }}</label>
              </div>

              <div class="form-field">
                <input id="custEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasValue('email')" />
                <label for="custEmail" class="form-label">{{ 'customers.form.email' | t }}</label>
                @if (isFieldInvalid('email')) { <div class="form-error">{{ 'customers.form.emailInvalid' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="custPhone" type="tel" formControlName="phone" class="form-input" [class.has-value]="hasValue('phone')" />
                <label for="custPhone" class="form-label">{{ 'customers.form.phone' | t }}</label>
              </div>

              <div class="form-field">
                <input id="custTax" type="text" formControlName="taxNumber" class="form-input" [class.has-value]="hasValue('taxNumber')" />
                <label for="custTax" class="form-label">{{ 'customers.form.taxNumber' | t }}</label>
              </div>

              <div class="form-row">
                <div class="form-field">
                  <input id="custCountry" type="text" formControlName="country" maxlength="2" class="form-input mono upper" [class.has-value]="hasValue('country')" (input)="upper('country', $event)" />
                  <label for="custCountry" class="form-label">{{ 'customers.form.country' | t }}</label>
                  @if (isFieldInvalid('country')) { <div class="form-error">{{ 'customers.form.countryInvalid' | t }}</div> }
                </div>
                <div class="form-field">
                  <input id="custCurrency" type="text" formControlName="currency" maxlength="3" class="form-input mono upper" [class.has-value]="hasValue('currency')" (input)="upper('currency', $event)" />
                  <label for="custCurrency" class="form-label">{{ 'customers.form.currency' | t }}</label>
                  @if (isFieldInvalid('currency')) { <div class="form-error">{{ 'customers.form.currencyInvalid' | t }}</div> }
                </div>
              </div>

              <div class="form-row">
                <div class="form-field">
                  <input id="custCity" type="text" formControlName="city" class="form-input" [class.has-value]="hasValue('city')" />
                  <label for="custCity" class="form-label">{{ 'customers.form.city' | t }}</label>
                </div>
                <div class="form-field">
                  <input id="custPostal" type="text" formControlName="postalCode" class="form-input" [class.has-value]="hasValue('postalCode')" />
                  <label for="custPostal" class="form-label">{{ 'customers.form.postalCode' | t }}</label>
                </div>
              </div>

              <div class="form-field">
                <textarea id="custAddress" formControlName="address" class="form-input" [class.has-value]="hasValue('address')"></textarea>
                <label for="custAddress" class="form-label">{{ 'customers.form.address' | t }}</label>
              </div>

              <div class="form-field">
                <textarea id="custNotes" formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')"></textarea>
                <label for="custNotes" class="form-label">{{ 'customers.form.notes' | t }}</label>
              </div>
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="form.invalid || form.pristine || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'customers.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `
})
export class CustomersComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  customers = signal<Customer[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  editId = signal<string | null>(null);
  searchQuery = signal('');

  canEdit = computed(() => ['admin', 'manager'].includes(this.ui.userProfile()?.role));
  canDelete = computed(() => this.ui.userProfile()?.role === 'admin');

  filteredCustomers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.customers();
    if (!q) return list;
    return list.filter(c =>
      [c.name, c.email, c.phone, c.taxNumber, c.city, c.country]
        .some(v => !!v && v.toLowerCase().includes(q))
    );
  });

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['individual'],
    email: ['', [Validators.email]],
    phone: [''],
    taxNumber: [''],
    country: ['', [Validators.pattern(/^[A-Z]{2}$/)]],
    address: [''],
    city: [''],
    postalCode: [''],
    currency: ['', [Validators.pattern(/^[A-Z]{3}$/)]],
    notes: ['']
  });

  ngOnInit() {
    this.load();
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      if (params['open'] === 'new') {
        this.openDrawer();
        this.router.navigate([], { relativeTo: this.route, queryParams: { open: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    });
  }

  load() {
    this.isLoading.set(true);
    this.inventory.getCustomers().subscribe({
      next: data => { this.customers.set(data); this.isLoading.set(false); },
      error: err => {
        this.isLoading.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('customers.loadError'), 'error');
      }
    });
  }

  location(c: Customer): string {
    return [c.city, c.country].filter(Boolean).join(', ');
  }

  hasValue(name: string): boolean {
    const v = this.form.get(name)?.value;
    return v !== null && v !== undefined && v !== '';
  }

  isFieldInvalid(name: string): boolean {
    const f = this.form.get(name);
    return f ? f.invalid && (f.dirty || f.touched) : false;
  }

  upper(name: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const v = input.value.toUpperCase().replace(/[^A-Z]/g, '');
    input.value = v;
    this.form.get(name)?.setValue(v);
  }

  openDrawer(c?: Customer) {
    if (!this.canEdit()) return;
    const blank = { name: '', type: 'individual', email: '', phone: '', taxNumber: '', country: '', address: '', city: '', postalCode: '', currency: '', notes: '' };
    if (c) {
      this.editId.set(c.id);
      const v: any = { ...blank };
      Object.keys(blank).forEach(k => { const val = (c as any)[k]; if (val !== null && val !== undefined) v[k] = val; });
      this.form.reset(v);
    } else {
      this.editId.set(null);
      this.form.reset({ ...blank, currency: this.i18n.currency() || '' });
    }
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.editId.set(null);
  }

  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const raw = this.form.value;
    const data: Partial<Customer> = {};
    Object.keys(raw).forEach(k => {
      const v = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
      (data as any)[k] = v === '' ? null : v;
    });
    const id = this.editId();
    const req = id ? this.inventory.updateCustomer(id, data) : this.inventory.createCustomer(data);
    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.load();
        this.ui.showToast(this.i18n.t(id ? 'customers.updated' : 'customers.created'), 'success');
      },
      error: err => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('customers.actionFailed'), 'error');
      }
    });
  }

  deleteCustomer(c: Customer) {
    this.ui.openConfirm({
      title: this.i18n.t('customers.deleteTitle'),
      message: this.i18n.t('customers.deleteMessage', { name: c.name }),
      isDelete: true,
      onConfirm: () => this.inventory.deleteCustomer(c.id).pipe(
        tap({
          next: () => { this.load(); this.ui.showToast(this.i18n.t('customers.deleted'), 'success'); },
          error: err => this.ui.showToast(err.error?.message || this.i18n.t('customers.actionFailed'), 'error')
        })
      )
    });
  }
}
