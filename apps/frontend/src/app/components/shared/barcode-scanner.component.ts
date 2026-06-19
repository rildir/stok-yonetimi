import { Component, EventEmitter, Input, Output, OnDestroy, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="scanner-overlay" (click)="close()">
      <div class="scanner-modal" (click)="$event.stopPropagation()">
        <div class="scanner-header">
          <h3>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 6px;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
            </svg>
            Barkod / QR Tarayıcı
          </h3>
          <button class="scanner-close" (click)="close()">✕</button>
        </div>

        <div class="scanner-body">
          <div class="camera-container">
            <video #videoEl autoplay playsinline muted></video>
            <div class="scan-overlay">
              <div class="scan-frame">
                <div class="corner tl"></div>
                <div class="corner tr"></div>
                <div class="corner bl"></div>
                <div class="corner br"></div>
                <div class="laser-line"></div>
              </div>
            </div>

            @if (!cameraActive()) {
              <div class="camera-placeholder">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: var(--text-muted, #6b6b6b);">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                <p>Kamera başlatılıyor...</p>
                <span class="cam-hint">Kamera izni gerekli</span>
              </div>
            }
          </div>

          @if (scannedSku()) {
            <div class="scan-result">
              <div class="scan-result-icon">✓</div>
              <div>
                <strong>Ürün Bulundu!</strong>
                <span class="scan-sku">SKU: {{ scannedSku() }}</span>
              </div>
            </div>
          }

          @if (scanError()) {
            <div class="scan-error">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 6px; flex-shrink: 0;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <span>{{ scanError() }}</span>
            </div>
          }

          <div class="scanner-actions">
            <button class="btn btn-outline" (click)="triggerManualScan()" [disabled]="isScanning()">
              @if (isScanning()) {
                <span class="spinner-sm"></span> Taranıyor...
              } @else {
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                Taramayı Tetikle
              }
            </button>
            @if (scannedSku()) {
              <button class="btn btn-primary" (click)="confirmScan()">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="margin-right: 4px;">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                Ürünü Getir
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .scanner-overlay {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .scanner-modal {
      position: relative;
      width: 100%;
      max-width: 480px;
      background: var(--surface, #fff);
      border: 1px solid var(--secondary, #e5e7eb);
      border-radius: var(--radius-lg, 10px);
      box-shadow: var(--shadow-xl, 0 20px 40px -8px rgba(0,0,0,0.1));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1;
    }
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .scanner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
      border-bottom: 1px solid var(--secondary, #f0f0f0);
    }
    .scanner-header h3 {
      font-family: var(--font-heading);
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary, #111827);
      margin: 0;
      display: flex;
      align-items: center;
    }
    .scanner-close {
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--text-muted, #999);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      border-radius: var(--radius-sm, 6px);
      transition: background 0.15s ease, color 0.15s ease;
    }
    .scanner-close:hover {
      background: var(--canvas, #f5f5f5);
      color: var(--text-primary, #111827);
    }

    .scanner-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .camera-container {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-md, 8px);
      overflow: hidden;
      background: #111827;
      border: 1px solid var(--secondary, #e5e7eb);
    }
    .camera-container video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .camera-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-muted, #999);
      font-size: 14px;
    }
    .cam-hint {
      font-size: 11px;
      opacity: 0.6;
    }

    .scan-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .scan-frame {
      position: relative;
      width: 220px;
      height: 160px;
    }
    .corner {
      position: absolute;
      width: 24px;
      height: 24px;
      border-color: #3ecf8e;
      border-style: solid;
      border-width: 0;
    }
    .corner.tl { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-radius: 4px 0 0 0; }
    .corner.tr { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
    .corner.bl { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 4px; }
    .corner.br { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }

    .laser-line {
      position: absolute;
      left: 4px;
      right: 4px;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, #3ecf8e 20%, #3ecf8e 80%, transparent 100%);
      box-shadow: 0 0 8px rgba(62, 207, 142, 0.6), 0 0 20px rgba(62, 207, 142, 0.2);
      animation: laserScan 2.5s ease-in-out infinite;
    }
    @keyframes laserScan {
      0%, 100% { top: 8px; }
      50% { top: calc(100% - 10px); }
    }

    .scan-result {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(62, 207, 142, 0.08);
      border: 1px solid rgba(62, 207, 142, 0.25);
      border-radius: var(--radius-md, 8px);
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(8px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .scan-result-icon {
      width: 32px;
      height: 32px;
      background: #3ecf8e;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
    }
    .scan-result strong {
      display: block;
      font-size: 14px;
      color: var(--text-primary, #111827);
    }
    .scan-sku {
      display: block;
      font-size: 12px;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      color: #3ecf8e;
      margin-top: 2px;
    }

    .scan-error {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: rgba(220, 38, 38, 0.08);
      border: 1px solid rgba(220, 38, 38, 0.25);
      border-radius: var(--radius-md, 8px);
      color: #dc2626;
      font-size: 13px;
      line-height: 1.4;
      animation: slideUp 0.3s ease;
    }

    .scanner-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid var(--secondary, #f0f0f0);
      background: var(--canvas, #f9fafb);
      margin: 16px -24px -24px -24px;
    }
    .scanner-actions .btn {
      flex: none;
      min-width: 120px;
    }
  `]
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
  @Input() products: any[] = [];
  @Output() scanResult = new EventEmitter<string>();
  @Output() closeScanner = new EventEmitter<void>();

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

  cameraActive = signal(false);
  isScanning = signal(false);
  scannedSku = signal<string | null>(null);
  scanError = signal<string | null>(null);

  private stream: MediaStream | null = null;

  async ngAfterViewInit() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (this.videoEl) {
        this.videoEl.nativeElement.srcObject = this.stream;
        this.cameraActive.set(true);
        await this.loadJsQR();
        this.startScanningLoop();
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      // Camera not available — scanner still works via simulated scan
    }
  }

  ngOnDestroy() {
    this.cameraActive.set(false);
    this.stopCamera();
  }

  private loadJsQR(): Promise<void> {
    if ((window as any).jsQR) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      script.onload = () => resolve();
      script.onerror = () => {
        console.warn('Could not load jsQR library from CDN.');
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  private startScanningLoop() {
    if (!this.cameraActive()) return;
    requestAnimationFrame(() => this.scanFrame());
  }

  private scanFrame() {
    if (!this.cameraActive() || this.scannedSku()) return;

    const video = this.videoEl?.nativeElement;
    if (video && video.readyState === video.HAVE_ENOUGH_DATA && (window as any).jsQR) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = (window as any).jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && code.data) {
          const foundSku = code.data.trim();
          this.scannedSku.set(foundSku);
          this.scanError.set(null); // Clear error on auto-detect success
          if (navigator.vibrate) {
            navigator.vibrate(200);
          }
          return;
        }
      }
    }

    if (this.cameraActive() && !this.scannedSku()) {
      requestAnimationFrame(() => this.scanFrame());
    }
  }

  private stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  triggerManualScan() {
    if (this.isScanning()) return;
    this.isScanning.set(true);
    this.scannedSku.set(null);
    this.scanError.set(null);

    setTimeout(() => {
      this.isScanning.set(false);

      if (!this.cameraActive()) {
        this.scanError.set('Kamera aktif değil. Lütfen kamera erişim izinlerinizi kontrol edin.');
        return;
      }

      const video = this.videoEl?.nativeElement;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && (window as any).jsQR) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = (window as any).jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code && code.data) {
            const foundSku = code.data.trim();
            this.scannedSku.set(foundSku);
            this.scanError.set(null);
            if (navigator.vibrate) {
              navigator.vibrate(200);
            }
            return;
          }
        }
      }

      this.scanError.set('Kamerada taranabilir bir QR kod bulunamadı. Lütfen QR kodu ortalayıp tekrar deneyin.');
    }, 800);
  }

  confirmScan() {
    const sku = this.scannedSku();
    if (sku) {
      this.scanResult.emit(sku);
      this.close();
    }
  }

  close() {
    this.cameraActive.set(false);
    this.stopCamera();
    this.closeScanner.emit();
  }
}
