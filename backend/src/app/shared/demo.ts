/**
 * Demo / portfolio disclaimer. The application is a demo project: every generated document
 * (invoice and e-document views, despatch notes, count reports, legal pre-reports, printouts)
 * carries a visible "no legal validity" line so that a printout can never pass for a real document.
 */
export const DEMO_DOCUMENT_TEXT = 'DEMO — yasal geçerliliği yoktur / DEMO — no legal validity';

/** Disclaimer appended to the generated privacy notices and platform documents. */
export const DEMO_NOTICE_TEXT = {
  tr: 'Bu uygulama bir demo/portföy projesidir. Ticari bir hizmet sunulmamaktadır; gösterilen şirket, kişi, belge ve tutarlar örnek verilerdir. Bu metin yalnızca örnek amaçlıdır ve hukuki bağlayıcılığı yoktur; buradaki iletişim bilgileri örnektir ve başvurular işleme alınmaz. Lütfen gerçek kişisel veri girmeyin.',
  en: 'This application is a demo/portfolio project. No commercial service is offered; the companies, people, documents and amounts shown are sample data. This text is an example only and has no legal effect; the contact details are samples and requests are not processed. Please do not enter real personal data.',
};

/** Visible banner (screen and print) for the generated HTML documents. */
export function demoBannerHtml(): string {
  return `<div class="demo-banner" style="margin:0 0 10px;padding:6px 10px;border:1px dashed #b45309;border-radius:4px;background:#fff7ed;color:#9a3412;font:600 11px/1.4 'Segoe UI',Arial,sans-serif;text-align:center;letter-spacing:.02em;-webkit-print-color-adjust:exact;print-color-adjust:exact">${DEMO_DOCUMENT_TEXT}</div>`;
}

/** Inserts the demo banner right after the opening <body> tag (or prepends it when there is none). */
export function withDemoBanner(html: string): string {
  const m = /<body[^>]*>/i.exec(html);
  if (!m) return demoBannerHtml() + html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + demoBannerHtml() + html.slice(at);
}
