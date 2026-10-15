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

## 🛠️ Kurulum ve Çalıştırma

Proje bağımlılıklarını kurmak için ana dizinde aşağıdaki komutu çalıştırın:

```bash
npm install
```

### 1. Ortam Değişkenlerini Ayarlama (.env)
Projeyi güvenli bir şekilde çalıştırmak için öncelikle `.env` dosyasını oluşturmanız gerekmektedir:
Ana dizinde bulunan `.env.example` dosyasının adını `.env` olarak değiştirin veya kopyasını oluşturun.
İçerisindeki veritabanı, JWT ve Admin bilgilerini kendi güvenli değerlerinizle güncelleyin.

```bash
cp .env.example .env
```

### 2. Backend Servisini Başlatma (NestJS)
NestJS uygulamasını port 3000 üzerinde başlatmak için:

```bash
npx nx serve backend
```

### 3. Frontend Uygulamasını Başlatma (Angular)
Angular uygulamasını port 4200 üzerinde başlatmak ve NestJS proxy entegrasyonu ile çalıştırmak için:

```bash
npx nx serve frontend
```

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
