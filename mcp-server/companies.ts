// Everyday names for well-known filers. SEC titles miss some of them (Google is
// "Alphabet Inc.", Coca-Cola is "COCA COLA CO") and read badly aloud.
export const COMPANIES: Record<string, { name: string; aliases: string[] }> = {
  COST: { name: 'Costco', aliases: ['costco'] }, AAPL: { name: 'Apple', aliases: ['apple'] },
  MSFT: { name: 'Microsoft', aliases: ['microsoft'] }, NVDA: { name: 'Nvidia', aliases: ['nvidia'] },
  AMZN: { name: 'Amazon', aliases: ['amazon'] }, TSLA: { name: 'Tesla', aliases: ['tesla'] },
  GOOGL: { name: 'Alphabet', aliases: ['alphabet', 'google'] }, META: { name: 'Meta', aliases: ['meta', 'facebook'] },
  'BRK-B': { name: 'Berkshire Hathaway', aliases: ['berkshire hathaway', 'berkshire'] },
  JPM: { name: 'JPMorgan Chase', aliases: ['jpmorgan chase', 'jpmorgan', 'jp morgan'] },
  KO: { name: 'Coca-Cola', aliases: ['coca-cola', 'coca cola', 'coke'] }, SBUX: { name: 'Starbucks', aliases: ['starbucks'] },
  WMT: { name: 'Walmart', aliases: ['walmart'] }, NFLX: { name: 'Netflix', aliases: ['netflix'] },
  DIS: { name: 'Disney', aliases: ['disney'] }, NKE: { name: 'Nike', aliases: ['nike'] },
  MCD: { name: "McDonald's", aliases: ["mcdonald's", 'mcdonalds'] }, PEP: { name: 'PepsiCo', aliases: ['pepsico', 'pepsi'] },
  HD: { name: 'Home Depot', aliases: ['home depot'] }, INTC: { name: 'Intel', aliases: ['intel'] },
  AMD: { name: 'AMD', aliases: ['amd'] }, V: { name: 'Visa', aliases: ['visa'] }, MA: { name: 'Mastercard', aliases: ['mastercard'] },
  T: { name: 'AT&T', aliases: ['at&t'] }, XOM: { name: 'ExxonMobil', aliases: ['exxonmobil', 'exxon mobil', 'exxon'] },
  CVX: { name: 'Chevron', aliases: ['chevron'] }, JNJ: { name: 'Johnson & Johnson', aliases: ['johnson & johnson'] },
  PG: { name: 'Procter & Gamble', aliases: ['procter & gamble'] }, RIVN: { name: 'Rivian', aliases: ['rivian'] },
  TSM: { name: 'TSMC', aliases: ['tsmc', 'taiwan semiconductor'] }, BABA: { name: 'Alibaba', aliases: ['alibaba'] },
  BAC: { name: 'Bank of America', aliases: ['bank of america'] }, TMUS: { name: 'T-Mobile', aliases: ['t-mobile'] },
  BBY: { name: 'Best Buy', aliases: ['best buy'] },
};
// Aliases that are another company's ticker when written in capitals (COKE is Coca-Cola Consolidated).
const OTHER_TICKERS = new Set(['COKE']);
const ALIASES = Object.entries(COMPANIES).flatMap(([ticker, c]) => c.aliases.map(alias => [alias, ticker] as const)).sort((a, b) => b[0].length - a[0].length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIAS_PATTERN = new RegExp(`(?<![\\w&-])(${ALIASES.map(([a]) => escape(a)).join('|')})(?![\\w&-])`, 'i');
const fold = (text: string) => text.replace(/[’‘]/g, "'");
/** Ticker for a well-known company name in the text; `whole` requires the text to be just that name. */
export function aliasTicker(text: string, whole = false) {
  const folded = fold(text).trim();
  const raw = (whole ? new RegExp(`^(?:${ALIAS_PATTERN.source})(?:'s)?$`, 'i') : ALIAS_PATTERN).exec(folded)?.[1];
  // In an all-capitals question the capitals say nothing ("TEACH ME ABOUT COKE" is Coca-Cola),
  // but a capitalised name on its own is the ticker ("COKE" is Coca-Cola Consolidated).
  if (!raw || (OTHER_TICKERS.has(raw) && (whole || folded !== folded.toUpperCase() || !/\s/.test(folded)))) return undefined;
  return ALIASES.find(([a]) => a === raw.toLowerCase())![1];
}
/** SEC writes share classes with a dash (BRK-B); people also type BRK.B. */
export const tickerForm = (value: string) => value.trim().toUpperCase().replace(/^([A-Z]{1,5})\.([A-Z]{1,2})$/, '$1-$2');
const SUFFIXES = new Set(['INC', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LLC', 'NEW', 'DE', 'THE', 'SA', 'NV', 'AG', 'SE']);
const CONNECTORS = new Set(['OF', 'AND', 'FOR', 'THE', '&']);
// Legal forms SEC sometimes spells out letter by letter (NATUZZI S P A, ... A S).
const LETTER_FORMS = new Set(['NV', 'SA', 'AG', 'SE', 'AS', 'SPA', 'AB', 'BV', 'LP']);
/** Upper-case words without punctuation, legal suffixes or connectors, for name matching. */
export const nameKey = (text: string) => fold(text).toUpperCase().replace(/'/g, '').replace(/[^A-Z0-9&]+/g, ' ').trim().split(' ').filter(w => w && !SUFFIXES.has(w) && !CONNECTORS.has(w)).join(' ');
/** Keys with the apostrophe dropped ("Lowe's" is LOWES) and with a possessive dropped ("Boeing's" is BOEING). */
export const nameKeys = (text: string) => [...new Set([nameKey(text), nameKey(fold(text).replace(/'s\b/gi, ''))])].filter(Boolean);
/** Name to show and speak: everyday name when known, otherwise the SEC title without legal suffixes. */
export function displayName(ticker: string, title: string) {
  if (COMPANIES[ticker]) return COMPANIES[ticker].name;
  // SEC appends the state or country after a slash or in brackets ("WELLS FARGO & COMPANY/MN", "ACUITY INC. (DE)");
  // a slash in the first word is part of the name (M/I HOMES, CULLEN/FROST BANKERS).
  const base = fold(title).replace(/\bA\/S\b/gi, '').replace(/\s*\/\s*(?:ADR|ADS|[A-Z]{2})\.?\s*\/?\s*$/, '').replace(/^(\S+\s[^/]*?)\s*\/.*$/, '$1').replace(/\s*\([^)]*\)\s*$/, '');
  const shout = base === base.toUpperCase(), symbol = ticker.toUpperCase().replace(/[^A-Z]/g, '');
  const words = base.split(/[\s,]+/).map(w => w.replace(/\.$/, '')).filter(Boolean);
  // Legal forms only count at the end: NEW YORK TIMES CO is the New York Times. N V and S.A. are NV and SA,
  // but single letters are initials otherwise (SMITH A O, V F CORP).
  const legal = (w: string) => SUFFIXES.has(w.replace(/\./g, '').toUpperCase()) || LETTER_FORMS.has(w.toUpperCase()) || w === '&';
  // Letters after a legal form are a state or share class (TRUSTCO BANK CORP N Y, ... Acquisition Corp. A);
  // Roman numerals name a series and stay (Acquisition Corp V).
  const afterLegal = () => { let k = 0; while (k < 2 && k < words.length - 1 && /^[a-hj-uwyz]$/i.test(words[words.length - 1 - k])) k++; return k && SUFFIXES.has(words[words.length - 1 - k].replace(/\./g, '').toUpperCase()) ? k : 0; };
  for (;;) {
    const letters = words.slice(-3).join(' ').match(/(?:^|\s)((?:[a-z]\s){1,2}[a-z])$/i)?.[1].split(' '), state = afterLegal();
    if (words.length > 1 && legal(words.at(-1)!)) words.pop();
    else if (letters && words.length > letters.length && LETTER_FORMS.has(letters.join('').toUpperCase())) words.splice(-letters.length);
    else if (state) words.splice(-state);
    else break;
  }
  if (words.length > 1 && words[0].toUpperCase() === 'THE') words.shift();
  // Shouted titles put a founder's initials last (SMITH A O, BERKLEY W R): A.O. Smith, W.R. Berkley, VF.
  const initials = shout ? words.join(' ').match(/^(?:(\S+) )?([A-Z]) ([A-Z])$/) : null;
  if (initials) words.splice(0, words.length, ...(initials[1] ? [`${initials[2]}.${initials[3]}.`, initials[1]] : [initials[2] + initials[3]]));
  // Shouted titles read better in title case, but acronyms stay: no vowel (CSX, PNC) or a short
  // word the ticker starts with (KLA, ING Groep). EBAY and LEVI are words, so they do not.
  const part = (w: string, i: number, joined: boolean) => !shout || !/^[A-Z]{2,}$/.test(w) ? w
    : !/[AEIOUY]/.test(w) || (!joined && w.length <= 3 && symbol.startsWith(w)) ? w
    : i > 0 && CONNECTORS.has(w) ? w.toLowerCase() : /^MC[A-Z]{2,}$/.test(w) ? `Mc${w[2]}${w.slice(3).toLowerCase()}` : w[0] + w.slice(1).toLowerCase();
  // Joined names are cased part by part (COCA-COLA, CULLEN/FROST).
  const word = (w: string, i: number) => { const parts = w.split(/([/-])/); return parts.map((p, j) => j % 2 ? p : part(p, i + j, parts.length > 1)).join(''); };
  return words.length ? words.map(word).join(' ') : title.trim();
}
