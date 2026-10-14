import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { SecEdgar } from './sources/sec-edgar.js';
export const NOTE = 'Educational use only, not investment advice.';
export const DEFAULT_METRICS = ['Revenues/RevenueFromContractWithCustomerExcludingAssessedTax', 'NetIncomeLoss', 'GrossProfit', 'Assets', 'Liabilities'];
const identifier = z.string().trim().min(1).max(100);
export const schemas = {
  lookup_company: z.object({ query: identifier }),
  get_filings: z.object({ ticker_or_cik: identifier, form: z.string().min(1).optional(), limit: z.number().int().min(1).max(20).default(10) }),
  get_financials: z.object({ ticker_or_cik: identifier, metrics: z.array(identifier).min(1).max(30).default(DEFAULT_METRICS), years: z.number().int().min(1).max(10).default(5) }),
};
export function handlers(sec: SecEdgar) {
  return {
    lookup_company: async (args: unknown) => { const { query } = schemas.lookup_company.parse(args); return { companies: await sec.lookup(query), source: 'https://www.sec.gov/files/company_tickers.json', note: NOTE }; },
    get_filings: async (args: unknown) => {
      const { ticker_or_cik, form, limit } = schemas.get_filings.parse(args);
      const cik = await sec.resolve(ticker_or_cik), data = await sec.submissions(cik), recent = data.filings.recent;
      const filings = recent.accessionNumber.map((accessionNumber: string, i: number) => ({ form: recent.form[i], filingDate: recent.filingDate[i], accessionNumber,
        primaryDocumentUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNumber.replaceAll('-', '')}/${recent.primaryDocument[i]}` }))
        .filter((row: any) => !form || row.form === form).slice(0, limit);
      return { cik, filings, source: `https://data.sec.gov/submissions/CIK${cik}.json`, note: NOTE };
    },
    get_financials: async (args: unknown) => {
      const { ticker_or_cik, metrics, years } = schemas.get_financials.parse(args);
      const cik = await sec.resolve(ticker_or_cik), data = await sec.companyfacts(cik);
      const financials = metrics.map(metric => {
        const candidates = metric.split('/');
        const name = candidates.find(name => data.facts?.['us-gaap']?.[name]);
        const fact = name ? data.facts['us-gaap'][name] : undefined;
        const values = Object.entries(fact?.units ?? {}).flatMap(([unit, rows]) => {
          const byYear = new Map<number, any>();
          for (const row of rows as any[]) {
            if (row.form !== '10-K' || row.fp !== 'FY' || !Number.isInteger(row.fy)) continue;
            // Exclude quarterly/YTD duration facts also filed within an annual report.
            if (row.start) { const days = (Date.parse(row.end) - Date.parse(row.start)) / 86400000; if (days < 300 || days > 400) continue; }
            const prior = byYear.get(row.fy);
            if (!prior || row.filed > prior.filed || (row.filed === prior.filed && row.end > prior.end)) byYear.set(row.fy, row);
          }
          return [...byYear.values()].sort((a, b) => b.fy - a.fy).slice(0, years).map(row => ({ fiscalYear: row.fy, value: row.val, unit, end: row.end, accessionNumber: row.accn }));
        });
        return { metric, concept: name ?? null, values };
      });
      return { cik, financials, source: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, note: NOTE };
    },
  };
}
export function createMcpServer(sec: SecEdgar) {
  const server = new McpServer({ name: 'finwisp-home', version: '0.1.0' });
  for (const [name, handler] of Object.entries(handlers(sec))) {
    server.registerTool(name, { description: `${name}: SEC EDGAR company research. ${NOTE}`, inputSchema: schemas[name as keyof typeof schemas] }, async (args: any) => {
      try { const result = await handler(args); return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }; }
      catch (error) { const result = { error: error instanceof Error ? error.message : String(error), source: 'SEC EDGAR', note: NOTE }; return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }; }
    });
  }
  return server;
}
