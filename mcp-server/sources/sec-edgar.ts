import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { aliasTicker, displayName, nameKeys, tickerForm } from '../companies.js';
export const padCik = (value: string | number) => {
  const digits = String(value).replace(/^CIK/i, '');
  if (!/^\d{1,10}$/.test(digits)) throw new Error('CIK must contain 1–10 digits');
  return digits.padStart(10, '0');
};
export class SecEdgar {
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = -Infinity;
  private fetcher: typeof fetch;
  private cacheDir: string;
  private userAgent: string;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  constructor(options: { fetch?: typeof fetch; cacheDir?: string; userAgent?: string; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.cacheDir = options.cacheDir ?? 'data/cache';
    this.userAgent = options.userAgent ?? secUserAgent();
    if (!/\S+.*\s+.*[^\s@]+@[^\s@]+\.[^\s@]+/.test(this.userAgent)) throw new Error('SEC_USER_AGENT must use format AppName contact@example.com');
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }
  async json(url: string, ttl: number): Promise<any> {
    // Serialize cache checks and request starts across all endpoints in this client.
    const task = this.queue.then(async () => {
      const file = join(this.cacheDir, createHash('sha256').update(url).digest('hex') + '.json');
      try { const cached = JSON.parse(await readFile(file, 'utf8')); if (this.now() - cached.time < ttl) return cached.data; } catch {}
      const delay = Math.max(0, 210 - (this.now() - this.lastStart));
      if (delay) await this.sleep(delay);
      this.lastStart = this.now();
      const response = await this.fetcher(url, { headers: { 'User-Agent': this.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`SEC HTTP ${response.status} at ${url}`);
      const data = await response.json();
      await mkdir(this.cacheDir, { recursive: true });
      const temporary = file + '.' + randomUUID();
      await writeFile(temporary, JSON.stringify({ time: this.now(), data }));
      await rename(temporary, file);
      return data;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  tickers() { return this.json('https://www.sec.gov/files/company_tickers.json', 24 * 3600000); }
  submissions(cik: string) { return this.json(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`, 6 * 3600000); }
  companyfacts(cik: string) { return this.json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`, 6 * 3600000); }
  async lookup(query: string) {
    const ticker = aliasTicker(query, true) ?? tickerForm(query), keys = nameKeys(query);
    const rows = Object.values(await this.tickers()) as { cik_str: number; ticker: string; title: string }[];
    // Rank whole-word name matches only: a bare substring turns "OK" into "BROKERS" and "US" into "BUSINESS".
    const rank = (r: typeof rows[number]) => {
      if (r.ticker.toUpperCase() === ticker) return 0;
      const titles = nameKeys(r.title);
      const ranks = keys.flatMap(key => titles.map(title => title === key ? 1 : title.startsWith(key + ' ') ? 2 : ` ${title} `.includes(` ${key} `) ? 3 : 9));
      return Math.min(9, ...ranks) < 9 ? Math.min(...ranks) : -1;
    };
    return rows.map((r, i) => ({ r, i, rank: rank(r) })).filter(x => x.rank >= 0).sort((a, b) => a.rank - b.rank || a.i - b.i)
      .slice(0, 5).map(({ r }) => ({ cik: padCik(r.cik_str), ticker: r.ticker, title: r.title, name: displayName(r.ticker, r.title) }));
  }
  async resolve(value: string) {
    if (/^(CIK)?\d{1,10}$/i.test(value)) return padCik(value);
    const rows = await this.lookup(value);
    const exact = rows.find(r => r.ticker.toUpperCase() === tickerForm(value));
    if (!exact) throw new Error(`Unknown ticker: ${value}`);
    return exact.cik;
  }
}

export function secUserAgent(env: NodeJS.ProcessEnv = process.env, warn = console.warn) {
  if (env.SEC_USER_AGENT?.trim()) return env.SEC_USER_AGENT.trim();
  const email = env.SEC_CONTACT_EMAIL?.trim() || 'contact@example.com';
  if (!env.SEC_CONTACT_EMAIL?.trim()) warn('SEC_CONTACT_EMAIL is unset; using contact@example.com placeholder. Configure a real contact before regular use.');
  return `${env.SEC_APP_NAME?.trim() || 'FinwispHome/0.1'} ${email}`;
}
