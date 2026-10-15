export const ALIASES: Record<string, string[]> = {
  // Preference order breaks ties inside one filing: Revenues is total revenue,
  // while contract revenue can be a subset (Berkshire, Walmart).
  Revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
  GrossProfit: ['GrossProfit'], NetIncomeLoss: ['NetIncomeLoss'], Assets: ['Assets'], Liabilities: ['Liabilities'],
  OperatingIncomeLoss: ['OperatingIncomeLoss'], CostOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'],
  NetCashProvidedByUsedInOperatingActivities: ['NetCashProvidedByUsedInOperatingActivities'],
};
export function annualFinancials(data: any, metrics: string[], years: number) {
  // Anchor each accession to its current annual period, even if a requested
  // concept exists only in comparative years within that filing. Facts dated
  // after the filing date are forward-looking estimates, not reported periods.
  const reported = (r: any) => !(typeof r.filed === 'string' && typeof r.end === 'string' && r.end > r.filed);
  const filingEnds = new Map<string, number>();
  for (const fact of Object.values(data.facts?.['us-gaap'] ?? {}) as any[]) for (const rows of Object.values(fact.units ?? {}))
    for (const r of rows as any[]) {
      const end = Date.parse(r.end), days = (end - Date.parse(r.start)) / 86400000;
      if (r.form !== '10-K' || r.fp !== 'FY' || !reported(r) || !Number.isFinite(end) || (r.start && (!Number.isFinite(days) || days < 350 || days > 380))) continue;
      const id = `${r.accn}:${r.fy}`;
      filingEnds.set(id, Math.max(filingEnds.get(id) ?? -Infinity, end));
    }
  // Count years back from the latest annual report, so a concept the company
  // stopped tagging cannot surface decade-old figures as the latest ones.
  const latestYear = Math.max(...[...filingEnds.keys()].map(id => Number(id.split(':').at(-1))));
  return metrics.map(metric => {
    const requested = metric.split('/');
    const key = Object.keys(ALIASES).find(k => k === metric || ALIASES[k].some(c => requested.includes(c)));
    const concepts = key ? ALIASES[key] : requested;
    const instant = key === 'Assets' || key === 'Liabilities';
    const periods = new Map<string, any>();
    for (const concept of concepts) for (const [unit, rows] of Object.entries(data.facts?.['us-gaap']?.[concept]?.units ?? {})) {
      for (const row of rows as any[]) {
        if (row.form !== '10-K' || row.fp !== 'FY' || !reported(row) || !Number.isInteger(row.fy) || !Number.isFinite(row.val)) continue;
        const end = Date.parse(row.end), start = Date.parse(row.start);
        if (!Number.isFinite(end)) continue;
        if (instant ? !!row.start : !Number.isFinite(start) || (end - start) / 86400000 < 350 || (end - start) / 86400000 > 380) continue;
        // fy labels the filing, including comparative facts. Shift it by the
        // relationship between this period end and the filing's current FY end.
        const currentEnd = Math.max(end, filingEnds.get(`${row.accn}:${row.fy}`) ?? end);
        const fiscalYear = row.fy - Math.round((currentEnd - end) / (365.2425 * 86400000));
        const id = `${unit}:${row.end}`, prior = periods.get(id);
        if (!prior || row.filed > prior.filed) periods.set(id, { fiscalYear, value: row.val, unit, end: row.end, filed: row.filed, accessionNumber: row.accn, concept });
      }
    }
    const byYear = new Map<string, any>();
    for (const r of periods.values()) { const id = `${r.unit}:${r.fiscalYear}`, p = byYear.get(id); if (!p || r.end > p.end || (r.end === p.end && r.filed > p.filed)) byYear.set(id, r); }
    const selectedYears = [...new Set([...byYear.values()].map(r => r.fiscalYear))].filter(y => !Number.isFinite(latestYear) || y > latestYear - years).sort((a,b) => b-a).slice(0,years);
    const values = [...byYear.values()].filter(r => selectedYears.includes(r.fiscalYear)).sort((a,b) => b.fiscalYear-a.fiscalYear || a.unit.localeCompare(b.unit));
    return { metric: key ?? metric, concepts, values };
  });
}
