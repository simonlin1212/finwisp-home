import { resolve } from 'node:path';

/** Host-selected resources, never request/model input. Desktop supplies its bundled interpreter. */
export interface ResearchRuntimePaths { projectRoot?: string; python?: string }

/** Current local web installation. Paths stay inside this product; no personal skill/MCP config. */
export function marketDataServer(dataHome: string, projectRoot = process.cwd(), python = resolve(projectRoot, '.local/data-sources/venv/bin/python')) {
  return {
    command: python,
    args: ['-B', resolve(projectRoot, 'data-sources/server.py')],
    env: { ASTOCK_DATA_HOME: resolve(dataHome) },
    enabled: true,
    startup_timeout_sec: 25,
    tool_timeout_sec: 50,
    enabled_tools: ['data_catalog', 'data_query'],
  };
}

export function marketDataToml(dataHome: string, resources: ResearchRuntimePaths = {}) {
  const config = marketDataServer(dataHome, resources.projectRoot, resources.python);
  return `\n[mcp_servers.market_data]\ncommand = ${JSON.stringify(config.command)}\nargs = ${JSON.stringify(config.args)}\nstartup_timeout_sec = ${config.startup_timeout_sec}\ntool_timeout_sec = ${config.tool_timeout_sec}\nenabled_tools = ${JSON.stringify(config.enabled_tools)}\n[mcp_servers.market_data.env]\nASTOCK_DATA_HOME = ${JSON.stringify(config.env.ASTOCK_DATA_HOME)}\n`;
}
