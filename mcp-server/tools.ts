import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { annualFinancials } from './financials.js';
import { educationHandlers, educationSchemas } from './education.js';
import { memoryHandlers, memorySchemas } from './memory.js';
import { conceptSchema, explainConcept, INSTRUCTIONS } from './policy.js';
import { SecEdgar } from './sources/sec-edgar.js';
export const NOTE = 'Educational use only, not investment advice.';
export const DEFAULT_METRICS = ['Revenue', 'NetIncomeLoss', 'GrossProfit', 'Assets', 'Liabilities', 'OperatingIncomeLoss', 'CostOfRevenue', 'NetCashProvidedByUsedInOperatingActivities', 'NetInterestIncome'];
const identifier = z.string().trim().min(1).max(100);
export const schemas = {
  ...educationSchemas, ...memorySchemas, explain_concept: conceptSchema,
  lookup_company: z.object({ query: identifier }),
  get_filings: z.object({ ticker_or_cik: identifier, form: z.string().min(1).optional(), limit: z.number().int().min(1).max(20).default(10) }),
  get_financials: z.object({ ticker_or_cik: identifier, metrics: z.array(identifier).min(1).max(30).default(DEFAULT_METRICS), years: z.number().int().min(1).max(10).default(5) }),
};
export function handlers(sec: SecEdgar) {
  return {
    ...educationHandlers, ...memoryHandlers, explain_concept: explainConcept,
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
      const financials = annualFinancials(data, metrics, years);
      return { cik, financials, source: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, note: NOTE };
    },
  };
}
export function createMcpServer(sec: SecEdgar) {
  const server = new McpServer({ name: 'finwisp-home', version: '0.1.0' }, { instructions: INSTRUCTIONS });
  for (const [name, handler] of Object.entries(handlers(sec))) {
    server.registerTool(name, { description: `${name}: SEC EDGAR company research. ${NOTE}`, annotations: { readOnlyHint: !['make_quiz','grade_quiz','update_learning_profile'].includes(name) }, inputSchema: schemas[name as keyof typeof schemas] }, async (args: any) => {
      try { const result = await handler(args); return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }; }
      catch (error) { const result = { error: error instanceof Error ? error.message : String(error), source: 'SEC EDGAR', note: NOTE }; return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }; }
    });
  }
  return server;
}
