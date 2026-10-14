import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs/operators';
import { I18nService, TranslatePipe } from '../../i18n';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'suppliers.title' | t }}</h1>
        <p>{{ 'suppliers.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="openDrawer()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          {{ 'suppliers.new' | t }}
        </button>
      </div>
    </header>

    <div class="filter-bar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'suppliers.searchPlaceholder' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="sup-skel">
          @for (r of [1,2,3,4,5]; track r) { <div class="skeleton skeleton-text"></div> }
        </div>
      } @else if (suppliers().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
          </div>
          <div class="empty-state-title">{{ 'suppliers.empty' | t }}</div>
          <button class="btn btn-primary" (click)="openDrawer()">{{ 'suppliers.addFirst' | t }}</button>
        </div>
      } @else if (filteredSuppliers().length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <div class="empty-state-title">{{ 'suppliers.noResults' | t }}</div>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="table-responsive">
            <thead>
              <tr>
                <th>{{ 'suppliers.col.name' | t }}</th>
                <th>{{ 'suppliers.col.contact' | t }}</th>
                <th>{{ 'suppliers.col.rating' | t }}</th>
                <th class="num">{{ 'suppliers.col.leadTime' | t }}</th>
                <th>{{ 'suppliers.col.email' | t }}</th>
                <th>{{ 'suppliers.col.phone' | t }}</th>
                <th class="th-actions">{{ 'common.actions' | t }}</th>
              </tr>
            </thead>
            <tbody>
              @for (s of filteredSuppliers(); track s.id) {
                <tr>
                  <td [attr.data-label]="'suppliers.col.name' | t"><span class="sup-name">{{ s.name }}</span></td>
                  <td [attr.data-label]="'suppliers.col.contact' | t">{{ s.contactPerson || '-' }}</td>
                  <td [attr.data-label]="'suppliers.col.rating' | t">
                    <span class="sup-stars" [title]="'suppliers.form.stars' | t: { n: s.rating || 5 }">
                      @for (star of [1, 2, 3, 4, 5]; track star) {
                        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [class.on]="star <= (s.rating || 5)"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
                      }
                    </span>
                  </td>
                  <td class="num" [attr.data-label]="'suppliers.col.leadTime' | t">{{ 'suppliers.days' | t: { n: s.leadTimeDays ?? 3 } }}</td>
                  <td [attr.data-label]="'suppliers.col.email' | t">
                    @if (s.email) { <a class="sup-link" href="mailto:{{ s.email }}">{{ s.email }}</a> } @else { - }
                  </td>
                  <td [attr.data-label]="'suppliers.col.phone' | t">
                    @if (s.phone) { <a class="sup-link num" href="tel:{{ s.phone }}">{{ normalizePhone(s.phone) }}</a> } @else { - }
                  </td>
                  <td class="td-actions">
                    <button class="edit-btn" [title]="'common.edit' | t" (click)="openDrawer(s)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button class="delete-btn" [title]="'common.delete' | t" (click)="deleteSupplier(s.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </td>
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
            <span class="drawer-title">{{ (editId() ? 'suppliers.editTitle' : 'suppliers.addTitle') | t }}</span>
            <button class="drawer-close" (click)="closeDrawer()" [title]="'common.close' | t">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <form [formGroup]="supplierForm" (ngSubmit)="saveSupplier()" class="sup-form">
            <div class="drawer-body">
              <div class="form-field">
                <input id="supplierName" type="text" formControlName="name" class="form-input" [class.has-value]="hasValue('name')" [disabled]="isSaving()" />
                <label for="supplierName" class="form-label">{{ 'suppliers.form.name' | t }}</label>
                @if (isFieldInvalid('name')) { <div class="form-error">{{ 'suppliers.form.nameRequired' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="supplierContact" type="text" formControlName="contactPerson" class="form-input" [class.has-value]="hasValue('contactPerson')" [disabled]="isSaving()" />
                <label for="supplierContact" class="form-label">{{ 'suppliers.form.contact' | t }}</label>
              </div>

              <div class="form-row">
                <div class="form-field">
                  <input id="supplierEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasValue('email')" [disabled]="isSaving()" />
                  <label for="supplierEmail" class="form-label">{{ 'suppliers.form.email' | t }}</label>
                  @if (isFieldInvalid('email')) { <div class="form-error">{{ 'suppliers.form.emailInvalid' | t }}</div> }
                </div>
                <div class="form-field">
                  <input id="supplierPhone" type="tel" formControlName="phone" class="form-input" [class.has-value]="hasValue('phone')" [disabled]="isSaving()" />
                  <label for="supplierPhone" class="form-label">{{ 'suppliers.form.phone' | t }}</label>
                </div>
              </div>

              <div class="form-row">
                <div class="sup-rating-field">
                  <span class="sup-rating-label">{{ 'suppliers.form.rating' | t }}</span>
                  <div class="sup-rating">
                    @for (star of [1, 2, 3, 4, 5]; track star) {
                      <button type="button" class="sup-star-btn" [class.on]="supplierForm.get('rating')?.value >= star" (click)="setRating(star)" [disabled]="isSaving()" [title]="'suppliers.form.stars' | t: { n: star }">
                        <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
                      </button>
                    }
                    <span class="sup-rating-text">
                      @if (supplierForm.get('rating')?.value) {
                        {{ 'suppliers.form.stars' | t: { n: supplierForm.get('rating')?.value } }}
                      } @else {
                        {{ 'suppliers.form.noRating' | t }}
                      }
                    </span>
                  </div>
                </div>
                <div class="form-field">
                  <input id="supplierLeadTime" type="number" formControlName="leadTimeDays" class="form-input" [class.has-value]="hasValue('leadTimeDays')" [disabled]="isSaving()" min="0" />
                  <label for="supplierLeadTime" class="form-label">{{ 'suppliers.form.leadTime' | t }}</label>
                  @if (isFieldInvalid('leadTimeDays')) { <div class="form-error">{{ 'suppliers.form.leadTimeInvalid' | t }}</div> }
                </div>
              </div>

              <div class="form-field">
                <textarea id="supplierAddress" formControlName="address" class="form-input" [class.has-value]="hasValue('address')" [disabled]="isSaving()"></textarea>
                <label for="supplierAddress" class="form-label">{{ 'suppliers.form.address' | t }}</label>
              </div>

              <div class="form-field">
                <textarea id="supplierNotes" formControlName="notes" class="form-input" [class.has-value]="hasValue('notes')" [disabled]="isSaving()"></textarea>
                <label for="supplierNotes" class="form-label">{{ 'suppliers.form.notes' | t }}</label>
              </div>
            </div>

            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="supplierForm.invalid || supplierForm.pristine || isSaving()">
                @if (isSaving()) { <span class="spinner-sm spinner-light"></span> {{ 'suppliers.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styles: [`
    .sup-skel { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
    .sup-name { font-weight: var(--weight-semibold); color: var(--color-text); }
    .sup-link { color: var(--color-primary-text); text-decoration: none; }
    .sup-link:hover { text-decoration: underline; }
    .sup-stars { display: inline-flex; gap: 2px; color: var(--color-border-strong); }
    .sup-stars svg { fill: none; }
    .sup-stars svg.on { color: var(--color-warning); fill: currentColor; }
    .sup-form { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .sup-rating-field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
    .sup-rating-label { font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--color-text-secondary); }
    .sup-rating { display: flex; align-items: center; gap: 2px; min-height: 40px; }
    .sup-star-btn { background: transparent; border: 0; padding: 4px; cursor: pointer; color: var(--color-border-strong); border-radius: var(--radius-sm); display: grid; place-items: center; transition: transform var(--duration-fast) var(--ease-standard); }
    .sup-star-btn svg { fill: none; }
    .sup-star-btn.on { color: var(--color-warning); }
    .sup-star-btn.on svg { fill: currentColor; }
    .sup-star-btn:hover:not(:disabled) { transform: scale(1.12); }
    .sup-star-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .sup-rating-text { font-size: var(--text-xs); color: var(--color-text-muted); margin-left: var(--space-2); white-space: nowrap; }
  `]
})
export class SuppliersComponent implements OnInit {
  inventory = inject(InventoryService);
  ui = inject(UiStateService);
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  i18n = inject(I18nService);

  suppliers = signal<any[]>([]);
  isLoading = signal(true);
  isDrawerOpen = signal(false);
  isSaving = signal(false);
  editId = signal<string | null>(null);
 
  searchQuery = signal('');

  filteredSuppliers = computed(() => {
    const list = this.suppliers();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(s => 
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(query)) ||
      (s.email && s.email.toLowerCase().includes(query))
    );
  });

  supplierForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    contactPerson: [''],
    email: ['', [Validators.email]],
    phone: [''],
    address: [''],
    notes: [''],
    rating: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
    leadTimeDays: [3, [Validators.required, Validators.min(0)]]
  });

  hasValue(fieldName: string): boolean {
    const val = this.supplierForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.supplierForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  ngOnInit() {
    this.loadSuppliers();
    this.route.queryParams.subscribe(params => {
      this.searchQuery.set(params['q'] || '');
      if (params['open'] === 'new') {
        this.openDrawer();
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { open: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      }
    });
  }

  loadSuppliers() {
    this.isLoading.set(true);
    this.inventory.getSuppliers().subscribe({
      next: (data) => {
        this.suppliers.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  openDrawer(supplier?: any) {
    if (supplier) {
      this.editId.set(supplier.id);
      this.supplierForm.patchValue(supplier);
    } else {
      this.editId.set(null);
      this.supplierForm.reset({
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        rating: null,
        leadTimeDays: 3
      });
    }
    this.isDrawerOpen.set(true);
  }

  closeDrawer() {
    this.isDrawerOpen.set(false);
    this.supplierForm.reset();
    this.editId.set(null);
  }

  normalizePhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      const area = last10.slice(0, 3);
      const p1 = last10.slice(3, 6);
      const p2 = last10.slice(6, 8);
      const p3 = last10.slice(8, 10);
      return `+90 ${area} ${p1} ${p2} ${p3}`;
    }
    return phone;
  }

  setRating(rating: number) {
    if (this.isSaving()) return;
    this.supplierForm.patchValue({ rating });
    this.supplierForm.get('rating')?.markAsDirty();
  }

  saveSupplier() {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const data = this.supplierForm.value;
    
    // Normalize phone number on save
    if (data.phone) {
      data.phone = this.normalizePhone(data.phone);
    }

    const id = this.editId();
    const req = id ? this.inventory.updateSupplier(id, data) : this.inventory.createSupplier(data);

    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeDrawer();
        this.loadSuppliers();
      },
      error: () => {
        this.isSaving.set(false);
      }
    });
  }

  deleteSupplier(id: string) {
    const supplier = this.suppliers().find(s => s.id === id);
    if (!supplier) return;

    this.ui.openConfirm({
      title: this.i18n.t('suppliers.deleteTitle'),
      message: this.i18n.t('suppliers.deleteMessage', { name: supplier.name }),
      isDelete: true,
      onConfirm: () => {
        return this.inventory.deleteSupplier(supplier.id).pipe(
          tap({
            next: () => {
              this.loadSuppliers();
              this.ui.showToast(this.i18n.t('suppliers.deleted'), 'success');
            },
            error: () => {
              this.ui.showToast(this.i18n.t('suppliers.actionFailed'), 'error');
            }
          })
        );
      }
    });
  }
}
