"""Product-owned MCP for open-ended calculation, independent of voice transport."""
import asyncio
from contextlib import asynccontextmanager
import os
from typing import Any
from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from compute_service import ComputeService, ACTIVE, kill
from server import lifespan as data_lifespan

service = ComputeService(os.environ['FINWISP_COMPUTE_HOME'])

@asynccontextmanager
async def lifespan(_server):
    async with data_lifespan(_server):
        try:
            yield {}
        finally:
            for child in list(ACTIVE):
                kill(child)
            await asyncio.gather(*(child.wait() for child in list(ACTIVE)), return_exceptions=True)

mcp = MCPServer('Finwisp research compute', version='1.0', lifespan=lifespan, log_level='ERROR')

@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, openWorldHint=True))
async def compute_run(code: str, datasets: list[dict] | None = None, inputs: dict | list | None = None,
                      assumptions: str = '', title: str = '计算实验', source_runs: list[str] | None = None) -> dict[str, Any]:
    """运行任意Python计算/回测，不限定策略类型。先data_catalog确认数据接口，再把请求放datasets:[{dataset,params,limit,offset}]；limit缺省20，应按所需覆盖明确指定；日线limit最多400（TDX250），其他入口按目录限制。宿主实际取数留原件。已有成功取数的runId可放source_runs，宿主校验并复用该次原件，不重取也不经模型抄写；可换任意代码，多来源按source_runs顺序、再datasets顺序放入inputs['datasets']。inputs参数直接传样本对象/数组，不要额外包装provided键。代码从inputs['datasets'][i]['data']读取原始数据（含来源、分页、质量字段），自定义样本从inputs['provided']读取；样本不冒称真实行情。inputs与回执中的dataObservations为宿主独立数据异常观察，包括当日退出价所在行；须处理，不得忽略后声称数据干净。Python提供标准库及产品自带numpy/pandas；赋值result为JSON兼容结果，建议包含metrics/trades/assumptions/dataCoverage。工作区可写CSV等文件；不能访问其他目录、网络、登录或启动子进程。每次35秒墙钟/25秒CPU，监测512MB内存与32MB输出文件；错误回执可修正代码重试。结果、代码、输入、来源与失败均自动存档；completed不代表方法已核验。"""
    return await service.run(code, datasets, inputs, assumptions, title, source_runs)

@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False))
def compute_read(run_id: str) -> dict[str, Any]:
    """按实际返回的runId读取本会话既有计算结果；不会重跑。"""
    return service.read(run_id)

@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False))
def compute_list() -> dict[str, Any]:
    """列出本会话最近30次通用计算（含失败），继续查询用compute_read，不新建回测。"""
    return service.list()

if __name__ == '__main__':
    mcp.run(transport='stdio')
