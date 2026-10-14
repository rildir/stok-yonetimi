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
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'customers.title' | t }}</h1>
        <p>{{ 'customers.subtitle' | t }}</p>
      </div>
      @if (canEdit()) {
        <div class="header-actions">
          <button class="btn btn-primary" (click)="openDrawer()">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            {{ 'customers.new' | t }}
          </button>
        </div>
      }
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" [placeholder]="'customers.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
      @if (isLoading()) {
        <div class="loading-state">{{ 'common.loading' | t }}</div>
      } @else if (customers().length === 0) {
        <div class="empty-state">
          <p>{{ 'customers.empty' | t }}</p>
          @if (canEdit()) {
            <button class="btn btn-outline" (click)="openDrawer()" style="margin-top: 16px;">{{ 'customers.addFirst' | t }}</button>
          }
        </div>
      } @else if (filteredCustomers().length === 0) {
        <div class="empty-state"><p>{{ 'customers.noResults' | t }}</p></div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'customers.col.name' | t }}</th>
                <th>{{ 'customers.col.type' | t }}</th>
                <th>{{ 'customers.col.email' | t }}</th>
                <th>{{ 'customers.col.phone' | t }}</th>
                <th>{{ 'customers.col.location' | t }}</th>
                <th>{{ 'finance.currency' | t }}</th>
                <th>{{ 'customers.col.orderCount' | t }}</th>
                <th>{{ 'customers.col.lastOrder' | t }}</th>
                @if (canEdit()) { <th class="th-actions">{{ 'common.actions' | t }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (c of filteredCustomers(); track c.id) {
                <tr>
                  <td>
                    <strong>{{ c.name }}</strong>
                    @if (c.taxNumber) { <div style="font-size: 11px; color: var(--text-muted);">{{ 'customers.col.taxNumber' | t }}: {{ c.taxNumber }}</div> }
                  </td>
                  <td>
                    <span class="badge" [class.badge-instock]="c.type === 'company'" [class.badge-lowstock]="c.type !== 'company'">
                      {{ (c.type === 'company' ? 'customers.type.company' : 'customers.type.individual') | t }}
                    </span>
                  </td>
                  <td>
                    @if (c.email) { <a href="mailto:{{ c.email }}" style="color: #007185; text-decoration: none;">{{ c.email }}</a> } @else { - }
                  </td>
                  <td>
                    @if (c.phone) { <a href="tel:{{ c.phone }}" style="color: #007185; text-decoration: none;">{{ c.phone }}</a> } @else { - }
                  </td>
                  <td>{{ location(c) || '-' }}</td>
                  <td class="mono">{{ c.currency || '-' }}</td>
                  <td class="mono">{{ (c.orderCount ?? 0) | num }}</td>
                  <td>{{ c.lastOrderDate ? (c.lastOrderDate | appDate) : '-' }}</td>
                  @if (canEdit()) {
                    <td class="td-actions">
                      <button class="edit-btn" [title]="'common.edit' | t" (click)="openDrawer(c)">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      @if (canDelete()) {
                        <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteCustomer(c)">
                          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
              <button type="button" class="btn btn-outline btn-sm" style="margin-left: auto; margin-right: 8px;" (click)="router.navigate(['/audit-log'], { queryParams: { entityType: 'customers', entityId: editId() } })">{{ 'auditLog.history' | t }}</button>
            }
            <button class="drawer-close" (click)="closeDrawer()">×</button>
          </div>

          <form [formGroup]="form" (ngSubmit)="save()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="custName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" />
                <label for="custName" class="form-label">{{ 'customers.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">⚠ {{ 'customers.form.nameRequired' | t }}</div> }
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
                @if (isFieldInvalid('email')) { <div class="form-error">⚠ {{ 'customers.form.emailInvalid' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="custPhone" type="tel" formControlName="phone" class="form-input" [class.has-value]="hasValue('phone')" />
                <label for="custPhone" class="form-label">{{ 'customers.form.phone' | t }}</label>
              </div>

              <div class="form-field">
                <input id="custTax" type="text" formControlName="taxNumber" class="form-input" [class.has-value]="hasValue('taxNumber')" />
                <label for="custTax" class="form-label">{{ 'customers.form.taxNumber' | t }}</label>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="form-field">
                  <input id="custCountry" type="text" formControlName="country" maxlength="2" class="form-input mono" style="text-transform: uppercase;" [class.has-value]="hasValue('country')" (input)="upper('country', $event)" />
                  <label for="custCountry" class="form-label">{{ 'customers.form.country' | t }}</label>
                  @if (isFieldInvalid('country')) { <div class="form-error">⚠ {{ 'customers.form.countryInvalid' | t }}</div> }
                </div>
                <div class="form-field">
                  <input id="custCurrency" type="text" formControlName="currency" maxlength="3" class="form-input mono" style="text-transform: uppercase;" [class.has-value]="hasValue('currency')" (input)="upper('currency', $event)" />
                  <label for="custCurrency" class="form-label">{{ 'customers.form.currency' | t }}</label>
                  @if (isFieldInvalid('currency')) { <div class="form-error">⚠ {{ 'customers.form.currencyInvalid' | t }}</div> }
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
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
