import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AiResponseCard {
  title: string;
  type: 'chart' | 'table' | 'metric' | 'list';
  description: string;
  chartType?: 'bar' | 'line' | 'pie' | 'doughnut';
  chartData?: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string[];
      borderColor?: string[];
    }[];
  };
  tableData?: {
    headers: string[];
    rows: any[][];
  };
  metrics?: {
    label: string;
    value: string | number;
    change?: string;
    isPositive?: boolean;
  }[];
  thinking?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private ollamaUrl = 'http://localhost:11434/api/generate';
  private ollamaModel = 'gemma4:e4b';
  private readonly OLLAMA_TIMEOUT_MS = 60_000; // 60 saniye timeout
  private readonly MAX_PRODUCTS_IN_PROMPT = 100;
  private readonly MAX_ORDERS_IN_PROMPT = 200;

  constructor(private dbService: DbService) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log('Gemini Cloud client initialized.');
    }

    if (process.env.OLLAMA_MODEL) {
      this.ollamaModel = process.env.OLLAMA_MODEL;
    }
    if (process.env.OLLAMA_HOST) {
      this.ollamaUrl = `${process.env.OLLAMA_HOST}/api/generate`;
    }
    this.logger.log(`Local Ollama model configured: ${this.ollamaModel} at ${this.ollamaUrl}`);
  }

  // ─── Ana Sorgu İşleyici ────────────────────────────────────────
  async processQuery(query: string): Promise<AiResponseCard> {
    const startTime = Date.now();
    this.logger.log(`[QUERY] "${query}"`);

    // Phase 1: Gemini Cloud
    if (this.genAI) {
      try {
        const result = await this.processWithGemini(query);
        this.logger.log(`[GEMINI] Başarılı (${Date.now() - startTime}ms)`);
        return result;
      } catch (err: any) {
        this.logger.warn(`[GEMINI] Başarısız: ${err.message} — Ollama'ya geçiliyor.`);
      }
    }

    // Phase 2: Local Ollama
    try {
      const result = await this.processWithOllama(query);
      this.logger.log(`[OLLAMA] Başarılı (${Date.now() - startTime}ms)`);
      return result;
    } catch (err: any) {
      this.logger.warn(`[OLLAMA] Başarısız: ${err.message} — Yerel fallback'e geçiliyor.`);
    }

    // Phase 3: Rule-based fallback
    const result = await this.processQueryLocalFallback(query);
    this.logger.log(`[FALLBACK] Yerel kural motoru kullanıldı (${Date.now() - startTime}ms)`);
    return result;
  }

  async processQueryStream(query: string, onChunk: (text: string) => void): Promise<AiResponseCard> {
    const startTime = Date.now();
    this.logger.log(`[QUERY STREAM] "${query}"`);

    // Phase 1: Gemini Cloud Streaming
    if (this.genAI) {
      try {
        let fullText = '';
        const model = this.genAI!.getGenerativeModel({
          model: 'gemini-1.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const products = await this.dbService.getProducts();
        const orders = await this.dbService.getOrders();
        const systemPrompt = this.buildSystemPrompt(products, orders, query);

        const resultStream = await model.generateContentStream(systemPrompt);
        for await (const chunk of resultStream.stream) {
          const text = chunk.text();
          fullText += text;
          onChunk(fullText);
        }
        
        const result = this.safeParseAndValidate(fullText, query);
        this.logger.log(`[GEMINI STREAM] Başarılı (${Date.now() - startTime}ms)`);
        return result;
      } catch (err: any) {
        this.logger.warn(`[GEMINI STREAM] Başarısız: ${err.message} — Ollama'ya geçiliyor.`);
      }
    }

    // Phase 2: Local Ollama Streaming
    try {
      let fullText = '';
      const products = await this.dbService.getProducts();
      const orders = await this.dbService.getOrders();
      const systemPrompt = this.buildSystemPrompt(products, orders, query);

      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: systemPrompt,
          stream: true,
          format: 'json',
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Ollama response body reader is not available');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const rawChunk = decoder.decode(value, { stream: true });
        const lines = rawChunk.split('\n').filter(l => l.trim() !== '');
        for (const line of lines) {
          try {
            const parsedLine = JSON.parse(line);
            if (parsedLine.response) {
              fullText += parsedLine.response;
              onChunk(fullText);
            }
          } catch {
            // Ignore partial lines
          }
        }
      }

      const result = this.safeParseAndValidate(fullText, query);
      this.logger.log(`[OLLAMA STREAM] Başarılı (${Date.now() - startTime}ms)`);
      return result;
    } catch (err: any) {
      this.logger.warn(`[OLLAMA STREAM] Başarısız: ${err.message} — Yerel kural motoruna geçiliyor.`);
    }

    // Phase 3: Fallback (no stream, returns instantly)
    const result = await this.processQueryLocalFallback(query);
    onChunk(JSON.stringify(result));
    this.logger.log(`[FALLBACK] Yerel kural motoru kullanıldı (${Date.now() - startTime}ms)`);
    return result;
  }

  // ─── Gemini Cloud ──────────────────────────────────────────────
  private async processWithGemini(query: string): Promise<AiResponseCard> {
    const model = this.genAI!.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const products = await this.dbService.getProducts();
    const orders = await this.dbService.getOrders();
    const systemPrompt = this.buildSystemPrompt(products, orders, query);

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text().trim();

    return this.safeParseAndValidate(responseText, query);
  }

  // ─── Ollama (Yerel LLM) ───────────────────────────────────────
  private async processWithOllama(query: string): Promise<AiResponseCard> {
    const products = await this.dbService.getProducts();
    const orders = await this.dbService.getOrders();
    const systemPrompt = this.buildSystemPrompt(products, orders, query);

    // AbortController ile 60 saniyelik timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.OLLAMA_TIMEOUT_MS);

    try {
      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: systemPrompt,
          stream: false,
          format: 'json',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return this.safeParseAndValidate(data.response, query);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Ollama ${this.OLLAMA_TIMEOUT_MS / 1000}s timeout aşıldı.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Güvenli JSON Parse + Doğrulama ────────────────────────────
  private safeParseAndValidate(rawText: string, originalQuery: string): AiResponseCard {
    this.logger.log(`[RAW RESPONSE] ${rawText}`);
    let parsed: any;

    try {
      // Markdown kod bloklarını temizle (```json ... ```)
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr: any) {
      this.logger.error(`[PARSE] JSON parse hatası: ${parseErr.message}`);
      this.logger.debug(`[PARSE] Ham yanıt: ${rawText.substring(0, 500)}`);
      throw new Error(`Yapay zeka yanıtı JSON olarak ayrıştırılamadı: ${parseErr.message}`);
    }

    return this.validateAiResponse(parsed, originalQuery);
  }

  private extractThinkingFromDescription(description: string): { description: string, thinking?: string } {
    const thinkStart = description.indexOf('<think>');
    if (thinkStart !== -1) {
      const thinkEnd = description.indexOf('</think>');
      if (thinkEnd !== -1) {
        const thinking = description.slice(thinkStart + 7, thinkEnd).trim();
        const cleanedDescription = description.slice(thinkEnd + 8).trim();
        return { description: cleanedDescription, thinking };
      } else {
        const thinking = description.slice(thinkStart + 7).trim();
        const cleanedDescription = description.slice(0, thinkStart).trim();
        return { description: cleanedDescription, thinking };
      }
    }
    return { description };
  }

  private validateAiResponse(response: any, originalQuery: string): AiResponseCard {
    // Zorunlu alanları kontrol et
    if (!response || typeof response !== 'object') {
      this.logger.warn('[VALIDATE] Yanıt bir obje değil.');
      throw new Error('AI yanıtı geçersiz formatta (obje değil).');
    }

    const validTypes = ['chart', 'table', 'metric', 'list'];
    const parsedDesc = this.extractThinkingFromDescription(
      typeof response.description === 'string' ? response.description : `"${originalQuery}" sorgusu analiz edildi.`
    );

    const card: AiResponseCard = {
      title: typeof response.title === 'string' ? response.title : 'Analiz Sonucu',
      type: validTypes.includes(response.type) ? response.type : 'metric',
      description: parsedDesc.description,
      thinking: parsedDesc.thinking || (typeof response.thinking === 'string' ? response.thinking : undefined),
    };

    // chart verisi
    if (card.type === 'chart' && response.chartData) {
      const validChartTypes = ['bar', 'line', 'pie', 'doughnut'];
      card.chartType = validChartTypes.includes(response.chartType) ? response.chartType : 'bar';
      card.chartData = {
        labels: Array.isArray(response.chartData.labels) ? response.chartData.labels : [],
        datasets: Array.isArray(response.chartData.datasets) ? response.chartData.datasets : [],
      };
    }

    // table verisi
    if (card.type === 'table' && response.tableData) {
      card.tableData = {
        headers: Array.isArray(response.tableData.headers) ? response.tableData.headers : [],
        rows: Array.isArray(response.tableData.rows) ? response.tableData.rows : [],
      };
    }

    // metric verisi
    if (response.metrics && Array.isArray(response.metrics)) {
      card.metrics = response.metrics;
    }

    // type=table ama tableData yoksa → metric'e düşür
    if (card.type === 'table' && (!card.tableData || card.tableData.rows.length === 0)) {
      if (card.metrics && card.metrics.length > 0) {
        card.type = 'metric';
      } else {
        throw new Error('AI geçerli bir JSON döndürdü fakat tablo verisi eksik.');
      }
    }

    // type=chart ama chartData yoksa → metric'e düşür
    if (card.type === 'chart' && (!card.chartData || card.chartData.labels.length === 0)) {
      if (card.metrics && card.metrics.length > 0) {
        card.type = 'metric';
      } else {
        throw new Error('AI geçerli bir JSON döndürdü fakat grafik verisi eksik.');
      }
    }

    // type=metric ama metrik yoksa
    if (card.type === 'metric' && (!card.metrics || card.metrics.length === 0)) {
      throw new Error('AI geçerli bir JSON döndürdü fakat metrik verisi eksik.');
    }

    return card;
  }

  private buildErrorCard(query: string, message: string): AiResponseCard {
    return {
      title: 'İşlem Başarısız',
      type: 'metric',
      description: message,
      metrics: [
        { label: 'Sorgu', value: query },
        { label: 'Durum', value: 'Yeniden deneyin', isPositive: false },
      ],
    };
  }

  // ─── System Prompt Builder ─────────────────────────────────────
  private buildSystemPrompt(products: any[], orders: any[], query: string): string {
    // Veri boyutu kontrolü — çok büyükse kırp
    const trimmedProducts = products.slice(0, this.MAX_PRODUCTS_IN_PROMPT);
    const trimmedOrders = orders.slice(0, this.MAX_ORDERS_IN_PROMPT);

    let dataTrimNote = '';
    if (products.length > this.MAX_PRODUCTS_IN_PROMPT || orders.length > this.MAX_ORDERS_IN_PROMPT) {
      dataTrimNote = `\nNOTE: Database has been trimmed for analysis. Showing ${trimmedProducts.length}/${products.length} products and ${trimmedOrders.length}/${orders.length} orders.\n`;
    }

    const now = new Date();
    const currentDateStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const currentDateTR = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

    return `You are an expert AI Data Analyst embedded in a Stock Management (Inventory) System.
You have the full database state in JSON format below. You MUST calculate the answers by analyzing this JSON data directly. DO NOT make up numbers.

CURRENT DATE & TIME: ${currentDateStr} (${currentDateTR})
Use this date as the reference point for ALL time-relative queries (e.g., "bugün", "son 1 hafta", "son 1 ay", "bu ay", "dün").

Products Database: ${JSON.stringify(trimmedProducts)}
Orders Database: ${JSON.stringify(trimmedOrders)}
${dataTrimNote}
══════════════════════════════════════════════════════════
CRITICAL ANALYSIS RULES (You MUST follow these exactly):
══════════════════════════════════════════════════════════

RULE 0 — THINKING PROCESS WRAPPING:
You MUST start the "description" field with a '<think>' block containing your step-by-step data analysis planning, the reference date used, which dates were filtered, and how the database records were analyzed. For example: "<think>Referans tarih (2026-06-12) baz alınmıştır. Analiz için son 30 günlük tarihler kullanılmıştır...</think>\n\nİşte sonuçlar:". This is mandatory. Exclude date range/reference date technical parameters from the rest of the description.

RULE 0.2 — NO GENERIC ANSWERS:
NEVER return generic summaries like "Genel Durum Analizi - stok durumunuz stabil". You MUST calculate exact numbers from the data. If you cannot answer a question, say WHY specifically.

RULE 0.5 — TIME-BASED FILTERING:
When the user mentions a time period, ALWAYS filter Orders by their 'date' field:
- "bugün" / "today" → date starts with "${currentDateStr}"
- "dün" / "yesterday" → date starts with the day before ${currentDateStr}
- "son 1 hafta" / "bu hafta" / "last week" → orders from the last 7 days (>= ${currentDateStr} minus 7 days)
- "son 1 ay" / "bu ay" / "last month" → orders from the last 30 days (>= ${currentDateStr} minus 30 days)
- "son 3 ay" → orders from the last 90 days
Compare the date strings (YYYY-MM-DD portion) to determine inclusion. After filtering, apply the relevant analysis rule (sales, revenue, etc.) ONLY on the filtered set. Always write the date range, reference date, and analysis parameters inside the '<think>...</think>' block at the beginning of the 'description' field.

RULE 1 — KRİTİK STOK (Reorder Point / "what should I order?" / "sipariş vermeliyim"):
Find products where quantity <= minQuantity. Return type='table' with columns: [Ürün Adı, Mevcut Stok, Min Stok, Önerilen Sipariş Miktarı, Neden]. Calculate suggested order = (minQuantity * 2) - quantity.

RULE 2 — EN ÇOK SATANLAR (Best Sellers / "en çok satan"):
From Orders where status='Completed', sum each item's quantity per productId. Sort descending. Return type='table' or type='chart' (chartType='bar').

RULE 3 — KÂRLILIK VE CİRO (Revenue / "en çok kâr getiren" / "ciro"):
From Orders where status='Completed', sum (price × quantity) per productId. Sort descending. Return type='table' or type='chart'.

RULE 4 — ÖLÜ STOK (Dead Stock / "satamadığım" / "ölü stok" / "yavaş satan"):
Find products with 0 total sales in Orders, or the lowest sellers. Return type='table'. Suggest discounting or removing.

RULE 5 — KATEGORİ PERFORMANSI (Category Analysis / "kategori"):
Group products by 'category'. Sum revenue and units sold per category from Orders. Return type='chart' (pie/doughnut) or type='table'.

RULE 6 — STOK TÜKENME MALİYETİ (Stockout Cost / "kaçırılan fırsat" / "kayıp"):
Find products where quantity == 0. Estimate lost revenue = minQuantity × price. Return type='table' with "Kaçırılan Fırsat Maliyeti".

RULE 7 — ABC ANALİZİ:
Classify products by cumulative revenue: A = top 70% revenue, B = next 20%, C = bottom 10%. Return type='table' with columns: [Ürün, Gelir, Sınıf (A/B/C)].

RULE 8 — TREND ANALİZİ (Sales Trend / "trend" / "zaman"):
Group completed Orders by date (YYYY-MM-DD). Sum totalAmount per date. Return type='chart' (chartType='line').

RULE 9 — STOK DEĞERİ (Inventory Valuation / "stok değeri" / "depo değeri"):
Calculate total inventory value = Σ(quantity × price) for all products. Return type='metric' with total value and breakdown by category.

RULE 10 — STOK DEVİR HIZI (Inventory Turnover / "devir hızı"):
Calculate: Total Units Sold (from Completed orders) / Average Inventory (current stock). Higher = better. Return type='metric'. Interpret: >6 = Excellent, 3-6 = Good, <3 = Slow.

RULE 11 — MÜŞTERİ ANALİZİ (Customer Analysis / "müşteri" / "en iyi müşteri"):
Group Orders by customerName. Sum totalAmount and count orders per customer. Sort by totalAmount descending. Return type='table' with columns: [Müşteri, Sipariş Sayısı, Toplam Harcama, Ortalama Sipariş].

RULE 12 — SİPARİŞ DURUM DAĞILIMI (Order Status / "iptal oranı" / "sipariş durumu"):
Count orders by status (Completed/Pending/Cancelled). Calculate percentages. Return type='chart' (pie) or type='metric'.

RULE 13 — FİYAT SEGMENTASYOnu (Price Segmentation / "fiyat dağılımı" / "fiyat analizi"):
Group products by price range: Budget (0-50₺), Mid (50-150₺), Premium (150-300₺), Luxury (300+₺). Return type='chart' (doughnut) or type='table'.

RULE 14 — ORTALAMA SİPARİŞ DEĞERİ (AOV / "ortalama sipariş"):
Calculate: Total Revenue / Number of Completed Orders. Return type='metric'.

RULE 15 — GENEL DURUM ÖZETİ (Dashboard / "genel durum" / "özet" / "nasıl gidiyor"):
Calculate ALL of these KPIs: Total Products, Total Orders, Total Revenue, Critical Stock Count, Out of Stock Count, Total Inventory Value, Average Order Value, Top Seller Name, Top Customer Name. Return type='metric' with all values.

══════════════════════════════════════════════════════════
OUTPUT FORMAT (Turkish, strictly JSON):
══════════════════════════════════════════════════════════
Always respond in Turkish. Return a JSON object matching this schema. All fields must be in Turkish except key names.

JSON Schema:
{
  "title": string,
  "type": "chart" | "table" | "metric",
  "description": string,
  "chartType?": "bar" | "line" | "pie" | "doughnut",
  "chartData?": { "labels": string[], "datasets": [{ "label": string, "data": number[], "backgroundColor?": string[], "borderColor?": string[] }] },
  "tableData?": { "headers": string[], "rows": any[][] },
  "metrics?": [{ "label": string, "value": string | number, "change?": string, "isPositive?": boolean }]
}

Field descriptions:
- "title": A suitable title for the analysis.
- "description": Start this field with '<think>step-by-step thinking process, reference date, and date range filter details</think>' block, then follow with a user-friendly summary of the final results.

EXAMPLE JSON OUTPUT (MUST follow this exact structure):
{
  "title": "Kritik Stoktaki Ürünler",
  "type": "table",
  "description": "<think>Kritik stok seviyesindeki ürünler aranıyor. Referans tarih: 2026-06-12. Ürünlerin quantity <= minQuantity olanları listelenecektir. DB üzerinde yapılan kontrolde 2 adet ürün bulundu.</think>\n\nMevcut stok miktarı belirlenen minimum eşiğin altına düşen ürünler listelenmiştir.",
  "tableData": {
    "headers": ["Ürün Adı", "Mevcut Stok", "Min Stok"],
    "rows": [
      ["Wireless Mouse", 2, 5],
      ["Keyboard K85", 1, 4]
    ]
  }
}
Return ONLY raw JSON. No markdown. No code fences. No explanation outside JSON.

User Question: "${query}"`;
  }

  // ─── Yerel Fallback (AI yokken) ────────────────────────────────
  private async processQueryLocalFallback(query: string): Promise<AiResponseCard> {
    const q = query.toLowerCase().trim();

    if (q.includes('en az satan') || q.includes('az satan')) {
      return this.getLeastSellingProducts();
    }
    if (q.includes('en çok satan') || q.includes('cok satan') || q.includes('en popüler')) {
      return this.getMostSellingProducts();
    }
    if (q.includes('kritik') || q.includes('düşük stok') || q.includes('azalan') || q.includes('tükenen') || q.includes('sipariş ver')) {
      return this.getCriticalStockProducts();
    }
    if (q.includes('satış') || q.includes('gelir') || q.includes('ciro') || q.includes('trend')) {
      return this.getSalesSummary();
    }
    if (q.includes('stok değeri') || q.includes('depo değeri') || q.includes('envanter değeri')) {
      return this.getInventoryValuation();
    }
    if (q.includes('müşteri')) {
      return this.getCustomerAnalysis();
    }
    if (q.includes('iptal') || q.includes('sipariş durum')) {
      return this.getOrderStatusDistribution();
    }

    // Genel durum (default fallback — artık boş değil!)
    return this.getDashboardSummary(query);
  }

  // ─── Fallback Yardımcı Metodlar ────────────────────────────────

  private async getInventoryValuation(): Promise<AiResponseCard> {
    const products = await this.dbService.getProducts();
    const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);

    const categoryMap: Record<string, number> = {};
    products.forEach(p => {
      const val = p.quantity * p.price;
      categoryMap[p.category] = (categoryMap[p.category] || 0) + val;
    });

    const metrics = [
      { label: 'Toplam Stok Değeri', value: `₺${totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
      ...Object.entries(categoryMap).map(([cat, val]) => ({
        label: cat,
        value: `₺${val.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
      })),
    ];

    return {
      title: 'Envanter Değerleme Raporu',
      type: 'metric',
      thinking: 'Depodaki tüm ürünlerin mevcut miktarları ve birim fiyatları çarpılarak toplam envanter değeri ve kategori bazlı dağılım hesaplanıyor.',
      description: `Depodaki ${products.length} farklı ürünün toplam stok değeri hesaplandı.`,
      metrics,
    };
  }

  private async getCustomerAnalysis(): Promise<AiResponseCard> {
    const orders = await this.dbService.getOrders();
    const completed = orders.filter(o => o.status === 'Completed');

    const customerMap: Record<string, { count: number; total: number }> = {};
    completed.forEach(o => {
      if (!customerMap[o.customerName]) customerMap[o.customerName] = { count: 0, total: 0 };
      customerMap[o.customerName].count++;
      customerMap[o.customerName].total += o.totalAmount;
    });

    const sorted = Object.entries(customerMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: data.total,
        avg: data.total / data.count,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      title: 'Müşteri Analizi',
      type: 'table',
      thinking: 'Sistemdeki tamamlanmış siparişler taranıyor, müşteri adına göre gruplandırılıyor. Her müşterinin toplam sipariş sayısı, harcama miktarı ve ortalama sipariş değeri hesaplanarak yüksekten düşüğe doğru sıralanıyor.',
      description: `${sorted.length} müşterinin harcama verileri analiz edildi.`,
      tableData: {
        headers: ['Müşteri', 'Sipariş Sayısı', 'Toplam Harcama (₺)', 'Ort. Sipariş (₺)'],
        rows: sorted.map(c => [c.name, c.count, parseFloat(c.total.toFixed(2)), parseFloat(c.avg.toFixed(2))]),
      },
    };
  }

  private async getOrderStatusDistribution(): Promise<AiResponseCard> {
    const orders = await this.dbService.getOrders();
    const statusMap: Record<string, number> = { Completed: 0, Pending: 0, Cancelled: 0 };
    orders.forEach(o => {
      statusMap[o.status] = (statusMap[o.status] || 0) + 1;
    });

    const total = orders.length;
    return {
      title: 'Sipariş Durum Dağılımı',
      type: 'chart',
      chartType: 'doughnut',
      thinking: 'Tüm sipariş kayıtlarının durum (status) alanı inceleniyor. Tamamlanan, bekleyen ve iptal edilen sipariş sayıları sayılıyor. Toplam siparişe oranları hesaplanarak iptal oranı belirleniyor.',
      description: `Toplam ${total} sipariş: ${statusMap['Completed']} tamamlandı, ${statusMap['Pending']} beklemede, ${statusMap['Cancelled']} iptal edildi. İptal oranı: %${total > 0 ? ((statusMap['Cancelled'] / total) * 100).toFixed(1) : 0}.`,
      chartData: {
        labels: ['Tamamlanan', 'Bekleyen', 'İptal Edilen'],
        datasets: [{
          label: 'Sipariş Sayısı',
          data: [statusMap['Completed'], statusMap['Pending'], statusMap['Cancelled']],
          backgroundColor: ['#22C55E', '#F59E0B', '#EF4444'],
        }],
      },
    };
  }

  private async getDashboardSummary(query: string): Promise<AiResponseCard> {
    const products = await this.dbService.getProducts();
    const orders = await this.dbService.getOrders();
    const completedOrders = orders.filter(o => o.status === 'Completed');

    const totalRevenue = completedOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalInventoryValue = products.reduce((s, p) => s + (p.quantity * p.price), 0);
    const criticalCount = products.filter(p => p.quantity <= p.minQuantity).length;
    const outOfStockCount = products.filter(p => p.quantity === 0).length;
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    return {
      title: 'Genel İşletme Özeti',
      type: 'metric',
      thinking: 'Genel işletme performansı için temel göstergeler (KPI) hesaplanıyor. Toplam ürün çeşitliliği, tamamlanan ciro, kritik durumdaki ve tükenen stok sayıları ile ortalama sipariş tutarı yerel kural motoruyla çıkarılıyor.',
      description: `"${query}" için kapsamlı stok ve satış verileri hesaplandı (AI servis dışı — yerel analiz motoru).`,
      metrics: [
        { label: 'Toplam Ürün Çeşidi', value: products.length },
        { label: 'Toplam Sipariş', value: orders.length },
        { label: 'Toplam Ciro', value: `₺${totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Toplam Stok Değeri', value: `₺${totalInventoryValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
        { label: 'Kritik Stoktaki Ürünler', value: criticalCount, isPositive: criticalCount === 0 },
        { label: 'Stokta Olmayan Ürünler', value: outOfStockCount, isPositive: outOfStockCount === 0 },
        { label: 'Ort. Sipariş Değeri', value: `₺${avgOrderValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
      ],
    };
  }

  private async getLeastSellingProducts(): Promise<AiResponseCard> {
    const allOrders = await this.dbService.getOrders();
    const orders = allOrders.filter(o => o.status === 'Completed');
    const products = await this.dbService.getProducts();

    const salesMap: { [productId: string]: number } = {};
    products.forEach(p => { salesMap[p.id] = 0; });

    orders.forEach(o => {
      o.items.forEach((item: any) => {
        if (salesMap[item.productId] !== undefined) {
          salesMap[item.productId] += item.quantity;
        }
      });
    });

    const sortedList = products
      .map(p => ({ name: p.name, sales: salesMap[p.id] }))
      .sort((a, b) => a.sales - b.sales)
      .slice(0, 5);

    return {
      title: 'En Az Satan 5 Ürün',
      type: 'chart',
      chartType: 'bar',
      thinking: 'Tamamlanan siparişlerdeki tüm kalemler taranıyor, her ürün için toplam satış adetleri toplanıyor. Satış adedi en düşük olan ilk 5 ürün belirleniyor.',
      description: 'Tamamlanan siparişlerde en düşük satış adedine sahip 5 ürün.',
      chartData: {
        labels: sortedList.map(item => item.name),
        datasets: [{
          label: 'Satış Adedi',
          data: sortedList.map(item => item.sales),
          backgroundColor: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE'],
        }],
      },
    };
  }

  private async getMostSellingProducts(): Promise<AiResponseCard> {
    const allOrders = await this.dbService.getOrders();
    const orders = allOrders.filter(o => o.status === 'Completed');
    const products = await this.dbService.getProducts();

    const salesMap: { [productId: string]: number } = {};
    products.forEach(p => { salesMap[p.id] = 0; });

    orders.forEach(o => {
      o.items.forEach((item: any) => {
        if (salesMap[item.productId] !== undefined) {
          salesMap[item.productId] += item.quantity;
        }
      });
    });

    const sortedList = products
      .map(p => ({ name: p.name, sales: salesMap[p.id] }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    return {
      title: 'En Çok Satan 5 Ürün',
      type: 'chart',
      chartType: 'doughnut',
      thinking: 'Tamamlanan sipariş verileri üzerinden ürün bazında satış adetleri toplanıyor ve en yüksek satış miktarına sahip ilk 5 ürün listeleniyor.',
      description: 'Toplam sipariş hacmine göre en yüksek satış adetli ürünler.',
      chartData: {
        labels: sortedList.map(item => item.name),
        datasets: [{
          label: 'Satış Payı',
          data: sortedList.map(item => item.sales),
          backgroundColor: ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD', '#E0F2FE'],
        }],
      },
    };
  }

  private async getCriticalStockProducts(): Promise<AiResponseCard> {
    const products = await this.dbService.getProducts();
    const criticalProducts = products.filter(p => p.quantity <= p.minQuantity);

    return {
      title: 'Kritik Stok Seviyesindeki Ürünler',
      type: 'table',
      thinking: 'Ürün veritabanındaki her ürünün mevcut stok miktarı (quantity), minimum stok limiti (minQuantity) ile karşılaştırılıyor. Mevcut stok seviyesi limitin altında veya eşit olan kritik ürünler filtreleniyor.',
      description: `Stok seviyesi minimum limitin altına düşmüş veya tükenmiş ${criticalProducts.length} ürün tespit edildi.`,
      tableData: {
        headers: ['Ürün Adı', 'SKU', 'Mevcut Stok', 'Minimum Limit'],
        rows: criticalProducts.map(p => [p.name, p.sku, p.quantity, p.minQuantity]),
      },
    };
  }

  private async getSalesSummary(): Promise<AiResponseCard> {
    const allOrders = await this.dbService.getOrders();
    const orders = allOrders.filter(o => o.status === 'Completed');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const salesByDay = Array(7).fill(0);
    let totalCiro = 0;

    orders.forEach(o => {
      const orderDate = new Date(o.date);
      if (orderDate >= sevenDaysAgo) {
        totalCiro += o.totalAmount;
        const d = orderDate.getDay();
        salesByDay[d] += o.totalAmount;
      }
    });

    const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const data = [salesByDay[1], salesByDay[2], salesByDay[3], salesByDay[4], salesByDay[5], salesByDay[6], salesByDay[0]];

    return {
      title: 'Haftalık Satış Dağılımı ve Gelir Analizi',
      type: 'chart',
      chartType: 'line',
      thinking: 'Son 7 güne ait tamamlanmış siparişler taranıyor, sipariş tarihleri günlere göre gruplandırılıyor ve günlük toplam ciro tutarları hesaplanarak grafik oluşturuluyor.',
      description: `Tamamlanan siparişlerden elde edilen toplam gelir: ₺${totalCiro.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}.`,
      chartData: {
        labels,
        datasets: [{
          label: 'Gelir (₺)',
          data: data.map(v => parseFloat(v.toFixed(2))),
          backgroundColor: ['rgba(14, 165, 233, 0.2)'],
          borderColor: ['#0EA5E9'],
        }],
      },
    };
  }
}
