import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ResearchRuntimePaths } from './market-data.ts';

export const computeTools = ['compute_run', 'compute_read', 'compute_list'];
/** Scope persisted experiments to one product session, never to the personal Codex HOME. */
export function computeServer(root: string, sessionId: string, resources: ResearchRuntimePaths = {}) {
  const project = resources.projectRoot ?? process.cwd();
  return { command: resources.python ?? resolve(project, '.local/data-sources/venv/bin/python'),
    args: ['-B', resolve(project, 'data-sources/compute_server.py')],
    env: { FINWISP_COMPUTE_HOME: resolve(root, 'compute', createHash('sha256').update(sessionId).digest('hex')), ASTOCK_DATA_HOME: resolve(root, 'market-data') },
    enabled: true, startup_timeout_sec: 25, tool_timeout_sec: 600, enabled_tools: computeTools,
    tools: { compute_run: { approval_mode: 'approve' } } };
}

export const researchComputeInstructions = `
通用计算与回测：compute_run是本产品的Python计算工作区，策略由你编程表达，不受旧回测模板种类限制。用户要求回测本身就是开展取数和模拟计算的授权；先简洁说明关键口径，再实际取数、编程、执行、检查并修正代码。真正影响策略含义的歧义才追问，不要求重复完整参数。旧backtest_conversation只是可选的固定模板快捷工具，不能用它的枚举推断产品能力；不能因为其不支持成交量、多标的、做空、隔日退出、分钟规则等就拒绝，先查实际数据覆盖并选择方法。
若选择旧模板工具，仍须按propose→完整复述→用户确认→confirm执行；BACKTEST_PLAN_MISSING须先解决propose回执原因，不能反复confirm。名称疑似识别错字时只用用户实际原话作为spokenSubject核对候选，读回纠正前后名称与代码再确认，不凭模型猜身份。模板running只表示取数或计算，completed且有metrics才是已完成，failed如实解释；回执前不声称已启动或完成。更改模板条件须新方案，进度查询复用原编号；这些模板操作规程不限制compute_run可表达的策略。
工具按需加载，列表没有compute_run时先工具发现。先data_catalog(dataset=...)核对数据请求，再在compute_run的datasets中提供请求，宿主取回原始响应并留档。第一次可以只返回字段/覆盖信息，随后用source_runs=[先前runId]复用已取回的原始数据并换代码计算，不要重复取数或手工抄写行数据。代码从inputs['datasets']读取。分页、缺失值、日期排序、复权、完整交易日和退出所需后一交易日要核对；分页截断不是完整样本。sourceTimeContexts给出原始抓取时刻与可确定的市场本地时刻，未知仍为空；据此核对完整观察日与来源时效。宿主会在inputs与回执的dataObservations独立列出OHLC异常；必须检查所有实际使用的价格行，包括只取open的退出行。异常未解决时不把收益称为有效或数据无异常。先检查OHLC为有限正值、high不低于open/close/low、low不高于open/close；异常行要用备用源核对或明确列为数据缺口。观察期要求完整日线，退出只需开盘价时不要求退出日收盘；若该日数据异常或缺失，单列未完成交易，不把19个可退出日说成完整20日，也不补零。不得编造历史数据或把模型手写的inputs当实际源数据。公开其他来源可以先实际查证再传inputs，但明确是模型传入、保留来源，不能冒充宿主直接取数。
计算全程保留原始精度，只在展示时舍入。代码自由表达入场/离场、指标、持仓和组合，输出JSON兼容result，包含实际采用的条件、来源覆盖、逐笔明细、费用和汇总。先用小样本验证关键边界，再运行实际数据；输入样本结果要标合成验证。异常读回日志修正，不把代码失败说成策略不能测。没有成交时返回0笔和原因，不编造收益。不要把模型撰写的结论冒充程序输出。
例如“盘中较前收跌5%买入、下一交易日开盘卖出”：可用日线low判断触价，开盘已越过阈值则按开盘，否则按阈值假定成交，退出用下一交易日open；这是日线触价和开盘成交假设，不是集合竞价逐笔撮合。用户接受开盘近似时不需要精确竞价数据；明确要求真实撮合时查相应数据，不擅自改成当日收盘卖出。若数据不足以区分盘中先后顺序，说明歧义，给可计算的假设选择。若同日交易限制、停牌或涨跌停影响可成交性，明确模型是否考虑，不能将纯假设说成实际可交易。
compute_run回执才证明执行；completed仅表示代码成功运行，不能声称方法被独立验证。每次代码、输入、来源、输出及失败均在本会话计算工作区保存，回执含runId；复查用compute_list/compute_read，不重跑。最终答案记录到本会话的研究记录，通用结果暂不写入旧模板回测历史；请明确位置和runId。内置模板仍可选用，但不是通用能力边界。计算无券商交易能力；不得读取登录、其他会话或系统目录。
`;
