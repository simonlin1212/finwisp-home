import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardEyebrow, educationHandlers, METRIC_GROUPS } from '../mcp-server/education.js';
import { glossary } from '../mcp-server/glossary.js';
test('card eyebrow names the topic and card type instead of one fixed label',async()=>{
 assert.equal(cardEyebrow('trend','net_margin'),'PROFITABILITY · MULTI-YEAR TREND');
 assert.equal(cardEyebrow('concept','liabilities_to_assets'),'KEY IDEA · BALANCE SHEET');
 assert.equal(cardEyebrow('metric','operating_cash_conversion'),'CASH FLOW · FROM THE 10-K');
 for(const metric of Object.keys(glossary).filter(k=>k!=='education_policy'))assert.ok(METRIC_GROUPS[metric],metric);
 const {card}=await educationHandlers.make_card({type:'concept',metric:'revenue_growth_yoy',computed:[]});
 assert.equal(card.eyebrow,'KEY IDEA · GROWTH');
 const labels=new Set(['metric','concept','trend'].flatMap(t=>Object.keys(METRIC_GROUPS).map(m=>cardEyebrow(t as any,m))));
 assert.ok(labels.size>=12 && ![...labels].some(l=>/BUSINESS BASICS/.test(l)));
});
