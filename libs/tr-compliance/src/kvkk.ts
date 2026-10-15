/**
 * KVKK helpers shared by the backend and the frontend (WP7, R59, R61, R66).
 * Pure functions only: masking of identifiers and the special-category (özel nitelikli kişisel
 * veri, KVKK md. 6) warning for free-text notes.
 */

/** Mask used everywhere a personal identifier is hidden: seven stars + the last 4 characters. */
export function maskIdentifier(value: string | null | undefined, visible = 4): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (!s) return s;
  if (s.includes('*')) return s;
  return '*******' + s.slice(-Math.min(visible, Math.max(1, s.length - 2)));
}

/** e-mail: first character of the local part + domain (a*****@domain.com). */
export function maskEmail(value: string | null | undefined): string | null {
  if (value === null || value === undefined || !value) return value ?? null;
  const at = value.indexOf('@');
  if (at <= 0) return maskIdentifier(value);
  return `${value[0]}*****${value.slice(at)}`;
}

/** True when the value is the output of maskIdentifier / maskEmail (sent back unchanged by a form). */
export function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('*****');
}

/** Categories of KVKK md. 6/1 (özel nitelikli kişisel veriler). */
export type SpecialCategory =
  | 'HEALTH'
  | 'RELIGION'
  | 'RACE_ETHNICITY'
  | 'POLITICAL'
  | 'PHILOSOPHICAL'
  | 'ASSOCIATION'
  | 'CRIMINAL'
  | 'BIOMETRIC_GENETIC'
  | 'SEX_LIFE'
  | 'APPEARANCE';

/**
 * Word stems that usually indicate special-category data. A stem matches at the start of a word
 * (Turkish suffixes follow: "hastalığı", "diyabetli"). Deliberately conservative: the result is a
 * warning shown next to the notes field, never a block.
 */
const SPECIAL_STEMS: Record<SpecialCategory, string[]> = {
  HEALTH: ['hastalı', 'hastane', 'teşhis', 'tanısı', 'tedavi', 'ameliyat', 'engelli', 'engellilik', 'hamile', 'gebelik', 'kan grubu', 'diyabet', 'şeker hastası', 'kanser', 'psikiyatr', 'psikolojik', 'ilaç kullan', 'sağlık rapor', 'alerjisi', 'epilepsi', 'astım', 'hiv', 'covid', 'medical', 'diagnos', 'illness', 'disease', 'pregnan', 'disabilit'],
  RELIGION: ['dini', 'dinî', 'mezhep', 'mezhebi', 'inancı', 'namaz', 'oruç tut', 'alevi', 'sünni', 'hristiyan', 'yahudi', 'religio'],
  RACE_ETHNICITY: ['ırkı', 'ırk ', 'etnik', 'kürt kökenli', 'ethnic', 'race '],
  POLITICAL: ['siyasi', 'siyasî', 'parti üye', 'partili', 'politic'],
  PHILOSOPHICAL: ['felsefi inanç', 'felsefî inanç', 'philosophical belief'],
  ASSOCIATION: ['sendika', 'dernek üye', 'vakıf üye', 'trade union'],
  CRIMINAL: ['sabıka', 'mahkumiyet', 'mahkûmiyet', 'adli sicil', 'hapis', 'cezaevi', 'güvenlik tedbir', 'criminal record', 'convict'],
  BIOMETRIC_GENETIC: ['biyometri', 'parmak izi', 'genetik', 'dna', 'yüz tanıma', 'biometric', 'fingerprint', 'genetic'],
  SEX_LIFE: ['cinsel', 'sexual'],
  APPEARANCE: ['kılık kıyafet', 'kılık ve kıyafet', 'başörtü', 'türban'],
};

const LETTER = /[\p{L}\p{N}]/u;

/** Categories of special-category data that a free text probably contains (empty: none found). */
export function detectSpecialCategoryData(text: string | null | undefined): SpecialCategory[] {
  if (!text) return [];
  const lower = ` ${String(text).toLocaleLowerCase('tr-TR')} `;
  const found: SpecialCategory[] = [];
  for (const [cat, stems] of Object.entries(SPECIAL_STEMS) as [SpecialCategory, string[]][]) {
    for (const stem of stems) {
      let from = 0;
      let hit = false;
      for (;;) {
        const i = lower.indexOf(stem, from);
        if (i < 0) break;
        // word start: the previous character is not a letter / digit
        if (!LETTER.test(lower[i - 1] ?? ' ')) {
          hit = true;
          break;
        }
        from = i + 1;
      }
      if (hit) {
        found.push(cat);
        break;
      }
    }
  }
  return found;
}

/** Days left until a deadline (negative: overdue), counted on calendar days of the given "today". */
export function kvkkDaysLeft(deadline: string | Date, now: Date = new Date()): number {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

/** Hours left until a deadline (negative: overdue). */
export function kvkkHoursLeft(deadline: string | Date, now: Date = new Date()): number {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  return Math.floor((d.getTime() - now.getTime()) / 3600000);
}
