# GİB e-Belge paketleri: güncelleme kontrol listesi

Kaynaklar `../MANIFEST.json` içinde. GİB `Degisim Tablosu.txt` (ubltr-1.2.1/Degisim-Tablosu.txt) ve şematron `History.txt` dosyalarındaki her yeni satır için:

1. ebelge.gib.gov.tr > e-Fatura / e-İrsaliye teknik kılavuzlarından güncel `UBL-TR1.2.1_Paketi.zip` ve `e-FaturaPaketi.zip` indirilir.
2. Değişen XSD dosyaları `ubltr-1.2.1/xsdrt/`, şematron dosyaları (`UBL-TR_Main_Schematron.xml`, `UBL-TR_Common_Schematron.xml`, `UBL-TR_Codelist.xml`, `History.txt`) `schematron/` altına kopyalanır (UTF-8).
3. `node backend/tools/ebelge/build-ebelge-assets.js` çalıştırılır (şematron SEF'i ve MANIFEST.json yeniden üretilir).
4. `npx nx test backend` — altın (golden) UBL testleri yeni şematrondan geçmeli; geçmiyorsa builder güncellenir, gerekiyorsa `UPDATE_GOLDEN=1` ile altın dosyalar gözden geçirilerek yenilenir.
5. Kod listesi değişiklikleri (istisna / tevkifat / birim kodları) `tax_exemption_codes`, `withholding_codes`, `UNECE_STANDARD_UNIT_MAP` ile karşılaştırılır; fark varsa migration ile eklenir.
6. Yeni Türkçe şematron mesajları için `shared/ebelge/validation/schematron-messages.ts` içine İngilizce karşılık eklenir.

Son kontrol: şematron sürümü 20260701, UBL-TR paketi 1.2.1, Kod Listeleri kılavuzu V1.43 (15.10.2026).
