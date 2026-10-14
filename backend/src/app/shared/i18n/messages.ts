export type Lang = 'tr' | 'en';
export const DEFAULT_LANG: Lang = 'tr';

type Catalog = Record<string, { tr: string; en: string }>;

/** Message catalog keyed by stable error codes. `{param}` placeholders are interpolated. */
export const MESSAGES: Catalog = {
  // Generic
  INTERNAL_ERROR: { tr: 'Sunucu hatası oluştu.', en: 'Internal server error.' },

  // Auth / tenant
  AUTH_LOGIN_REQUIRED: { tr: 'Yetkisiz erişim: Oturum açmanız gerekiyor.', en: 'Unauthorized: you need to sign in.' },
  AUTH_SESSION_EXPIRED: { tr: 'Geçersiz veya süresi dolmuş oturum.', en: 'Invalid or expired session.' },
  AUTH_SESSION_INVALID: { tr: 'Geçersiz oturum.', en: 'Invalid session.' },
  AUTH_DEMO_READONLY: {
    tr: 'Demo modundasınız: Bu hesaptayken ekleme, güncelleme veya silme işlemi gerçekleştiremezsiniz.',
    en: 'You are in demo mode: you cannot create, update or delete with this account.',
  },
  AUTH_FORBIDDEN: { tr: 'Bu işlemi gerçekleştirmek için yetkiniz bulunmamaktadır.', en: 'You are not authorized to perform this action.' },
  AUTH_INVALID_CREDENTIALS: { tr: 'Kullanıcı adı veya şifre hatalı.', en: 'Invalid username or password.' },
  AUTH_WRONG_CURRENT_PASSWORD: { tr: 'Mevcut şifreniz yanlış.', en: 'Your current password is incorrect.' },
  TENANT_CONTEXT_MISSING: { tr: 'Şirket bağlamı bulunamadı.', en: 'Company context not found.' },

  // Company / user
  COMPANY_NOT_FOUND: { tr: 'Şirket bulunamadı.', en: 'Company not found.' },
  USERNAME_TAKEN: { tr: '"{username}" kullanıcı adı zaten kullanımda.', en: 'Username "{username}" is already taken.' },
  EMAIL_TAKEN: { tr: 'Bu e-posta adresi zaten kullanımda.', en: 'This email address is already in use.' },
  USER_NOT_FOUND: { tr: 'Kullanıcı bulunamadı.', en: 'User not found.' },
  USER_NOT_FOUND_BY_USERNAME: { tr: 'Bu kullanıcı adı ile kayıtlı kullanıcı bulunamadı.', en: 'No user found with this username.' },
  ADMIN_NOT_FOUND: { tr: 'Yönetici bulunamadı.', en: 'Administrator not found.' },
  USER_LAST_ADMIN: { tr: 'Son yönetici hesabı silinemez.', en: 'The last administrator account cannot be deleted.' },

  // Category
  CATEGORY_SLUG_TAKEN: { tr: 'Bu kategori slug bilgisi zaten kullanımda.', en: 'This category slug is already in use.' },
  CATEGORY_HAS_PRODUCTS: { tr: 'Bu kategoriye ait aktif ürünler bulunduğundan silinemez.', en: 'This category cannot be deleted because it has active products.' },

  // Order
  ORDER_CANNOT_CREATE_CANCELLED: { tr: 'Yeni bir sipariş "İptal Edildi" (Cancelled) durumuyla oluşturulamaz.', en: 'A new order cannot be created with "Cancelled" status.' },
  ORDER_NUMBER_GENERATION_FAILED: { tr: 'Benzersiz sipariş numarası üretilemedi, lütfen tekrar deneyin.', en: 'Could not generate a unique order number, please try again.' },
  ORDER_INSUFFICIENT_STOCK: { tr: 'Yetersiz stok: {name} (Mevcut: {available})', en: 'Insufficient stock: {name} (Available: {available})' },
  ORDER_CANCELLED_IMMUTABLE: { tr: 'İptal edilmiş bir siparişin durumu değiştirilemez.', en: 'The status of a cancelled order cannot be changed.' },
  ORDER_COMPLETED_TO_PENDING: { tr: 'Tamamlanmış bir sipariş tekrar "Beklemede" (Pending) durumuna alınamaz.', en: 'A completed order cannot be moved back to "Pending".' },
  ORDER_DELETE_ONLY_CANCELLED: { tr: 'Sadece iptal edilmiş siparişler silinebilir.', en: 'Only cancelled orders can be deleted.' },

  // Product
  PRODUCT_NOT_FOUND: { tr: 'Ürün bulunamadı', en: 'Product not found' },
  PRODUCT_NOT_FOUND_NAME: { tr: 'Ürün bulunamadı: {name}', en: 'Product not found: {name}' },
  PRODUCT_NOT_FOUND_ID: { tr: 'Ürün bulunamadı: ID {id}', en: 'Product not found: ID {id}' },
  PRODUCT_SKU_TAKEN: { tr: 'Bu SKU zaten kullanımda: {sku}', en: 'This SKU is already in use: {sku}' },
  PRODUCT_INVALID_CATEGORY: { tr: 'Geçersiz kategori: {category}', en: 'Invalid category: {category}' },
  PRODUCT_INVALID_SUPPLIER: { tr: 'Geçersiz tedarikçi: ID {id}', en: 'Invalid supplier: ID {id}' },
  PRODUCT_DUPLICATE_SKUS_IN_PAYLOAD: { tr: "Yüklenen veri içerisinde yinelenen SKU'lar bulundu: {skus}", en: 'Duplicate SKUs found in the uploaded data: {skus}' },
  PRODUCT_SKUS_EXIST: { tr: "Sistemde zaten kayıtlı olan SKU'lar bulundu: {skus}", en: 'SKUs already registered in the system: {skus}' },

  // Purchase order
  PO_NUMBER_GENERATION_FAILED: { tr: 'Benzersiz satın alma sipariş numarası üretilemedi, lütfen tekrar deneyin.', en: 'Could not generate a unique purchase order number, please try again.' },
  PO_SUPPLIER_REQUIRED: { tr: "Tedarikçi ID'si (supplierId) belirtilmelidir.", en: 'Supplier ID (supplierId) is required.' },
  PO_SUPPLIER_NOT_FOUND: { tr: 'Tedarikçi bulunamadı: ID {id}', en: 'Supplier not found: ID {id}' },
  PO_ITEMS_REQUIRED: { tr: 'Sipariş kalemi (items) belirtilmelidir.', en: 'Order items (items) are required.' },
  PO_ITEM_PRODUCT_REQUIRED: { tr: "Sipariş kalemi için ürün ID'si (productId) belirtilmelidir.", en: 'Product ID (productId) is required for each order item.' },
  PO_RECEIVED_IMMUTABLE: { tr: 'Teslim alınmış bir satın alma siparişinin durumu değiştirilemez.', en: 'The status of a received purchase order cannot be changed.' },
  PO_CANCELLED_IMMUTABLE: { tr: 'İptal edilmiş bir satın alma siparişinin durumu değiştirilemez.', en: 'The status of a cancelled purchase order cannot be changed.' },
  PO_UPDATE_ONLY_DRAFT: { tr: 'Sadece "Taslak" (Draft) durumundaki satın alma siparişleri güncellenebilir.', en: 'Only purchase orders in "Draft" status can be updated.' },
  PO_DELETE_ONLY_DRAFT: { tr: 'Sadece "Taslak" (Draft) durumundaki satın alma siparişleri silinebilir.', en: 'Only purchase orders in "Draft" status can be deleted.' },

  // Stock count / stock
  STOCK_COUNT_ITEMS_REQUIRED: { tr: 'items array zorunludur.', en: 'The items array is required.' },
  STOCK_COUNT_IN_PROGRESS: { tr: 'Halihazırda devam eden bir sayım seansı bulunmaktadır.', en: 'A stock count session is already in progress.' },
  STOCK_INSUFFICIENT_BY_WAREHOUSE: { tr: 'Depo bazında yeterli stok bulunamadı. Eksik: {missing} adet.', en: 'Not enough stock across warehouses. Missing: {missing} units.' },

  // Supplier
  SUPPLIER_NAME_TAKEN: { tr: 'Bu isimde bir tedarikçi zaten mevcut: {name}', en: 'A supplier with this name already exists: {name}' },
  SUPPLIER_EMAIL_TAKEN: { tr: 'Bu e-posta adresine sahip bir tedarikçi zaten mevcut: {email}', en: 'A supplier with this email already exists: {email}' },
  SUPPLIER_HAS_ACTIVE_PO: { tr: 'Bu tedarikçiye ait aktif satın alma siparişi bulunduğundan silinemez.', en: 'This supplier cannot be deleted because it has active purchase orders.' },

  // Warehouse
  WAREHOUSE_NAME_TAKEN: { tr: 'Bu isimde bir depo zaten mevcut: {name}', en: 'A warehouse with this name already exists: {name}' },
  WAREHOUSE_CODE_TAKEN: { tr: 'Bu kodda bir depo zaten mevcut: {code}', en: 'A warehouse with this code already exists: {code}' },
  WAREHOUSE_HAS_STOCK: { tr: 'Bu depoda aktif stok bulunduğundan silinemez. Ürün: {product} ({qty} adet)', en: 'This warehouse cannot be deleted because it has active stock. Product: {product} ({qty} units)' },
  WAREHOUSE_INSUFFICIENT_STOCK: { tr: '{warehouse} deposunda yeterli stok yok. Mevcut: {available}, İstenen: {requested}', en: 'Not enough stock in warehouse {warehouse}. Available: {available}, Requested: {requested}' },

  // Barcodes / units / lots / serials
  BARCODE_INVALID_FORMAT: { tr: 'Geçersiz barkod biçimi: {code} ({type})', en: 'Invalid barcode format: {code} ({type})' },
  BARCODE_INVALID_CHECKSUM: { tr: 'Barkod kontrol basamağı hatalı: {code} ({type})', en: 'Invalid barcode check digit: {code} ({type})' },
  BARCODE_TAKEN: { tr: 'Bu barkod zaten kullanımda: {code}', en: 'This barcode is already in use: {code}' },
  BARCODE_DUPLICATE_IN_PAYLOAD: { tr: 'Aynı barkod birden fazla kez girildi: {code}', en: 'The same barcode was entered more than once: {code}' },
  PRODUCT_BARCODE_NOT_FOUND: { tr: 'Barkoda ait ürün bulunamadı: {code}', en: 'No product found for barcode: {code}' },
  UNIT_NOT_FOUND: { tr: 'Birim bulunamadı.', en: 'Unit not found.' },
  UNIT_CODE_REQUIRED: { tr: 'Birim kodu boş olamaz.', en: 'Unit code is required.' },
  UNIT_NAME_REQUIRED: { tr: 'Birim adı boş olamaz.', en: 'Unit name is required.' },
  UNIT_CODE_PATTERN: { tr: 'Birim kodu yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir.', en: 'Unit code may only contain letters, digits, dots, underscores and dashes.' },
  UNIT_CODE_TAKEN: { tr: 'Bu birim kodu zaten kullanımda: {code}', en: 'This unit code is already in use: {code}' },
  UNIT_STANDARD_CODE_LOCKED: { tr: 'Standart birimlerin kodu değiştirilemez.', en: 'The code of a standard unit cannot be changed.' },
  UNIT_STANDARD_DELETE: { tr: 'Standart birimler silinemez.', en: 'Standard units cannot be deleted.' },
  UNIT_IN_USE: { tr: 'Bu birim ürünlerde kullanıldığı için silinemez.', en: 'This unit cannot be deleted because products use it.' },
  UNIT_NOT_FOR_PRODUCT: { tr: '{name} ürünü için bu birim tanımlı değil.', en: 'This unit is not defined for product {name}.' },
  UNIT_FACTOR_INVALID: { tr: 'Birim çarpanı 0\'dan büyük olmalıdır.', en: 'Unit factor must be greater than 0.' },
  UNIT_DUPLICATE: { tr: 'Aynı birim bir ürüne birden fazla eklenemez.', en: 'The same unit cannot be added to a product twice.' },
  UNIT_BASE_AS_ALTERNATE: { tr: 'Temel birim alternatif birim olarak eklenemez.', en: 'The base unit cannot also be an alternate unit.' },
  UNIT_QUANTITY_NOT_INTEGRAL: { tr: '{name}: {unit} cinsinden miktar tam sayı temel birime karşılık gelmelidir.', en: '{name}: the quantity in {unit} must convert to a whole number of base units.' },
  PRODUCT_TRACKED_QTY_LOCKED: { tr: '{name} lot/seri takipli; stok yalnızca satın alma teslimi, sipariş, transfer veya sayım ile değişir.', en: '{name} is lot/serial tracked; its stock only changes through PO receipts, orders, transfers or stock counts.' },
  PRODUCT_TRACKING_CHANGE_STOCK: { tr: 'Takip türü yalnızca stok 0 iken değiştirilebilir ({name}).', en: 'Tracking type can only be changed while stock is 0 ({name}).' },
  PRODUCT_TRACKING_INVALID: { tr: 'Geçersiz takip türü.', en: 'Invalid tracking type.' },
  LOT_NUMBER_REQUIRED: { tr: '{name} için lot numarası girilmelidir.', en: 'A lot number is required for {name}.' },
  LOT_QUANTITY_INVALID: { tr: 'Lot miktarı pozitif tam sayı olmalıdır ({lot}).', en: 'Lot quantity must be a positive whole number ({lot}).' },
  LOT_EXPIRY_REQUIRED: { tr: '{name} için son kullanma tarihi zorunludur (lot {lot}).', en: 'An expiry date is required for {name} (lot {lot}).' },
  LOT_EXPIRY_INVALID: { tr: 'Geçersiz son kullanma tarihi (lot {lot}).', en: 'Invalid expiry date (lot {lot}).' },
  LOT_EXPIRY_CONFLICT: { tr: 'Lot {lot} farklı bir son kullanma tarihiyle zaten kayıtlı.', en: 'Lot {lot} already exists with a different expiry date.' },
  LOT_QUANTITY_MISMATCH: { tr: '{name}: lot miktarları toplamı {actual}, beklenen {expected}.', en: '{name}: lot quantities add up to {actual}, expected {expected}.' },
  LOT_NOT_FOUND: { tr: 'Lot bulunamadı: {lot}', en: 'Lot not found: {lot}' },
  LOT_WRONG_WAREHOUSE: { tr: 'Lot {lot} seçilen depoda değil.', en: 'Lot {lot} is not in the selected warehouse.' },
  LOT_INSUFFICIENT: { tr: 'Lot {lot} için yetersiz stok. Mevcut: {available}, İstenen: {requested}', en: 'Not enough stock in lot {lot}. Available: {available}, Requested: {requested}' },
  LOT_INSUFFICIENT_AUTO: { tr: '{name}: kullanılabilir (süresi geçmemiş) lot stoğu yetersiz. Mevcut: {available}, İstenen: {requested}', en: '{name}: not enough usable (unexpired) lot stock. Available: {available}, Requested: {requested}' },
  SERIAL_DUPLICATE_INPUT: { tr: 'Seri numarası birden fazla kez girildi: {serial}', en: 'Serial number entered more than once: {serial}' },
  SERIAL_COUNT_MISMATCH: { tr: '{name}: {expected} seri numarası gerekli, {actual} girildi.', en: '{name}: {expected} serial numbers required, {actual} given.' },
  SERIAL_ALREADY_IN_STOCK: { tr: 'Seri numarası zaten stokta: {serial}', en: 'Serial number is already in stock: {serial}' },
  SERIAL_NOT_IN_STOCK: { tr: 'Seri numarası stokta değil: {serial}', en: 'Serial number is not in stock: {serial}' },
  SERIAL_WRONG_WAREHOUSE: { tr: 'Seri numarası seçilen depoda değil: {serial}', en: 'Serial number is not in the selected warehouse: {serial}' },
  SERIAL_INSUFFICIENT: { tr: '{name}: stokta yeterli seri numaralı ürün yok. Mevcut: {available}, İstenen: {requested}', en: '{name}: not enough serialized units in stock. Available: {available}, Requested: {requested}' },
  TRACKING_RESTORE_UNAVAILABLE: { tr: '{name} için lot/seri bilgisi bulunamadığından stok geri alınamadı.', en: 'Stock for {name} cannot be restored because its lot/serial details are missing.' },
  PO_RECEIPT_ITEM_NOT_FOUND: { tr: 'Teslim alma satırı siparişte bulunamadı: {id}', en: 'Receipt line not found in the purchase order: {id}' },

  // DTO validation ({property} and decorator constraints such as {min} are available)
  VALIDATION_CATEGORY_NAME_REQUIRED: { tr: 'Kategori adı boş olamaz.', en: 'Category name is required.' },
  VALIDATION_COUNTRY_CODE: { tr: 'Geçerli bir ülke kodu girin (ör. TR, US).', en: 'Enter a valid country code (e.g. TR, US).' },
  VALIDATION_LANGUAGE: { tr: 'Dil "tr" veya "en" olmalıdır.', en: 'Language must be "tr" or "en".' },
  VALIDATION_CURRENCY_CODE: { tr: 'Geçerli bir para birimi kodu girin (ör. TRY, USD).', en: 'Enter a valid currency code (e.g. TRY, USD).' },
  VALIDATION_TIMEZONE: { tr: 'Geçerli bir saat dilimi girin (ör. Europe/Istanbul).', en: 'Enter a valid time zone (e.g. Europe/Istanbul).' },
  VALIDATION_COMPANY_NAME_REQUIRED: { tr: 'Şirket adı boş olamaz.', en: 'Company name is required.' },
  VALIDATION_USERNAME_REQUIRED: { tr: 'Kullanıcı adı boş olamaz.', en: 'Username is required.' },
  VALIDATION_USERNAME_MIN: { tr: 'Kullanıcı adı en az {min} karakter olmalıdır.', en: 'Username must be at least {min} characters.' },
  VALIDATION_USERNAME_PATTERN: { tr: 'Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.', en: 'Username may only contain letters, digits, dots, hyphens and underscores.' },
  VALIDATION_PASSWORD_REQUIRED: { tr: 'Şifre boş olamaz.', en: 'Password is required.' },
  VALIDATION_PASSWORD_MIN: { tr: 'Şifre en az {min} karakter olmalıdır.', en: 'Password must be at least {min} characters.' },
  VALIDATION_CURRENT_PASSWORD_REQUIRED: { tr: 'Mevcut şifre boş olamaz.', en: 'Current password is required.' },
  VALIDATION_NEW_PASSWORD_REQUIRED: { tr: 'Yeni şifre boş olamaz.', en: 'New password is required.' },
  VALIDATION_NEW_PASSWORD_MIN: { tr: 'Yeni şifre en az {min} karakter olmalıdır.', en: 'New password must be at least {min} characters.' },
  VALIDATION_FULL_NAME_REQUIRED: { tr: 'Ad soyad boş olamaz.', en: 'Full name is required.' },
  VALIDATION_EMAIL: { tr: 'Geçerli bir e-posta adresi girin.', en: 'Enter a valid email address.' },
  VALIDATION_ROLE_REQUIRED: { tr: 'Rol boş olamaz.', en: 'Role is required.' },
  VALIDATION_PRODUCT_ID_REQUIRED: { tr: 'Ürün ID zorunludur.', en: 'Product ID is required.' },
  VALIDATION_PRODUCT_NAME_REQUIRED: { tr: 'Ürün adı boş olamaz.', en: 'Product name is required.' },
  VALIDATION_ITEM_PRODUCT_NAME_REQUIRED: { tr: 'Ürün adı zorunludur.', en: 'Product name is required.' },
  VALIDATION_ITEM_QUANTITY_INT: { tr: 'Ürün adedi tam sayı olmalıdır.', en: 'Item quantity must be an integer.' },
  VALIDATION_ITEM_QUANTITY_MIN: { tr: 'Ürün adedi en az {min} olmalıdır.', en: 'Item quantity must be at least {min}.' },
  VALIDATION_CUSTOMER_NAME_REQUIRED: { tr: 'Müşteri adı zorunludur.', en: 'Customer name is required.' },
  VALIDATION_ORDER_STATUS_REQUIRED: { tr: 'Sipariş durumu zorunludur.', en: 'Order status is required.' },
  VALIDATION_SKU_REQUIRED: { tr: 'SKU kodu boş olamaz.', en: 'SKU is required.' },
  VALIDATION_CATEGORY_REQUIRED: { tr: 'Kategori boş olamaz.', en: 'Category is required.' },
  VALIDATION_PRICE_NUMBER: { tr: 'Fiyat geçerli bir sayı olmalıdır.', en: 'Price must be a valid number.' },
  VALIDATION_PRICE_MIN: { tr: 'Fiyat en az {min} olmalıdır.', en: 'Price must be at least {min}.' },
  VALIDATION_QUANTITY_INT: { tr: 'Miktar bir tam sayı olmalıdır.', en: 'Quantity must be an integer.' },
  VALIDATION_QUANTITY_MIN: { tr: 'Miktar en az {min} olmalıdır.', en: 'Quantity must be at least {min}.' },
  VALIDATION_MIN_QUANTITY_INT: { tr: 'Minimum miktar bir tam sayı olmalıdır.', en: 'Minimum quantity must be an integer.' },
  VALIDATION_MIN_QUANTITY_MIN: { tr: 'Minimum miktar en az {min} olmalıdır.', en: 'Minimum quantity must be at least {min}.' },
  VALIDATION_IDS_ARRAY: { tr: 'IDs bir dizi olmalıdır.', en: 'IDs must be an array.' },
  VALIDATION_IDS_MIN: { tr: 'En az bir ID seçilmelidir.', en: 'At least one ID must be selected.' },
  VALIDATION_IDS_STRING: { tr: 'Her bir ID string olmalıdır.', en: 'Each ID must be a string.' },
  VALIDATION_SUPPLIER_ID_REQUIRED: { tr: 'Tedarikçi ID zorunludur.', en: 'Supplier ID is required.' },
  VALIDATION_SUPPLIER_NAME_REQUIRED: { tr: 'Tedarikçi adı boş olamaz.', en: 'Supplier name is required.' },
  VALIDATION_WAREHOUSE_NAME_REQUIRED: { tr: 'Depo adı boş olamaz.', en: 'Warehouse name is required.' },
  VALIDATION_WAREHOUSE_CODE_REQUIRED: { tr: 'Depo kodu boş olamaz.', en: 'Warehouse code is required.' },
  VALIDATION_FAILED: { tr: 'Geçersiz istek parametreleri.', en: 'Invalid request parameters.' },
  VALIDATION_DATE: { tr: 'Geçerli bir tarih girin (YYYY-AA-GG).', en: 'Enter a valid date (YYYY-MM-DD).' },
  VALIDATION_CUSTOMER_TYPE: { tr: 'Müşteri tipi "individual" veya "company" olmalıdır.', en: 'Customer type must be "individual" or "company".' },
  VALIDATION_TAX_NAME_REQUIRED: { tr: 'Vergi adı boş olamaz.', en: 'Tax name is required.' },
  VALIDATION_TAX_RATE_NUMBER: { tr: 'Vergi oranı geçerli bir sayı olmalıdır.', en: 'Tax rate must be a valid number.' },
  VALIDATION_TAX_RATE_RANGE: { tr: 'Vergi oranı 0 ile 100 arasında olmalıdır.', en: 'Tax rate must be between 0 and 100.' },
  VALIDATION_EXCHANGE_RATE_POSITIVE: { tr: 'Kur pozitif bir sayı olmalıdır.', en: 'Exchange rate must be a positive number.' },

  // Warehouse stock / transfer
  WAREHOUSE_NOT_FOUND: { tr: 'Depo bulunamadı.', en: 'Warehouse not found.' },
  WAREHOUSE_NONE_ACTIVE: { tr: 'Stok işlemi için en az bir aktif depo gereklidir.', en: 'At least one active warehouse is required for stock operations.' },
  TRANSFER_QUANTITY_INVALID: { tr: 'Transfer miktarı pozitif bir tam sayı olmalıdır.', en: 'Transfer quantity must be a positive integer.' },
  TRANSFER_SAME_WAREHOUSE: { tr: 'Kaynak ve hedef depo aynı olamaz.', en: 'Source and target warehouse must differ.' },

  // Customers / orders
  CUSTOMER_NOT_FOUND: { tr: 'Müşteri bulunamadı.', en: 'Customer not found.' },
  ORDER_ITEMS_REQUIRED: { tr: 'Sipariş en az bir ürün içermelidir.', en: 'An order must contain at least one item.' },

  // Tax / currency
  TAX_RATE_NOT_FOUND: { tr: 'Vergi oranı bulunamadı.', en: 'Tax rate not found.' },
  TAX_RATE_DEFAULT_DELETE: { tr: 'Varsayılan vergi oranı silinemez. Önce başka bir oranı varsayılan yapın.', en: 'The default tax rate cannot be deleted. Make another rate the default first.' },
  EXCHANGE_RATE_MISSING: { tr: '{from} → {to} için döviz kuru tanımlı değil. Ayarlar > Döviz Kurları bölümünden ekleyin.', en: 'No exchange rate defined for {from} → {to}. Add one under Settings > Exchange rates.' },
  EXCHANGE_RATE_NOT_FOUND: { tr: 'Döviz kuru bulunamadı.', en: 'Exchange rate not found.' },
  EXCHANGE_RATE_SAME_CURRENCY: { tr: 'Kaynak ve hedef para birimi aynı olamaz.', en: 'Base and quote currency must differ.' },
  EXCHANGE_RATE_DUPLICATE: { tr: 'Bu para birimi çifti için o tarihte zaten bir kur var.', en: 'A rate for this currency pair already exists on that date.' },
  // API keys / webhooks / import
  API_KEY_INVALID: { tr: 'Geçersiz, iptal edilmiş veya süresi dolmuş API anahtarı.', en: 'Invalid, revoked or expired API key.' },
  API_KEY_SCOPE_DENIED: { tr: 'API anahtarının bu işlem için yetkisi yok ({method} {resource}).', en: 'The API key is not allowed to do this ({method} {resource}).' },
  API_KEY_NOT_FOUND: { tr: 'API anahtarı bulunamadı.', en: 'API key not found.' },
  API_KEY_SCOPES_REQUIRED: { tr: 'En az bir kaynak için yetki seçmelisiniz.', en: 'Select access for at least one resource.' },
  API_KEY_EXPIRY_INVALID: { tr: 'Son kullanma tarihi gelecekte olmalıdır.', en: 'Expiry date must be in the future.' },
  VALIDATION_API_KEY_NAME_REQUIRED: { tr: 'Anahtar adı zorunludur.', en: 'Key name is required.' },
  WEBHOOK_URL_INVALID: { tr: 'Geçersiz webhook adresi (yalnızca http/https).', en: 'Invalid webhook URL (http/https only).' },
  WEBHOOK_URL_BLOCKED: { tr: 'Bu adres engellendi: yerel / özel ağ adreslerine webhook gönderilemez.', en: 'URL blocked: webhooks cannot target localhost or private network addresses.' },
  WEBHOOK_EVENT_INVALID: { tr: 'Geçersiz olay: {events}', en: 'Invalid event: {events}' },
  WEBHOOK_EVENTS_REQUIRED: { tr: 'En az bir olay seçmelisiniz.', en: 'Select at least one event.' },
  WEBHOOK_NOT_FOUND: { tr: 'Webhook bulunamadı.', en: 'Webhook not found.' },
  WEBHOOK_DELIVERY_NOT_FOUND: { tr: 'Webhook gönderimi bulunamadı.', en: 'Webhook delivery not found.' },
  IMPORT_EMPTY: { tr: 'CSV dosyası boş.', en: 'The CSV file is empty.' },
  IMPORT_MISSING_COLUMNS: { tr: 'Eksik sütunlar: {columns}', en: 'Missing columns: {columns}' },
  IMPORT_TOO_MANY_ROWS: { tr: 'En fazla {max} satır içe aktarılabilir.', en: 'At most {max} rows can be imported.' },
  IMPORT_DUPLICATE_ROW: { tr: '"{value}" dosyada tekrar ediyor (satır {row}).', en: '"{value}" is duplicated in the file (row {row}).' },
};

export type MessageParams = Record<string, string | number | undefined | null>;

/** Resolve the response language from an Accept-Language header (default: tr). */
export function resolveLang(header?: string | string[] | null): Lang {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return DEFAULT_LANG;
  const first = raw.split(',')[0].trim().toLowerCase();
  return first.startsWith('en') ? 'en' : DEFAULT_LANG;
}

export function hasMessage(code: unknown): code is string {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, code);
}

/** Translate a code; unknown codes / plain messages pass through unchanged. */
export function translate(code: string, lang: Lang = DEFAULT_LANG, params: MessageParams = {}): string {
  const template = hasMessage(code) ? MESSAGES[code][lang] ?? MESSAGES[code][DEFAULT_LANG] : code;
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    params[key] !== undefined && params[key] !== null ? String(params[key]) : m,
  );
}
