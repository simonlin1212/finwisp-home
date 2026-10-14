import React from 'react';
export type ToolEvent={call_id:string;tool:string;status:'started'|'completed'|'failed';duration_ms:number};
export function updateTools(tools:ToolEvent[],event:ToolEvent){return tools.some(t=>t.call_id===event.call_id)?tools.map(t=>t.call_id===event.call_id?event:t):[...tools,event];}
export function ToolChips({tools}:{tools:ToolEvent[]}){return <div className="tool-row" aria-label="MCP tool calls">{tools.map(t=><span className={`tool-chip ${t.status}`} key={t.call_id}>{t.tool} · {t.status==='started'?'running':t.status==='completed'?'done':'error'} · {t.duration_ms} ms</span>)}</div>;}
