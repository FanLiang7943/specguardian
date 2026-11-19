# 🛡️ SpecGuardian

[![npm](https://img.shields.io/npm/v/@liangf7943/specguardian-guard)](https://www.npmjs.com/package/@liangf7943/specguardian-guard)
[![CI](https://github.com/FanLiang7943/specguardian/actions/workflows/ci.yml/badge.svg)](https://github.com/FanLiang7943/specguardian/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/FanLiang7943/specguardian)](./LICENSE)

[English](./README.md) | **简体中文**

> AI 写代码很快，SpecGuardian 确保它依然遵守你的架构。

你的规格（spec）里写着"UI 代码不能直接访问数据库"或"支付模块不能使用 axios"，可三轮对话之后，Agent 就忘了。[Spec Kit](https://github.com/github/spec-kit)、[OpenSpec](https://github.com/Fission-AI/OpenSpec) 这类工具帮你写规格；**SpecGuardian 负责在 Agent 每次修改文件时，强制执行规格里的硬性规则。**

- **改动时拦截**：`PreToolUse` hook（Agent 调用编辑工具前触发的钩子）在写入磁盘前检查每一次改动，并告诉 Agent 违反了哪条规则、应该怎么改。
- **规则写在规格里**：在已有的规格 Markdown 中用 ` ```specguardian ` 代码块声明规则，也可以写在 `.specguardian/guard.yaml` 中。
- **确定、快速**：不调用大模型，不需要 API Key，纯静态检查，毫秒级完成。
- **适合已有项目**：只拦截本次改动**新引入**的违规，历史遗留问题不会阻塞无关的修改。
- **适配主流 Agent**：提供 Claude Code 与 Cursor 的 hooks、通用的 MCP 服务器，以及可在 CI 中运行的 CLI。

```
 Agent 想修改 src/ui/Page.tsx
            │
            ▼
 ┌───────────────────────────┐   规则来自 .specguardian/guard.yaml
 │ PreToolUse hook           │ ◄─ 以及规格文档中的 ```specguardian 代码块
 │ specguardian-guard hook   │
 └───────────┬───────────────┘
    通过     │      违规
   ┌─────────┴─────────┐
   ▼                   ▼
 正常写入        改动被拒绝，Agent 收到：
                "[no-direct-db-in-ui] src/ui/Page.tsx:3 imports
                 "../db/client" across a boundary. UI code must
                 go through the service layer."
```

## 快速开始

需要 Node.js 20 及以上版本。想先体验一下？可以试试[示例项目](./examples/demo)。

```bash
# 1. 在项目根目录生成 .specguardian/guard.yaml
npx -y @liangf7943/specguardian-guard init

# 2. 按项目实际情况修改 .specguardian/guard.yaml 中的示例规则

# 3. 注册 hook、MCP 服务器和 Agent skill
npx -y @liangf7943/specguardian-guard install --claude     # Claude Code
npx -y @liangf7943/specguardian-guard install --cursor     # Cursor

# 4. 查看现有代码中哪些地方已经偏离规则
npx -y @liangf7943/specguardian-guard check
```

`install` 会写入以下文件（建议提交到仓库，让团队成员使用同一套规则）：

| Agent | 文件 |
|---|---|
| Claude Code | `.claude/settings.json`（PreToolUse hook）、`.mcp.json`、`.claude/skills/specguardian-guard/SKILL.md` |
| Cursor | `.cursor/hooks.json`（preToolUse hook）、`.cursor/mcp.json`、`.cursor/skills/specguardian-guard/SKILL.md`（如果已存在 Claude 版 skill 则跳过，因为 Cursor 也会加载 `.claude/skills/`） |

hook 默认通过 `npx -y @liangf7943/specguardian-guard` 运行。如果想让 hook 更快，可以把它装为开发依赖，并让 `install` 指向本地文件：

```bash
npm install -D @liangf7943/specguardian-guard
npx specguardian-guard install --claude --command "node ./node_modules/@liangf7943/specguardian-guard/dist/cli.js"
```

## 在规格文档中声明规则

把规则写在它所对应的需求旁边。SpecGuardian 会扫描 `guard.yaml` 中 `sources` 列出的 Markdown 文件；`init` 会自动识别 OpenSpec、Spec Kit 和 Kiro 的目录结构。

````markdown
## 支付

支付代码必须使用内部 HTTP 客户端，以保证重试和审计日志的一致性。

```specguardian
id: payment-no-axios
type: forbid-import
paths: ["src/core/payment/**"]
modules: ["axios", "node-fetch"]
message: Use src/lib/http instead.
```
````

一个代码块可以包含单条规则、规则列表，或 `rules: [...]`。违规报告会注明每条规则的出处，方便 Agent 和代码审查者追溯到对应的规格。

## 规则说明

通用字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 规则唯一标识，会出现在每条报告中 |
| `type` | 是 | `forbid-import`、`boundary`、`protected` 或 `forbid-pattern` |
| `paths` | 否 | 规则作用的文件（glob 通配符，默认所有文件）。`boundary` 使用 `from` 代替 |
| `exclude` | 否 | 跳过的文件（glob） |
| `severity` | 否 | `error`（默认，拦截改动）或 `warn`（提示 Agent，不拦截） |
| `message` | 否 | 规则存在的原因以及正确做法，会展示给 Agent |

规则类型：

| 类型 | 额外字段 | 违规条件 |
|---|---|---|
| `forbid-import` | `modules`：模块名或 glob | `paths` 中的文件导入了 `modules` 中的模块。`axios` 也会匹配 `axios/lib/x`，但不会匹配 `axios-retry` |
| `boundary` | `from`、`to`：路径 glob | `from` 中的文件导入了 `to` 中的文件。支持相对路径导入、`aliases` 别名和 Python 点号导入 |
| `protected` | — | Agent 修改了 `paths` 中已存在的文件；新建文件不受限制（仅在 hook 中生效） |
| `forbid-pattern` | `pattern`：正则表达式，`flags`（可选） | `paths` 中的文件包含匹配 `pattern` 的内容 |

导入检测支持 JavaScript/TypeScript（`.js .jsx .ts .tsx .mjs .cjs .mts .cts .vue .svelte .astro`）和 Python（`.py .pyi`）。`forbid-pattern` 和 `protected` 适用于任何文本文件。

## 配置

`.specguardian/guard.yaml`：

```yaml
version: 1

# 扫描其中 ```specguardian 代码块的 Markdown 文件
sources:
  - openspec/specs/**/*.md
  - .specify/memory/*.md

# 额外忽略的路径（.git、node_modules、dist、build、coverage、.next、.venv 默认忽略）
exclude: ["generated/**"]

# boundary 规则使用的导入前缀映射（例如 tsconfig 中的 "paths"）
aliases:
  "@/": "src/"

rules:
  - id: no-direct-db-in-ui
    type: boundary
    from: ["src/ui/**"]
    to: ["src/db/**"]
    message: UI code must go through the service layer.

  - id: frozen-migrations
    type: protected
    paths: ["migrations/**"]
    message: Applied migrations are immutable. Add a new migration instead.

  - id: no-console-log
    type: forbid-pattern
    paths: ["src/**"]
    pattern: "console\\.log\\("
    severity: warn
```

无效的规则会被跳过并报告，不会中断 Agent 的会话。

## 命令行

| 命令 | 说明 |
|---|---|
| `specguardian-guard init [--force]` | 生成 `.specguardian/guard.yaml` |
| `specguardian-guard install [--claude] [--cursor] [--command "<cmd>"]` | 注册 hook、MCP 服务器和 skill（默认 `--claude`） |
| `specguardian-guard check [files...] [--json]` | 扫描违规，发现 error 时退出码为 1 |
| `specguardian-guard rules [file]` | 列出所有规则，或只列出作用于某个文件的规则 |
| `specguardian-guard hook <claude\|cursor>` | hook 入口，从 stdin 读取 hook 的 JSON 输入 |
| `specguardian-guard mcp` | 以 stdio 方式启动 MCP 服务器 |

## MCP 工具

| 工具 | 说明 |
|---|---|
| `guard_list_rules` | 列出规则，可只列出作用于某个文件的规则。Agent 在修改不熟悉的模块前调用 |
| `guard_check_file` | 检查磁盘上的文件，或检查拟写入的内容（只报告新引入的违规） |
| `guard_check_drift` | 扫描整个项目或指定文件 |

MCP 服务器从工作目录向上查找项目根目录；如果设置了 `SPECGUARDIAN_ROOT`，则从该目录开始查找。

## Agent 支持情况

| Agent | 改动时拦截 | MCP 工具 | 说明 |
|---|---|---|---|
| Claude Code | ✅ `PreToolUse`，匹配 `Write\|Edit\|MultiEdit` | ✅ | warn 级别的提示会作为附加上下文传给 Agent |
| Cursor | ✅ `preToolUse`，匹配 `Write`（实验性） | ✅ | Cursor 也能加载 Claude Code 的 hooks。如果开启了该功能，只安装其中一个，避免重复检查 |
| 其他 MCP 客户端 | — | ✅ | 使用 MCP 工具，并在 CI 中运行 `check` |

## 在 CI 中使用

```yaml
# .github/workflows/specguardian.yml
name: SpecGuardian
on: [pull_request]
jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y @liangf7943/specguardian-guard check
```

## 已知限制

- 导入检测基于模式匹配，而不是完整的语法解析。支持静态导入、动态导入和 `require`，并会忽略注释。
- hook 只能看到文件编辑类工具。通过 shell 命令写入的文件不会被拦截，建议在 CI 中运行 `check` 兜底。
- `boundary` 规则不读取 `tsconfig.json`，路径别名需要在 `aliases` 中声明。

## 仓库结构

```
packages/
  core/    @liangf7943/specguardian-core：共享的 glob、路径和文件工具
  guard/   @liangf7943/specguardian-guard：规则引擎、hooks、MCP 服务器、CLI、Agent skill
```

本地开发：

```bash
npm install
npm test        # 构建所有包并运行测试
```

## 路线图

- `@liangf7943/specguardian-router`：按改动大小对请求分级，只在大改动时打扰你
- 基于语法解析（tree-sitter）的导入检测，支持更多语言
- `require-pattern`（必须包含）和依赖方向类规则

## 许可证

[MIT](./LICENSE)
