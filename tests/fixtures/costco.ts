// Synthetic regression, not live SEC data: Revenues stops at FY2025.
const annual = (fy: number, start: string, end: string, val: number, accn: string, filed: string) => ({ fy, start, end, val, accn, filed, form:'10-K', fp:'FY' });
export const costcoFacts = { facts: { 'us-gaap': {
  Revenues: { units: { USD: [
    annual(2025,'2024-09-02','2025-08-31',250,'old','2025-10-10'),
    annual(2025,'2023-09-04','2024-09-01',240,'old','2025-10-10'),
    annual(2024,'2023-09-04','2024-09-01',239,'earlier','2024-10-10'),
  ] } },
  RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
    annual(2026,'2025-09-01','2026-08-30',270,'new','2026-10-10'),
    annual(2026,'2024-09-02','2025-08-31',251,'new','2026-10-10'),
    annual(2026,'2026-06-01','2026-08-30',70,'new','2026-10-10'),
    {...annual(2026,'2025-09-01','2026-08-30',999,'q','2026-10-11'),form:'10-Q'},
    {...annual(2026,'2025-09-01','2026-08-30',999,'instant','2026-10-11'),start:undefined},
  ] } },
  Assets: { units: { USD: [
    {...annual(2026,'','2026-08-30',100,'new','2026-10-10'),start:undefined},
    {...annual(2026,'','2025-08-31',90,'new','2026-10-10'),start:undefined},
  ] } },
} } };
