# SEC EDGAR data: access terms (checked 2026-10-15 SGT)

Sources (official sec.gov pages, read live):
- https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data (last reviewed 2024-06-26)
- https://www.sec.gov/privacy — "Internet Security Policy" and "Website Dissemination" (last reviewed 2023-11-29)

Key terms:
1. **Free, no API key.** Submissions and XBRL data are offered as RESTful JSON APIs on data.sec.gov.
2. **Fair access:** max **10 requests/second in total**, regardless of number of machines. Exceeding it may get the IP limited until traffic stays below the threshold for 10 minutes. Download only what you need.
3. **Declare a User-Agent** with app/company name and admin contact email (e.g. `Sample Company Name AdminContact@<domain>.com`).
4. **Reuse:** "Information presented on sec.gov is considered public information and may be copied or further distributed ... without the SEC's permission. Please consider appropriate citation to the SEC as the source."
5. **Trademarks:** do not use the SEC seal/logos; "SEC", "EDGAR" are registered trademarks — may be referred to in text without implying affiliation/endorsement. Do not use EDGAR in the product name.
6. No technical support for scripted access; ticker files are "not guaranteed for accuracy or scope".

How finwisp-home complies: `SEC_USER_AGENT` env var (required for real use), client-side limit 5 req/s, disk cache (tickers 24h, filings/facts 6h), "Source: SEC EDGAR" citation on every tool result, no SEC/EDGAR logos, README states no affiliation.
