import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../mcp-server/memory.js';
import { isAdvice, policyResponse, INSTRUCTIONS } from '../mcp-server/policy.js';
import { askWith, parseIntent } from '../orchestrator/index.js';
import { educationHandlers as h, formatUSD } from '../mcp-server/education.js';
test('atomic memory persists across stores; concurrent events, validation and caps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'profiles-'));try{
 const store=new ProfileStore(dir);assert.equal((await store.get()).lastSession,'');
 await Promise.all(Array.from({length:8},()=>store.update('family',{type:'concept',concept:'net_margin'})));
 await store.update('family',{type:'quiz',score:1,missedConcepts:['net_margin']});await store.update('family',{type:'company',company:'COST'});await store.update('family',{type:'session',summary:'Reviewed Costco.'});
 const p=await new ProfileStore(dir).get();assert.equal(p.conceptsLearned.net_margin.count,8);assert.ok(p.conceptsLearned.net_margin.lastSeen);assert.equal(p.quizHistory[0].score,1);assert.deepEqual(p.companiesFollowed,['COST']);assert.equal(p.lastSession,'Reviewed Costco.');
 assert.deepEqual(await readdir(dir),['family.json']);assert.deepEqual(JSON.parse(await readFile(join(dir,'family.json'),'utf8')),p);
 await assert.rejects(store.get('../escape'));assert.throws(()=>store.update('family',{type:'quiz',score:4,missedConcepts:[]}));assert.throws(()=>store.update('family',{type:'session',summary:'x'.repeat(1001)}));
 for(let i=0;i<102;i++)await store.update('family',{type:'quiz',score:0,missedConcepts:[]});assert.equal((await store.get()).quizHistory.length,100);
 await writeFile(join(dir,'huge.json'),' '.repeat(65537));await assert.rejects(store.get('huge'),/size cap/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('policy tricky requests and educational questions',()=>{
 for(const text of ['Should I hold COST?','What is your price-target for Apple?','Will it go up?','Could NVDA double next year?','Is Costco worth buying?','Allocate 20% to AAPL?','How much should I put into shares?','Would you recommend this stock?','Is it a good investment?','Will Apple recover?','Should I sell my shares?'])assert.equal(isAdvice(text),true,text);
 for(const text of ['What is Net Margin?','COST revenue growth','Explain operating cash flow','continue where we left off'])assert.equal(isAdvice(text),false,text);
 assert.equal(policyResponse().questions.length,3);assert.match(policyResponse().text,/not investment advice/);assert.ok(INSTRUCTIONS.length<=512);
});
test('orchestrator policy bypass, continue reviews missed concepts and parses intents',async()=>{
 assert.equal((await askWith(async()=>{throw Error('must not call MCP');},'Will it go up?')).mode,'policy');
 const calls:string[]=[];const p={quizHistory:[{missedConcepts:['net_margin']}],lastSession:'Reviewed COST',companiesFollowed:['COST']};
 const result=await askWith(async(name,args)=>{calls.push(name);return name==='get_learning_profile'?{profile:p}:{concept:args.concept,text:'Profit after expenses.'};},'continue where we left off');assert.deepEqual(calls,['get_learning_profile','explain_concept','make_quiz']);assert.equal((result as any).review.length,1);
 assert.deepEqual(parseIntent('teach me about COST net margin'),{company:'COST',topic:'net_margin',continue:false});
});
test('card formatting preserves raw figures and quiz hides keys with varied deterministic positions',async()=>{
 const computed=[{metric:'net_margin',fiscalYear:2026,value:.03,sources:[{fiscalYear:2026,value:303200000000,unit:'USD',end:'2026-12-31',accessionNumber:'x'}]},{metric:'operating_margin',fiscalYear:2026,value:.05,sources:[]}];
 const card=await h.make_card({type:'metric',metric:'net_margin',computed});assert.equal(card.card.title,'Net Margin');assert.match(card.card.body,/3\.0%/);assert.match(card.card.body,/\$303\.2B/);assert.equal(card.card.figures[0].value,.03);assert.equal(formatUSD(-303200000000),'-$303.2B');
 const quiz=await h.make_quiz({computed});assert.deepEqual(quiz,await h.make_quiz({computed}));assert.ok(!JSON.stringify(quiz).includes('answer_keys'));assert.ok(quiz.questions.every(q=>q.options.length>=3 && q.options.length<=4 && new Set(q.options).size===q.options.length));assert.ok(quiz.questions[1].options.includes('5.0%'));
 await assert.rejects(h.grade_quiz({quiz_id:quiz.quiz_id,answers:[3,3,3]}),/outside options/);
});
test('quiz expiry rejects grading after the one-hour TTL',async()=>{
 const original=Date.now;let now=original();Date.now=()=>now;
 try{const quiz=await h.make_quiz({computed:[]});now+=3600001;await assert.rejects(h.grade_quiz({quiz_id:quiz.quiz_id,answers:[0,0,0]}),/expired/);}finally{Date.now=original;}
});
test('grading optionally records score and missed concepts in learning memory',async(t)=>{
 const {profiles}=await import('../mcp-server/memory.js');const events:any[]=[];
 t.mock.method(profiles,'update',async(id:string,event:unknown)=>{events.push({id,event});return {};});
 const quiz=await h.make_quiz({computed:[]});await h.grade_quiz({quiz_id:quiz.quiz_id,answers:[0,0,0]});assert.equal(events.length,0);
 const grade=await h.grade_quiz({quiz_id:quiz.quiz_id,answers:[0,0,0],profile_id:'family'});assert.equal(events.length,1);assert.equal(events[0].id,'family');assert.equal(events[0].event.score,grade.score);assert.deepEqual(events[0].event.missedConcepts,grade.results.filter(r=>!r.correct).map(r=>r.concept));
});
test('trading verbs about the business are education; personal money moves are advice',()=>{
 for(const text of ['Put all my savings in Nvidia','Is Apple a buy?','Buy or sell Tesla?','Is now a good time to buy Costco?','Buy NVDA now?','Is NVDA a good stock to buy?','Is it too late to get into Nvidia?','Move my retirement money into Costco','What percentage of my portfolio should be Apple?','我应该买英伟达吗',
  // Reviewer-found misses: family members deciding, judgment words, opinions without "should I".
  'Should my daughter buy Tesla?','Should our family invest in Costco?','My kids want to buy Tesla stock, should they?','Would you buy Apple?','Do you think I should buy Nvidia?','Tell me whether to buy Costco','Teach me about Costco and tell me if I should buy it','Is it OK to buy Tesla?','Is Nvidia a good company to invest in?','Apple or Microsoft, which is better to buy?','We want to invest in Apple',
  'Grandma wants to know if she should buy Disney','Is it too risky to invest in Rivian?','Should I put $10,000 into Apple?','Is Apple overpriced?','Pick one stock for my kid','Is Walmart going to beat the market?','苹果股票能买吗'])assert.equal(isAdvice(text),true,text);
 for(const text of ['What does Costco sell?','Does Apple hold cash?','How does Apple invest in R&D?','What does Costco sell today?',"Explain Apple's product portfolio",'How does Apple allocate capital?','Does Costco buy back shares?','Can we keep learning about Costco?','OK teach me Tesla',
  'Teach me about Best Buy','Can you explain what Costco and Walmart sell?','How do companies decide what to sell?','Can revenue fall while profit rises?','What share of its revenue does Costco put into wages?','Hold on, what is net margin?','好市多卖什么？','苹果公司持有多少现金？'])assert.equal(isAdvice(text),false,text);
});
test('price calls, best-buy picks, holdings and valuation are advice; figures, learning and everyday words are not',()=>{
 for(const text of ['Will Nvidia go up after earnings?','Could Apple crash if sales disappoint?','Is Apple the best buy right now?','Should I buy Best Buy?','Is Costco a hold?','Should I keep my Tesla stock?','What percentage of my 401k should be Nvidia?',
  'Is Nvidia stock a bargain?','Is Apple fairly valued?','Thoughts on buying Nvidia?','What are hedge funds buying?','Where will Tesla stock be next year?','Is buying Tesla a mistake?','How many shares of Apple should I get?','Should I learn about Apple or just buy it?'])assert.equal(isAdvice(text),true,text);
 for(const text of ["Can Apple's profit rise while revenue falls?",'I want to learn about investing','Teach my kids how the stock market works',"I'm short on time, explain net margin",'Does Costco own its stores?','Could we get into Nvidia margins?','What do they sell?',
  'Our family runs a store, how do we invest in inventory?','What does Best Buy sell?','What is a sell-side analyst?','Is learning finance a good investment of time?','Will Costco keep its membership fee?'])assert.equal(isAdvice(text),false,text);
});
test('company intent prefers known names over capitalised words and strips filler',async()=>{
 for(const [text,company] of [['OK teach me Tesla','TSLA'],['Teach me about Costco net margin in the US','COST'],["Explain Apple's AI spending",'AAPL'],['Teach me about Google','GOOGL'],['Teach me about Coca-Cola','KO'],['BRK.B net margin','BRK.B'],['Starbucks earnings','SBUX'],['Pfizer earnings','Pfizer'],["Tell me about Boeing's liabilities","Boeing's"]])assert.equal(parseIntent(text).company,company,text);
 assert.match((await askWith(async()=>{throw Error('must not call MCP');},'英伟达是做什么的')).text!,/English/);
});
test('lookup matches whole words, everyday names and share-class tickers',async(t)=>{
 const {SecEdgar}=await import('../mcp-server/sources/sec-edgar.js');const cacheDir=await mkdtemp(join(tmpdir(),'lookup-'));t.after(()=>rm(cacheDir,{recursive:true,force:true}));
 const tickers=[['IBKR','Interactive Brokers Group, Inc.'],['IBM','INTERNATIONAL BUSINESS MACHINES CORP'],['CCEP','COCA-COLA EUROPACIFIC PARTNERS plc'],['KO','COCA COLA CO'],['GOOGL','Alphabet Inc.'],['BRK-B','BERKSHIRE HATHAWAY INC'],['COST','COSTCO WHOLESALE CORP /NEW']].map(([ticker,title],i)=>({cik_str:i+1,ticker,title}));
 const sec=new SecEdgar({cacheDir,userAgent:'Test test@example.com',fetch:(async()=>Response.json({...tickers})) as typeof fetch});
 assert.deepEqual(await sec.lookup('OK'),[]);assert.deepEqual(await sec.lookup('US'),[]);
 assert.equal((await sec.lookup('Coca-Cola'))[0].ticker,'KO');assert.equal((await sec.lookup('Google'))[0].ticker,'GOOGL');
 assert.equal((await sec.lookup('BRK.B'))[0].ticker,'BRK-B');assert.equal(await sec.resolve('BRK.B'),'0000000006');
 assert.equal((await sec.lookup('COST'))[0].name,'Costco');
});
test('spoken and displayed names drop SEC legal suffixes',async()=>{
 const {displayName}=await import('../mcp-server/companies.js');
 for(const [ticker,title,name] of [['COST','COSTCO WHOLESALE CORP /NEW','Costco'],['AAPL','Apple Inc.','Apple'],['BA','BOEING CO','Boeing'],['RIVN','Rivian Automotive, Inc. / DE','Rivian'],['XYZ','Block, Inc.','Block'],['AI','C3.ai, Inc.','C3.ai'],['GS','GOLDMAN SACHS GROUP INC','Goldman Sachs Group'],
  ['WFC','WELLS FARGO & COMPANY/MN','Wells Fargo'],['GLW','CORNING INC /NY','Corning'],['NYT','NEW YORK TIMES CO','New York Times'],['BNY','Bank of New York Mellon Corp','Bank of New York Mellon'],
  ['CSX','CSX CORP','CSX'],['KLAC','KLA CORP','KLA'],['ING','ING GROEP NV','ING Groep'],['EBAY','EBAY INC','Ebay'],['BUD','Anheuser-Busch InBev SA/NV','Anheuser-Busch InBev'],
  ['AYI','ACUITY INC. (DE)','Acuity'],['GMAB','GENMAB A/S','Genmab'],['RY','ROYAL BANK OF CANADA','Royal Bank of Canada'],
  // Slashes inside a name stay, founders' initials read first, joined words are cased part by part.
  ['TM','TOYOTA MOTOR CORP/','Toyota Motor'],['CIXPF','CaixaBank/ADR','CaixaBank'],['TWLV','Twelve Seas Investment Co III/Cayman','Twelve Seas Investment Co III'],['MHO','M/I HOMES, INC.','M/I Homes'],['CFR','CULLEN/FROST BANKERS, INC.','Cullen/Frost Bankers'],['AIDX','20/20 Biolabs, Inc.','20/20 Biolabs'],
  ['AOS','SMITH A O CORP','A.O. Smith'],['DHI','HORTON D R INC /DE/','D.R. Horton'],['VFC','V F CORP','VF'],['NTZ','NATUZZI S P A','Natuzzi'],['CEPV','Cantor Equity Partners V, Inc.','Cantor Equity Partners V'],
  ['BBW','BUILD-A-BEAR WORKSHOP INC','Build-A-Bear Workshop'],['CALM','CAL-MAINE FOODS INC','Cal-Maine Foods'],['ASB','ASSOCIATED BANC-CORP','Associated Banc-Corp']])assert.equal(displayName(ticker,title),name);
});
test('possessive and joined company names find their SEC filer',async(t)=>{
 const {aliasTicker}=await import('../mcp-server/companies.js'),{SecEdgar}=await import('../mcp-server/sources/sec-edgar.js');
 const cacheDir=await mkdtemp(join(tmpdir(),'names-'));t.after(()=>rm(cacheDir,{recursive:true,force:true}));
 const tickers=[{cik_str:63908,ticker:'MCD',title:'MCDONALDS CORP'},{cik_str:60667,ticker:'LOW',title:'LOWES COMPANIES INC'},{cik_str:885639,ticker:'KSS',title:'KOHLS Corp'},{cik_str:794367,ticker:'M',title:"Macy's, Inc."},{cik_str:80424,ticker:'PG',title:'PROCTER & GAMBLE Co'},{cik_str:18230,ticker:'CAT',title:'CATERPILLAR INC'},{cik_str:732717,ticker:'T',title:'AT&T INC.'},{cik_str:1283699,ticker:'TMUS',title:'T-Mobile US, Inc.'}];
 const sec=new SecEdgar({cacheDir,userAgent:'Test test@example.com',fetch:(async()=>Response.json(Object.fromEntries(tickers.map((t,i)=>[i,t])))) as any});
 for(const [query,ticker] of [["Lowe's",'LOW'],['Lowes','LOW'],["Kohl’s",'KSS'],["Macy's",'M'],['Procter and Gamble','PG'],["Caterpillar's",'CAT'],["McDonald's",'MCD']])assert.equal((await sec.lookup(query))[0]?.ticker,ticker,query);
 for(const [text,ticker] of [["Teach me about McDonald's",'MCD'],["What does McDonald’s sell?",'MCD'],["Apple's margins",'AAPL'],['Is Coke profitable?','KO'],['Teach me Bank of America','BAC'],['Tell me about T-Mobile','TMUS'],['Teach me about Best Buy','BBY'],['Teach me COKE',undefined]] as [string,string|undefined][])assert.equal(aliasTicker(text),ticker,text);
 for(const [text,company] of [["Teach me about Lowe's revenue","Lowe's"],['Teach me about T-Mobile','TMUS'],["What's Caterpillar's net margin?","Caterpillar's"],
  ['What does Etsy sell?','Etsy'],['What did Lululemon buy last year?','Lululemon'],['What does Best Buy sell?','BBY'],['Teach me COKE','COKE']])assert.equal(parseIntent(text).company,company,text);
});
test('asking what a company sells looks up that company',async()=>{
 const queries:string[]=[];
 for(const text of ['What does Etsy sell?','What did Lululemon buy last year?']){
  const result:any=await askWith(async(name,args)=>{
   if(name==='lookup_company'){queries.push(String(args.query));return {companies:[{ticker:'ZZZ',cik:'1',title:'ZZZ CORP'}]};}
   if(name==='get_filings')return {filings:[]};if(name==='get_financials')return {financials:[]};
   if(name==='update_learning_profile')return {profile:{}};return (h as any)[name](args);
  },text);
  assert.equal(result.mode,'education',text);
 }
 assert.deepEqual(queries,['Etsy','Lululemon']);
});
test('a company without 10-K figures explains why instead of showing empty cards',async()=>{
 const result:any=await askWith(async(name,args)=>{
  if(name==='lookup_company')return {companies:[{ticker:'TSM',cik:'1046179',title:'TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD'}]};
  if(name==='get_filings')return {filings:[]};if(name==='get_financials')return {financials:[{metric:'Revenue',values:[]}]};
  if(name==='update_learning_profile')return {profile:{}};return (h as any)[name](args);
 },'Teach me about TSMC');
 assert.match(result.text,/^TSMC has no annual 10-K report.*20-F/);assert.equal(result.company.name,'TSMC');assert.equal(result.cards.items.length,2);
 assert.equal(new Set(result.quiz.questions.map((q:any)=>q.prompt)).size,3);
});
test('stock moves near figures, picks and plans inside lessons, and modal questions about people are advice',()=>{
 for(const text of ['Will earnings make the stock go up?','Will earnings make Nvidia go up?','Could good earnings make Disney jump?','Will strong earnings make Nvidia shares rise?',"Can Tesla's profit help the stock double?",
  'Do you know any good stocks?','Do you know a good stock for my daughter?','Teach me the best stocks for kids','Teach my son the best stocks to own','Help me understand the safest stocks for a teenager','Teach me how to invest $500 for my son','Teach me how to invest our savings',
  'What should teenagers buy?','What should Dad buy, Apple or Nvidia?','What would Grandpa buy?','What should 15 year olds invest in?','What should first-timers buy?',
  'Should I go short on Tesla?','Should I hold off on Nvidia until after earnings?','Should I get into the S&P 500?','Should I own a little Tesla?','Is it smart to own a Tesla share?',
  'How should I split $1000 between Apple and Tesla?','Will Nvidia hit $200?','Will Apple stock reach $300?','Is Apple trading below fair value?','Which stocks do investors like?','Would buying Apple be a smart move?','Is now a good time for Nvidia?','Can you explain why Nvidia shares will drop?','Why will shares drop tomorrow?','Does it make sense to buy Apple?','How high can Nvidia go?',"What's a good entry price for Nvidia?","What's your price prediction for Meta?",'Should I go long on Microsoft?','Should we bail on Disney?','Which is the safer bet, Walmart or Target?','Is Tesla a better pick than Ford?',"Will Netflix's stock bounce back?",'Will Tesla be worth more in five years?','Is Costco going to be higher next year?'])assert.equal(isAdvice(text),true,text);
});
test('business figures, accounting terms and everyday phrases with trading words are education',()=>{
 for(const text of ['How does Apple split revenue between products and services?','How many shares does Apple have outstanding?','How many shares did Apple buy back last year?',"Did Apple's revenue reach $400 billion?",
  'What does fair value mean in a 10-K?','What metrics do investors like to use?','Was Amazon buying Whole Foods a smart move?','Could rising interest rates hurt Disney?','Can falling sales still mean higher profit?',
  'Is it a good time for kids to learn about stocks?','what does best buy sell?',"How did best buy's revenue change?",'best buy net_margin',"I'm short on cash, explain cash flow",'Can we get into the details of the margins?','Does Costco own its stores?','I own a small cafe, what does gross margin mean for me?','Teach me how to invest','Can you explain why shares drop after earnings?','How low can gross margin go before a store loses money?','Will costs be higher next year?','Can revenue rebound after a bad year?','Should we bail on the quiz?'])assert.equal(isAdvice(text),false,text);
});
test('shouted questions and names after legal suffixes read naturally',async()=>{
 const {displayName}=await import('../mcp-server/companies.js');
 for(const [ticker,title,name] of [['TRST','TRUSTCO BANK CORP N Y','Trustco Bank'],['FCX','FREEPORT-MCMORAN INC','Freeport-McMoran'],['MCK','MCKESSON CORP','McKesson'],['AEXA','American Exceptionalism Acquisition Corp. A','American Exceptionalism Acquisition'],['IPEX','Inflection Point Acquisition Corp. V','Inflection Point Acquisition Corp V'],['AOS','SMITH A O CORP','A.O. Smith']])assert.equal(displayName(ticker,title),name);
 assert.equal(parseIntent('TEACH ME ABOUT COKE').company,'KO');assert.equal(parseIntent('TEACH ME ABOUT NVDA').company,'NVDA');assert.equal(parseIntent('Tell me about COKE').company,'COKE');
});
test('review round 3: predictions, price levels, valuations and picks stay advice; lessons, hypotheticals and shortages stay education',async()=>{
 for(const text of ['Can you predict if the stock goes up?','Can you tell me when the stock goes up?','Will Apple hit $300 after earnings?','Can Nvidia reach $200 if sales keep growing?','How high can Nvidia go after earnings?','Will Disney be worth more after earnings?',
  "What is Tesla's fair value?","What's the fair value of Nvidia stock?",'Best buy for a beginner?','best buy under $50?','Which one is best buy this year?','How should kids split allowance between saving and stocks?',"What's the best way to split savings between stocks and bonds?",
  'Should I average down on Intel?','Would you put your money in Coca-Cola?','I have 1000 dollars, where should I put it?','Help me decide between Apple and Google stock'])assert.equal(isAdvice(text),true,text);
 for(const text of ['I own a small café, how do I read a profit and loss statement?','Teach my kids about investing money wisely','Teach me how to invest money','When you own a share, what do you get?','If my kids own a share of Apple, do they get to vote?',
  'Can we hold off on the quiz until tomorrow?','Can we get into the balance sheet now?','Can we get into the 10-K?','Could we get into how Apple makes money?','Will rising costs make profit drop?','Can higher costs make margins fall?',"I'm short on ideas",'What can Costco sell besides groceries?','What will Apple sell next year?',"Disney's revenue reached $88 billion, what does that mean?",'Explain what happens when stocks crash'])assert.equal(isAdvice(text),false,text);
 const {aliasTicker}=await import('../mcp-server/companies.js');
 assert.equal(aliasTicker('COKE',true),undefined);assert.equal(aliasTicker('coke',true),'KO');assert.equal(parseIntent('COKE').company,'COKE');
 assert.equal(parseIntent('TEACH ME ABOUT NET').company,'NET');assert.equal(parseIntent('IS IT OK TO TALK ABOUT T').company,'T');assert.equal(parseIntent('TEACH ME ABOUT PFIZER NET MARGIN').company,'PFIZER');
});
