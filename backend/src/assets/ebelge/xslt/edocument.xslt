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

  <xsl:variable name="emblem" select="'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QBoRXhpZgAASUkqAAgAAAADABIBAwABAAAAAQAAADEBAgAQAAAAMgAAAGmHBAABAAAAQgAAAAAAAABTaG90d2VsbCAwLjIyLjAAAgACoAkAAQAAAKYBAAADoAkAAQAAAKYBAAAAAAAA/+EJ9Gh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8APD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNC40LjAtRXhpdjIiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyIgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iIGV4aWY6UGl4ZWxYRGltZW5zaW9uPSI0MjIiIGV4aWY6UGl4ZWxZRGltZW5zaW9uPSI0MjIiIHRpZmY6SW1hZ2VXaWR0aD0iNDIyIiB0aWZmOkltYWdlSGVpZ2h0PSI0MjIiIHRpZmY6T3JpZW50YXRpb249IjEiLz4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8P3hwYWNrZXQgZW5kPSJ3Ij8+/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUE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'"/>

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
