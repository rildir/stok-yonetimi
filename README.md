# Project 01: Smart Inventory Panel

**Smart Inventory Panel**, Angular (Frontend) ve NestJS (Backend) ile geliştirilmiş akıllı bir stok yönetimi ve sipariş takip sistemidir. Nx Monorepo yapısında tasarlanmış olup en güncel yazılım standartlarına göre modülerleştirilmiştir.

## 🚀 Öne Çıkan Özellikler

- **Stok Takibi & CRUD**: Ürün ekleme, silme ve dinamik stok seviyesi takipleri.
- **Sipariş Yönetimi**: Bekleyen siparişleri tamamlama, iptal etme ve otomatik stok düşümü/iadesi.

---

## 🎨 Tasarım Dili (Design Language)

- **Renk Paleti**:
  - **Sidebar Background**: `#1E1B4B` (Lacivert / İndigo)
  - **Primary / Akranlar**: `#0EA5E9` (Gökyüzü Mavisi)
  - **Stok Durumları**:
    - Stokta (In stock): `#059669` (Zümrüt Yeşili)
    - Kritik Stok (Low stock): `#F59E0B` (Amber / Turuncu)
    - Stokta Yok (Out of stock): `#DC2626` (Kırmızı)
  - **Canvas Background**: `#F0F4F8` (Açık Gri / Mavi)
- **Tipografi**:
  - **Başlıklar & Etiketler**: `Plus Jakarta Sans`
  - **Gövde Metinleri / UI**: `Inter`
  - **Sayısal Değerler & SKU'lar**: `JetBrains Mono`

---

## 📸 Ekran Görüntüsü (Dashboard Mockup)

![Smart Inventory Panel Mockup](./dashboard_mockup.png)

---

