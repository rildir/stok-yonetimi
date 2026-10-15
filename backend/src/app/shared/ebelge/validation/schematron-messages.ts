/**
 * English renderings of the GİB schematron messages (the official texts are Turkish only). Each
 * pattern matches the Turkish text of an assertion; `$1`... are the values the schematron printed.
 * Messages without a pattern get a generic English text with the failing location.
 */
const PATTERNS: [RegExp, string][] = [
  [/^Geçersiz plaka değeri : '(.*)'/, "Invalid vehicle plate '$1'."],
  [/^Geçersiz dorse plaka değeri : '(.*)'/, "Invalid trailer plate '$1'."],
  [/^Para birimi TRY olmayan belgelerde kur bilgisi zorunludur/, 'An exchange rate (PricingExchangeRate) is required when the currency is not TRY.'],
  [/^Geçersiz cbc:ID elemanı değeri\. cbc:ID elemanı 16 haneli olmalıdır/, 'The document number must be 16 characters long.'],
  [/^Geçersiz cbc:ID elemanı değeri\. cbc:ID elemanı 'ABC2009123456789' formatında olmalıdır/, 'The document number must have the format ABC2026000000001 (3-character series, year, 9-digit sequence).'],
  [/^Geçersiz cbc:ID elemanı değeri\. cbc:ID elemanı boş olamaz/, 'The ID element must not be empty.'],
  [/^cac:Item elemanı boş değer içermeyen cbc:Name elemanı içermelidir/, 'Every line item needs a name.'],
  [/^Uyumsuz vergi tipi yüzdesi: '(.*)' vergi tipinin yüzdesi '(.*)' olamaz/, "Tax type $1 cannot have the rate $2."],
  [/^Geçersiz unitCode niteliği : '(.*)'/, "Invalid unit code '$1' (UN/ECE Rec. 20 code list)."],
  [/^Geçersiz schemeID niteliği : '(.*)'/, "Invalid identifier scheme '$1'."],
  [/^Geçersiz currencyID niteliği : '(.*)'/, "Invalid currency code '$1'."],
  [/^Geçersiz mimeCode niteliği : '(.*)'/, "Invalid attachment MIME type '$1'."],
  [/^schemeID niteliği değeri 'TCKN' olması durumunda cac:Person elemanı bulunmalıdır/, 'A party identified by TCKN needs a person (first and family name).'],
  [/^cac:PartyName elemanı geçerli ve boş değer içermeyen cbc:Name elemanı içermelidir/, 'The party name must not be empty.'],
  [/^schemeID niteliği değeri 'VKN' olması durumunda cac:PartyName elemanı bulunmalıdır/, 'A party identified by VKN needs a party name (trade name).'],
  [/^schemeID niteliği değeri 'VKN' ve ya 'TCKN' olan bir tane cbc:ID elemanı bulunmalıdır/, 'Each party needs exactly one VKN or TCKN identifier.'],
  [/^schemeID niteliği değeri hem 'VKN' hem de 'TCKN'/, 'A party cannot have both a VKN and a TCKN identifier.'],
  [/^cbc:ID elemanının schemeID niteliği değeri 'VKN' olması durumunda .* 10 haneli/, 'A VKN must have 10 digits.'],
  [/^cbc:ID elemanının schemeID niteliği değeri 'TCKN' olması durumunda .* 11 haneli/, 'A TCKN must have 11 digits.'],
  [/^cac:Person elemanı geçerli ve boş değer içermeyen cbc:FirstName ve cbc:FamilyName/, 'The person must have a first name and a family name.'],
  [/^Geçersiz +cbc:TaxTypeCode değeri : '(.*)'/, "Invalid tax type code '$1'."],
  [/^Geçersiz cac:TaxCategory\/cac:TaxScheme\/cbc:TaxTypeCode elemanı : '(.*)'/, "Invalid tax type code '$1'."],
  [/Vergi miktarı 0 olan 0015 vergi kodlu KDV için cbc:TaxExemptionReason/, 'VAT (0015) with a zero amount needs an exemption reason (code and text).'],
  [/^Geçersiz cbc:TaxExemptionReasonCode niteliği : '(.*)'/, "Invalid or missing VAT exemption code '$1'."],
  [/cbc:TaxExemptionReason\(vergi istisna muhafiyet sebebi\) elemanı boş değer içermemelidir/, 'The VAT exemption reason must not be empty.'],
  [/^Geçersiz cbc:InvoiceTypeCode elemanı değeri : '(.*)'/, "Invalid invoice type '$1'."],
  [/^Geçersiz cbc:ProfileID elemanı değeri : '(.*)'\. Geçerli cbc:ProfileID değerleri için (\w+)/, "Invalid scenario (ProfileID) '$1' (list $2)."],
  [/^Geçersiz cbc:CustomizationID elemanı değeri : '(.*)'/, "Invalid CustomizationID '$1' (TR1.2 or TR1.2.1)."],
  [/^Geçersiz cbc:UBLVersionID elemanı değeri : '(.*)'/, "Invalid UBLVersionID '$1' (must be 2.1)."],
  [/^Geçersiz cbc:CopyIndicator elemanı değeri/, "CopyIndicator must be 'false'."],
  [/^Geçersiz cbc:IssueDate değeri : '(.*)' cbc:IssueDate alanı günün tarihinden ileri/, "The issue date $1 is in the future."],
  [/^Geçersiz cbc:IssueDate değeri : '(.*)' cbc:IssueDate alanı 01\.01\.2005/, 'The issue date $1 is before 01.01.2005.'],
  [/^Geçersiz cbc:DespatchAdviceTypeCode elemanı değeri : '(.*)'/, "Invalid despatch advice type '$1' (SEVK or MATBUDAN)."],
  [/^Geçersiz cbc:ReceiptAdviceTypeCode elemanı değeri : '(.*)'/, "Invalid receipt advice type '$1'."],
  [/^Geçersiz cbc:ActualDespatchDate değeri : '(.*)'/, "Invalid actual despatch date '$1' (YYYY-MM-DD)."],
  [/^cbc:ActualDespatchDate elemanı geçerli/, 'The actual despatch date is required.'],
  [/^cbc:ActualDespatchTime elemanı geçerli/, 'The actual despatch time is required.'],
  [/DeliveryAddress\/cbc:CitySubdivisionName elemanı içermelidir/, 'The delivery address needs a district (ilçe).'],
  [/DeliveryAddress\/cbc:CityName elemanı içermelidir/, 'The delivery address needs a province (il).'],
  [/DeliveryAddress\/cac:Country\/cbc:Name elemanı içermelidir/, 'The delivery address needs a country.'],
  [/^Hatalı Posta Kodu :'(.*)'/, "Invalid postal code '$1' in the delivery address (5 digits starting with the province code)."],
  [/cac:DriverPerson veya cac:Shipment\/cac:Delivery\/cac:CarrierParty alanlarından en az birini/, 'A despatch advice needs a driver or a carrier party.'],
  [/İrsaliyede şoför bilgisi olduğu durumda +plaka bilgisi/, 'A despatch advice with a driver needs the vehicle plate.'],
  [/DriverPerson\/cbc:FirstName alanı dolu/, "The driver's first name is required."],
  [/DriverPerson\/cbc:FamilyName alanı dolu/, "The driver's family name is required."],
  [/DriverPerson\/cbc:NationalityID alanı dolu/, "The driver's TCKN is required."],
  [/^DespatchAdviceTypeCode değeri 'MATBUDAN' iken/, 'A MATBUDAN despatch must reference the paper despatch (number and date).'],
  [/cbc:DeliveredQuantity elemanı/, 'Every despatch line needs a delivered quantity with a unit code.'],
  [/cbc:InvoicedQuantity elemanı geçerli ve boş değer içermeyen bir adet unitCode/, 'Every invoice line quantity needs a unit code.'],
  [/^Geçersiz cbc:LicensePlateID schemeID niteliği : '(.*)'/, "Invalid plate scheme '$1'."],
  [/^Geçersiz TransportEquipment ID schemeID niteliği : '(.*)'/, "Invalid trailer plate scheme '$1'."],
  [/^cac:Signature elemanı içerisindeki cbc:ID elemanının schemeID niteliği değeri 'VKN_TCKN'/, "The signature ID scheme must be 'VKN_TCKN'."],
  [/^schemeID niteliği 'VKN_TCKN' ye eşit olan elemanın uzunluğu/, 'The signatory VKN / TCKN must have 10 or 11 digits.'],
  [/^Uygulama yanıtı için cac:Signature elemanı bulunmalıdır/, 'An application response needs a signature (cac:Signature).'],
  [/^Uygulama yanıtı için cbc:ProfileID +elemanı değeri 'TICARIFATURA' veya 'IHRACAT'/, 'Application responses exist only for TICARIFATURA and IHRACAT invoices.'],
  [/^Geçersiz cbc:ResponseCode elemanı değeri '(.*)'/, "Invalid response code '$1' (KABUL / RED)."],
  [/^Fatura tipi IADE iken fatura profili sadece/, 'A return (IADE) invoice can only be sent as TEMELFATURA or EARSIVFATURA.'],
  [/IADE, TEVKIFATIADE ve YTBIADE fatura tiplerinde iade bilgilerini/, 'A return invoice must reference each returned invoice (BillingReference, DocumentTypeCode IADE, 16-character number).'],
  [/cac:WithholdingTaxTotal elemanı geçerli ve boş değer içermeyen/, 'Withholding totals need the withholding code and rate.'],
  [/^Geçersiz cac:PricingExchangeRate\/cbc:CalculationRate/, 'The exchange rate may have at most 15 integer and 6 decimal digits.'],
  [/^Geçersiz <sch:name\/> elemanı değeri\. <sch:name\/> elemanı noktadan önce en fazla 15/, 'Amounts may have at most 15 integer and 2 decimal digits.'],
  [/elemanı UUID formatında olmalıdır/, 'The ETTN must be a UUID.'],
  [/^Geçersiz +cbc:PaymentMeansCode değeri : '(.*)'/, "Invalid payment means code '$1'."],
  [/IHRACAT iken, schemeID özelliği PARTYTYPE olan ve değeri EXPORT/, 'An export (IHRACAT) invoice needs the foreign buyer (BuyerCustomerParty with PARTYTYPE=EXPORT).'],
  [/IHRACAT iken, cac:BuyerCustomerParty\/cac:Party\/cac:PartyLegalEntity\/cbc:RegistrationName/, "An export invoice needs the foreign buyer's registered name."],
  [/IHRACAT iken, cac:AccountingSupplierParty\/cac:Party\/cac:PartyTaxScheme/, "An export invoice needs the seller's tax office."],
  [/IHRACAT iken, .*RequiredCustomsID/, 'Every export line needs the GTİP (customs tariff) code.'],
  [/IHRACAT iken, .*INCOTERMS/, 'Export lines need a valid INCOTERMS delivery term.'],
  [/IHRACAT iken, .*TransportModeCode/, 'An export invoice needs the transport mode.'],
  [/IHRACAT iken Invoice ve cac:InvoiceLine elemanlarından en az bir tanesi cac:Delivery\/cac:DeliveryAddress/, 'An export invoice needs a delivery address.'],
  [/^Vergi istisna muafiyet kodu 555 olduğu durumda KDV 0 geçilemez/, 'Exemption code 555 cannot be used with 0% VAT.'],
  [/^(.*) senaryolu (.*) fatura tipinde '555' vergi muafiyet kodu kullanılamaz/, "Exemption code 555 is not allowed for scenario $1, type $2."],
];

export function englishSchematronMessage(tr: string, location?: string | null): string {
  const text = tr.replace(/\s+/g, ' ').trim();
  for (const [re, en] of PATTERNS) {
    const m = re.exec(text);
    if (m) return en.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
  }
  return `UBL-TR schematron rule failed${location ? ` at ${shortLocation(location)}` : ''}: ${text}`;
}

/** "/*:Invoice[namespace-uri()=...][1]/*:InvoiceLine[...][2]/..." -> "Invoice/InvoiceLine[2]/..." */
export function shortLocation(location: string): string {
  return location
    .replace(/\*:([A-Za-z]+)\[namespace-uri\(\)='[^']*'\]/g, '$1')
    .replace(/\*\[local-name\(\)='([A-Za-z]+)'\]/g, '$1')
    .replace(/Q\{[^}]*\}/g, '')
    .replace(/\[1\]/g, '')
    .replace(/^\//, '');
}

export const SCHEMATRON_TRANSLATED_PATTERNS = PATTERNS.length;
