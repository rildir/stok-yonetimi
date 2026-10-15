<?xml version="1.0" encoding="UTF-8"?>
<!--
  Default display template for e-Fatura / e-Arşiv Fatura / e-İrsaliye / İrsaliye Yanıtı (509 V.3-V.4).
  XSLT 1.0 so that every GİB-compatible viewer can render it; it is embedded (base64) in each UBL
  document as AdditionalDocumentReference and used by the server-side renderer (SaxonJS) for the
  HTML / PDF preview. Source of the GİB emblem: GİB UBL-TR 1.2.1 package (general.xslt).
  Generated file: backend/src/assets/ebelge/xslt/edocument.xslt (build-ebelge-assets.js).
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:inv="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:desp="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:recp="urn:oasis:names:specification:ubl:schema:xsd:ReceiptAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  exclude-result-prefixes="inv desp recp cac cbc">

  <xsl:output method="html" encoding="UTF-8" indent="no"/>
  <xsl:decimal-format name="tr" decimal-separator="," grouping-separator="."/>

  <!-- Company logo (data: URI), set per company when the template is embedded -->
  <xsl:param name="logo" select="''"/>
  <!-- QR (karekod) JSON; the renderer replaces the placeholder with an SVG -->
  <xsl:param name="qr" select="''"/>

  <xsl:variable name="emblem" select="'data:image/jpeg;base64,__GIB_EMBLEM__'"/>

  <xsl:template name="money">
    <xsl:param name="v"/>
    <xsl:param name="cur"/>
    <xsl:value-of select="format-number(number($v), '###.##0,00', 'tr')"/>
    <xsl:text> </xsl:text>
    <xsl:choose>
      <xsl:when test="$cur = 'TRY'">TL</xsl:when>
      <xsl:otherwise><xsl:value-of select="$cur"/></xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template name="qty">
    <xsl:param name="v"/>
    <xsl:value-of select="format-number(number($v), '###.##0,###', 'tr')"/>
  </xsl:template>

  <xsl:template name="date">
    <xsl:param name="d"/>
    <xsl:value-of select="concat(substring($d, 9, 2), '-', substring($d, 6, 2), '-', substring($d, 1, 4))"/>
  </xsl:template>

  <xsl:template name="unit">
    <xsl:param name="c"/>
    <xsl:choose>
      <xsl:when test="$c = 'C62' or $c = 'NIU'">Adet</xsl:when>
      <xsl:when test="$c = 'KGM'">Kg</xsl:when>
      <xsl:when test="$c = 'GRM'">g</xsl:when>
      <xsl:when test="$c = 'LTR'">Lt</xsl:when>
      <xsl:when test="$c = 'MLT'">ml</xsl:when>
      <xsl:when test="$c = 'MTR'">m</xsl:when>
      <xsl:when test="$c = 'MTK'">m²</xsl:when>
      <xsl:when test="$c = 'MTQ'">m³</xsl:when>
      <xsl:when test="$c = 'BX'">Kutu</xsl:when>
      <xsl:when test="$c = 'PK' or $c = 'PA'">Paket</xsl:when>
      <xsl:when test="$c = 'PF'">Palet</xsl:when>
      <xsl:when test="$c = 'SET'">Set</xsl:when>
      <xsl:otherwise><xsl:value-of select="$c"/></xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <!-- Party block (seller / buyer / receiver) -->
  <xsl:template name="party">
    <xsl:param name="p"/>
    <xsl:param name="title"/>
    <div class="party">
      <xsl:if test="$title != ''"><div class="party-title"><xsl:value-of select="$title"/></div></xsl:if>
      <div class="party-name">
        <xsl:choose>
          <xsl:when test="$p/cac:PartyName/cbc:Name"><xsl:value-of select="$p/cac:PartyName/cbc:Name"/></xsl:when>
          <xsl:otherwise><xsl:value-of select="concat($p/cac:Person/cbc:FirstName, ' ', $p/cac:Person/cbc:FamilyName)"/></xsl:otherwise>
        </xsl:choose>
      </div>
      <xsl:for-each select="$p/cac:PostalAddress">
        <div>
          <xsl:value-of select="cbc:StreetName"/>
          <xsl:if test="cbc:BuildingNumber != ''"><xsl:text> No:</xsl:text><xsl:value-of select="cbc:BuildingNumber"/></xsl:if>
        </div>
        <div>
          <xsl:if test="cbc:PostalZone != ''"><xsl:value-of select="cbc:PostalZone"/><xsl:text> </xsl:text></xsl:if>
          <xsl:value-of select="cbc:CitySubdivisionName"/> / <xsl:value-of select="cbc:CityName"/>
          <xsl:if test="cac:Country/cbc:Name != 'Türkiye'"><xsl:text> / </xsl:text><xsl:value-of select="cac:Country/cbc:Name"/></xsl:if>
        </div>
      </xsl:for-each>
      <xsl:if test="$p/cac:Contact/cbc:Telephone != ''"><div>Tel: <xsl:value-of select="$p/cac:Contact/cbc:Telephone"/></div></xsl:if>
      <xsl:if test="$p/cac:Contact/cbc:ElectronicMail != ''"><div>E-Posta: <xsl:value-of select="$p/cac:Contact/cbc:ElectronicMail"/></div></xsl:if>
      <xsl:if test="$p/cbc:WebsiteURI != ''"><div>Web: <xsl:value-of select="$p/cbc:WebsiteURI"/></div></xsl:if>
      <xsl:if test="$p/cac:PartyTaxScheme/cac:TaxScheme/cbc:Name != ''"><div>Vergi Dairesi: <xsl:value-of select="$p/cac:PartyTaxScheme/cac:TaxScheme/cbc:Name"/></div></xsl:if>
      <xsl:for-each select="$p/cac:PartyIdentification/cbc:ID">
        <div>
          <xsl:choose>
            <xsl:when test="@schemeID = 'MERSISNO'">MERSİS No</xsl:when>
            <xsl:when test="@schemeID = 'TICARETSICILNO'">Ticaret Sicil No</xsl:when>
            <xsl:otherwise><xsl:value-of select="@schemeID"/></xsl:otherwise>
          </xsl:choose>
          <xsl:text>: </xsl:text><xsl:value-of select="."/>
        </div>
      </xsl:for-each>
    </div>
  </xsl:template>

  <xsl:template name="style">
    <style type="text/css">
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
      .page { max-width: 820px; margin: 0 auto; padding: 16px; }
      .head { display: table; width: 100%; table-layout: fixed; }
      .head > div { display: table-cell; vertical-align: top; }
      .head .mid { text-align: center; width: 150px; }
      .head .right { text-align: right; width: 180px; }
      .emblem { width: 90px; }
      .doc-title { font-size: 15px; font-weight: bold; margin-top: 4px; letter-spacing: .5px; }
      .ministry { font-size: 9px; color: #444; }
      .party { line-height: 1.45; padding: 6px 0; }
      .party-title { font-weight: bold; border-bottom: 1px solid #999; margin-bottom: 4px; }
      .party-name { font-weight: bold; font-size: 12px; }
      .row2 { display: table; width: 100%; margin-top: 10px; table-layout: fixed; }
      .row2 > div { display: table-cell; vertical-align: top; }
      .row2 > div + div { padding-left: 16px; }
      table.info { border-collapse: collapse; margin-left: auto; }
      table.info td { border: 1px solid #999; padding: 2px 6px; }
      table.info td:first-child { font-weight: bold; white-space: nowrap; }
      table.lines { width: 100%; border-collapse: collapse; margin-top: 12px; }
      table.lines th, table.lines td { border: 1px solid #999; padding: 3px 5px; }
      table.lines th { background: #eee; font-size: 10px; }
      td.n { text-align: right; white-space: nowrap; }
      table.totals { border-collapse: collapse; margin-left: auto; margin-top: 8px; }
      table.totals td { border: 1px solid #999; padding: 3px 6px; }
      table.totals td:first-child { font-weight: bold; text-align: right; }
      .notes { margin-top: 12px; border: 1px solid #999; padding: 6px; }
      .ettn { font-family: monospace; }
      .qr { display: inline-block; width: 150px; height: 150px; font-size: 7px; word-break: break-all; overflow: hidden; }
      .qr svg { width: 150px; height: 150px; }
      .legal { margin-top: 10px; font-weight: bold; }
      .sign { display: table; width: 100%; margin-top: 30px; }
      .sign > div { display: table-cell; text-align: center; padding-top: 40px; border-top: 1px dashed #999; }
      .logo { max-width: 160px; max-height: 70px; }
      @media print { .page { padding: 0; } }
      @media (max-width: 640px) {
        .page { padding: 10px; }
        .head, .row2, .head > div, .row2 > div { display: block; width: auto; }
        .row2 > div + div { padding-left: 0; margin-top: 8px; }
        .head .mid { text-align: left; margin: 8px 0; }
        .head .right { text-align: center; }
        .qr, .qr svg { width: 240px; height: 240px; }
        table.info { width: 100%; margin: 0; }
        table.lines { font-size: 10px; display: block; overflow-x: auto; }
        table.totals { width: 100%; }
      }
    </style>
  </xsl:template>

  <xsl:template name="qrbox">
    <div class="qr" id="ebelge-qr" data-qr="{$qr}"><xsl:comment>QR</xsl:comment></div>
  </xsl:template>

  <xsl:template name="header">
    <xsl:param name="supplier"/>
    <xsl:param name="title"/>
    <div class="head">
      <div class="left">
        <xsl:if test="$logo != ''"><img class="logo" src="{$logo}" alt="Logo"/></xsl:if>
        <xsl:call-template name="party"><xsl:with-param name="p" select="$supplier"/><xsl:with-param name="title" select="''"/></xsl:call-template>
      </div>
      <div class="mid">
        <img class="emblem" src="{$emblem}" alt="GİB"/>
        <div class="ministry">T.C. Hazine ve Maliye Bakanlığı<br/>Gelir İdaresi Başkanlığı</div>
        <div class="doc-title"><xsl:value-of select="$title"/></div>
      </div>
      <div class="right"><xsl:call-template name="qrbox"/></div>
    </div>
  </xsl:template>

  <!-- ===================================================================== Invoice -->
  <xsl:template match="/inv:Invoice">
    <xsl:variable name="cur" select="cbc:DocumentCurrencyCode"/>
    <xsl:variable name="earsiv" select="cbc:ProfileID = 'EARSIVFATURA'"/>
    <html>
      <head>
        <meta charset="UTF-8"/>
        <title><xsl:value-of select="cbc:ID"/></title>
        <xsl:call-template name="style"/>
      </head>
      <body>
        <div class="page">
          <xsl:call-template name="header">
            <xsl:with-param name="supplier" select="cac:AccountingSupplierParty/cac:Party"/>
            <xsl:with-param name="title">
              <xsl:choose>
                <xsl:when test="$earsiv">e-ARŞİV FATURA</xsl:when>
                <xsl:otherwise>e-FATURA</xsl:otherwise>
              </xsl:choose>
            </xsl:with-param>
          </xsl:call-template>

          <div class="row2">
            <div>
              <xsl:call-template name="party"><xsl:with-param name="p" select="cac:AccountingCustomerParty/cac:Party"/><xsl:with-param name="title" select="'SAYIN'"/></xsl:call-template>
            </div>
            <div>
              <table class="info">
                <tr><td>Özelleştirme No</td><td><xsl:value-of select="cbc:CustomizationID"/></td></tr>
                <tr><td>Senaryo</td><td><xsl:value-of select="cbc:ProfileID"/></td></tr>
                <tr><td>Fatura Tipi</td><td><xsl:value-of select="cbc:InvoiceTypeCode"/></td></tr>
                <tr><td>Fatura No</td><td><xsl:value-of select="cbc:ID"/></td></tr>
                <tr><td>Fatura Tarihi</td><td><xsl:call-template name="date"><xsl:with-param name="d" select="cbc:IssueDate"/></xsl:call-template><xsl:text> </xsl:text><xsl:value-of select="substring(cbc:IssueTime, 1, 5)"/></td></tr>
                <xsl:for-each select="cac:DespatchDocumentReference">
                  <tr><td>İrsaliye No</td><td><xsl:value-of select="cbc:ID"/> / <xsl:call-template name="date"><xsl:with-param name="d" select="cbc:IssueDate"/></xsl:call-template></td></tr>
                </xsl:for-each>
                <xsl:for-each select="cac:OrderReference">
                  <tr><td>Sipariş No</td><td><xsl:value-of select="cbc:ID"/> / <xsl:call-template name="date"><xsl:with-param name="d" select="cbc:IssueDate"/></xsl:call-template></td></tr>
                </xsl:for-each>
                <xsl:for-each select="cac:BillingReference/cac:InvoiceDocumentReference">
                  <tr><td>İade Edilen Fatura</td><td><xsl:value-of select="cbc:ID"/> / <xsl:call-template name="date"><xsl:with-param name="d" select="cbc:IssueDate"/></xsl:call-template></td></tr>
                </xsl:for-each>
                <xsl:if test="cac:PricingExchangeRate">
                  <tr><td>Döviz Kuru</td><td>1 <xsl:value-of select="cac:PricingExchangeRate/cbc:SourceCurrencyCode"/> = <xsl:value-of select="format-number(number(cac:PricingExchangeRate/cbc:CalculationRate), '###.##0,0000', 'tr')"/> TL</td></tr>
                </xsl:if>
              </table>
            </div>
          </div>
          <div class="ettn">ETTN: <xsl:value-of select="cbc:UUID"/></div>

          <table class="lines">
            <tr>
              <th>Sıra No</th><th>Mal Hizmet</th><th>Miktar</th><th>Birim Fiyat</th><th>İskonto</th><th>KDV Oranı</th><th>KDV Tutarı</th><th>Diğer Vergiler</th><th>Mal Hizmet Tutarı</th>
            </tr>
            <xsl:for-each select="cac:InvoiceLine">
              <tr>
                <td class="n"><xsl:value-of select="cbc:ID"/></td>
                <td>
                  <xsl:value-of select="cac:Item/cbc:Name"/>
                  <xsl:if test="cac:Item/cac:SellersItemIdentification/cbc:ID != ''"> (<xsl:value-of select="cac:Item/cac:SellersItemIdentification/cbc:ID"/>)</xsl:if>
                  <xsl:for-each select="cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode">
                    <div style="font-size:9px">İstisna: <xsl:value-of select="."/> - <xsl:value-of select="../cbc:TaxExemptionReason"/></div>
                  </xsl:for-each>
                  <xsl:for-each select="cac:WithholdingTaxTotal/cac:TaxSubtotal">
                    <div style="font-size:9px">Tevkifat (<xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode"/>) %<xsl:value-of select="cbc:Percent"/></div>
                  </xsl:for-each>
                </td>
                <td class="n"><xsl:call-template name="qty"><xsl:with-param name="v" select="cbc:InvoicedQuantity"/></xsl:call-template><xsl:text> </xsl:text><xsl:call-template name="unit"><xsl:with-param name="c" select="cbc:InvoicedQuantity/@unitCode"/></xsl:call-template></td>
                <td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cac:Price/cbc:PriceAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td>
                <td class="n"><xsl:if test="cac:AllowanceCharge[cbc:ChargeIndicator = 'false']"><xsl:call-template name="money"><xsl:with-param name="v" select="sum(cac:AllowanceCharge[cbc:ChargeIndicator = 'false']/cbc:Amount)"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></xsl:if></td>
                <td class="n">%<xsl:value-of select="format-number(number(cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = '0015'][1]/cbc:Percent), '0,##', 'tr')"/></td>
                <td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="sum(cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = '0015']/cbc:TaxAmount)"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td>
                <td>
                  <xsl:for-each select="cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode != '0015']">
                    <div><xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name"/> (%<xsl:value-of select="cbc:Percent"/>) <xsl:call-template name="money"><xsl:with-param name="v" select="cbc:TaxAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></div>
                  </xsl:for-each>
                </td>
                <td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cbc:LineExtensionAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td>
              </tr>
            </xsl:for-each>
          </table>

          <table class="totals">
            <tr><td>Mal Hizmet Toplam Tutarı</td><td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cac:LegalMonetaryTotal/cbc:LineExtensionAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td></tr>
            <xsl:if test="number(cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount) &gt; 0">
              <tr><td>Toplam İskonto</td><td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td></tr>
            </xsl:if>
            <xsl:if test="number(cac:LegalMonetaryTotal/cbc:ChargeTotalAmount) &gt; 0">
              <tr><td>Toplam Masraf</td><td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cac:LegalMonetaryTotal/cbc:ChargeTotalAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td></tr>
            </xsl:if>
            <xsl:for-each select="cac:TaxTotal/cac:TaxSubtotal">
              <tr><td>Hesaplanan <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name"/> (%<xsl:value-of select="format-number(number(cbc:Percent), '0,##', 'tr')"/>)</td><td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cbc:TaxAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td></tr>
            </xsl:for-each>
            <xsl:for-each select="cac:WithholdingTaxTotal/cac:TaxSubtotal">
              <tr><td>KDV Tevkifat (<xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode"/>)</td><td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cbc:TaxAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td></tr>
            </xsl:for-each>
            <tr><td>Vergiler Dahil Toplam Tutar</td><td class="n"><xsl:call-template name="money"><xsl:with-param name="v" select="cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></td></tr>
            <tr><td>Ödenecek Tutar</td><td class="n"><strong><xsl:call-template name="money"><xsl:with-param name="v" select="cac:LegalMonetaryTotal/cbc:PayableAmount"/><xsl:with-param name="cur" select="$cur"/></xsl:call-template></strong></td></tr>
          </table>

          <xsl:if test="cbc:Note">
            <div class="notes">
              <xsl:for-each select="cbc:Note"><div><xsl:value-of select="."/></div></xsl:for-each>
            </div>
          </xsl:if>
          <xsl:if test="$earsiv and cbc:Note[starts-with(., 'Gönderim şekli: ELEKTRONIK')]">
            <div class="legal">e-Arşiv izni kapsamında elektronik ortamda iletilmiştir.</div>
          </xsl:if>
          <xsl:if test="cbc:Note[. = 'İrsaliye yerine geçer.']">
            <div class="sign"><div>Teslim Eden</div><div>Teslim Alan</div></div>
          </xsl:if>
        </div>
      </body>
    </html>
  </xsl:template>

  <!-- ===================================================================== Despatch advice -->
  <xsl:template match="/desp:DespatchAdvice">
    <html>
      <head>
        <meta charset="UTF-8"/>
        <title><xsl:value-of select="cbc:ID"/></title>
        <xsl:call-template name="style"/>
      </head>
      <body>
        <div class="page">
          <xsl:call-template name="header">
            <xsl:with-param name="supplier" select="cac:DespatchSupplierParty/cac:Party"/>
            <xsl:with-param name="title" select="'e-İRSALİYE'"/>
          </xsl:call-template>
          <div class="row2">
            <div>
              <xsl:call-template name="party"><xsl:with-param name="p" select="cac:DeliveryCustomerParty/cac:Party"/><xsl:with-param name="title" select="'SAYIN'"/></xsl:call-template>
              <xsl:for-each select="cac:Shipment/cac:Delivery/cac:DeliveryAddress">
                <div class="party"><div class="party-title">Teslimat Adresi</div>
                  <div><xsl:value-of select="cbc:StreetName"/><xsl:if test="cbc:BuildingNumber != ''"> No:<xsl:value-of select="cbc:BuildingNumber"/></xsl:if></div>
                  <div><xsl:value-of select="cbc:PostalZone"/><xsl:text> </xsl:text><xsl:value-of select="cbc:CitySubdivisionName"/> / <xsl:value-of select="cbc:CityName"/></div>
                </div>
              </xsl:for-each>
            </div>
            <div>
              <table class="info">
                <tr><td>Özelleştirme No</td><td><xsl:value-of select="cbc:CustomizationID"/></td></tr>
                <tr><td>Senaryo</td><td><xsl:value-of select="cbc:ProfileID"/></td></tr>
                <tr><td>İrsaliye Tipi</td><td><xsl:value-of select="cbc:DespatchAdviceTypeCode"/></td></tr>
                <tr><td>İrsaliye No</td><td><xsl:value-of select="cbc:ID"/></td></tr>
                <tr><td>Düzenleme Tarihi</td><td><xsl:call-template name="date"><xsl:with-param name="d" select="cbc:IssueDate"/></xsl:call-template><xsl:text> </xsl:text><xsl:value-of select="substring(cbc:IssueTime, 1, 5)"/></td></tr>
                <tr><td>Fiili Sevk Tarihi</td><td><xsl:call-template name="date"><xsl:with-param name="d" select="cac:Shipment/cac:Delivery/cac:Despatch/cbc:ActualDespatchDate"/></xsl:call-template><xsl:text> </xsl:text><xsl:value-of select="substring(cac:Shipment/cac:Delivery/cac:Despatch/cbc:ActualDespatchTime, 1, 5)"/></td></tr>
                <xsl:for-each select="cac:OrderReference">
                  <tr><td>Sipariş No</td><td><xsl:value-of select="cbc:ID"/></td></tr>
                </xsl:for-each>
                <xsl:for-each select="cac:Shipment/cac:ShipmentStage/cac:TransportMeans/cac:RoadTransport/cbc:LicensePlateID">
                  <tr><td>Plaka</td><td><xsl:value-of select="."/></td></tr>
                </xsl:for-each>
                <xsl:for-each select="cac:Shipment/cac:TransportHandlingUnit/cac:TransportEquipment/cbc:ID">
                  <tr><td>Dorse Plaka</td><td><xsl:value-of select="."/></td></tr>
                </xsl:for-each>
                <xsl:for-each select="cac:Shipment/cac:ShipmentStage/cac:DriverPerson">
                  <tr><td>Sürücü</td><td><xsl:value-of select="concat(cbc:FirstName, ' ', cbc:FamilyName, ' (', cbc:NationalityID, ')')"/></td></tr>
                </xsl:for-each>
                <xsl:for-each select="cac:Shipment/cac:Delivery/cac:CarrierParty">
                  <tr><td>Taşıyıcı</td><td><xsl:value-of select="cac:PartyName/cbc:Name"/> (<xsl:value-of select="cac:PartyIdentification/cbc:ID"/>)</td></tr>
                </xsl:for-each>
              </table>
            </div>
          </div>
          <div class="ettn">ETTN: <xsl:value-of select="cbc:UUID"/></div>
          <table class="lines">
            <tr><th>Sıra No</th><th>Mal Hizmet</th><th>Stok Kodu</th><th>Miktar</th><th>Lot / Seri</th></tr>
            <xsl:for-each select="cac:DespatchLine">
              <tr>
                <td class="n"><xsl:value-of select="cbc:ID"/></td>
                <td><xsl:value-of select="cac:Item/cbc:Name"/></td>
                <td><xsl:value-of select="cac:Item/cac:SellersItemIdentification/cbc:ID"/></td>
                <td class="n"><xsl:call-template name="qty"><xsl:with-param name="v" select="cbc:DeliveredQuantity"/></xsl:call-template><xsl:text> </xsl:text><xsl:call-template name="unit"><xsl:with-param name="c" select="cbc:DeliveredQuantity/@unitCode"/></xsl:call-template></td>
                <td><xsl:for-each select="cac:Item/cac:ItemInstance"><div><xsl:value-of select="cac:LotIdentification/cbc:LotNumberID"/><xsl:value-of select="cbc:SerialID"/></div></xsl:for-each></td>
              </tr>
            </xsl:for-each>
          </table>
          <xsl:if test="cbc:Note">
            <div class="notes"><xsl:for-each select="cbc:Note"><div><xsl:value-of select="."/></div></xsl:for-each></div>
          </xsl:if>
          <div class="sign"><div>Teslim Eden</div><div>Teslim Alan</div></div>
        </div>
      </body>
    </html>
  </xsl:template>

  <!-- ===================================================================== Receipt advice -->
  <xsl:template match="/recp:ReceiptAdvice">
    <html>
      <head>
        <meta charset="UTF-8"/>
        <title><xsl:value-of select="cbc:ID"/></title>
        <xsl:call-template name="style"/>
      </head>
      <body>
        <div class="page">
          <xsl:call-template name="header">
            <xsl:with-param name="supplier" select="cac:DeliveryCustomerParty/cac:Party"/>
            <xsl:with-param name="title" select="'İRSALİYE YANITI'"/>
          </xsl:call-template>
          <table class="info">
            <tr><td>Yanıt No</td><td><xsl:value-of select="cbc:ID"/></td></tr>
            <tr><td>Tarih</td><td><xsl:call-template name="date"><xsl:with-param name="d" select="cbc:IssueDate"/></xsl:call-template></td></tr>
            <tr><td>İrsaliye</td><td><xsl:value-of select="cac:AdditionalDocumentReference[cbc:DocumentTypeCode = 'DespatchAdviceID']/cbc:ID"/></td></tr>
          </table>
          <table class="lines">
            <tr><th>Sıra No</th><th>Mal Hizmet</th><th>Kabul Edilen</th><th>Kabul Edilmeyen</th><th>Eksik</th><th>Fazla</th><th>Neden</th></tr>
            <xsl:for-each select="cac:ReceiptLine">
              <tr>
                <td class="n"><xsl:value-of select="cbc:ID"/></td>
                <td><xsl:value-of select="cac:Item/cbc:Name"/></td>
                <td class="n"><xsl:value-of select="cbc:ReceivedQuantity"/></td>
                <td class="n"><xsl:value-of select="cbc:RejectedQuantity"/></td>
                <td class="n"><xsl:value-of select="cbc:ShortQuantity"/></td>
                <td class="n"><xsl:value-of select="cbc:OversupplyQuantity"/></td>
                <td><xsl:value-of select="cbc:RejectReason"/></td>
              </tr>
            </xsl:for-each>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