## 🔗 Live Demo Link
Projenizi yerel ortamınızda çalıştırdıktan sonra aşağıdaki adreslerden erişim sağlayabilirsiniz:
- **Frontend Panel**: [http://localhost:4200](http://localhost:4200)
- **Backend API**: [http://localhost:3000/api](http://localhost:3000/api)

---

## 🛠️ Kurulum ve Çalıştırma (yeni klon, boş veritabanı)

Gereksinimler: Node.js 20+, Docker (MySQL 8 için). Tüm komutlar depo kök dizininde çalıştırılır.

### 1. Bağımlılıklar

```bash
npm install
```

### 2. Ortam değişkenleri (.env)

```bash
cp .env.example .env
```

`.env` içinde en az şunları doldurun (gerçek sırları depoya koymayın):

| Anahtar | Açıklama |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Uygulamanın bağlandığı MySQL (docker-compose ile: `127.0.0.1`, `3307`, `root`, `DB_ROOT_PASSWORD` ile aynı değer, `stok_yonetimi`) |
| `DB_ROOT_PASSWORD`, `DB_APP_USERNAME`, `DB_APP_PASSWORD` | Yalnızca `docker-compose.yml` okur (MySQL kapsayıcısının hesapları) |
| `JWT_SECRET` | En az 32 rastgele karakter (`openssl rand -base64 48`) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Boş veritabanında ilk açılışta oluşturulan süper yönetici. Şifre politikası: en az 10 karakter, büyük harf / küçük harf / rakam / sembolden en az 3'ü. Uymazsa tek kullanımlık şifre `initial-admin-password.txt` dosyasına yazılır. |
| `EBELGE_CREDENTIALS_KEY` | Entegratör kimlik bilgilerinin şifreleme anahtarı: 32 bayt, base64 veya 64 hex (`openssl rand -base64 32`) |
| `PII_ENCRYPTION_KEY`, `PII_HMAC_KEY` | KVKK alan şifrelemesi ve arama indeksi: ayrı ayrı 32 bayt (`openssl rand -base64 32`). **Veri yazıldıktan sonra asla değiştirmeyin.** |
| `PORT`, `CORS_ORIGIN` | Geliştirmede `3001` ve `http://localhost:4300` (frontend proxy'si 3001'e gider) |

Geliştirmede (`NODE_ENV` production değilken) eksik `JWT_SECRET` / `EBELGE_CREDENTIALS_KEY` / `PII_*` anahtarları uyarıyla güvensiz geliştirme anahtarlarına düşer; üretimde uygulama bu anahtarlar olmadan açılmaz. Diğer isteğe bağlı ayarlar `.env.example` içinde açıklamalıdır.

### 3. MySQL

```bash
docker compose up -d mysql
```

Kapsayıcı `--log-bin-trust-function-creators=1` ile açılır: göçler (migration) değiştirilemezlik tetikleyicileri oluşturur ve MySQL 8'de ikili günlük açıkken SUPER yetkisi olmayan bir hesap bunu ancak bu ayarla yapabilir. Kendi MySQL sunucunuzu kullanıyorsanız aynı ayarı verin (`SET PERSIST log_bin_trust_function_creators = 1;`) veya göçleri SUPER/SYSTEM_VARIABLES_ADMIN yetkili bir hesapla çalıştırın.

### 4. Şemayı oluşturma (göçler)

```bash
npx nx run backend:migration:run
```

Boş bir veritabanında tüm göç zincirini (başlangıç şeması → çok kiracılık → … → KVKK) baştan sona çalıştırır. Uygulama göç bekleyen bir veritabanıyla açılmayı reddeder.

### 5. Backend (NestJS)

```bash
npx nx serve backend
```

API `http://localhost:3001/api`, Swagger `http://localhost:3001/api/docs`. İlk açılışta seed servisi boş veritabanını doldurur: referans veriler (il / ilçe / vergi dairesi, yasal parametreler, vergi kodları), "Demo Şirketi" ve demo verileri, `ADMIN_USERNAME` / `ADMIN_PASSWORD` ile yönetici ve (yalnızca production dışında) `manager`, `viewer`, `demo` hesapları. Bu demo hesaplarının şifreleri ya `DEMO_ACCOUNT_PASSWORD` (politikaya uyan tek şifre) ya da hesap başına rastgele üretilip `demo-account-passwords.txt` dosyasına yazılır (günlüğe yazılmaz, depoya eklenmez). İlk girişte şifre belirleme zorunluluğu yoktur; böylece hesabı ilk giren kişi sahiplenemez.

### 6. Frontend (Angular)

```bash
npx nx serve frontend --port 4300
```

Uygulama `http://localhost:4300` adresindedir. İlk girişte KVKK aydınlatma / onay penceresi çıkar.

### Testler

```bash
npx nx build backend && npx nx build frontend
npx nx test backend
npx nx test frontend
```

`nx test frontend`, Vitest'i Windows'ta sürücü harfi büyük/küçük farkından etkilenmeden çalıştırmak için `apps/frontend/tools/run-unit-tests.mjs` üzerinden `frontend:unit-test` hedefini çağırır.

---

## API değişiklikleri (entegratörler için)

### WP1 — Mali kimlik ve yapılandırılmış adres

- `GET/POST/PUT /api/customers`, `/api/suppliers`, `/api/warehouses` ve ilgili webhook olaylarında `address` artık bir nesnedir: `{ line1, line2, districtId, district, provinceCode, province, postalCode, country, uavtCode }`.
- Müşteride `taxNumber`, `city`, `postalCode`, `country` alanları kaldırıldı; kimlik `identityType` (VKN/TCKN/YKN/FOREIGN/ANONYMOUS) + `identityNumber`, vergi dairesi `taxOfficeCode`/`taxOfficeName` ile tutulur.
- Geçiş dönemi için yanıtlarda salt-okunur uyumluluk alanları döner: müşteri `taxNumber` (= `identityNumber`), `city` (= `address.province`), `postalCode`, `country`, `addressText`; tedarikçi ve depo `addressText` (tek satır adres). Girdide yok sayılırlar; `taxNumber` girdisi yalnızca kimlik tipi ve numarası boşken kullanılır.
- Doğrulama hatalarında `code` alanı alan hatasının kodunu taşır (`INVALID_VKN`, `INVALID_TCKN`, `TAX_ID_REQUIRED_FOR_COMPANY`, `WEAK_PASSWORD`, ...); her hata için `fields: [{ property, code }]` döner. Genel hatalarda `VALIDATION_FAILED` kalır.
- Rapor, stok hareketi ve denetim kaydı filtrelerinde `YYYY-MM-DD` tarihleri şirketin saat dilimindeki takvim günüdür; bitiş günü dahildir. Veritabanı UTC saklar.

### WP2 — Envanter çekirdeği (ondalık miktar, birim kodları, değişmez hareketler)

- Tüm stok miktarları `DECIMAL(18,4)`'tür; API'de sayı olarak döner (`1.25`). Girilebilecek ondalık basamak birimin `decimals` alanıyla sınırlıdır (kg: 3, adet: 0); aşımda `QUANTITY_PRECISION_EXCEEDED`.
- `GET/POST/PUT /api/units`: `decimals` (0-3), `uneceCode` (UN/ECE Rec. 20: C62, KGM, LTR...), `allowsFraction`, salt-okunur `deprecated`. TR şirketlerinde yeni birim için UN/ECE kodu zorunludur (`UNIT_CODE_MISSING`); `lb`/`LBR` (SI dışı) sunulmaz. Standart birim → UN/ECE eşlemesi `legal_parameters.UNECE_STANDARD_UNIT_MAP` içindedir (pack/pallet teyit bekliyor).
- Stok hareketleri (`/api/stock-movements`) değiştirilemez: UPDATE/DELETE veritabanı trigger'ı ile reddedilir (`MOVEMENT_IMMUTABLE`, HTTP 409). Her satırda `transactionDate`, `reasonCode`, `documentType/No/Date`, `counterpartyTaxId`, `productSku`/`warehouseName`/`unitCode` anlık görüntüleri, `sequenceNo`, `prevHash`, `hash` bulunur. Liste `dateField=transactionDate|createdAt` ve `reasonCode` filtrelerini kabul eder; varsayılan sıralama ve tarih filtresi işlem tarihidir.
- `POST /api/stock-movements/adjust`: `reasonCode` zorunlu; `newQuantity` depo (`warehouseId`), lot (`lotId`) veya ürün toplamı için hedef miktardır; isteğe bağlı `transactionDate`, `documentType/No/Date`, `attachment { fileName, mimeType, dataBase64 }` (en fazla 5 MB). Şirket onay eşiği (`adjustmentApprovalThreshold`) aşılırsa HTTP 202 ve `SECOND_APPROVAL_REQUIRED` döner; talep `POST /api/stock-movements/adjustment-requests/:id/approve|reject` ile talep edenden farklı bir yönetici tarafından sonuçlandırılır.
- Düzeltme yalnızca ters kayıtla yapılır: `POST /api/stock-movements/:id/reverse { note }` (belgeye bağlı hareketler belge iptal/iade akışıyla düzeltilir). Tutarı onay eşiğini aşan veya ikinci onayla yapılmış bir hareketin ters kaydı da HTTP 202 ile ikinci yönetici onayına gider. Onaylanan hareketlerde `performedBy*` talep edeni, `approvedBy*` onaylayanı gösterir.
- Zayi / afet / hırsızlık / TETT imhası / imha nedenli çıkışlar (LOSS_ZAYI, DISASTER_LOSS, THEFT_LOSS, EXPIRED_DESTROYED, DESTRUCTION_IMHA) belge no + tarih ve ek dosya ister (`DOCUMENT_REQUIRED_FOR_REASON`, `ATTACHMENT_REQUIRED_FOR_REASON`). Kural `legal_parameters.MOVEMENT_REASON_EVIDENCE` ile değiştirilebilir; etkin kurallar `GET /api/stock-movements/reason-rules`.
- İşlem tarihi kuralları: şirketin `stockLockDate` tarihi ve öncesine, ayrıca bir önceki yılın 1 Ocak tarihinden önceye hareket girilemez (`TRANSACTION_DATE_LOCKED`, `TRANSACTION_DATE_TOO_OLD`). Geriye tarihli çıkış, işlem tarihindeki ve sonraki her andaki ürün bakiyesini eksiye düşürecekse reddedilir (`BACKDATED_BALANCE_NEGATIVE`). `previousQuantity/newQuantity` kayıt sırasındaki bakiyedir; dönem bakiyeleri `transactionDate` toplamlarından hesaplanır. VUK 219 geç kayıt uyarısı (`warnings[].code = LATE_ENTRY_WARNING`) düzeltme, ters kayıt, onay, satın alma teslimi ve tarihli sipariş yanıtlarında döner.
- Hash zinciri v2 (`hashVersion = 2`): kayıt zamanı (`createdAt`), onaylayan ve ek dosyaların SHA-256 özeti (`attachmentsSha256`) de zincire dahildir; v1 satırlar (WP2 göçü) eski alan kümesiyle doğrulanır. Ek dosyalar silinemez/değiştirilemez, sonuçlanmış onay talepleri değiştirilemez (trigger). Doğrulama 1000'lik partilerle yapılır ve ek dosya içeriklerini de kontrol eder.
- Ürünlerde salt-okunur `availableQuantity`: satılabilir depolardaki stok (karantina / yolda hariç); `status` (düşük / tükendi) bu miktara göre hesaplanır.
- Sayılan / ambalaj UN/ECE kodlu birimler (C62, DZN, BX...) ondalık alamaz (`UNIT_DECIMALS_NOT_ALLOWED_FOR_CODE`).
- Bilinçli sapma (R08): "açık satışta dara düşülür" kuralı satış belgesi satırlarına (brüt / dara / net) WP4'te eklenecektir; WP2 yalnızca ondalık net miktarı ve birim hassasiyetini sağlar.
- `GET /api/integrity/stock-movements/verify`: şirketin SHA-256 hareket zincirini yeniden hesaplar.
- `PUT /api/purchase-orders/:id/status` teslim almada `transactionDate`, `documentType`, `documentNo`, `documentDate` kabul eder (geç girilen alış kendi dönemine düşer).
- Ürünlerde `regulatoryCategory`, `inventoryClass`, `gtin14`; depolarda `type` (NORMAL/QUARANTINE/CONSIGNMENT/IN_TRANSIT), `isSellable`, `ownership`; şirkette `enabledComplianceModules`, `adjustmentApprovalThreshold`, `stockLockDate` alanları eklendi. Ürün güncellemesi (`PUT /api/products/:id`, `bulk-update`) stok miktarını değiştiremez (`PRODUCT_QUANTITY_USE_ADJUSTMENT`); stok yalnızca `POST /api/stock-movements/adjust` ile (neden, belge, onay eşiği kurallarıyla) değişir.
- Geliştirme ortamında şema senkronizasyonu korumalıdır: bekleyen veya kodda olmayan bir migration varsa ya da senkronizasyon bir kolonu/tabloyu silecekse (DROP COLUMN trigger'ları atlayıp defteri siler) uygulama açılmaz; önce `npx nx run backend:migration:run` çalıştırın veya değişiklik için migration yazın. `DB_SYNCHRONIZE=false` senkronizasyonu tamamen kapatır.

### WP3 — Vergi motoru (oran kataloğu, istisna, tevkifat, iskonto, kur, vergi doğuran olay)

- KDV oranları TR şirketlerinde yasal katalogdan gelir (`legal_parameters.KDV_RATE_CATALOG`: 10.07.2023'ten itibaren %20/%10/%1). Katalog dışı oran (`%18` gibi) `TAX_RATE_LOCKED_TR` (422) ile reddedilir; %0 bir oran değil `kind = EXEMPT` (KDV0) satırıdır ve istisna kodu ister (`EXEMPTION_CODE_REQUIRED`). Oranlar `code`, `taxTypeCode` (0015), `kind`, `validFrom/validTo`, `isSystem`, `supersedesId` alanlarını taşır; oran değişikliği yeni sürüm satırı ekler, kullanımdaki oran silinemez (`TAX_RATE_IN_USE`, 409). `GET /api/tax-rates/catalog`, `GET /api/tax-rates?history=true`.
- Global ve sürümlü UBL-TR kod listeleri: `GET /api/tax-codes/exemptions|withholdings|otv?date=` (GİB UBL-TR Kod Listeleri v1.31; teyit bekleyen satırlar `confidence` + `note` ile işaretli). Yeni sürüm yalnızca süper yönetici: `POST /api/admin/tax-codes/:kind`.
- Ürünlerde `exemptionCode`, `withholdingCode` (ör. 627 demir-çelik), `otvCode`, `otvRate`. TR ürününde oran zorunludur (`PRODUCT_TAX_RATE_MISSING`); yeni üründe varsayılan oran açıkça atanır.
- Sipariş / satın alma satırları: `discountRate`/`discountAmount`, `exemptionCode`, `withholdingCode` (`""` ürün varsayılanını kapatır), PO'da `reverseCharge`. Belge: `documentDiscountAmount`, `charges[] {type: SHIPPING|PACKAGING|INSURANCE|OTHER, amount, description}`, `taxPointDate`; siparişte `shippedAt`, `salesChannel`, `isDistanceSale`, `channelOrderRef`; PO'da `customsDeclarationNo/Date`, `importVatAmount`, `nonDeductibleImportVat`. Yanıtta `withheldTaxTotal`, `payableTotal`, `taxBreakdown`, `subtotalTry/taxTotalTry/grandTotalTry`, `exchangeRateSource/Date`, `invoiceTypeHint`, `taxFrozenAt`, satırlarda `unitPrice` DECIMAL(18,6) ve vergi anlık görüntüsü (`taxRateId`, `taxCode`...).
- Hesap: brüt → satır iskontosu → belge iskontosu payı → matrah (round2) → (ÖTV) → KDV; tevkifat KDV × pay/10, yalnızca KDV mükellefi (gerekiyorsa belirlenmiş) alıcıya ve KDV dahil TL toplam yıllık `VUK232_INVOICE_LIMIT`'i aşınca; 627'de şirket `isImporterOrOreProducer` ise uygulanmaz; 701/702 KDV'si hesaplanır ama genel toplama eklenmez; 301 vb. ihracat istisnası yabancı alıcı ister (`EXPORT_REQUIRES_FOREIGN_BUYER`). Masraflar asıl teslimin oranına, çok oranlıda oransal dağıtılır.
- Önizleme: `POST /api/orders/quote`, `POST /api/purchase-orders/quote` (stok/kayıt yok, `warnings[]` döner: eşik altı, bölünmüş sipariş şüphesi...). `PUT /api/orders/:id/tax-point { taxPointDate?, shippedAt? }` beklemedeki siparişin kurunu yeniler; tamamlanan sipariş ve teslim alınan PO'nun vergisi dondurulur (`DOCUMENT_TAX_FROZEN`, 409).
- Kur: `exchange_rates` artık `source` (TCMB/MANUAL), `rateType`, `announcedAt`, `bulletinNo` taşır. TCMB `today.xml` her iş günü 15:45'te (Europe/Istanbul) `fxAutoFetch` açık TR şirketleri için çekilir; `POST /api/exchange-rates/tcmb/fetch { date? }`, `GET /api/exchange-rates/tax-rate?currency=&taxPointDate=`. KDV dönüşümü yalnızca doğrudan `X/TRY` döviz alış kuruyla yapılır (çapraz kur yok); D-1 bülten politikası `legal_parameters.KDV_FX_RATE_DAY` (düşük güven) ile yönetilir. Bulunamazsa `FX_RATE_NOT_FOUND` (422). `TCMB_FETCH_DISABLED=true`, `TCMB_BASE_URL` ortam değişkenleri.

### WP4 — Belge düzeni (numaralandırma, irsaliye, fatura, iade, mal kabul, gider pusulası)

- Seriler ve numaralar: `GET/POST/PUT /api/document-series`, `GET /api/document-series/counters`. e-Belge serisi 3 karakter + yıl + 9 hane (her yıl 1'den), matbu seri `A-000001`, iç belgeler `MKB-2026-000001`. Numara yalnızca onay / düzenlemede, `SELECT … FOR UPDATE` ile boşluksuz verilir; aynı serinin son belgesinden önceki tarihe numara verilmez (`DOCUMENT_DATE_BEFORE_LAST`). Yasaklı seriler `legal_parameters.DOCUMENT_SERIES_FORBIDDEN` (`SERIES_CODE_FORBIDDEN`).
- Şirket ayarları (`PUT /api/company`): `stockDeductOn` = `despatch` (TR varsayılanı: sipariş yalnızca rezerve eder, stok irsaliye onayında düşer) | `order` (eski davranış); `eDocumentMode` = `NONE` (matbu seri veya harici sistem numarası) | `PROVIDER` (WP5); `producerReceiptEnabled`. Sipariş oluşturulduğu modu `stockMode` alanında taşır; mevcut siparişler `documentsLegacy = true`.
- İrsaliye: `POST /api/orders/:id/despatch`, `POST /api/despatches` (transfer, konsinye, tamir, numune, fason, iade), `POST /api/despatches/:id/approve`, `POST /api/despatches/:id/receive` (transfer: yoldaki mallar → hedef depo), `GET /api/despatches/:id/print`. İptal yoktur: `POST …/cancel` ve onaylı irsaliyenin silinmesi `DESPATCH_CANNOT_BE_CANCELLED` (409). Sürücü TCKN'si gerçek olmalı (`DRIVER_TCKN_INVALID`). Farklı adresteki depolar arası `POST /api/warehouses/transfer` artık `TRANSFER_DESPATCH_REQUIRED` döner.
- Fatura: `POST /api/orders/:id/invoice`, `POST /api/invoices/from-despatches` (toplu), `POST /api/invoices/:id/issue { externalDocNo?, issueDate?, issueTime?, lateConfirm? }`, `POST /api/invoices/:id/cancel { reason }`, `PUT /api/invoices/:id/objection`. İrsaliye no/tarihi `despatchRefs`'e otomatik girer; teslimden 7 günden sonra düzenleme `INVOICE_LATE_CONFIRM_REQUIRED` (409) ve açık onay ister (audit `invoice.late_issue_confirmed`). Faturası/irsaliyesi olan sipariş iptal edilemez (`ORDER_HAS_ISSUED_DOCUMENTS`). Sipariş yanıtında `invoiceRequirement` (VUK 232) ve `PUT /api/orders/:id/okc-receipt`.
- İade: `POST /api/returns` (`SALES_RETURN|WITHDRAWAL|DEFECT` fatura satırına, `PURCHASE_RETURN` mal kabul satırına), `POST /api/returns/:id/complete`. Miktar satılanı aşamaz (`RETURN_QTY_EXCEEDS_SOLD`), orijinal oran kopyalanır, RETURN hareketi `reversesMovementId` taşır; cayma süreleri `WITHDRAWAL_*` parametreleri ve şirket saat dilimiyle hesaplanır.
- Mal kabul: `POST /api/purchase-orders/:id/goods-receipts { lines: [{ purchaseOrderItemId, despatchQuantity, countedQuantity, rejectedQuantity }], complete }`, `PUT /api/goods-receipts/:id/supplier-invoice`, `POST /api/goods-receipts/:id/own-despatch`. Yalnızca kabul edilen miktar stoğa girer (fazlası `TESELLUM_SURPLUS`); `PUT /api/purchase-orders/:id/status` artık teslim almaz (`PO_RECEIVE_REQUIRES_GOODS_RECEIPT`), kısmen alınmış siparişi yalnızca kapatır.
- Gider pusulası / müstahsil makbuzu: `/api/expense-vouchers` (+ `issue`, `cancel`, `signed-copy`); mükellef olmayan tedarikçiden mal kabulde taslak otomatik oluşur.
- Uyum: `GET /api/compliance/uninvoiced-deliveries` (5. gün uyarı, 7. gün kritik), `receipts-without-invoice`, `pending-expense-vouchers`, `document-summary`; her gün 09:00'da `document_deadlines` WebSocket olayı. Yeni webhook olayları: `despatch.approved`, `invoice.issued`, `invoice.cancelled`, `return.completed`, `goods_receipt.completed`.
- Değişmezlik: onay / düzenleme sonrası belge ve satırları DB trigger'larıyla dondurulur (`DOCUMENT_IMMUTABLE`, 409); yalnızca durum / iş akışı kolonları değişebilir. Belge tablolarında şirket FK'si RESTRICT (sipariş ve satın alma dahil).
- Çıktılar (`…/print`, sipariş toplama listesi, satın alma "Sipariş formu") her zaman Türkçe HTML'dir (tarayıcıdan PDF); fatura / irsaliye olmayan çıktılarda ve e-Belge önizlemelerinde "Mali değeri yoktur, fatura veya irsaliye yerine geçmez." ibaresi bulunur. Resmî e-Belge görüntüsü WP5'tedir.

### WP5 — e-Belge (UBL-TR 1.2.1, sağlayıcı soyutlaması, mock entegratör, gelen kutusu, arşiv)

- Mimari: uygulama UBL-TR XML'i üretir ve doğrular (GİB XSD paketi + GİB şematronu, `backend/src/assets/ebelge/vendor`, SaxonJS ile); imza, GİB'e iletim, e-Arşiv raporu ve yasal arşiv entegratördedir. Entegratör `EDocumentProvider` arayüzüyle takılır (`backend/src/app/shared/ebelge/provider`); yeni bir entegratör için adapter sınıfı yazılıp `EDOCUMENT_PROVIDER_FACTORIES` listesine eklenir, ayarlardan seçilir. Geliştirme / test için `MOCK` sağlayıcı (kayıtlı VKN listesi, gecikmeli durum geçişleri, kesinti / zaman aşımı / red simülasyonu, örnek gelen belgeler).
- Ayarlar: `GET/PUT /api/ebelge/settings` (sağlayıcı, TEST/LIVE, kimlik bilgileri AES-256-GCM ile şifreli ve maskeli, GB/PK etiketleri, e-Arşiv iletim kanalı, logo), `POST /api/ebelge/settings/test`, `GET /api/ebelge/status` (kesinti bandı, kuyruk, MATBUDAN süreleri, gelen kutusu geri sayımları). Ortam değişkenleri: `EBELGE_CREDENTIALS_KEY` (32 bayt base64 / 64 hex, üretimde zorunlu), `EBELGE_CREDENTIALS_KEY_ID` (anahtar döndürme: eski anahtar `EBELGE_CREDENTIALS_KEY_<ID>`), `EBELGE_WORKER=off` (zamanlanmış işleri kapatır), `EBELGE_CHROMIUM_PATH` (PDF için tarayıcı).
- Akış: şirket `eDocumentMode = PROVIDER` iken fatura düzenlenince alıcının GİB kaydı (24 saat önbellek) sorgulanır, senaryo seçilir (kayıtlı: TEMEL/TICARI, değil: EARSIV, ihracat: IHRACAT — bayrakla), UBL üretilip doğrulanır (hata: `UBL_VALIDATION_FAILED`, 422; her bulgu TR+EN `errors[]`; işlem geri alınır, numara harcanmaz), arşive ve kuyruğa (`edocument_outbox`, ETTN + işlem benzersiz) yazılır. İrsaliye onayında aynı akış (her alıcıya e-İrsaliye; kanal GIB / EMAIL / PRINT). Durumlar: fatura QUEUED → SENT → DELIVERED / ACCEPTED / REJECTED, irsaliye APPROVED → HANDED_TO_PROVIDER → GIB_ACCEPTED → (PARTIALLY_ACCEPTED / REJECTED, irsaliye yanıtıyla).
- İptal: e-Arşiv alıcıya iletimden itibaren `EARSIV_CANCEL_DAYS` (8) gün içinde entegratörden iptal (`EARCHIVE_CANCEL_WINDOW_EXPIRED`); iletilmiş e-Fatura yalnızca bildirimle: `POST /api/invoices/:id/cancel { reason, noticeChannel, noticeDate, noticeRef }` (`EFATURA_CANCEL_NOTICE_REQUIRED`). İtiraz bildirimi `PUT /api/invoices/:id/objection { …notice }`.
- Arşiv: `GET /api/e-documents`, `/:id` (zaman çizelgesi, teslimler, bildirimler, iptal penceresi, karekod JSON'u), `/:id/xml`, `/:id/html` (GİB amblemli XSLT görünümü + karekod), `/:id/pdf`, `POST /:id/retry`, `PUT /:id/legal-hold`, `POST /api/e-documents/integrity-check`, `GET /api/e-documents/archive-package?from&to` (ibraz paketi ZIP: XML, PDF, index.csv, manifest.sha256). `e_documents` silinemez, XML / özet değiştirilemez (DB trigger, `EDOCUMENT_ARCHIVE_IMMUTABLE`); `retentionUntil = 31.12.(yıl+10)`.
- Gelen kutusu: `GET /api/ebelge/inbox`, `POST /api/ebelge/inbox/fetch` (ayrıca 15 dakikada bir), `PUT /api/ebelge/inbox/:id/match`, `POST /api/ebelge/inbox/:id/respond { response: KABUL|RED }` (TICARIFATURA, 8 gün), `POST /api/ebelge/inbox/:id/receipt-advice { lines: [{ lineId, accepted, rejected, reason }] }` (e-İrsaliye, fiili sevkten 7 gün; süre geçince kabul sayılır). Tedarikçi VKN → sipariş → mal kabul (üçlü eşleşme); gelen IADE faturası asıl satışa bağlanır.
- Kayıtlı kullanıcı sorgusu: `GET /api/ebelge/registry/:taxId?type=INVOICE|DESPATCH`, `POST /api/ebelge/customers/:id/registry-check`. Entegratör bildirimi: `POST /api/ebelge/provider-webhook/:companyId` (HMAC). Yeni webhook olayları: `invoice.status_changed`, `despatch.status_changed`, `edocument.received`.
- GİB paketleri güncellenince: `backend/src/assets/ebelge/vendor/UPDATE-CHECKLIST.md` adımları, ardından `node backend/tools/ebelge/build-ebelge-assets.js` (şematron ve görüntü XSLT'si SaxonJS SEF olarak derlenir, `MANIFEST.json` yenilenir; bir birim testi manifest ile dosyaları karşılaştırır).

### WP7 — KVKK ve veri yönetişimi

- **Oturum (kırıcı değişiklik):** erişim jetonu 15-60 dk (`ACCESS_TOKEN_TTL_MINUTES`, varsayılan 30). Giriş, httpOnly + `SameSite=Strict` `rt` yenileme çerezi de yazar; `POST /api/auth/refresh` (çerezle, `withCredentials`) yeni jeton döndürür ve çerezi döndürür, `POST /api/auth/logout` iptal eder. Boşta kalma süresi `SESSION_IDLE_MINUTES` (30), mutlak süre `REFRESH_TOKEN_TTL_HOURS` (12).
- **İki adımlı doğrulama:** yöneticiler için zorunlu (mevcut şirketlere 30 gün, yeni şirketlere 7 gün geçiş süresi; sonra her çağrı `403 TOTP_REQUIRED`). `POST /api/user/totp/setup | enable | disable`. TOTP etkin kullanıcıda `POST /api/auth/login` `{ totpRequired: true, challenge }` döner; oturum `POST /api/auth/login/totp { challenge, code }` (6 haneli kod veya kurtarma kodu) ile açılır.
- **Kişisel veri maskesi:** `customers.pii.read` yetkisi olmayan çağıranlara (viewer, auditor, `customers_pii` kapsamı olmayan API anahtarları) tüm JSON yanıtlarda 11 haneli kimlik numaraları ve pasaport no `*******1234` biçiminde döner. Müşteri listesi / detayında gerçek kişinin TCKN'si herkese maskelidir; `POST /api/customers/:id/reveal` açık değeri döndürür ve `pii_view` olarak loglanır. Maskeli değer `PUT` ile geri gönderilirse "değişmedi" sayılır. CSV dışa aktarımda kişisel sütunlar `customers.pii.export` ister; her dışa aktarım `read_export` olarak loglanır. API anahtarı kapsamı: `customers_pii: read|write`.
- **Webhook:** yüklerde kişisel veri varsayılan olarak yok (`includePersonalData: false`; ad, iletişim, kimlik, adres alanları çıkarılır, kimlikler kalır). Yeni alanlar `destinationCountry` (ISO-2, varsayılan TR), `transferBasis` (DOMESTIC / ADEQUACY / SCC / BCR / INCIDENTAL_CONSENT), `sccSignedAt`, `sccNotifiedAt`; yurt dışı alıcı dayanaksız etkinleştirilemez (`TRANSFER_BASIS_REQUIRED`, `SCC_NOTICE_REQUIRED`). Yeni olay `customer.erased` (`{ customerId, mode: FULL|PARTIAL, restrictedUntil }`). WebSocket `customer_mutated` artık yalnızca `{ type, customerId, changedFields }` taşır.
- **Roller:** `auditor` (denetçi) tüm okuma uçlarına erişir, hiçbir şey yazamaz (`AUDITOR_READ_ONLY`). Kullanıcıya ek yetki: `permissions: ["customers.pii.read"]`.
- **KVKK uçları (`/api/kvkk`):** `status`; aydınlatma metinleri `notices` (taslak üret / yayımla / yürürlükten kaldır), `public/notices/current` (oturumsuz); kabul `acceptances/pending`, `POST acceptances`; rıza `consents` (fatura / sevk için `CONSENT_NOT_REQUIRED`); `retention-policies` (asgari süre altına `RETENTION_BELOW_LEGAL_MINIMUM`, öneri süreler onaylanmadan imhada kullanılmaz); `destruction/runs` (aday listesi, `approve` / `reject`), `destruction/logs`, `destruction/schedule`; başvurular `dsr` (`verify-identity`, `erase`, `export?format=html`, `respond`; 30 gün sayacı); `subjects/:type/:id/export`; ihlaller `incidents` (`confirm` ile 72 saat başlar, `affected`); `subprocessors`; `verbis/status | inventory | inventory.csv | inventory/print`; `settings`; `audit-chain/verify`; `tenant/export` (ZIP) ve `tenant/close` (kapalı şirkette yazma `TENANT_UNDER_RETENTION`).
- **Veri koruma:** `customers.identityNumber`, `customers.passportNo`, `suppliers.identityNumber` AES-256-GCM ile şifreli (`PII_ENCRYPTION_KEY`), aramada `identityNumberHash` (HMAC, `PII_HMAC_KEY`); üretimde iki anahtar ve `DB_PASSWORD` zorunlu, veritabanı bağlantısı TLS (`DB_SSL`). `audit_logs` ekleme-yalnızca ve hash zincirli (trigger; üretim GRANT'leri `backend/tools/db/kvkk-grants.sql`). Ön yüz CSP'si: `apps/frontend/nginx.conf` (üretim) ve dev-server başlıkları.

### Son uyum düzeltmeleri

- `GET /products`, `GET /products/:id`, barkod araması, ürün oluşturma / güncelleme, depo transferi ve `product_mutated` soket olayı: `availableQuantity` artık **rezerve düşülmüş** satılabilir miktardır (`sellableQuantity − reservedQuantity`, 0'ın altına inmez). Yeni salt okunur alan `sellableQuantity` satılabilir depolardaki stoktur (karantina / yoldaki hariç; stok durumu buna göre hesaplanır).
- `POST /auth/login`: bilinmeyen kullanıcı, kilitli hesap, bekleyen davet ve hatalı şifre aynı yanıtı verir (400 `AUTH_INVALID_CREDENTIALS`); 423 artık dönmez. Kilit sürerken şifre hiç değerlendirilmez, neden yalnızca denetim günlüğüne yazılır.
- e-Fatura / e-İrsaliye düzenlenirken GİB kayıtlı kullanıcı önbelleğindeki "kayıtlı değil" yanıtına güvenilmez, entegratörden yeniden sorgulanır.
- `customers.pii.read` yetkisi olmayanlar (viewer, auditor) belge yanıtlarında ve soket olaylarında gerçek kişi alıcı / müşterinin kimlik numarasını, e-postasını ve telefonunu maskeli görür.
