import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecEdgar, padCik } from '../mcp-server/sources/sec-edgar.js';
import { handlers, NOTE } from '../mcp-server/tools.js';
const tickers = { 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, 1: { cik_str: 1, ticker: 'OTHER', title: 'Apple Other' } };
const submissions = { filings: { recent: { form: ['10-Q', '10-K'], filingDate: ['2025-04-01', '2024-11-01'], accessionNumber: ['0000320193-25-000001', '0000320193-24-000123'], primaryDocument: ['q.htm', 'k.htm'] } } };
const row = { fy: 2024, fp: 'FY', form: '10-K', start: '2023-10-01', end: '2024-09-30', val: 100, filed: '2024-11-01', accn: 'original' };
const facts = { facts: { 'us-gaap': { RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [row, { ...row, val: 101, filed: '2025-11-01', accn: 'latest' }, { ...row, start: '2024-07-01', val: 2 }] } }, Assets: { units: { USD: [{ ...row, start: undefined }] } } } } };
async function fixture(t: any) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'finwisp-test-')); t.after(() => rm(cacheDir, { recursive: true, force: true }));
  let now = 0; const starts: number[] = []; const urls: string[] = [];
  const sec = new SecEdgar({ cacheDir, userAgent: 'Test test@example.com', now: () => now, sleep: async ms => { now += ms; }, fetch: (async (url: any) => { starts.push(now); urls.push(String(url)); return Response.json(String(url).includes('company_tickers') ? tickers : String(url).includes('companyfacts') ? facts : submissions); }) as typeof fetch });
  return { sec, starts, urls, advance: (ms: number) => { now += ms; }, cacheDir };
}
test('CIK padding and invalid values', () => { assert.equal(padCik(320193), '0000320193'); assert.equal(padCik('CIK0000320193'), '0000320193'); assert.throws(() => padCik('bad')); });
test('disk cache survives clients and expires at ticker TTL', async t => { const f = await fixture(t); await f.sec.tickers(); await f.sec.tickers(); assert.equal(f.starts.length, 1); const second = new SecEdgar({ cacheDir: f.cacheDir, userAgent: 'Test test@example.com', now: () => 1, fetch: (async () => { throw new Error('network forbidden'); }) as typeof fetch }); await second.tickers(); f.advance(24 * 3600000); await f.sec.tickers(); assert.equal(f.starts.length, 2); });
test('submissions and facts expire after six hours', async t => { const f = await fixture(t); await f.sec.submissions('1'); await f.sec.companyfacts('1'); f.advance(6 * 3600000); await f.sec.submissions('1'); await f.sec.companyfacts('1'); assert.equal(f.starts.length, 4); assert.match(f.urls[0], /CIK0000000001.json$/); });
test('concurrent requests are limited below five per second', async t => { const f = await fixture(t); await Promise.all(Array.from({ length: 8 }, (_, i) => f.sec.submissions(String(i + 1)))); assert.equal(f.starts.length, 8); for (let i = 1; i < 8; i++) assert.ok(f.starts[i] - f.starts[i - 1] >= 200); });
test('lookup_company ticker and name with education note', async t => { const f = await fixture(t), h = handlers(f.sec); const r = await h.lookup_company({ query: 'AAPL' }); assert.equal(r.companies[0].cik, '0000320193'); assert.equal(r.note, NOTE); assert.equal((await h.lookup_company({ query: 'Apple' })).companies.length, 2); });
test('get_filings filters, bounds and document URLs', async t => { const h = handlers((await fixture(t)).sec); const r = await h.get_filings({ ticker_or_cik: 'AAPL', form: '10-K', limit: 1 }); assert.equal(r.filings.length, 1); assert.equal(r.filings[0].primaryDocumentUrl, 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/k.htm'); await assert.rejects(h.get_filings({ ticker_or_cik: 'AAPL', limit: 21 })); });
test('get_financials defaults, annual deduplication, units and accession', async t => { const h = handlers((await fixture(t)).sec); const r = await h.get_financials({ ticker_or_cik: '320193' }); assert.equal(r.financials.length, 8); assert.deepEqual(r.financials[0].values.map(v => [v.fiscalYear, v.value, v.unit, v.accessionNumber]), [[2024, 101, 'USD', 'latest']]); assert.equal(r.financials[3].values.length, 1); await assert.rejects(h.get_financials({ ticker_or_cik: 'AAPL', years: 11 })); });
test('User-Agent validation', () => { assert.throws(() => new SecEdgar({ userAgent: 'invalid' })); });
