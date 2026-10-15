import { glossary } from './glossary.js';
import { z } from 'zod';
export const DISCLAIMER='Educational use only, not investment advice.';
// Any buy/sell/invest counts as a trade unless it describes what a business or its customers
// do ("What does Costco sell?", "companies that sell", "buy back shares"); see BUSINESS_USE.
// The patterns below also catch hold/own/short and -ing forms in decision, judgment,
// stock, valuation and prediction phrasings. Learning about investing is not a trade (LESSON).
const TRADE="(buy|buying|sell|selling|hold(?!\\s+(?:on|up|off\\s+(?:on\\s+)?(?:the|this|that)\\s+(?:quiz|lesson|game|test))\\b)|holding|invest|investing|(?<!\\b(?:a|an|the|too|very|so|in|i'm|im|am|are|is|was|were|we're|they're|running|run|ran|bit|little)\\s)short(?!\\s+(?:(?:on|of)\\s+(?:time|cash|money|sleep|staff)|time|answer|version|summary|list|term|story|run)\\b)|shorting|trim|dump|own(?!\\s+(?:(?:a|an|the|my|our|their|its|his|her)\\s+)?(?:\\w+\\s+){0,2}(?:business|businesses|company|companies|shop|shops|store|stores|cafe|restaurant|bakery|bar|salon|farm|ranch|stand|startup|franchise|firm|practice|studio|gym|clinic|home|homes|house|apartment|condo|car|truck|land|buildings?|factories|plants?|brand|patents?|pets?|dogs?|cats?)\\b)|get (?:in|into|out)(?!\\s+(?:of here|here|how|why)\\b)(?![\\w\\s']{0,25}\\b(?:margins?|revenues?|numbers|details|figures|filings|cash flow|profits?|earnings|liabilities|debt|reports?|lesson|quiz|topic|basics|concepts?|questions?|balance sheets?|income statements?|statements?|10-?[kq]|chapter|section|part)\\b)|(?:jump|hop|pile) (?:in|into|on)(?!\\s+(?:here|it|board)\\b)(?![\\w\\s']{0,25}\\b(?:margins?|revenues?|numbers|details|figures|filings|cash flow|profits?|earnings|liabilities|debt|reports?|lesson|quiz|topic|basics|concepts?|questions?|balance sheets?|income statements?|statements?|10-?[kq]|chapter|section|part|game|story|story)\\b)|add (?:more|some|a little(?: more)?|a bit(?: more)?|a few(?: more)?)(?!\\s+(?:of\\s+)?(?:\\w+\\s+)?(?:stores?|products?|items?|features?|lines?|services?|locations?|jobs?|workers?|staff|employees|details?|examples?|notes?|questions?|words?|context|pictures?|charts?|cards?|quiz|practice|numbers|figures|colou?rs?|flavou?rs?|menu)\\b)|go all in|keep(?!\\s+(?:the|a|an|this|that|it|them|going|learning|reading|practicing|track|in|up|on|my|our)\\b)|stay (?:in|invested)(?!\\s+(?:the|this|that|school|touch|mind|bed|here)\\b)|exit(?!\\s+(?:the|this|that|lesson|quiz|here)\\b)|load up|cash out|take profits?|get some|pick up some|grab some|go long|average (?:down|up)|bail on(?!\\s+(?:the|this|that|it)\\b))";
const PERSON="(i|i'm|im|we|we're|you|my (?![\\w]+'s)\\w+|our (?![\\w]+'s)\\w+|their (?:kids?|children|family)|the (?:kids?|children|family)|kids?|children|family|daughter|son)";
const MONEY='(savings|money|retirement|401\\(?k\\)?|ira|pension|nest egg|funds?|portfolio|allowance|pocket money|bonus|paycheck|salary|inheritance|windfall|tax refund|spare cash|extra cash)';
const METRIC='(revenues?|sales|margins?|profits?|income|earnings|cash|costs?|debt|expenses?)';
// People who pick stocks for a living: asking what they buy is asking for a pick.
const PICKERS='(investors?|analysts?|hedge funds?|fund managers?|the experts|experts|the pros|pros|billionaires?|insiders?|buffett|wall street|traders?)';
type Rule={test(text:string):boolean};
const ADVICE:Rule[]=[
 /\b(price[ -]?target|investment recommendation|worth buying|overvalued|undervalued|overpriced|underpriced|in a bubble|entry point|exit point|entry price|price prediction|price forecast|add to my position|time to get in|time to get out|keep this stock|strong buy|buy the dip|double down|stock pick|pick a stock|(safe|risky) stock)/,
 /\b(good|better|best|bad|great|safe|safer|safest|smart|solid|wise|sound)\s+(long[- ]term\s+)?(investment|buy|bet|pick)\b(?!\s+of\s+(time|effort|energy)\b)/,
 // "a hold", "the best buy", "a good long-term hold"; not "a sell-side analyst".
 /\b(a|an|the)\s+((good|great|solid|safe|smart|wise|bad|strong|long[- ]term|best|better|top|clear|real)\s+){0,3}(hold|buy|sell)(?![\w-])/,
 /\b(buy|hold|sell|keep)\s+or\s+(sell|fold|buy|hold|dump)\b/,
 /\b(my|our|their|your|the kids'?|his|her)\s+(portfolio|holdings|401\(?k\)?|ira|retirement account|brokerage( account)?)\b/,
 new RegExp(`(^\\s*|[,;:]\\s*|\\b(is|was|would|be|isn't|wasn't)\\s+)(buying|selling|investing in|owning|shorting)\\b.{0,40}\\b((good|bad|smart|great|wise|dumb|terrible) (idea|move|choice|decision)|mistake)\\b`),
 /\b(take|thoughts|opinion|views?|feelings?)\b.{0,15}\b(on|about)\s+(buying|selling|investing|owning|shorting)\b/,
 // Valuation, sizing and hype questions about a holding.
 /\b(fairly|over|under|correctly) ?valued\b|\b(at|below|above|under|over|near|than|to)\s+(its\s+|the\s+|a\s+)?fair value\b|\b(?!(?:asset|liability|investment|security|derivative|option|loan|contract)'s)[a-z]+'s\s+fair value\b(?!\s+(measurements?|hierarchy|levels?|accounting|option|inputs?))|\bfair value (of|for)\b.{0,20}\b(stock|shares)\b|\b(a bargain|a steal)\b|\byay or nay\b|\bto the moon\b|\bmake (me|us|my \w+|our \w+) (rich|wealthy|a fortune)\b/,
 /\bhow (high|low|far)\b.{0,30}\b(stock|shares)\b|\b(stock|shares)\b.{0,30}\bhow (high|low|far)\b|\b(stock|shares)\b.{0,15}\b(be )?worth it\b|\b(stock|shares)\b.{0,15}\bbe worth\b|\bhow many\b.{0,30}\b(shares|stocks?)\b.{0,30}\b(i|we|my|our|me|us|should)\b|\bhow many\b.{0,40}\b(should|do|can|could|would) (i|we)\b/,
 // Splitting money is allocation; a company splitting its revenue is not.
 {test:t=>/\b(split|divide|spread)\b.{0,40}\b(between|across|among)\b/.test(t) && /\b(i|we|my|our|me|us|savings|money|allowance|nest egg|portfolio|retirement|paycheck|salary)\b|\$\s?\d|\b\d[\d,.]*\s?(k|dollars)\b/.test(t)},
 /\b(good|right|bad|best|great) time for(?!\s+(a|the|learning|lesson|quiz|bed|dinner|kids?|children|beginners?|students?|teens?|teenagers?|families|family)\b)/,
 /\b(do|would) you (like|love|own|recommend)\b.{0,30}\b(stock|stocks|shares)\b/,
 new RegExp(`\\b(what|which)\\b.{0,20}\\b${PICKERS}\\b.{0,20}\\b(buy|buying|sell|selling|own|owning|pick|picking|recommend|like(?!\\s+to\\b))\\b`),
 new RegExp(`\\b${PICKERS}\\b.{0,15}\\b(say|said|rate|rating|call)\\b.{0,15}\\b(buy|sell|hold)\\b`),
 /\bkeep (my|our)\b.{0,20}\b(shares|stocks?)\b/,
 new RegExp(`\\b(smart|wise|good|right|best|bad|better|ok|okay|safe|time|moment|window|worth|whether|too late|too early|sense)( [\\w$,']+){0,3}? to ${TRADE}\\b`),
 new RegExp(`\\b(worth|thinking (about|of)|considering) ${TRADE}\\b`),
 new RegExp(`\\b(should|shall|must|can|could|do|would|will) (i|we)\\b.{0,50}\\b${TRADE}\\b`),
 new RegExp(`\\b(should|shall|must|would) (he|she|they)\\b.{0,50}\\b${TRADE}\\b`),
 new RegExp(`\\b${PERSON}( [\\w']+){0,2}? ${TRADE}\\b`),
 /\b(would you|do you|can you|could you)\b.{0,30}\b(recommend|suggest|pick|rate)\b/,
 /\b(recommend|rate)\b.{0,20}\b(stock|stocks|shares)\b/,
 /\b(should|recommend|suggest)\b.{0,40}\b(stock|stocks|shares|money|position|ticker)\b/,
 /^\s*(buy|buying|sell|selling|short)\b/,
 /\b(stock|stocks|shares|ticker)\b.{0,20}\bto (buy|sell|own|invest)\b/,
 /\b(stock|stocks|shares)\b.{0,15}\b(cheap|expensive|overpriced|underpriced|safe|risky|a good bet)\b|\b(cheap|expensive)\b.{0,10}\b(right now|now|today|at this price)\b/,
 /\bwhich\b.{0,30}\b(stock|stocks|shares)\b.{0,30}\b(buy|sell|invest|own|pick)\b|\bwhich\b.{0,30}\bsafer to (own|hold|buy)\b/,
 /\bmake money (on|from|with|off)\b.{0,30}\b(stock|stocks|shares)\b/,
 /\bwhat (should|would|could) (i|we|you) do with\b/,
 // "How high can Nvidia go?" and "Will Tesla be worth more?" are price calls; how low a margin can go is not.
 {test:t=>/\bhow (high|low|far) (can|could|will|might)\b.{0,30}\b(go|get|climb|fall|drop|rise|run)\b|\b(will|could|might|going to)\b.{0,40}\bbe worth (more|less|\$)/.test(t.replace(FIGURE_REACH,' '))},
 // Picking or ranking stocks needs no trading verb ("best stock for beginners").
 /\bpick\b.{0,20}\b(stock|stocks|shares)\b|\b(best|top|safest|safer|better|good|great)\b.{0,15}\b(stock|stocks)\b|\bbeat the market\b/,
 new RegExp(`\\b(put|move|invest|bet|dump|throw|park)\\b.{0,30}\\b(my|our|their|his|her|your)\\s+${MONEY}\\b`),
 /\bwhere (should|would|do|can) (i|we|you) put\b|\bdecide between\b.{0,40}\b(stock|stocks|shares)\b/,
 /\b(put|move|invest|bet|park)\s+(\$\s?\d[\d,.]*|\d[\d,.]*\s?(k|dollars)?|everything|all)\b.{0,30}\b(into|in|on)\b/,
 new RegExp(`\\b(my|our|his|her)\\s+${MONEY}\\b.{0,30}\\b(into|in|on)\\b`),
 /\ballocat(e|ion)\b.{0,30}(\d+\s?%|\b(my|our|money|savings|portfolio)\b)|\b(asset|portfolio) allocation\b/,
 /\b(where|what) (is|will|would)\b.{0,40}\b(stock|shares|share price|stock price)\b.{0,15}\b(headed|be worth|be|go)\b|\bwhere will\b.{0,30}\b(be trading|trade)\b/,
 // Reaching a dollar level is a price target, unless a reported figure does it ("Did revenue reach $400 billion?").
 {test:t=>/\b(hit|hits|reach|reaches)\s+\$\s?\d/.test(t.replace(FIGURE_REACH,' '))},
 // The person check is a separate test: a lookahead inside the pattern is quadratic on long input.
 {test:t=>/\b(i|we|my|our|you|your)\b/.test(t) && new RegExp(`\\b(how much|what percentage|what percent|what share|what portion)\\b.{0,40}\\b(put|weight|exposure|go into|(my|our)\\s+${MONEY})\\b`).test(t)},
 // "What stock should my daughter start with?": asking which stock to choose is a pick, whatever the verb.
 /\b(what|which)\s+(stocks?|shares|tickers?)\s+(should|would|could|can|do|does|to|is|are|might)\b(?!.{0,40}\b(learn|learning|study|read|look at|research|explore|review|quiz|compare|mean|means|trade|trades|listed|called)\b)/,
 // "What company should I put my bonus into?": choosing a company or fund for someone's money is a pick.
 new RegExp(`\\b(what|which)\\s+(company|companies|fund|funds|etfs?|index funds?|one)\\b.{0,20}\\b(should|would|could|can|do|to)\\s+${PERSON}\\b.{0,30}\\b(put|invest|buy|bet|park|start with|go with|choose|pick|own|back)\\b`),
 // Asking for a forecast of a stock or the market ("Predict where Tesla's stock will be").
 /\b(predict|forecast|guess|project)\b.{0,40}\b(stocks?|shares|share price|stock price|market|ticker)\b/,
 // "Is investing in Apple smart?": judging a trade, with the judgment anywhere after it.
 /\b(is|was|would|isn't|wasn't|are|be)\s+(buying|selling|investing in|owning|shorting|holding|getting into|adding)\b(?!\s+(more\s+)?(memberships?|products?|goods|groceries|inventory|ads|advertising|services?|subscriptions?|cars?|phones?|chips?|stores?|food)\b).{0,40}\b(smart|wise|good|bad|safe|safer|risky|dumb|okay|ok|sensible|reasonable|worth it|wrong|right|a mistake)\b/,
 // Chinese buy/sell questions get the same refusal instead of a failed company lookup.
 /(我|我们|咱|你|您|家里|孩子|应该|该不该|要不要|能不能|可不可以|值不值得|值得|适合|推荐|建议).{0,8}(买|卖|入手|持有|投资)|^\s*(买|卖)|(买|卖|入手|投资).{0,10}(好吗|好不好|行吗|划算吗|合适吗|靠谱吗)|(抄底|加仓|减仓|清仓|建仓|梭哈|割肉|目标价|会涨|会跌|涨吗|跌吗|值得买|能买|买入|卖出)/,
];
// A buyer or seller who is the user or a beginner is not a business ("What should a beginner buy?"),
// and "what should/would X buy" asks for a pick whoever X is ("What can Costco sell?" is about the business).
const NOT_PERSON="(?!(?:i|i'm|we|you|my|our|your|me|us|she|he|kids?|children|family|a|an|beginners?|someone|somebody|one|newbies?|students?|to|should|would|shall|must)\\b)";
const BUSINESS_USE=[
 new RegExp(`\\b(does|do|did)\\s+(${NOT_PERSON.replace('|to','')}[\\w&.'-]+\\s+){1,4}?(buy|sell|invest)\\b`,'g'),
 new RegExp(`\\bwhat\\s+(${NOT_PERSON}[\\w&.'-]+\\s+){1,4}?(buy|sell|invest)\\b`,'g'),
 /\b(?<!\b(?:should|shall|would|could|can|must|will)\s)(companies|company|businesses|firms|retailers|stores|people|customers|shoppers|consumers|they|who|which|that)\s+(buy|sell|invest)\b/g,
 /\bbuyback\b|\bbuy and hold\b/g,
 // "What should Costco sell more of?" asks about a business's product mix; selling is what it does.
 // Buying stays a pick ("What should Costco buy?" could mean the stock), as do people and pickers.
 new RegExp(`\\bwhat\\s+(should|could|can|would|might)\\s+(?!(?:i|we|you|my|our|your|me|us|she|he|they|kids?|children|family|a|an|beginners?|someone|somebody|one|newbies?|students?|${PICKERS.slice(1,-1)})\\b)([\\w&.'-]+\\s+){1,3}?sell\\b`,'g'),
];
// Learning about investing is a lesson ("Teach my kids about investing"), unless it names where to put money.
const LESSON=/\b(learn|learning|teach|teaching|explain|explaining|understand|know|study|read)\b(\s+(?!(should|whether|if|which|what|best|top|safest|safer|good|great|cheap|cheapest)\b)[\w']+){0,5}?\s+(about\s+|how\s+(to\s+)?|to\s+)?(investing|invest|investments?|stocks?|bonds?|shares|the stock market)\b(\s+(and|or)\s+(investing|stocks?|bonds?|shares))?(?!\s+(in|into|on|my|our|his|her|their)\b|\s*\$|\s+\d)/g;
const MOVE="(bounc(?:e|es|ing)(?: back)?|surg(?:e|es|ing)|spik(?:e|es|ing)|slump(?:s|ing)?|tumbl(?:e|es|ing)|turn(?:s|ing)? around|go(?:es|ing)? up|go(?:es|ing)? down|go(?:es|ing)? higher|rises?|rising|falls?|falling|rall(?:y|ies)|crash(?:es)?|outperform|doubles?|increases?|recovers?|drops?|dropping|tanks?|soars?|jumps?|climbs?|climbing|plunges?|sinks?|heading (?:higher|lower)|bounces? back|rebounds?|be (?:higher|lower))";
const PREDICTION=new RegExp(`\\b(will|could|can|going to|likely to|gonna|keep)\\b.{0,60}\\b${MOVE}(?![\\w-])|\\bheading (higher|lower)\\b`);
// "Tell me if the stock goes up tomorrow": asking whether something moves, or a move by a future date, is a forecast.
const ASKED_MOVE=new RegExp(`\\b(tell me|let me know|do you know|you think|guess|bet|predict)\\b.{0,15}\\b(if|whether|when)\\b.{0,40}\\b${MOVE}(?![\\w-])`);
const FUTURE_MOVE=new RegExp(`\\b${MOVE}(?![\\w-]).{0,25}\\b(tomorrow|next (week|month|quarter|year)|soon|this (week|month)|by (friday|monday|year[- ]end))\\b`);
// A business's own figures moving is a lesson ("Can revenue fall while profit rises?");
// the company or its stock moving is a prediction, even next to a figure ("Will Nvidia go up after earnings?").
const FIGURE_MOVES=new RegExp(`\\b(${METRIC.slice(1,-1)}|liabilities|assets|ratio|cash flow|margin)\\b(\\s+(?!(?:stocks?|shares?|price|make|makes|made|help|helps|push|pushes|drive|drives|send|sends|cause|causes|lift|lifts)\\b)[\\w'-]+){0,3}?\\s+${MOVE}(?![\\w-])`,'g');
// "Could rising interest rates hurt Disney?": a rising or falling figure is a condition, not a prediction.
const TREND=new RegExp(`\\b(rising|falling|growing|shrinking)\\s+(interest\\s+)?(rates?|prices?|inflation|wages|demand|${METRIC.slice(1,-1)})\\b`,'g');
// "Explain why shares drop after earnings" asks how markets work, not where one stock is going.
const MARKET_MOVES=new RegExp(`\\b(why|how|what happens (?:when|if))\\s+(do\\s+|does\\s+)?(the\\s+)?(stocks?|shares|stock prices?|share prices?|prices|(stock\\s+)?markets?)\\s+${MOVE}(?![\\w-])`,'gi');
// "Did Apple's revenue reach $400 billion?": a reported figure reaching a level is not a price call.
const FIGURE_REACH=new RegExp(`\\b(${METRIC.slice(1,-1)}|assets|liabilities|ratio|cash flow|margin)\\b(\\s+(?!(?:stocks?|shares?|price|make|makes|made|help|helps|push|pushes|drive|drives|send|sends|cause|causes|lift|lifts)\\b)[\\w'-]+){0,2}?\\s+(hit|hits|reach|reaches|reached|go|get|be worth)\\b`,'g');
const strip=(text:string,patterns:RegExp[])=>patterns.reduce((rest,pattern)=>rest.replace(pattern,' '),text);
export function isAdvice(text:string) {
 // Best Buy the company: written as a name, or lower-case in a company context ("what does best buy sell");
 // "the best buy" and "best buy for a beginner" are picks. Accents are folded (café is cafe).
 const t=strip(text.replace(/[’‘]/g,"'").replace(/\b(buy|sell)-side\b/gi,'$1side').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/(?<!\b(?:[Tt]he|[Aa]|[Mm]y|[Oo]ur|[Yy]our|[Tt]heir|[Tt]his|[Tt]hat)\s)\bBest Buy\b(?!\s+(right now|now|today|for|under|below|this)\b)/g,'bestbuyco')
   .replace(/\b(does|did|do|about|explain|on|at)\s+best buy\b|\bbest buy(?='s\b|\s+(sells?|sold|makes?|made|stores?|revenues?|sales|margins?|earnings|profits?|net|gross|operating|stock|shares|do|does|did|offers?|has|have|compete|competes|[a-z]+_\w+)\b)/gi,m=>m.replace(/best buy$/i,'bestbuyco')).toLowerCase(),[MARKET_MOVES,LESSON])
  // "When you own a share, what do you get?" describes owning, it does not ask whether to.
  .replace(/\b(when|if|once)\s+(you|we|kids?|people|someone|investors?|shareholders?|(?:my|your|our) \w+)\s+own\b/g,'$1 $2 have')
  // A company buying back its shares or investing in its own operations is not a trade.
  // "What is a hold rating?" defines a term; "What price did Apple IPO at?" is history, not an entry point.
  .replace(/\b(what is|what's|what are|what does|what do|explain|define|definition of|meaning of|mean by)\b(.{0,25}?)\b(strong\s+)?(buy|sell|hold)\s+(ratings?|recommendations?|signals?|orders?)\b/g,'$1$2ratingterm')
  .replace(/\b(entry|offer|offering|listing|opening|ipo)\s+price\b(?=.{0,40}\b(did|was|were)\b.{0,30}\b(ipo|went public|list|listed|debut|debuted)\b)/g,'ipoprice')
  .replace(/\bbuy(s|ing)?\s?backs?\b|\bbuy(s|ing)?\s+back\b|\bbought\s+back\b/g,'buyback')
  .replace(/\binvest(s|ing|ed)?\s+(\w+\s+)?in\s+(its\s+|their\s+|the\s+|our\s+|new\s+|more\s+)?(inventory|equipment|stores?|factories|plants?|research|people|employees|training|marketing|technology|r&d|growth|capacity|data centers?|chips?)\b/g,'spends on $4');
 const moves=t.replace(FIGURE_MOVES,' ').replace(TREND,' ');
 if(PREDICTION.test(moves)||ASKED_MOVE.test(moves)||FUTURE_MOVE.test(moves))return true;
 if(/\b(buy|sell|invest)\b/.test(strip(t,BUSINESS_USE)))return true;
 return ADVICE.some(rule=>rule.test(t));
}
export function policyResponse() {return {mode:'policy',spoken_text:"I can't tell you whether to buy. Check these three filing questions yourself. Educational use only.",text:`I can't tell you whether to buy. I cannot recommend trades, portfolio allocations, price targets, or predict stock prices. Here are 3 questions you can check yourself:\n1. How have revenue and margins changed in the filings?\n2. How do operating cash flow and profit compare?\n3. What risks and liabilities does the company report?\n${DISCLAIMER}`,questions:['How have revenue and margins changed in the filings?','How do operating cash flow and profit compare?','What risks and liabilities does the company report?'],note:DISCLAIMER};}
export const conceptSchema=z.object({concept:z.enum(Object.keys(glossary) as [string,...string[]])});
export async function explainConcept(args:unknown) {const {concept}=conceptSchema.parse(args);return {concept,text:glossary[concept],note:DISCLAIMER};}
export const INSTRUCTIONS='Teach in English: lookup company, read SEC filings and facts, compute metrics, show cards, then quiz and review learning memory. Refuse trade, allocation, price-target and prediction requests; reframe into three filing questions. Education only, not investment advice. SEC requests are serialized at least 210 ms apart (under five/second); use one shared SEC client.';
