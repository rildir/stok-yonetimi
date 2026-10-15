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
