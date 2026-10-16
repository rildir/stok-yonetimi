import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { ToastComponent } from '../shared/toast/toast.component';
import { tap } from 'rxjs/operators';
import { I18nService, TranslatePipe } from '../../i18n';
import { AddressFieldsComponent, addressFromForm, addressToForm, createAddressGroup } from '../shared/address-fields.component';
import { IdentityFieldsComponent, taxIdValidator } from '../shared/identity-fields.component';
import { SpecialCategoryWarningComponent } from '../shared/special-category-warning.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, AddressFieldsComponent, IdentityFieldsComponent, SpecialCategoryWarningComponent, IconComponent],
  styleUrls: ['../../drawer.css'],
  template: `
    <header class="page-header">
      <div>
        <h1>{{ 'suppliers.title' | t }}</h1>
        <p>{{ 'suppliers.subtitle' | t }}</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-primary" (click)="openDrawer()">
          <app-icon name="plus" /><span>{{ 'suppliers.new' | t }}</span><kbd>N</kbd><kbd>S</kbd>
        </button>
      </div>
    </header>

    <div class="toolbar sup-toolbar">
      <div class="field field-sm sup-search">
        <span class="lead"><app-icon name="search" size="sm" /></span>
        <input type="search" data-page-search [placeholder]="'suppliers.searchPlaceholder' | t" [attr.aria-label]="'common.search' | t" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)" />
        <span class="trail"><kbd>/</kbd></span>
      </div>
    </div>

    <div class="table-card">
      @if (isLoading()) {
        <div class="sup-skel" aria-busy="true">
          @for (r of [1,2,3,4,5,6]; track r) { <div class="skeleton-row"></div> }
        </div>
      } @else if (suppliers().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="truck" /></div>
          <h3>{{ 'suppliers.empty' | t }}</h3>
          <div class="actions cluster">
            <button type="button" class="btn btn-primary" (click)="openDrawer()"><app-icon name="plus" />{{ 'suppliers.addFirst' | t }}</button>
          </div>
        </div>
      } @else if (filteredSuppliers().length === 0) {
        <div class="empty-state">
          <div class="empty-art"><app-icon name="search" /></div>
          <h3>{{ 'suppliers.noResults' | t }}</h3>
          <div class="actions cluster">
            <button type="button" class="btn" (click)="searchQuery.set('')"><app-icon name="x" size="sm" />{{ 'common.clear' | t }}</button>
          </div>
        </div>
      } @else {
        <div class="table-scroll">
          <table class="tbl table-responsive sup-table">
            <thead>
              <tr>
                <th>{{ 'suppliers.col.name' | t }}</th>
                <th>{{ 'customers.col.taxNumber' | t }}</th>
                <th class="lg-only">{{ 'customers.col.location' | t }}</th>
                <th>{{ 'suppliers.col.contact' | t }}</th>
                <th>{{ 'suppliers.col.rating' | t }}</th>
                <th class="r">{{ 'suppliers.col.leadTime' | t }}</th>
                <th>{{ 'suppliers.col.email' | t }}</th>
                <th>{{ 'suppliers.col.phone' | t }}</th>
                <th class="w-acts"><span class="sr">{{ 'common.actions' | t }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of filteredSuppliers(); track s.id) {
                <tr>
                  <td class="td-primary">
                    <div class="cell-prod sup-name">
                      <span class="thumb" aria-hidden="true">{{ (s.name || '?').charAt(0) }}</span>
                      <b class="truncate" [title]="s.name">{{ s.name }}</b>
                      @if (s.needsReview) { <span class="badge badge-warning" [title]="'suppliers.review.missingTaxId' | t"><app-icon name="warn" size="xs" />{{ 'customers.filter.needsReview' | t }}</span> }
                    </div>
                  </td>
                  <td class="no-xs">
                    @if (s.identityNumber) { <span class="tag">{{ s.identityType || 'VKN' }}</span><span class="mono sup-id">{{ s.identityNumber }}</span> } @else { <span class="cell-sec">—</span> }
                  </td>
                  <td class="no-xs lg-only cell-sec" [title]="s.taxOfficeName || ''">@if (s.address?.province) { {{ s.address.district ? s.address.district + ' / ' : '' }}{{ s.address.province }} } @else { — }</td>
                  <td [attr.data-label]="'suppliers.col.contact' | t">@if (s.contactPerson) { {{ s.contactPerson }} } @else { <span class="cell-sec">—</span> }</td>
                  <td [attr.data-label]="'suppliers.col.rating' | t">
                    <span class="sup-stars" role="img" [attr.aria-label]="'suppliers.form.stars' | t: { n: s.rating || 5 }" [title]="'suppliers.form.stars' | t: { n: s.rating || 5 }">
                      @for (star of [1, 2, 3, 4, 5]; track star) {
                        <svg viewBox="0 0 24 24" aria-hidden="true" [class.on]="star <= (s.rating || 5)"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
                      }
                    </span>
                  </td>
                  <td class="r" [attr.data-label]="'suppliers.col.leadTime' | t">{{ 'suppliers.days' | t: { n: s.leadTimeDays ?? 3 } }}</td>
                  <td class="sup-email" [attr.data-label]="'suppliers.col.email' | t">
                    @if (s.email) { <a class="sup-contact" href="mailto:{{ s.email }}" [title]="s.email">{{ s.email }}</a> } @else { <span class="cell-sec">—</span> }
                  </td>
                  <td [attr.data-label]="'suppliers.col.phone' | t">
                    @if (s.phone) { <a class="sup-contact sup-phone" href="tel:{{ s.phone }}">{{ normalizePhone(s.phone) }}</a> } @else { <span class="cell-sec">—</span> }
                  </td>
                  <td class="td-actions w-acts">
                    <div class="sup-acts">
                      <button type="button" class="btn btn-ghost btn-sm btn-icon row-act" [attr.aria-label]="'common.edit' | t" [attr.data-tip]="'common.edit' | t" (click)="openDrawer(s)"><app-icon name="edit" /></button>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon row-act sup-del" [attr.aria-label]="'common.delete' | t" [attr.data-tip]="'common.delete' | t" (click)="deleteSupplier(s.id)"><app-icon name="trash" /></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="tbl-foot">
          <span>{{ 'suppliers.count' | t: { n: filteredSuppliers().length } }}@if (filteredSuppliers().length !== suppliers().length) { / {{ suppliers().length }} }</span>
        </div>
      }
    </div>

    @if (isDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeDrawer()" (document:keydown.escape)="closeDrawer()">
        <div class="drawer-panel drawer-panel-lg" role="dialog" aria-modal="true" [attr.aria-label]="(editId() ? 'suppliers.editTitle' : 'suppliers.addTitle') | t" (click)="$event.stopPropagation()">
          <header class="drawer-h">
            <div class="t">
              <div class="eyebrow"><app-icon name="truck" size="sm" /><span class="truncate">{{ 'suppliers.title' | t }}</span></div>
              <h2>{{ (editId() ? 'suppliers.editTitle' : 'suppliers.addTitle') | t }}</h2>
            </div>
            <div class="tools">
              <button type="button" class="drawer-close" (click)="closeDrawer()" [attr.aria-label]="'common.close' | t"><app-icon name="x" /><kbd>Esc</kbd></button>
            </div>
          </header>

          <form [formGroup]="supplierForm" (ngSubmit)="saveSupplier()" class="sup-form">
            <div class="drawer-body drawer-b">
              <section class="fsec">
                <div class="fsec-h"><span class="n">1</span><h3>{{ 'suppliers.section.general' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld span-2">
                    <label class="fld-label" for="supplierName">{{ 'suppliers.form.name' | t }} <span class="req">*</span></label>
                    <div class="field"><input id="supplierName" type="text" formControlName="name" [attr.aria-invalid]="isFieldInvalid('name')" [disabled]="isSaving()" /></div>
                    @if (isFieldInvalid('name')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'suppliers.form.nameRequired' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="supplierType">{{ 'suppliers.form.type' | t }}</label>
                    <div class="field select">
                      <select id="supplierType" formControlName="type">
                        @for (t of supplierTypes; track t) { <option [value]="t">{{ 'suppliers.type.' + t | t }}</option> }
                      </select>
                    </div>
                  </div>
                  <div class="fld sup-foreign">
                    <label class="check"><input type="checkbox" formControlName="isForeign" />{{ 'suppliers.form.isForeign' | t }}</label>
                  </div>
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">2</span><h3>{{ 'customers.section.identity' | t }}</h3></div>
                <app-identity-fields [form]="supplierForm" idPrefix="sup" [types]="identityTypes" [provinceCode]="addressGroup.value.provinceCode"></app-identity-fields>
                <div class="sup-checks">
                  <label class="check"><input type="checkbox" formControlName="isTaxpayer" />{{ 'suppliers.form.isTaxpayer' | t }}</label>
                  <label class="check"><input type="checkbox" formControlName="isVatTaxpayer" />{{ 'customers.form.isVatTaxpayer' | t }}</label>
                  <label class="check"><input type="checkbox" formControlName="isImporterOrOreProducer" /><span>{{ 'suppliers.form.isImporterOrOreProducer' | t }}<span class="sub">{{ 'suppliers.form.isImporterOrOreProducerHint' | t }}</span></span></label>
                  @if (supplierForm.value.type === 'farmer') {
                    <label class="check"><input type="checkbox" formControlName="isRealTaxationFarmer" />{{ 'suppliers.form.isRealTaxationFarmer' | t }}</label>
                  }
                </div>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">3</span><h3>{{ 'customers.section.address' | t }}</h3></div>
                <app-address-fields [group]="addressGroup" idPrefix="sup"></app-address-fields>
              </section>

              <section class="fsec">
                <div class="fsec-h"><span class="n">4</span><h3>{{ 'suppliers.section.contact' | t }}</h3></div>
                <div class="grid-2">
                  <div class="fld span-2">
                    <label class="fld-label" for="supplierContact">{{ 'suppliers.form.contact' | t }}</label>
                    <div class="field"><span class="lead"><app-icon name="user" size="sm" /></span><input id="supplierContact" type="text" formControlName="contactPerson" [disabled]="isSaving()" /></div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="supplierEmail">{{ 'suppliers.form.email' | t }}</label>
                    <div class="field"><input id="supplierEmail" type="email" formControlName="email" [attr.aria-invalid]="isFieldInvalid('email')" [disabled]="isSaving()" /></div>
                    @if (isFieldInvalid('email')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'suppliers.form.emailInvalid' | t }}</div> }
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="supplierPhone">{{ 'suppliers.form.phone' | t }}</label>
                    <div class="field"><input id="supplierPhone" type="tel" formControlName="phone" [disabled]="isSaving()" /></div>
                  </div>
                  <div class="fld">
                    <span class="fld-label" id="supRatingLbl">{{ 'suppliers.form.rating' | t }} <span class="req">*</span></span>
                    <div class="sup-rating" role="radiogroup" aria-labelledby="supRatingLbl">
                      @for (star of [1, 2, 3, 4, 5]; track star) {
                        <button type="button" class="sup-star-btn" role="radio" [attr.aria-checked]="supplierForm.get('rating')?.value === star" [class.on]="supplierForm.get('rating')?.value >= star" (click)="setRating(star)" [disabled]="isSaving()" [attr.aria-label]="'suppliers.form.stars' | t: { n: star }">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
                        </button>
                      }
                      <span class="sup-rating-text">
                        @if (supplierForm.get('rating')?.value) { {{ 'suppliers.form.stars' | t: { n: supplierForm.get('rating')?.value } }} } @else { {{ 'suppliers.form.noRating' | t }} }
                      </span>
                    </div>
                  </div>
                  <div class="fld">
                    <label class="fld-label" for="supplierLeadTime">{{ 'suppliers.form.leadTime' | t }}</label>
                    <div class="field"><input id="supplierLeadTime" type="number" class="num" formControlName="leadTimeDays" min="0" [attr.aria-invalid]="isFieldInvalid('leadTimeDays')" [disabled]="isSaving()" /><span class="affix suf">{{ 'suppliers.daysUnit' | t }}</span></div>
                    @if (isFieldInvalid('leadTimeDays')) { <div class="fld-error"><app-icon name="alert" size="sm" />{{ 'suppliers.form.leadTimeInvalid' | t }}</div> }
                  </div>
                  <div class="fld span-2">
                    <label class="fld-label" for="supplierNotes">{{ 'suppliers.form.notes' | t }}</label>
                    <div class="field has-area"><textarea id="supplierNotes" rows="3" formControlName="notes" [disabled]="isSaving()"></textarea></div>
                    <app-special-category-warning [text]="supplierForm.get('notes')?.value" />
                  </div>
                </div>
              </section>
            </div>

            <div class="drawer-footer">
              <span class="hint"><kbd>Ctrl</kbd><kbd>↵</kbd></span>
              <span class="spacer"></span>
              <button type="button" class="btn btn-ghost" (click)="closeDrawer()" [disabled]="isSaving()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [class.is-loading]="isSaving()" [disabled]="supplierForm.invalid || supplierForm.pristine || isSaving()">
                <span>{{ (isSaving() ? 'suppliers.saving' : 'common.save') | t }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styles: [`
    .sup-toolbar { margin-bottom: 12px; }
    .sup-search { flex: 1 1 260px; max-width: 380px; }
    .sup-skel { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .sup-table td { max-width: 240px; }
    .sup-table td.w-acts { overflow: visible; max-width: none; }
    .sup-name { max-width: 240px; }
    .sup-name b { min-width: 0; }
    .sup-name .badge { flex: none; }
    .sup-id { margin-left: 6px; font-size: var(--text-xs); color: var(--fg-2); }
    .sup-table td.sup-email { max-width: 190px; }
    .sup-email .sup-contact { display: block; overflow: hidden; text-overflow: ellipsis; }
    /* contact values read as ink; the accent only appears on hover/focus */
    .sup-contact { color: var(--fg); text-decoration: none; }
    .sup-contact:hover { color: var(--accent-text); text-decoration: underline; text-underline-offset: 3px; }
    .sup-phone { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sup-stars { display: inline-flex; gap: 1px; color: var(--line-strong); vertical-align: middle; }
    .sup-stars svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
    .sup-stars svg.on { color: var(--warning-dot); fill: currentColor; }
    .sup-table th.w-acts, .sup-table td.w-acts { width: 1%; text-align: right; padding-left: 4px; padding-right: 8px; }
    .sup-acts { display: flex; justify-content: flex-end; gap: 2px; }
    .sup-acts .btn { color: var(--fg-2); }
    .sup-acts .btn:hover { color: var(--fg); }
    .sup-acts .sup-del:hover { color: var(--danger); }
    .sup-form { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
    .sup-foreign { justify-content: flex-end; padding-bottom: 7px; }
    .sup-checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
    .sup-rating { display: flex; align-items: center; gap: 2px; min-height: var(--h-md); }
    .sup-star-btn { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--line-strong); cursor: pointer; transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
    .sup-star-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
    .sup-star-btn.on { color: var(--warning-dot); }
    .sup-star-btn.on svg { fill: currentColor; }
    .sup-star-btn:hover:not(:disabled) { background: var(--surface-hover); }
    .sup-star-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .sup-rating-text { font-size: var(--text-xs); color: var(--fg-3); margin-left: 8px; white-space: nowrap; }
    @media (min-width: 641px) and (max-width: 1500px) { .lg-only { display: none; } }
    @media (max-width: 640px) {
      .no-xs { display: none !important; }
      .sup-search { flex-basis: 100%; max-width: none; }
      .sup-table td, .sup-table td.sup-email { max-width: none; }
      .sup-name { max-width: none; }
      .sup-checks { grid-template-columns: minmax(0, 1fr); }
      .sup-foreign { padding-bottom: 0; }
      .sup-table .row-act { opacity: 1; }
      .table-responsive td.w-acts { width: 100%; padding-top: 4px; }
    }
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
  readonly supplierTypes = ['company', 'individual', 'farmer'];
  readonly identityTypes = ['VKN', 'TCKN', 'YKN', 'FOREIGN'];

  filteredSuppliers = computed(() => {
    const list = this.suppliers();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(s => 
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(query)) ||
      (s.email && s.email.toLowerCase().includes(query)) ||
      (s.identityNumber && s.identityNumber.includes(query))
    );
  });

  addressGroup: FormGroup = createAddressGroup(this.fb);
  supplierForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    type: ['company'],
    isForeign: [false],
    identityType: ['VKN'],
    identityNumber: [''],
    taxOfficeCode: [''],
    taxOfficeName: [''],
    isTaxpayer: [true],
    isVatTaxpayer: [true],
    isImporterOrOreProducer: [false],
    isRealTaxationFarmer: [false],
    contactPerson: [''],
    email: ['', [Validators.email]],
    phone: [''],
    address: this.addressGroup,
    notes: [''],
    rating: [null, [Validators.required, Validators.min(1), Validators.max(5)]],
    leadTimeDays: [3, [Validators.required, Validators.min(0)]]
  }, { validators: taxIdValidator((f) => (f.value?.isForeign ? null : f.value?.type === 'individual' ? 'individual' : 'company')) });

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
    const country = this.ui.userProfile()?.company?.country || 'TR';
    const blank = {
      name: '', type: 'company', isForeign: false, identityType: 'VKN', identityNumber: '', taxOfficeCode: '', taxOfficeName: '',
      isTaxpayer: true, isVatTaxpayer: true, isImporterOrOreProducer: false, isRealTaxationFarmer: false, contactPerson: '', email: '', phone: '', notes: '', rating: null, leadTimeDays: 3,
    };
    if (supplier) {
      this.editId.set(supplier.id);
      const v: any = { ...blank };
      Object.keys(blank).forEach((k) => { if (supplier[k] !== null && supplier[k] !== undefined) v[k] = supplier[k]; });
      this.supplierForm.reset({ ...v, address: addressToForm(supplier.address, country) });
    } else {
      this.editId.set(null);
      this.supplierForm.reset({ ...blank, address: addressToForm(null, country) });
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
    const raw = this.supplierForm.value;
    const data: any = {};
    Object.keys(raw).forEach((k) => {
      if (k === 'address') return;
      const v = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
      data[k] = v === '' ? null : v;
    });
    data.address = addressFromForm(raw.address);
    if (!['VKN', 'TCKN'].includes(String(data.identityType))) { data.taxOfficeCode = null; data.taxOfficeName = null; }
    
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
        this.ui.showToast(this.i18n.t(id ? 'suppliers.updated' : 'suppliers.created'), 'success');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.ui.showToast(err.error?.message || this.i18n.t('suppliers.actionFailed'), 'error');
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
