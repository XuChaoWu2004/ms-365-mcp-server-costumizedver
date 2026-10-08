# ms-365-mcp-server（定制版）

本仓库 fork 自 [Softeria/ms-365-mcp-server](https://github.com/Softeria/ms-365-mcp-server)（MIT 许可证），改动基于上游 `c471971` 开发，已合并上游至 `a73c427`（2026-10-08）。
下文前半部分介绍原项目的功能，后半部分是本 fork 新增的内容和推荐配置。参数细节以[上游 README](https://github.com/Softeria/ms-365-mcp-server#readme) 为准。

## 这是什么

一个 [MCP（Model Context Protocol）](https://modelcontextprotocol.io) 服务器，把 Microsoft 365 接到 AI 客户端（Claude 桌面版、Claude Code、Cherry Studio、Open WebUI 等）。
AI 发出请求，服务器把它翻译成 [Microsoft Graph API](https://learn.microsoft.com/graph/overview) 调用，读写你的邮件、日历、文件、待办等数据。

## 原项目功能

### 覆盖的服务

每个工具对应一个 Graph 接口，全部声明在 [`src/endpoints.json`](src/endpoints.json) 中（共 335 个定义）。启动后，个人模式约有 190 个工具，组织模式约有 350 个（数字包含登录类工具和通用工具）。

| 服务                                                      | 预设（`--preset`）      | 工具数 | 账号类型        |
| --------------------------------------------------------- | ----------------------- | ------ | --------------- |
| Outlook 邮件：收发、草稿、文件夹、规则、附件              | `mail`                  | 43     | 个人 / 工作学校 |
| 日历：日程、邀请、空闲时间、会议时间推荐                  | `calendar`              | 41     | 个人 / 工作学校 |
| OneDrive 文件：浏览、上传、下载、移动、版本               | `files` / `onedrive`    | 22     | 个人 / 工作学校 |
| Excel 工作簿：工作表、区域、表格、图表                    | `excel`                 | 23     | 个人 / 工作学校 |
| OneNote：笔记本、分区、页面                               | `onenote`               | 26     | 个人 / 工作学校 |
| To Do 待办 + Planner 计划                                 | `tasks`                 | 26     | 个人 / 工作学校 |
| 联系人                                                    | `contacts`              | 13     | 个人 / 工作学校 |
| 搜索（跨邮件、文件、日程）                                | `search`                | 4      | 个人 / 工作学校 |
| Teams 聊天和频道、在线会议、转录、录像、出勤报告          | `teams` / `teams-write` | 69     | 仅工作学校      |
| SharePoint 站点和列表、共享邮箱和日历、用户目录、在线状态 | `work` / `users`        | —      | 仅工作学校      |

- 工作学校账号的功能需要加 `--org-mode` 启动。
- 还支持世纪互联版（`--cloud china`）。
- 合集预设：`outlook`（邮件 + 日历 + 联系人）、`personal`、`work`、`all`。用 `--list-presets` 查看全部预设。

### 控制 AI 能用哪些工具

| 方式                             | 作用                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--preset <名称>`                | 按服务开放工具                                                                                       |
| `--enabled-tools "<正则>"`       | 按工具名做白名单，最精细                                                                             |
| `--read-only`                    | 隐藏所有写入工具                                                                                     |
| `--discovery`                    | 只暴露 `search-tools` / `get-tool-schema` / `execute-tool` 三个元工具，AI 按需搜索后调用，上下文最小 |
| `--allowed-scopes`               | 限定 Graph 权限范围，超出范围的工具自动隐藏                                                          |
| `MS365_MCP_REQUIRE_CONFIRM=true` | 写入操作必须带 `confirm: true`（软闸门）                                                             |
| `--list-permissions`             | 列出当前配置会申请哪些 Graph 权限                                                                    |

申请哪些权限由启用的工具自动推导，只开放少量工具时，登录也只申请少量权限。

### 登录和账号

- **设备码登录（默认）**：`--login` 后在浏览器输入代码，令牌加密缓存在本机，并自动续期。
- **OAuth 授权码流程**：HTTP 模式下使用，适合多人共用的部署。
- **自带令牌**：用 `MS365_MCP_OAUTH_TOKEN` 传入外部管理的令牌，服务器不负责续期。
- **多账号**：登录多个账号后，每个工具会多出一个 `account` 参数。
- **账号锁定**：用 `MS365_MCP_EXPECTED_USERNAME` 固定只用一个账号，缓存里没有这个账号时拒绝启动。
- 令牌缓存以 AES-256-GCM 加密，密钥放在系统凭据库（Windows 凭据管理器 / macOS 钥匙串）。也支持 Azure Key Vault 和外部命令存储。

### 部署和其他

- 传输方式：本机 stdio（默认），或者 `--http` 远程部署。提供 Docker 镜像和 Azure 部署示例，见 [docs/deployment.md](docs/deployment.md)。
- 输出格式：默认 JSON；可选 `--toon`（实验性），能减少 30%–60% 的 token。
- 大文件：`get-download-url`、`download-bytes` 等工具让附件和录像的字节不经过 AI 上下文。
- 发件署名：`--message-signoff-prefix` 给 AI 代发的邮件和 Teams 消息加上标记。
- 日志默认脱敏（令牌、邮箱地址）。

## 本 fork 新增

1. **请求体字段白名单 `bodyFields`**
   在 `src/endpoints.json` 里给端点声明 `bodyFields` 后：
   - AI 只能看到这些字段，`id`、`createdDateTime` 等只读字段不会出现；
   - 执行时再检查一次，含其他字段的调用返回 `body_fields_not_allowed`，不会发到 Graph。

   直接调用和 discovery 的 `execute-tool` 两条路径都生效，实现在 [`src/lib/body-fields.ts`](src/lib/body-fields.ts)。

2. **To Do 写入改进**
   - 新工具 `create-todo-checklist-item`：给任务逐条添加步骤。
   - `create-todo-task` 只接受标题、备注、截止、提醒、重要性、类别、重复、链接这些字段，并重写了给 AI 的说明：不许编造日期，写明截止日期的时区格式，步骤改用上面的新工具添加。

3. **登录类工具受工具过滤控制（行为变更）**
   在 stdio 模式下，只要设置了工具过滤（`--enabled-tools`、`--preset` 或环境变量 `ENABLED_TOOLS`，三者都算），登录类工具（`login`、`logout`、`verify-login`、`list-accounts`、`select-account`、`remove-account`）不在过滤结果里就不会注册。这时要在命令行用 `--login` 登录。不设置过滤时行为和上游一样；HTTP 模式不受影响。

4. 以上改动都配有测试：`test/body-fields*.test.ts`、`test/auth-tools-filter.test.ts`、`test/todo-tools.test.ts`。

## 推荐配置：To Do 直连 + 其余走 discovery

同一个程序在客户端里注册两次，共用一份登录：

| 服务器名     | AI 看到的工具                                                            | 用途                                                                                      |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `ms365-todo` | `list-todo-task-lists`、`create-todo-task`、`create-todo-checklist-item` | 日常把待办写进 To Do。每次写入单独审批，审批框能看清工具名                                |
| `ms365`      | `search-tools`、`get-tool-schema`、`execute-tool`                        | 其余全部功能，包括改、完成、删待办。审批框只显示 `execute-tool`，要看参数里的 `tool_name` |

两边不重叠：discovery 那边排除了上面 3 个 To Do 工具和登录类工具。两个服务器的工具定义合计约 4,000 token；如果把全部工具直接暴露，约要 100 万字符，会占满对话上下文。

### 1. 安装和构建

需要 Node.js 20 或更新版本。

```bash
git clone https://github.com/XuChaoWu2004/ms-365-mcp-server-costumizedver.git
cd ms-365-mcp-server-costumizedver
npm install
npm run generate
npm run build
```

`npm run generate` 会下载 Graph 的 OpenAPI 描述文件（约 110 MB），需要几分钟。

### 2. 登录（只需一次，在命令行做）

登录时用 discovery 那边的过滤规则，这样申请的权限覆盖两个服务器。授权页面会列出读写邮件、发送邮件、文件、日历、联系人、OneNote、任务等权限。

**Windows**：新建 `ms365-login.cmd`，改好路径后双击运行：

```bat
@echo off
rem 个人微软账号（Outlook/Hotmail）必须用 consumers，否则约一小时后掉线
set MS365_MCP_TENANT_ID=consumers
rem 令牌缓存放在固定位置，避免 Microsoft Store 版 Claude 读不到 %APPDATA%
set MS365_MCP_TOKEN_CACHE_PATH=C:\path\to\ms365-auth\.token-cache.json
set MS365_MCP_SELECTED_ACCOUNT_PATH=C:\path\to\ms365-auth\.selected-account.json
cd /d C:\path\to\ms-365-mcp-server-costumizedver
node dist\index.js --enabled-tools "^(?!(login|logout|verify-login|list-accounts|select-account|remove-account|list-todo-task-lists|create-todo-task|create-todo-checklist-item)$).*" --login
node dist\index.js --verify-login
pause
```

**macOS**（未实测）：在终端运行：

```bash
export MS365_MCP_TENANT_ID=consumers
cd ~/path/to/ms-365-mcp-server-costumizedver
node dist/index.js --enabled-tools '^(?!(login|logout|verify-login|list-accounts|select-account|remove-account|list-todo-task-lists|create-todo-task|create-todo-checklist-item)$).*' --login
node dist/index.js --verify-login
```

按提示在浏览器打开 `https://login.microsoft.com/device`，输入代码并同意授权。

- 刷新令牌会自动续期，正常使用不用反复登录。撤销授权：<https://microsoft.com/consent>。
- 工作或学校账号不要设置 `consumers`，并且两个服务器都要加 `--org-mode`。

### 3. 在 Claude 桌面版注册

Settings → Developer → Edit Config，在 `mcpServers` 里加入下面两项。

- 配置文件位置：Windows 是 `%APPDATA%\Claude\claude_desktop_config.json`；macOS 是 `~/Library/Application Support/Claude/claude_desktop_config.json`。
- 把路径和邮箱改成你自己的。Windows 路径在 JSON 里要写成双反斜杠 `\\`。

```json
"ms365-todo": {
  "command": "node",
  "args": [
    "C:\\path\\to\\ms-365-mcp-server-costumizedver\\dist\\index.js",
    "--enabled-tools",
    "^(list-todo-task-lists|create-todo-task|create-todo-checklist-item)$"
  ],
  "env": {
    "MS365_MCP_TENANT_ID": "consumers",
    "MS365_MCP_TOKEN_CACHE_PATH": "C:\\path\\to\\ms365-auth\\.token-cache.json",
    "MS365_MCP_SELECTED_ACCOUNT_PATH": "C:\\path\\to\\ms365-auth\\.selected-account.json",
    "MS365_MCP_REQUIRE_CONFIRM": "true",
    "MS365_MCP_EXPECTED_USERNAME": "you@outlook.com"
  }
},
"ms365": {
  "command": "node",
  "args": [
    "C:\\path\\to\\ms-365-mcp-server-costumizedver\\dist\\index.js",
    "--discovery",
    "--enabled-tools",
    "^(?!(login|logout|verify-login|list-accounts|select-account|remove-account|list-todo-task-lists|create-todo-task|create-todo-checklist-item)$).*"
  ],
  "env": {
    "MS365_MCP_TENANT_ID": "consumers",
    "MS365_MCP_TOKEN_CACHE_PATH": "C:\\path\\to\\ms365-auth\\.token-cache.json",
    "MS365_MCP_SELECTED_ACCOUNT_PATH": "C:\\path\\to\\ms365-auth\\.selected-account.json",
    "MS365_MCP_REQUIRE_CONFIRM": "true",
    "MS365_MCP_EXPECTED_USERNAME": "you@outlook.com"
  }
}
```

**macOS 注意**：

- 路径写成 `/Users/你/...`。
- `command` 要写 `node` 的完整路径（终端里运行 `which node` 查看），否则 Claude 可能找不到 Homebrew 或 nvm 装的 node。
- 两个 `MS365_MCP_*_PATH` 可以删掉，用默认位置即可。

保存后完全退出 Claude（包括托盘或菜单栏图标），再重新打开。

### 4. 试用和审批

- 先在 To Do 里手动建一个测试清单，比如 `_AI 测试`，然后对 Claude 说："把下面的待办整理进 \_AI 测试：……"
- 写入时 AI 可能先收到 `confirmation_required`，再带上 `confirm: true` 重试，这是正常的。
- **真正的把关在客户端审批**：每次写入只点"允许一次"。批准 `execute-tool` 前，先看参数里的 `tool_name`，确认是 `send-mail` 还是 `delete-todo-task` 之类。

### 调整范围

- 改过滤规则后，用新规则重新运行一次 `--login`，才会申请新增的权限。
- discovery 那边只想要只读：加 `--read-only`。
- 只开放某个服务：把 discovery 那边的 `--enabled-tools` 换成 `--preset outlook` 之类。
- 想给其他端点也加字段白名单：在 `endpoints.json` 里写 `bodyFields`，然后运行 `npm run generate && npm run build`。

## 常见问题

| 现象                                                      | 处理                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Claude 里没有工具                                         | 先在终端单独运行 `node dist/index.js`，确认能正常进入等待状态；检查 JSON 格式；macOS 上把 `node` 写成完整路径 |
| `Expected Microsoft account ... not found in token cache` | 还没登录，或者登录脚本和 Claude 配置里的缓存路径不一致                                                        |
| 大约一小时后提示未登录                                    | 个人账号没有设置 `MS365_MCP_TENANT_ID=consumers`，加上后重新登录                                              |
| discovery 调用返回权限不足（403）                         | 登录时用的过滤规则比现在的窄，用当前规则重新 `--login`                                                        |
| `body_fields_not_allowed`                                 | 字段白名单在起作用，让 AI 去掉多余字段后重试                                                                  |
| `confirmation_required`                                   | 确认闸门在起作用，让 AI 带上 `confirm: true` 重试                                                             |

## 许可证

MIT，与上游相同，见 [LICENSE](LICENSE)。原作者：Softeria。
