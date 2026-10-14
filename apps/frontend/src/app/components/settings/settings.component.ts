import { Component, inject, ViewChild, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup, FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastComponent } from '../shared/toast/toast.component';
import { InventoryService } from '../../inventory.service';
import { UiStateService } from '../../services/ui-state.service';
import { SocketService } from '../../services/socket.service';
import { I18nService, TranslatePipe, AppDatePipe } from '../../i18n';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastComponent, TranslatePipe, AppDatePipe],
  template: `
    <!-- Amazon Header Style -->
    <header class="page-header" style="border-bottom: none; margin-bottom: 1.5rem; display: block;">
      @if (activeTab() === 'dashboard') {
        <div>
          <h1>{{ 'settings.account' | t }}</h1>
          <p>{{ 'settings.accountDesc' | t }}</p>
        </div>
      } @else {
        <div style="font-size: 13px; color: #565959; margin-bottom: 8px;">
          <a href="#" (click)="changeTab('dashboard'); $event.preventDefault()" style="color: #007185; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">{{ 'settings.account' | t }}</a>
          <span style="margin: 0 6px; color: #888;">&gt;</span>
          <span style="color: #C45500; font-weight: 500;">{{ getTabTitle() }}</span>
        </div>
        <h1>{{ getTabTitle() }}</h1>
      }
    </header>

    <div class="settings-layout" style="width: 100%;">
      <!-- AMAZON YOUR ACCOUNT DASHBOARD -->
      @if (activeTab() === 'dashboard') {
        <div class="ecelon-settings-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem; width: 100%;">
          <!-- Card 1: Profil & Güvenlik -->
          <div class="ecelon-settings-card" (click)="changeTab('profile')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
            <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">🔒</div>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">{{ 'settings.tab.profile' | t }}</h3>
              <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">{{ 'settings.card.profileDesc' | t }}</p>
            </div>
          </div>

          <!-- Card 2: Kategori Yönetimi -->
          <div class="ecelon-settings-card" (click)="changeTab('categories')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
            <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">📦</div>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">{{ 'settings.tab.categories' | t }}</h3>
              <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">{{ 'settings.card.categoriesDesc' | t }}</p>
            </div>
          </div>

          <!-- Card 3: Kullanıcı Yönetimi (Admin only) -->
          @if (ui.userProfile()?.role === 'admin') {
            <div class="ecelon-settings-card" (click)="changeTab('users')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
              <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">👥</div>
              <div>
                <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">{{ 'settings.tab.users' | t }}</h3>
                <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">{{ 'settings.card.usersDesc' | t }}</p>
              </div>
            </div>

            <!-- Card 4: Şirket Ayarları (Admin only) -->
            <div class="ecelon-settings-card" (click)="changeTab('company')" style="border: 1px solid #D5D9D9; border-radius: 8px; padding: 16px; background: #FFFFFF; display: flex; gap: 16px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#F7F8F8'" onmouseout="this.style.backgroundColor='#FFFFFF'">
              <div style="font-size: 40px; display: flex; align-items: center; justify-content: center; width: 50px;">🏢</div>
              <div>
                <h3 style="margin: 0 0 4px 0; font-size: 17px; font-weight: 500; color: #0F1111;">{{ 'settings.tab.company' | t }}</h3>
                <p style="margin: 0; font-size: 13px; color: #565959; line-height: 1.4;">{{ 'settings.card.companyDesc' | t }}</p>
              </div>
            </div>
          }
        </div>
      }

      <div class="settings-content" style="width: 100%; display: flex; flex-direction: column; gap: 1.5rem;">

        <!-- COMPANY SETTINGS TAB (Admin) -->
        @if (activeTab() === 'company') {
          <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 24px; max-width: 720px;">
            <h3 class="card-title">{{ 'settings.company.title' | t }}</h3>
            <p class="card-subtitle" style="margin-bottom: 1.5rem;">{{ 'settings.company.subtitle' | t }}</p>
            <form [formGroup]="companyForm" (ngSubmit)="saveCompany()">
              <div class="form-group" [class.has-error]="companyForm.get('name')?.invalid && companyForm.get('name')?.touched">
                <label for="">{{ 'settings.company.name' | t }}</label>
                <input type="text" formControlName="name" />
              </div>
              <div class="settings-form-grid">
                <div class="form-group">
                  <label for="">{{ 'settings.company.country' | t }}</label>
                  <select formControlName="country">
                    @for (c of countries; track c.code) { <option [value]="c.code">{{ 'settings.country.' + c.code | t }} ({{ c.code }})</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="">{{ 'settings.company.defaultLanguage' | t }}</label>
                  <select formControlName="defaultLanguage">
                    @for (l of languages; track l) { <option [value]="l">{{ 'settings.lang.' + l | t }}</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="">{{ 'settings.company.baseCurrency' | t }}</label>
                  <select formControlName="baseCurrency">
                    @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                  </select>
                </div>
                <div class="form-group">
                  <label for="">{{ 'settings.company.timezone' | t }}</label>
                  <select formControlName="timezone">
                    @for (tz of timezones; track tz) { <option [value]="tz">{{ 'settings.tz.' + tz | t }} ({{ tz }})</option> }
                  </select>
                </div>
              </div>
              <div class="settings-divider">
                <button type="submit" class="btn btn-primary" [disabled]="companyForm.invalid || companyForm.pristine || isSavingCompany()">
                  @if (isSavingCompany()) { {{ 'settings.saving' | t }} } @else { {{ 'settings.company.save' | t }} }
                </button>
              </div>
            </form>
          </div>
        }

        <!-- PROFILE & SECURITY TAB -->
        <ng-container *ngIf="activeTab() === 'profile'">
          <div class="settings-container" style="display: flex; gap: 1.5rem; align-items: start; width: 100%; flex-wrap: wrap;">
            <div class="settings-left-col" style="flex: 2; min-width: 300px; display: flex; flex-direction: column; gap: 1.5rem;">
              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 24px;">
                <h3 class="card-title">{{ 'settings.profile.title' | t }}</h3>
                <p class="card-subtitle" style="margin-bottom: 1.5rem;">{{ 'settings.profile.subtitle' | t }}</p>
                
                <div class="settings-avatar-section">
                  <div class="settings-avatar">
                    @if (ui.userProfile()?.avatar) {
                      <img [src]="ui.userProfile().avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    } @else {
                      {{ getAvatarInitials() }}
                    }
                  </div>
                  <div class="settings-avatar-actions">
                    <button type="button" class="btn btn-outline" (click)="fileInput.click()">{{ 'settings.profile.uploadPhoto' | t }}</button>
                    <input #fileInput type="file" style="display:none" (change)="onFileSelected($event)" accept="image/*" />
                    <a class="link-remove" (click)="removeAvatar()">{{ 'settings.profile.removePhoto' | t }}</a>
                  </div>
                </div>

                <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
                  <div class="settings-form-grid">
                    <div class="form-group" [class.has-error]="isProfileFieldInvalid('fullName')">
                      <label for="">{{ 'settings.profile.fullName' | t }}</label>
                      <input type="text" formControlName="fullName" [placeholder]="'settings.profile.fullNamePh' | t" />
                      @if (isProfileFieldInvalid('fullName')) { <span class="error-msg">{{ 'settings.profile.fullNameErr' | t }}</span> }
                    </div>
                    <div class="form-group" [class.has-error]="isProfileFieldInvalid('email')">
                      <label for="">{{ 'settings.profile.email' | t }}</label>
                      <input type="email" formControlName="email" [placeholder]="'settings.profile.emailPh' | t" />
                      @if (isProfileFieldInvalid('email')) { <span class="error-msg">{{ 'settings.profile.emailErr' | t }}</span> }
                    </div>
                  </div>
                  <div class="form-group">
                    <label for="">{{ 'settings.profile.department' | t }}</label>
                    <input type="text" formControlName="department" [placeholder]="'settings.profile.departmentPh' | t" />
                  </div>
                  <div class="settings-form-grid">
                    <div class="form-group">
                      <label for="">{{ 'settings.profile.language' | t }}</label>
                      <select formControlName="language">
                        <option value="">{{ 'settings.profile.companyDefault' | t: { value: ui.userProfile()?.company?.defaultLanguage } }}</option>
                        @for (l of languages; track l) { <option [value]="l">{{ 'settings.lang.' + l | t }}</option> }
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="">{{ 'settings.profile.timezone' | t }}</label>
                      <select formControlName="timezone">
                        <option value="">{{ 'settings.profile.companyDefault' | t: { value: ui.userProfile()?.company?.timezone } }}</option>
                        @for (tz of timezones; track tz) { <option [value]="tz">{{ 'settings.tz.' + tz | t }} ({{ tz }})</option> }
                      </select>
                    </div>
                  </div>
                  
                  <div class="settings-divider">
                    <button type="submit" class="btn btn-primary" [style.opacity]="profileForm.pristine ? 0.5 : 1" [style.cursor]="profileForm.pristine ? 'not-allowed' : 'pointer'" [disabled]="profileForm.invalid || profileForm.pristine || isSavingProfile">
                      @if (isSavingProfile) { <span class="spinner-sm spinner-light"></span> {{ 'settings.saving' | t }} } @else { {{ 'settings.profile.save' | t }} }
                    </button>
                  </div>
                </form>
              </div>

              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 24px;">
                <h3 class="card-title">{{ 'settings.password.title' | t }}</h3>
                <p class="card-subtitle" style="margin-bottom: 1.5rem;">{{ 'settings.password.subtitle' | t }}</p>
                
                <form [formGroup]="passwordForm" (ngSubmit)="updatePassword()">
                  <div class="form-group" [class.has-error]="isPasswordFieldInvalid('currentPassword')">
                    <label for="">{{ 'settings.password.current' | t }}</label>
                    <div class="password-input-wrapper">
                      <input [type]="showCurrent() ? 'text' : 'password'" formControlName="currentPassword" placeholder="••••••••" />
                      <button type="button" class="password-toggle-btn" (click)="showCurrent.set(!showCurrent())">
                        @if (showCurrent()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                        @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                      </button>
                    </div>
                    @if (isPasswordFieldInvalid('currentPassword')) { <span class="error-msg">{{ 'settings.password.currentErr' | t }}</span> }
                  </div>
                  
                  <div class="settings-form-grid">
                    <div class="form-group" [class.has-error]="isPasswordFieldInvalid('newPassword')">
                      <label for="">{{ 'settings.password.new' | t }}</label>
                      <div class="password-input-wrapper">
                        <input [type]="showNew() ? 'text' : 'password'" formControlName="newPassword" [placeholder]="'settings.password.newPh' | t" (input)="evaluatePasswordStrength()"/>
                        <button type="button" class="password-toggle-btn" (click)="showNew.set(!showNew())">
                          @if (showNew()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                          @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                        </button>
                      </div>
                      <div class="password-strength-container" *ngIf="passwordForm.get('newPassword')?.value">
                        <div class="password-strength-bars">
                          <div [style.background]="pwdStrength() >= 1 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                          <div [style.background]="pwdStrength() >= 2 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                          <div [style.background]="pwdStrength() >= 3 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                          <div [style.background]="pwdStrength() >= 4 ? strengthColors[pwdStrength()-1] : '#e5e5e5'"></div>
                        </div>
                        <div class="strength-label" [style.color]="pwdStrength() > 0 ? strengthColors[pwdStrength()-1] : 'inherit'">{{ strengthLabels[pwdStrength()] ? (strengthLabels[pwdStrength()] | t) : '' }}</div>
                      </div>
                      @if (isPasswordFieldInvalid('newPassword')) { <span class="error-msg">{{ 'settings.password.newErr' | t }}</span> }
                    </div>
                    
                    <div class="form-group" [class.has-error]="passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)">
                      <label for="">{{ 'settings.password.confirm' | t }}</label>
                      <div class="password-input-wrapper">
                        <input [type]="showConfirm() ? 'text' : 'password'" formControlName="confirmPassword" [placeholder]="'settings.password.confirmPh' | t" />
                        <button type="button" class="password-toggle-btn" (click)="showConfirm.set(!showConfirm())">
                          @if (showConfirm()) { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg> }
                          @else { <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> }
                        </button>
                      </div>
                      @if (passwordForm.errors?.['mismatch'] && (passwordForm.get('confirmPassword')?.dirty || passwordForm.get('confirmPassword')?.touched)) { 
                        <span class="error-msg">{{ 'settings.password.mismatch' | t }}</span> 
                      } @else if (!passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.value) {
                        <span class="error-msg" style="color: var(--status-instock);">
                          <svg style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:2px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                          {{ 'settings.password.match' | t }}
                        </span>
                      }
                    </div>
                  </div>
                  
                  <div class="settings-divider">
                    <button type="submit" class="btn btn-primary" [disabled]="passwordForm.invalid || !passwordForm.get('currentPassword')?.value || isSavingPassword">
                      @if (isSavingPassword) { <span class="spinner-sm spinner-light"></span> {{ 'settings.updating' | t }} } @else { {{ 'settings.password.update' | t }} }
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div class="settings-right-col" style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1.5rem;">
              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 20px;">
                <div class="side-card-title">{{ 'settings.summary.title' | t }}</div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.accountType' | t }}</span>
                  <span class="summary-value">{{ roleLabel(ui.userProfile()?.role) | t }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.memberSince' | t }}</span>
                  <span class="summary-value">{{ (ui.userProfile()?.createdAt | appDate) || (defaultMemberSince | appDate) }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.lastLogin' | t }}</span>
                  <span class="summary-value">{{ demoLastLogin | appDate: 'datetime' }}</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">{{ 'settings.summary.status' | t }}</span>
                  <span class="badge badge-instock">{{ 'settings.summary.active' | t }}</span>
                </div>
              </div>

              <div class="settings-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 20px;">
                <div class="side-card-title">{{ 'settings.security.title' | t }}</div>
                <div class="security-row">
                  <div class="security-icon-text"><span class="security-icon">🔒</span> {{ 'settings.security.passwordUpdate' | t }}</div>
                  <span style="color: #999; font-size: 12px;">{{ 'settings.security.daysAgo' | t: { n: 30 } }}</span>
                </div>
                <div class="security-row">
                  <div class="security-icon-text"><span class="security-icon">🖥️</span> {{ 'settings.security.activeSession' | t }}</div>
                  <span class="badge badge-lowstock">{{ 'settings.security.sessions' | t: { n: 1 } }}</span>
                </div>
                <div class="security-row">
                  <div class="security-icon-text"><span class="security-icon">✉️</span> {{ 'settings.security.emailVerification' | t }}</div>
                  <span class="badge badge-instock">{{ 'settings.security.verified' | t }}</span>
                </div>
                <button type="button" class="btn-terminate" (click)="terminateAllSessions()">{{ 'settings.security.terminateAll' | t }}</button>
              </div>

              <div class="settings-card tips-card" style="background: #ffffff; border: 1px solid #D5D9D9; border-radius: 8px; padding: 20px;">
                <div class="side-card-title">{{ 'settings.tips.title' | t }}</div>
                <ul class="tips-list">
                  <li>✓ {{ 'settings.tips.strong' | t }}</li>
                  <li>✓ {{ 'settings.tips.rotate' | t }}</li>
                  <li>✓ {{ 'settings.tips.keepUpdated' | t }}</li>
                </ul>
              </div>
            </div>
          </div>
        </ng-container>

        <!-- CATEGORY MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'categories'">
          <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div>
                <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">{{ 'settings.categories.title' | t }}</h2>
                <p class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">{{ 'settings.categories.subtitle' | t }}</p>
              </div>
              <button class="btn btn-primary" (click)="openCategoryDrawer()">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                {{ 'settings.categories.add' | t }}
              </button>
            </div>

            <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
              @if (isLoadingCategories()) {
                <div class="loading-state">{{ 'common.loading' | t }}</div>
              } @else if (categories().length === 0) {
                <div class="empty-state">
                  <p>{{ 'settings.categories.empty' | t }}</p>
                  <button class="btn btn-outline" (click)="openCategoryDrawer()" style="margin-top: 16px;">{{ 'settings.categories.addFirst' | t }}</button>
                </div>
              } @else {
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'settings.categories.name' | t }}</th>
                        <th>{{ 'settings.categories.slug' | t }}</th>
                        <th class="th-actions">{{ 'common.actions' | t }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (cat of categories(); track cat.id) {
                        <tr>
                          <td style="font-size: 0.95rem;"><strong>{{ cat.name }}</strong></td>
                          <td class="mono" style="color: var(--text-muted); font-size: 0.85rem;">{{ cat.slug }}</td>
                          <td class="td-actions">
                            <button class="edit-btn" [title]="'common.edit' | t" (click)="openCategoryDrawer(cat)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button class="delete-btn" [title]="'common.delete' | t" (click)="promptDeleteCategory(cat)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        </ng-container>

        <!-- USER MANAGEMENT TAB -->
        <ng-container *ngIf="activeTab() === 'users'">
          <div style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div>
                <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary);">{{ 'settings.tab.users' | t }}</h2>
                <p class="text-muted" style="font-size: 0.85rem; margin-top: 2px;">{{ 'settings.users.subtitle' | t }}</p>
              </div>
              
              <div style="display: flex; gap: 1rem; align-items: center;">
                <button class="btn btn-primary" (click)="openUserDrawer()">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                  {{ 'settings.users.add' | t }}
                </button>
              </div>
            </div>

            <div class="table-card" style="margin-top: 0; border: 1px solid #D5D9D9; border-radius: 8px; overflow: hidden; background: #FFF;">
              @if (isLoadingUsers()) {
                <div class="loading-state">{{ 'common.loading' | t }}</div>
              } @else if (users().length === 0) {
                <div class="empty-state">
                  <p>{{ 'settings.users.empty' | t }}</p>
                  <button class="btn btn-outline" (click)="openUserDrawer()" style="margin-top: 16px;">{{ 'settings.users.addFirst' | t }}</button>
                </div>
              } @else {
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'settings.users.fullName' | t }}</th>
                        <th>{{ 'settings.users.username' | t }}</th>
                        <th>{{ 'settings.users.role' | t }}</th>
                        <th>{{ 'settings.users.department' | t }}</th>
                        <th>{{ 'settings.users.email' | t }}</th>
                        <th class="th-actions">{{ 'common.actions' | t }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (user of users(); track user.id) {
                        <tr>
                          <td style="font-size: 0.95rem;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <div class="user-avatar-sm" style="width: 32px; height: 32px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600; color: #4b5563; overflow: hidden; border: 1px solid #d1d5db;">
                                @if (user.avatar) {
                                  <img [src]="user.avatar" style="width: 100%; height: 100%; object-fit: cover;" />
                                } @else {
                                  {{ getInitials(user.fullName) }}
                                }
                              </div>
                              <strong>{{ user.fullName }}</strong>
                            </div>
                          </td>
                          <td class="mono" style="color: var(--text-muted); font-size: 0.85rem;">{{ user.username }}</td>
                          <td>
                            <span class="badge" [class.badge-instock]="user.role === 'admin'" [class.badge-lowstock]="user.role === 'manager'" [class.badge-outstock]="user.role === 'viewer'">
                              {{ roleLabel(user.role) | t }}
                            </span>
                          </td>
                          <td style="font-size: 0.9rem;">{{ user.department || '-' }}</td>
                          <td style="font-size: 0.9rem;">{{ user.email }}</td>
                          <td class="td-actions">
                            <button class="edit-btn" [title]="'common.edit' | t" (click)="openUserDrawer(user)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button class="delete-btn" [title]="'common.delete' | t" [disabled]="user.role === 'admin'" (click)="promptDeleteUser(user)">
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Category Drawer -->
    @if (isCategoryDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeCategoryDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editCategoryId() ? 'settings.categories.edit' : 'settings.categories.add') | t }}</span>
            <button class="drawer-close" (click)="closeCategoryDrawer()">×</button>
          </div>

          <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="catName" type="text" formControlName="name" class="form-input" [class.has-value]="hasCategoryValue('name')" [disabled]="isSavingCategory()" />
                <label for="catName" class="form-label">{{ 'settings.categories.nameLabel' | t }}</label>
                @if (isCategoryFieldInvalid('name')) { <div class="form-error">⚠ {{ 'settings.categories.nameErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="catSlug" type="text" formControlName="slug" class="form-input" [class.has-value]="hasCategoryValue('slug')" [disabled]="isSavingCategory()" [placeholder]="'settings.categories.slugPh' | t" />
                <label for="catSlug" class="form-label">{{ 'settings.categories.slugLabel' | t }}</label>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeCategoryDrawer()" [disabled]="isSavingCategory()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="categoryForm.invalid || isSavingCategory()">
                @if (isSavingCategory()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Category Delete Confirmation Modal -->
    @if (showCategoryDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">{{ 'settings.categories.deleteTitle' | t }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ categoryToDelete()?.name }}</strong> {{ 'settings.categories.deleteConfirm' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteCategory()" [disabled]="isSavingCategory()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-danger" (click)="confirmDeleteCategory()" [disabled]="isSavingCategory()">
              @if (isSavingCategory()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.deleting' | t }} } @else { {{ 'common.delete' | t }} }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- User Drawer -->
    @if (isUserDrawerOpen()) {
      <div class="drawer-overlay" (click)="closeUserDrawer()">
        <div class="drawer-panel" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <span class="drawer-title">{{ (editUserId() ? 'settings.users.edit' : 'settings.users.add') | t }}</span>
            <button class="drawer-close" (click)="closeUserDrawer()">×</button>
          </div>

          <form [formGroup]="userForm" (ngSubmit)="saveUser()" style="display:flex; flex-direction:column; flex:1; overflow:hidden">
            <div class="drawer-body">
              <div class="form-field">
                <input id="userFullName" type="text" formControlName="fullName" class="form-input" [class.has-value]="hasUserValue('fullName')" [disabled]="isSavingUser()" />
                <label for="userFullName" class="form-label">{{ 'settings.users.fullNameLabel' | t }}</label>
                @if (isUserFieldInvalid('fullName')) { <div class="form-error">⚠ {{ 'settings.users.fullNameErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userEmail" type="email" formControlName="email" class="form-input" [class.has-value]="hasUserValue('email')" [disabled]="isSavingUser()" />
                <label for="userEmail" class="form-label">{{ 'settings.users.emailLabel' | t }}</label>
                @if (isUserFieldInvalid('email')) { <div class="form-error">⚠ {{ 'settings.profile.emailErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userUsername" type="text" formControlName="username" class="form-input" [class.has-value]="hasUserValue('username')" [disabled]="isSavingUser() || !!editUserId()" />
                <label for="userUsername" class="form-label">{{ 'settings.users.usernameLabel' | t }}</label>
                @if (isUserFieldInvalid('username')) { <div class="form-error">⚠ {{ 'settings.users.usernameErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userPassword" type="password" formControlName="password" class="form-input" [class.has-value]="hasUserValue('password')" [disabled]="isSavingUser()" />
                <label for="userPassword" class="form-label">{{ (editUserId() ? 'settings.users.passwordEdit' : 'settings.users.passwordNew') | t }}</label>
                @if (isUserFieldInvalid('password')) { <div class="form-error">⚠ {{ 'settings.users.passwordErr' | t }}</div> }
              </div>

              <div class="form-field">
                <input id="userDepartment" type="text" formControlName="department" class="form-input" [class.has-value]="hasUserValue('department')" [disabled]="isSavingUser()" />
                <label for="userDepartment" class="form-label">{{ 'settings.users.department' | t }}</label>
              </div>

              <div class="form-field select-field" style="margin-top: 24px;">
                <label for="userRole" style="display:block; font-size: 0.8rem; font-weight:600; color:var(--text-muted); margin-bottom: 6px;">{{ 'settings.users.role' | t }}</label>
                <select id="userRole" formControlName="role" class="form-input has-value" style="width: 100%; padding: 10px; border: 1px solid #e5e5e5; border-radius: 6px;" [disabled]="isSavingUser()">
                  <option value="manager">{{ 'settings.users.roleManagerOpt' | t }}</option>
                  <option value="viewer">{{ 'settings.users.roleViewerOpt' | t }}</option>
                </select>
              </div>
            </div>
            
            <div class="drawer-footer">
              <button type="button" class="btn btn-secondary" (click)="closeUserDrawer()" [disabled]="isSavingUser()">{{ 'common.cancel' | t }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="userForm.invalid || isSavingUser()">
                @if (isSavingUser()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.saving' | t }} } @else { {{ 'common.save' | t }} }
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- User Delete Confirmation Modal -->
    @if (showUserDeleteModal()) {
      <div class="modal-backdrop">
        <div class="modal-panel modal-panel-sm">
          <div class="delete-modal-content">
            <button class="delete-modal-close" (click)="cancelDeleteUser()" [disabled]="isSavingUser()">✕</button>
            <div class="delete-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="delete-modal-title">{{ 'settings.users.deleteTitle' | t }}</h3>
            <p class="delete-modal-desc">
              <strong>{{ userToDelete()?.fullName }}</strong> {{ 'settings.users.deleteConfirm' | t }}
            </p>
          </div>
          <div class="delete-modal-actions">
            <button class="btn btn-secondary" (click)="cancelDeleteUser()" [disabled]="isSavingUser()">{{ 'common.cancel' | t }}</button>
            <button class="btn btn-danger" (click)="confirmDeleteUser()" [disabled]="isSavingUser()">
              @if (isSavingUser()) { <span class="spinner-sm spinner-light"></span> {{ 'settings.deleting' | t }} } @else { {{ 'common.delete' | t }} }
            </button>
          </div>
        </div>
      </div>
    }

    <app-toast></app-toast>
  `,
  styleUrls: ['../../drawer.css'],
  styles: [`
    .settings-side-btn {
      border: none;
      background: transparent;
      padding: 14px 18px;
      text-align: left;
      font-family: var(--font-heading);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      border-left: 4px solid transparent;
      outline: none;
    }
    .settings-side-btn:hover {
      background: #f9fafb;
      color: var(--text-primary);
    }
    .settings-side-btn.active {
      background: #f9fafb;
      color: var(--text-primary);
      border-left-color: var(--primary);
      font-weight: 700;
    }
    .settings-side-btn + .settings-side-btn {
      border-top: 1px solid #f0f0f0;
    }
  `]
})
export class SettingsComponent implements OnInit {
  fb = inject(FormBuilder);
  http = inject(HttpClient);
  inventoryService = inject(InventoryService);
  ui = inject(UiStateService);
  socketService = inject(SocketService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  i18n = inject(I18nService);

  // Placeholder values shown in the account summary card (demo data)
  readonly defaultMemberSince = '2025-01-01T00:00:00';
  readonly demoLastLogin = '2026-06-20T11:00:00';

  roleLabel(role: string | null | undefined): string {
    return role === 'admin' ? 'settings.role.admin' : role === 'manager' ? 'settings.role.manager' : 'settings.role.viewer';
  }
  
  @ViewChild(ToastComponent) toast!: ToastComponent;

  activeTab = signal<'profile' | 'categories' | 'users' | 'company' | 'dashboard'>('dashboard');

  // Locale option lists (shared by profile overrides and company settings)
  // Labels are translated in the template via settings.lang.<code> / settings.country.<code> / settings.tz.<tz>
  readonly languages = ['tr', 'en'];
  readonly countries = [
    { code: 'TR' }, { code: 'US' }, { code: 'GB' }, { code: 'DE' },
    { code: 'FR' }, { code: 'NL' }, { code: 'AE' }, { code: 'AZ' },
  ];
  readonly currencies = ['TRY', 'USD', 'EUR', 'GBP', 'AED', 'AZN'];
  readonly timezones = [
    'Europe/Istanbul', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Baku',
  ];

  // Company settings (admin)
  isSavingCompany = signal(false);
  companyForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    country: ['TR', Validators.required],
    defaultLanguage: ['tr', Validators.required],
    baseCurrency: ['TRY', Validators.required],
    timezone: ['Europe/Istanbul', Validators.required],
  });

  getTabTitle(): string {
    switch (this.activeTab()) {
      case 'profile': return this.i18n.t('settings.tab.profile');
      case 'categories': return this.i18n.t('settings.tab.categories');
      case 'users': return this.i18n.t('settings.tab.users');
      case 'company': return this.i18n.t('settings.tab.company');
      default: return this.i18n.t('settings.account');
    }
  }

  // Profile fields
  isSavingProfile = false;
  profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    department: [''],
    language: [''],
    timezone: ['']
  });

  // Password fields
  isSavingPassword = false;
  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  pwdStrength = signal(0);
  strengthColors = ['#ef4444', '#f97316', '#eab308', '#10b981']; // Red, Orange, Yellow, Green
  strengthLabels = ['', 'settings.strength.weak', 'settings.strength.medium', 'settings.strength.good', 'settings.strength.strong'];

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  }, { validators: this.passwordMatchValidator });

  // Categories fields
  categories = signal<any[]>([]);
  isLoadingCategories = signal(false);
  isCategoryDrawerOpen = signal(false);
  isSavingCategory = signal(false);
  editCategoryId = signal<string | null>(null);
  showCategoryDeleteModal = signal(false);
  categoryToDelete = signal<any>(null);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['']
  });

  // User Management fields
  users = signal<any[]>([]);
  isLoadingUsers = signal(false);
  isUserDrawerOpen = signal(false);
  isSavingUser = signal(false);
  editUserId = signal<string | null>(null);
  showUserDeleteModal = signal(false);
  userToDelete = signal<any>(null);

  userForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    username: ['', Validators.required],
    password: [''],
    department: [''],
    role: ['viewer', Validators.required]
  });

  ngOnInit() {
    this.loadCategories();
    this.loadProfile();
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (tab === 'profile' || tab === 'categories' || tab === 'users' || tab === 'company') {
        this.activeTab.set(tab);
      } else {
        this.activeTab.set('dashboard');
      }
    });
  }

  changeTab(tab: 'profile' | 'categories' | 'users' | 'company' | 'dashboard') {
    if (tab === 'dashboard') {
      this.router.navigate(['/settings']);
    } else {
      this.router.navigate(['/settings'], { queryParams: { tab } });
    }
  }

  loadProfile() {
    this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
      next: (profile: any) => {
        this.ui.userProfile.set(profile);
        this.i18n.applyLocale(profile?.locale);
        this.profileForm.patchValue({
          fullName: profile.fullName,
          email: profile.email,
          department: profile.department,
          language: profile.language || '',
          timezone: profile.timezone || ''
        });
        if (profile.company) {
          this.companyForm.patchValue(profile.company);
          this.companyForm.markAsPristine();
        }
        if (profile.role === 'admin') {
          this.loadUsers();
        }
      },
      error: () => {
        this.toast.show(this.i18n.t('settings.toast.profileLoadFailed'), 'error');
      }
    });
  }

  getAvatarInitials(): string {
    const name = this.ui.userProfile()?.fullName || 'AU';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.toast.show(this.i18n.t('settings.error', { msg: this.i18n.t('settings.toast.photoTooLarge') }), 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      this.http.put(`${environment.apiUrl}/user/profile`, { avatar: base64String }).subscribe({
        next: (res: any) => {
          this.ui.userProfile.set(res.data);
          this.toast.show('✓ ' + this.i18n.t('settings.toast.photoUpdated'), 'success');
        },
        error: (err) => {
          this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.photoUploadFailed') }), 'error');
        }
      });
    };
    reader.readAsDataURL(file);
  }

  removeAvatar() {
    this.http.put(`${environment.apiUrl}/user/profile`, { avatar: null }).subscribe({
      next: (res: any) => {
        this.ui.userProfile.set(res.data);
        this.toast.show('✓ ' + this.i18n.t('settings.toast.photoRemoved'), 'success');
      },
      error: (err) => {
        this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.photoRemoveFailed') }), 'error');
      }
    });
  }

  terminateAllSessions() {
    this.ui.openConfirm({
      title: this.i18n.t('settings.security.terminateAll'),
      message: this.i18n.t('settings.terminate.message'),
      confirmText: this.i18n.t('settings.terminate.confirm'),
      cancelText: this.i18n.t('common.cancel'),
      onConfirm: () => {
        this.http.post(`${environment.apiUrl}/user/sessions/terminate`, {}).subscribe({
          next: () => {
            this.toast.show('✓ ' + this.i18n.t('settings.toast.sessionsTerminated'), 'info');
            setTimeout(() => {
              this.doLogout();
            }, 1500);
          },
          error: (err) => {
            this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.sessionsTerminateFailed') }), 'error');
          }
        });
      }
    });
  }

  doLogout() {
    localStorage.removeItem('smart_inventory_token');
    this.socketService.disconnect();
    this.ui.userProfile.set(null);
    this.router.navigate(['/login']);
  }

  loadCategories() {
    this.isLoadingCategories.set(true);
    this.inventoryService.getCategories().subscribe({
      next: (data) => {
        this.categories.set(data);
        this.isLoadingCategories.set(false);
      },
      error: () => {
        this.isLoadingCategories.set(false);
        this.toast.show(this.i18n.t('settings.toast.categoriesLoadFailed'), 'error');
      }
    });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  isProfileFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  isPasswordFieldInvalid(fieldName: string): boolean {
    const field = this.passwordForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  isCategoryFieldInvalid(fieldName: string): boolean {
    const field = this.categoryForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasCategoryValue(fieldName: string): boolean {
    const val = this.categoryForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  evaluatePasswordStrength() {
    const val = this.passwordForm.get('newPassword')?.value || '';
    let score = 0;
    if (!val) { this.pwdStrength.set(0); return; }
    
    if (val.length >= 8) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;
    
    if (val.length >= 6 && score === 0) score = 1;
    else if (val.length < 6) score = 0;

    this.pwdStrength.set(score);
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    
    this.isSavingProfile = true;
    const payload = {
      ...this.profileForm.value,
      language: this.profileForm.value.language || null,
      timezone: this.profileForm.value.timezone || null,
    };
    this.http.put(`${environment.apiUrl}/user/profile`, payload).subscribe({
      next: (res: any) => {
        this.isSavingProfile = false;
        this.ui.userProfile.set(res.data);
        this.toast.show('✓ ' + this.i18n.t('settings.toast.changesSaved'), 'success');
        this.profileForm.markAsPristine();
        this.refreshEffectiveLocale();
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.saveFailed') }), 'error');
      }
    });
  }

  /** Re-fetch the profile after a save and apply the effective locale (language/timezone/currency). */
  private refreshEffectiveLocale() {
    this.http.get(`${environment.apiUrl}/user/profile`).subscribe({
      next: (profile: any) => {
        this.ui.userProfile.set(profile);
        this.i18n.applyLocale(profile?.locale);
      },
      error: () => { /* keep current locale */ },
    });
  }

  saveCompany() {
    if (this.companyForm.invalid) {
      this.companyForm.markAllAsTouched();
      return;
    }
    this.isSavingCompany.set(true);
    this.http.put(`${environment.apiUrl}/company`, this.companyForm.value).subscribe({
      next: () => {
        this.isSavingCompany.set(false);
        this.companyForm.markAsPristine();
        this.toast.show('✓ ' + this.i18n.t('settings.toast.companySaved'), 'success');
        this.loadProfile(); // re-fetches /user/profile, sets ui.userProfile and applies the effective locale
      },
      error: (err) => {
        this.isSavingCompany.set(false);
        const msg = err.error?.message;
        this.toast.show(this.i18n.t('settings.error', { msg: (Array.isArray(msg) ? msg[0] : msg) || this.i18n.t('settings.toast.saveFailed') }), 'error');
      }
    });
  }

  updatePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    
    this.isSavingPassword = true;
    this.http.put(`${environment.apiUrl}/user/password`, {
      currentPassword: this.passwordForm.get('currentPassword')?.value,
      newPassword: this.passwordForm.get('newPassword')?.value
    }).subscribe({
      next: () => {
        this.isSavingPassword = false;
        this.toast.show('✓ ' + this.i18n.t('settings.toast.passwordUpdated'), 'success');
        this.passwordForm.reset();
        this.pwdStrength.set(0);
        setTimeout(() => {
          this.doLogout();
        }, 1500);
      },
      error: (err) => {
        this.isSavingPassword = false;
        this.toast.show(this.i18n.t('settings.error', { msg: err.error?.message || this.i18n.t('settings.toast.passwordUpdateFailed') }), 'error');
      }
    });
  }

  // Categories Operations
  openCategoryDrawer(category?: any) {
    if (category) {
      this.editCategoryId.set(category.id);
      this.categoryForm.patchValue({
        name: category.name,
        slug: category.slug
      });
    } else {
      this.editCategoryId.set(null);
      this.categoryForm.reset({
        name: '',
        slug: ''
      });
    }
    this.isCategoryDrawerOpen.set(true);
  }

  closeCategoryDrawer() {
    this.isCategoryDrawerOpen.set(false);
    this.categoryForm.reset();
    this.editCategoryId.set(null);
  }

  saveCategory() {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSavingCategory.set(true);
    const data = this.categoryForm.value;
    const catId = this.editCategoryId();

    const obs = catId
      ? this.inventoryService.updateCategory(catId, data)
      : this.inventoryService.createCategory(data);

    obs.subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.closeCategoryDrawer();
        this.loadCategories();
        this.toast.show('✓ ' + this.i18n.t(catId ? 'settings.toast.categoryUpdated' : 'settings.toast.categoryCreated'), 'success');
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.categorySaveFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }

  promptDeleteCategory(category: any) {
    this.categoryToDelete.set(category);
    this.showCategoryDeleteModal.set(true);
  }

  cancelDeleteCategory() {
    this.showCategoryDeleteModal.set(false);
    this.categoryToDelete.set(null);
  }

  confirmDeleteCategory() {
    const cat = this.categoryToDelete();
    if (!cat) return;

    this.isSavingCategory.set(true);
    this.inventoryService.deleteCategory(cat.id).subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.cancelDeleteCategory();
        this.loadCategories();
        this.toast.show('✓ ' + this.i18n.t('settings.toast.categoryDeleted'), 'success');
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        this.cancelDeleteCategory();
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.categoryDeleteFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }

  // Users Operations and Limits Helpers
  loadUsers() {
    if (this.ui.userProfile()?.role !== 'admin') return;
    this.isLoadingUsers.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/user/users`).subscribe({
      next: (data) => {
        this.users.set(data);
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.isLoadingUsers.set(false);
        this.toast.show(this.i18n.t('settings.toast.usersLoadFailed'), 'error');
      }
    });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  isUserFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
  }

  hasUserValue(fieldName: string): boolean {
    const val = this.userForm.get(fieldName)?.value;
    return val !== null && val !== undefined && val !== '';
  }

  openUserDrawer(user?: any) {
    if (user) {
      this.editUserId.set(user.id);
      this.userForm.patchValue({
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        password: '',
        department: user.department,
        role: user.role || 'viewer'
      });
      this.userForm.get('username')?.disable();
    } else {
      this.editUserId.set(null);
      this.userForm.reset({
        fullName: '',
        email: '',
        username: '',
        password: '',
        department: '',
        role: 'viewer'
      });
      this.userForm.get('username')?.enable();
    }
    this.isUserDrawerOpen.set(true);
  }

  closeUserDrawer() {
    this.isUserDrawerOpen.set(false);
    this.userForm.reset();
    this.editUserId.set(null);
  }

  saveUser() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSavingUser.set(true);
    const data = this.userForm.getRawValue();
    const userId = this.editUserId();

    const obs = userId
      ? this.http.put(`${environment.apiUrl}/user/users/${userId}`, data)
      : this.http.post(`${environment.apiUrl}/user/users`, data);

    obs.subscribe({
      next: () => {
        this.isSavingUser.set(false);
        this.closeUserDrawer();
        this.loadUsers();
        this.toast.show('✓ ' + this.i18n.t(userId ? 'settings.toast.userUpdated' : 'settings.toast.userCreated'), 'success');
      },
      error: (err) => {
        this.isSavingUser.set(false);
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.userSaveFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }

  promptDeleteUser(user: any) {
    if (user.role === 'admin') {
      this.toast.show(this.i18n.t('settings.error', { msg: this.i18n.t('settings.toast.adminCannotDelete') }), 'error');
      return;
    }
    this.userToDelete.set(user);
    this.showUserDeleteModal.set(true);
  }

  cancelDeleteUser() {
    this.showUserDeleteModal.set(false);
    this.userToDelete.set(null);
  }

  confirmDeleteUser() {
    const user = this.userToDelete();
    if (!user) return;

    this.isSavingUser.set(true);
    this.http.delete(`${environment.apiUrl}/user/users/${user.id}`).subscribe({
      next: () => {
        this.isSavingUser.set(false);
        this.cancelDeleteUser();
        this.loadUsers();
        this.toast.show('✓ ' + this.i18n.t('settings.toast.userDeleted'), 'success');
      },
      error: (err) => {
        this.isSavingUser.set(false);
        this.cancelDeleteUser();
        const errMsg = err?.error?.message || this.i18n.t('settings.toast.userDeleteFailed');
        this.toast.show(this.i18n.t('settings.error', { msg: errMsg }), 'error');
      }
    });
  }
}
