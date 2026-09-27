# 日用 Daykit

一个可以部署到自己账号的个人工具网站。**Cloudflare Workers 完整版提供 12 个工具，GitHub Pages 静态版提供 9 个本地工具；每个工具都有独立网址。**

A self-hostable developer toolbox for Cloudflare Workers (12 tools) or GitHub Pages (9 browser-only tools).

[![CI](https://github.com/JamesZhaoY/daykit/actions/workflows/ci.yml/badge.svg)](https://github.com/JamesZhaoY/daykit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/JamesZhaoY/daykit)

[Workers 完整版](https://daykit.22y.workers.dev) · [Pages 静态版](https://jameszhaoy.github.io/daykit/) · [一键部署](#一键部署) · [手动部署](#手动部署) · [GitHub Pages 部署](#github-pages-部署) · [部署与费用详解](docs/DEPLOYMENT.md) · [功能边界](docs/TOOLS.md)

| 部署方式 | 可用功能 | 所需账号 |
| --- | --- | --- |
| Cloudflare Workers + Static Assets | 全部 12 个工具，含邮件、IP 和域名查询 | Cloudflare；一键部署还需 GitHub |
| GitHub Pages | JSON、时间戳、编码、Diff、正则、JWT、配置转换、Cron、cURL | GitHub，无需 Cloudflare |

## 功能清单

| 工具 | 功能 | 执行位置 | 页面路径 |
| --- | --- | --- | --- |
| JSON 格式化 | 格式化、压缩、校验、文件导入、复制与下载 | 浏览器 | `/tools/json/` |
| 时间戳转换 | 秒 / 毫秒识别，日期双向转换，本地时区与 UTC | 浏览器 | `/tools/timestamp/` |
| 文本编码 / 解码 | UTF-8 Base64、URL 参数编码与解码 | 浏览器 | `/tools/encode/` |
| 文本 Diff | 按行比较新增、删除、未变，忽略空白、复制结果 | 浏览器 | `/tools/diff/` |
| 正则表达式测试器 | 实时高亮、索引、捕获组、flags、超时保护 | 浏览器线程 | `/tools/regex/` |
| JWT 解析器 | 解码 Header / Payload，查看权限及时间声明；不验签 | 浏览器 | `/tools/jwt/` |
| 配置格式转换 | JSON / YAML / TOML 六方向转换，精度与类型检查 | 浏览器 | `/tools/config/` |
| Cron 表达式测试器 | 中文解释、未来 10 次执行、时区切换、Cloudflare 基础模式 | 浏览器线程 | `/tools/cron/` |
| cURL 请求转换 | 拆解请求，生成 JavaScript fetch / Python requests | 浏览器 | `/tools/curl/` |
| Outlook 邮件读取 | 四字段账号输入，Graph / IMAP OAuth，邮件排版、验证码、新令牌复制 | Worker + Microsoft | `/tools/outlook/` |
| IP 地址检测 | 当前公网出口、指定 IPv4 / IPv6、归属地、ASN 与网络组织 | Worker + 数据服务 | `/tools/ip/` |
| 域名 IP 查询 | A / AAAA / CNAME / MX / NS、CDN 线索与依据 | Worker + 公共 DNS | `/tools/domain/` |

共用功能：分类与关键词搜索、收藏、最近使用、桌面 / 手机布局、独立页面直达，以及 `⌘ / Ctrl + K` 快速打开工具。

GitHub Pages 不运行 Worker API，因此目录只展示 9 个本地工具。访问邮件、IP、域名工具的旧链接时会显示部署说明，不收集邮箱凭据或发起 API 请求。Pages 项目网址中的页面路径会自动加上 `/<仓库名>/` 前缀。

![Daykit 工具目录](docs/images/home.png)

## 一键部署

需要 **Cloudflare 账号和 GitHub 账号**，无需在电脑安装 Node.js，也无需购买服务器或域名。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/JamesZhaoY/daykit)

1. 点击按钮，登录 Cloudflare，并连接你的 GitHub 账号。
2. Cloudflare 会把项目复制到你的 GitHub 账号。选择仓库名及未被其他应用占用的 Worker 名称。
3. 检查构建设置：Node.js **24**，部署命令 **`npm run deploy`**。Wrangler 已包含构建步骤，独立的构建命令可以留空；如果页面自动填入 `npm run build`，保留也可，但会多执行一次构建。
4. 点击部署。成功后打开 Cloudflare 提供的 `https://<worker>.<账号子域>.workers.dev`。

项目不需要 D1、KV、R2、固定 API Key 或额外服务器。邮件工具的 Microsoft 授权凭据在使用时填写，不是部署配置。

一键部署使用 [Cloudflare 官方流程](https://developers.cloudflare.com/workers/platform/deploy-buttons/)，首次使用仍需完成账号登录、GitHub 授权和部署设置确认。

## 手动部署

准备 **Git、Node.js 24 和 npm**（项目最低 Node.js 22.12）。Python 不再是部署前提，只用于可选的生成代码测试。

```sh
git clone https://github.com/JamesZhaoY/daykit.git
cd daykit
npm ci
```

在 [wrangler.jsonc](wrangler.jsonc) 中将 `name` 改为自己的 Worker 名称，例如 `my-daykit`，然后执行：

```sh
npx wrangler login
npm run deploy
```

`deploy` 会运行核心测试、构建静态资源并上传到 Cloudflare。首次部署按 Wrangler 提示选择账号、设置 Workers 子域名。已存在的同名 Worker 会被更新，请使用自己的应用名称。

如果浏览器授权回调不方便，可使用设备授权：

```sh
npx wrangler login --device
```

部署成功后可关闭电脑，网站运行在 Cloudflare 上。自定义域名、Git 自动部署、更新与回滚方法见 [部署指南](docs/DEPLOYMENT.md)。

## GitHub Pages 部署

只需 **GitHub 账号和公开仓库**，无需 Cloudflare 账号、API Token 或本地开发环境。

1. Fork 本仓库，或点击 **Use this template → Create a new repository** 创建自己的公开仓库。Fork 后如 Actions 尚未启用，先到 **Actions** 页面启用工作流。
2. 在自己的仓库打开 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。
3. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `main` 分支并运行。
4. 等待 `build` 和 `deploy` 成功，在 **Settings → Pages** 查看访问地址，通常为 `https://<用户名>.github.io/<仓库名>/`。
5. 如需每次推送 `main` 自动更新，在 **Settings → Secrets and variables → Actions → Variables** 新建仓库变量 `ENABLE_GITHUB_PAGES`，值为 `true`。未设置时仍可手动运行工作流。

工作流会自动读取仓库子路径并构建 `dist-pages/`，收藏、深层链接和正则 / Cron 浏览器线程均支持该路径。自定义域名、手动构建和故障排查见 [GitHub Pages 详细指南](docs/DEPLOYMENT.md#方式四github-pages-静态版)。

## 是否免费

**支持先使用 Workers 免费套餐。** 当前架构没有数据库、对象存储或商业 API Key 的必选费用。

| 项目 | 当前规则 |
| --- | --- |
| 静态 HTML / JS / CSS 访问与存储 | 静态资源请求免费且不限次数，存储无额外费用 |
| 9 个浏览器本地工具 | 计算发生在用户设备，不消耗 Worker API CPU 额度 |
| 邮件、IP、域名 API | Workers 免费套餐每账号每天 100,000 次请求 |
| 免费 Worker 计算上限 | 每次请求 10 ms CPU 时间；网络等待不计 CPU 时间 |
| Workers 付费套餐 | 5 美元 / 月起，超出包含额度按用量计费 |
| 自定义域名 | 可选，域名注册 / 续费单独计算 |

规则核对日期：**2026-09-27**。以 [官方定价](https://developers.cloudflare.com/workers/platform/pricing/)、[静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)和 [平台限制](https://developers.cloudflare.com/workers/platform/limits/)为准。

大邮件的 MIME 解析与 HTML 清理可能超过免费 CPU 上限。免费部署不等于所有邮件都能免费处理；使用量增加时应查看 Worker 的 CPU 和错误指标。第三方 IP / DNS / Microsoft 服务也有各自的额度与限流规则。

**GitHub Pages 静态版可在 GitHub Free 的公开仓库使用**，不产生 Cloudflare 费用；受 GitHub Pages 的站点大小、带宽和使用规则限制。详见 [GitHub Pages 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)与 [使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 本地开发

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:8787 。Wrangler 在本机运行 Worker 与静态资源，配置转换、Cron 的依赖及浏览器线程会自动打包。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 本地开发，修改后自动重新构建 |
| `npm run build` | 生成压缩、带文件名指纹的 `dist/` |
| `npm run build:pages -- --base=/daykit/` | 生成仓库子路径下的静态版 `dist-pages/`；替换为自己的仓库名 |
| `npm test` | Node.js 核心测试，不需要 Cloudflare 登录或 Python |
| `npm run test:pages` | 构建并检查 Pages 子路径、资源引用和浏览器线程地址 |
| `npm run test:python` | 验证生成的 Python requests 代码，需要 Python 3；不需要安装 requests |
| `npm run test:workers` | 检查已启动本地服务的路由、缓存头和 API 边界 |
| `npm run check:deploy` | 核心测试 + 构建 + Wrangler dry-run，不上传 |
| `npm run deploy` | 核心测试 + 构建 + 正式部署 |

GitHub CI 会执行核心测试、Python 代码验证、部署预检、Pages 构建检查及本地 Workers 路由测试。Pages 发布使用独立工作流；浏览器检查的运行方式见 [功能与开发说明](docs/TOOLS.md#校验)。

## 数据处理与功能边界

- 浏览器工具的输入不会发送到服务器。应用只把收藏及最近访问的工具名称 / 时间存入 localStorage，不保存工具输入和输出。
- 邮件地址、`client_id`、`refresh_token` 经部署者的 Worker 发送给 Microsoft；密码字段只为兼容输入格式，不发送。应用不持久保存账号、令牌或邮件。
- HTML 邮件经过白名单清理并在沙箱中显示，提供纯文本切换；远程图片、脚本和可导航链接不启用。
- IP / 域名查询会把查询目标发给对应公开数据源。IP 地理位置为近似值；CDN 解析地址无法证明是源站真实 IP。
- JWT 解码不验证签名；Cron 只做预览，不创建任务；cURL 只转换代码，不执行命令或发请求。
- 当前没有登录系统、长期账号库或几万个邮箱的后台同步。私人部署如需限制访问，应在部署层配置访问控制；同源请求检查不等于用户认证。

解析限制、协议兼容和各工具说明见 [docs/TOOLS.md](docs/TOOLS.md)。请勿在 Issue、PR 或截图中提交真实令牌、密码、Cookie 或私人邮件。

## 项目结构

```text
public/                  页面、浏览器工具、CSS 与响应头
  tools/<id>/index.html  各工具独立页面
worker/                  邮件 / IP / DNS API
scripts/build.mjs        静态资源打包与浏览器线程构建
tests/                   核心、Python、HTTP 与浏览器检查
docs/                    部署指南与功能说明
.github/workflows/ci.yml     自动检查
.github/workflows/pages.yml  GitHub Pages 构建与发布
wrangler.jsonc           Workers 与静态资源配置
```

前端使用原生 HTML / CSS / JavaScript；esbuild 负责打包。Workers 版只有 `/api/*` 先进入 Worker，其余请求使用 Static Assets；Pages 版只发布静态资源。正则和 Cron 在可终止的浏览器线程中计算。

## 贡献与许可证

欢迎提交 Issue 和 PR，参见 [贡献说明](CONTRIBUTING.md)。

本项目采用 [MIT License](LICENSE)，可使用、修改、分发及商用，需保留许可证声明。第三方依赖遵循各自许可证，详见 [依赖许可声明](public/third-party-notices.txt)。
