# ms-365-mcp-server（To Do 白名单版）

本仓库 fork 自 [Softeria/ms-365-mcp-server](https://github.com/Softeria/ms-365-mcp-server)，基于上游提交 `c471971`。
完整功能、全部参数和原始文档请看上游 README；这里只写**改动**和**用法**。

主要场景：在 Claude 桌面版等客户端里，把待办丢给 AI，由它整理后写入 Microsoft To Do，每次写入由你人工批准。

## 改动

1. **请求体字段白名单（`bodyFields`）**
   `src/endpoints.json` 里的端点可以声明 `bodyFields`。声明后：
   - 注册给模型的参数里只保留这些字段，`id`、`createdDateTime` 等只读字段不会出现；
   - 执行时再检查一次，含白名单外字段的调用直接返回 `body_fields_not_allowed`，不会发到 Microsoft Graph。

   实现在 [`src/lib/body-fields.ts`](src/lib/body-fields.ts)。

2. **To Do 工具**
   - 新增 `create-todo-checklist-item`：给任务逐条添加步骤（字段：`displayName`、`isChecked`）。
   - `create-todo-task` 加了字段白名单（`title`、`body`、`dueDateTime`、`reminderDateTime`、`isReminderOn`、`importance`、`categories`、`recurrence`、`linkedResources`），并重写了给模型的提示：不许编日期、截止日期的时区写法、步骤要另外调用 `create-todo-checklist-item`。

3. **`--enabled-tools` 在 stdio 模式下也过滤登录类工具**
   `login`、`logout`、`verify-login`、`list-accounts`、`select-account`、`remove-account` 不在白名单里就不注册，AI 碰不到登录和退出。登录改为在命令行用 `--login` 完成。HTTP 模式行为不变。

4. **测试**：新增 `test/body-fields*.test.ts`、`test/auth-tools-filter.test.ts`、`test/todo-tools.test.ts`。

## 用法（Windows + Claude 桌面版）

### 1. 安装和构建

需要 Node.js 20 或更新版本。

```bash
git clone https://github.com/XuChaoWu2004/ms-365-mcp-server.git
cd ms-365-mcp-server
npm install
npm run generate
npm run build
```

`npm run generate` 会下载 Microsoft Graph 的 OpenAPI 描述文件，体积较大，需要几分钟。

### 2. 登录（只需一次，在命令行做，不要交给 AI）

在仓库目录新建 `ms365-login.cmd`，把路径改成你自己的，然后双击运行：

```bat
@echo off
rem 个人微软账号（Outlook/Hotmail）必须用 consumers，否则约一小时后掉线
set MS365_MCP_TENANT_ID=consumers
rem 令牌缓存放在固定位置，避免 Microsoft Store 版 Claude 读不到 %APPDATA%
set MS365_MCP_TOKEN_CACHE_PATH=C:\path\to\ms365-auth\.token-cache.json
set MS365_MCP_SELECTED_ACCOUNT_PATH=C:\path\to\ms365-auth\.selected-account.json
cd /d C:\path\to\ms-365-mcp-server
node dist\index.js --enabled-tools "^(list-todo-task-lists|create-todo-task|create-todo-checklist-item)$" --login
node dist\index.js --verify-login
pause
```

按提示在浏览器打开 `https://login.microsoft.com/device`，输入设备码并同意授权。这个白名单只申请 `Tasks.ReadWrite` 权限。

- `--enabled-tools` 必须和下一步配置里的**完全一样**，因为申请哪些权限是按启用的工具算的。
- 刷新令牌会自动续期，正常使用不用反复登录。撤销授权：<https://microsoft.com/consent>。
- 工作或学校账号不要设置 `consumers`，具体做法看上游 README 的 Organization Mode 部分。

### 3. 在 Claude 桌面版注册

Settings → Developer → Edit Config，在 `mcpServers` 里加入下面这段（路径和邮箱改成你自己的，JSON 里的反斜杠要写两遍）：

```json
"ms365": {
  "command": "node",
  "args": [
    "C:\\path\\to\\ms-365-mcp-server\\dist\\index.js",
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
}
```

保存后完全退出 Claude 桌面版（包括托盘图标）再打开。

| 设置                          | 作用                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `--enabled-tools`             | 只暴露这 3 个工具：查清单、建任务、加步骤。不能删除、修改或读邮件 |
| `MS365_MCP_REQUIRE_CONFIRM`   | 写入操作要求带 `confirm: true`。属于软闸门，AI 自己能补上         |
| `MS365_MCP_EXPECTED_USERNAME` | 锁定账号；缓存里没有这个账号时服务器拒绝启动                      |

真正的把关在客户端：建任务时 Claude 会弹出审批，**每次点"允许一次"**，不要点"始终允许"。

### 4. 试用

先在 To Do 里手动建一个测试清单，比如 `_AI 测试`，然后对 Claude 说：

> 把下面的待办整理进 \_AI 测试：……

AI 会先查清单，再建任务、逐条加步骤。

### 扩展：开放更多功能

服务器共有 300 多个工具，**不要全部开放**：全部工具的定义大约要 100 万字符，会把对话上下文占满。按需选一种方式：

- **往白名单里加工具**：工具名在 [`src/endpoints.json`](src/endpoints.json) 的 `toolName` 字段。例如加上 `update-todo-task` 就能修改任务。加完后用**同样的** `--enabled-tools` 重新运行一次 `--login`，申请新的权限。
- **预设**：`--preset tasks`（To Do 和 Planner 全部工具，包括删除）、`--preset outlook` 等，用 `node dist\index.js --list-presets` 查看全部预设。
- **只读**：加 `--read-only`，所有写入工具都不暴露。
- **按需发现**：`--discovery` 只暴露搜索、查看定义、执行这 3 个元工具，上下文最小。但客户端审批只能看到"执行工具"，要看参数才知道 AI 具体要做什么。
- 想给自己的端点加字段白名单：在 `endpoints.json` 里给它写 `bodyFields`，然后运行 `npm run generate && npm run build`。

查看某个配置会申请哪些权限：

```bash
node dist/index.js --enabled-tools "<你的正则>" --list-permissions
```

### 常见问题

| 现象                                                           | 处理                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Claude 里没有工具                                              | 先在终端单独运行 `node dist\index.js`，确认它能正常进入等待状态；再检查配置 JSON 的引号、逗号和 `\\` |
| 提示 `Expected Microsoft account ... not found in token cache` | 还没登录，或者登录脚本和 Claude 配置里的缓存路径不一致                                               |
| 大约一小时后提示未登录                                         | 个人账号没有设置 `MS365_MCP_TENANT_ID=consumers`，加上后重新登录                                     |
| 返回 `body_fields_not_allowed`                                 | 白名单在起作用，让 AI 去掉多余字段后重试                                                             |
| 返回 `confirmation_required`                                   | 确认闸门在起作用，让 AI 带上 `confirm: true` 重试                                                    |

## 许可证

MIT，与上游相同，见 [LICENSE](LICENSE)。原作者：Softeria。
