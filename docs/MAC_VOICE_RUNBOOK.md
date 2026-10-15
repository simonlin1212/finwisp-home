# Simon 的 Mac 语音运行指南

此仓库当前在构建机 `/workspace/finwisp-home`，不是已经放在你的 Mac 上。需要 Node **20.19 或更高版本**、npm、已安装且已登录的 Codex CLI。普通页面和规则式教学不启动模型；只有选择 Codex 语音并点击麦克风才会启动实验性语音会话。Codex 语音走 WebRTC，用 ChatGPT 登录的 Codex 即可；2026-10-15 已用合成语音在 Chrome 上实测连通（见 [VOICE.md](VOICE.md)），真实麦克风和扬声器尚未实测。

## 1. 把项目放到 Mac

我们准备的压缩包在构建机 `/workspace/finwisp-home.tgz`（Grok 可用 CopyFromBox 直接放到你的 Mac）。请 Simon 用已有的文件传输方式复制到 Mac，例如下载到 `~/Downloads/finwisp-home.tgz`。这里不需要 Git remote、密码或 SSH 配置。以下路径可替换为你实际保存的位置：

```sh
mkdir -p ~/Projects
tar -xzf ~/Downloads/finwisp-home.tgz -C ~/Projects
cd ~/Projects/finwisp-home
node --version
npm --version
command -v codex
codex login status
```

`codex login status` 已在本机 CLI 的 `codex login --help` 中确认存在；只查询登录状态，不启动模型。若尚未登录，在 Mac 上运行以下命令，按浏览器提示自行登录：

```sh
codex login
```

无需修改 `~/.codex/config.toml`。CLI 官方说明见 [OpenAI 命令参考](https://developers.openai.com/codex/cli/reference)。若 Mac 安装的版本不同，先运行 `codex login --help` 核实 `status` 子命令。

## 2. 安装和启动

```sh
npm ci
export SEC_CONTACT_EMAIL='<组织用于 SEC 联系的邮箱>'
VOICE_ENGINE=codex npm run hub
```

请把占位符替换为组织联系地址，不使用个人邮箱，不录入或提交到仓库。环境变量不会自动从 `.env` 加载。`npm run hub` 会先构建网页，再启动服务，默认地址为：

```sh
open 'http://127.0.0.1:8796/?demo=1'
```

在浏览器中确认 **Voice engine** 为 **Codex · preview**，点击 **Tap to speak**，允许麦克风权限。说 “COST net margin”。预期有英文转写和语音输出；Codex 先说一句“正在查”，几十秒后才报出财报数字。Codex 语音的回答由模型生成；它的工具输出尚不映射到网页学习卡片。要可靠展示卡片、测验、工具调用状态和记忆，选择 **Browser**，再次点击麦克风，或者在输入框输入同一句并点击 **Explore →**。点击 **End voice** 停止 Codex 音频。

录制前点击 **Reset demo profile** 清空 `family` 记忆。页面 `?demo=1` 仍显示工具 chips、状态和毫秒耗时。

## 3. 排查

- **麦克风不可用**：在浏览器站点权限及 macOS 系统设置的隐私与安全性 → 麦克风中允许浏览器访问；重新打开 localhost 页面。使用支持 Web Speech 的浏览器测试 Browser 模式；也可直接输入文字。
- **找不到 codex**：用 `command -v codex` 检查。若已安装在非 PATH 目录，可把实际可执行文件路径传给项目支持的环境变量：

  ```sh
  CODEX_EXECUTABLE='/实际路径/codex' VOICE_ENGINE=codex npm run hub
  ```

- **8796 被占用**：不要停止已有服务。让自己的新服务选随机端口：

  ```sh
  HUB_PORT=0 VOICE_ENGINE=codex npm run hub
  ```

  打开终端打印的 `Finwisp Home` 地址并追加 `?demo=1`，不要继续使用固定 8796 地址。
- **Codex 语音失败**：页面会提示回退并选择 Browser。再点击一次麦克风启动浏览器识别；文字输入始终可用。可以停止自己刚启动的服务，再用纯浏览器模式运行：

  ```sh
  VOICE_ENGINE=browser npm run hub
  ```

- **SEC 请求失败**：检查组织联系邮箱环境变量和网络；页面会保留拒绝建议的边界并显示 SEC 数据不可用，不会编造数字。

## 4. 停止

先点击 **End voice**（如果正在语音），再在启动服务的终端按 **Ctrl+C**。宿主会关闭自己持有的 MCP 服务和语音子进程。不要终止其他人运行的 hub。

本指南引用的 npm 脚本、`HUB_PORT`、`VOICE_ENGINE`、`SEC_CONTACT_EMAIL`、`CODEX_EXECUTABLE` 均已核对项目源码；Codex 登录命令已核对 CLI help。Codex 语音的实测范围见 [VOICE.md](VOICE.md)。
