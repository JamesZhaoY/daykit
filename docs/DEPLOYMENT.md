# 部署与费用指南

本文对应 [JamesZhaoY/daykit](https://github.com/JamesZhaoY/daykit)。项目部署目标是 **Cloudflare Workers + Static Assets**，不是 Cloudflare Pages。

## 前提条件

| 方式 | 需要准备 |
| --- | --- |
| 一键部署 | Cloudflare 账号、GitHub 账号，以及允许 Cloudflare 创建项目仓库的授权 |
| 命令行手动部署 | 上述 Cloudflare 账号、Git、Node.js 24 / npm，能够访问 npm 和 Cloudflare |
| 本地开发 | Node.js 24 / npm；无需登录 Cloudflare |
| 可选 Python 测试 | Python 3，只用于验证生成的 requests 代码 |

Node.js 最低版本为 22.12，仓库 `.nvmrc` 固定使用 24。运行时无需自建服务器、Python、数据库、KV、R2。当前实现也不需要部署级环境变量或 Secret。

需要读取邮件时，使用者自行提供有效的 Microsoft OAuth 应用与用户授权。邮箱凭据不要写进 `wrangler.jsonc` 或 Git 仓库。

## 方式一：一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/JamesZhaoY/daykit)

1. 点击按钮，登录 Cloudflare 并连接 GitHub。
2. 选择创建仓库的位置、仓库名和 Worker 名。
3. 检查环境与命令：Node.js 24，部署命令 `npm run deploy`。
4. 构建命令可以留空，因为 `wrangler.jsonc` 的 `build.command` 已运行 `npm run build`。Cloudflare 若自动填入构建命令，可保留或删去；保留会重复构建，但不影响结果。
5. 确认部署后，Cloudflare 将克隆仓库、安装依赖、构建并发布。完成后打开页面给出的 Workers URL。

该按钮遵循 [Cloudflare 官方 Deploy to Cloudflare 规范](https://developers.cloudflare.com/workers/platform/deploy-buttons/)。它需要用户确认和账号授权，并不会自动操作本项目作者的 Cloudflare 账号。

源仓库需要保持公开，才能供其他人使用按钮。第一次授权 GitHub 应用时，请给予新建项目仓库所需的访问范围。

## 方式二：命令行手动部署

```sh
git clone https://github.com/JamesZhaoY/daykit.git
cd daykit
npm ci
```

编辑 `wrangler.jsonc` 中的 `name`，使用自己的 Worker 名称。无需填写作者的账号 ID，也无需复制作者的 Workers 域名。

```sh
npx wrangler login
npm run check:deploy
npm run deploy
```

- `check:deploy` 只验证，不上传，不需要账号凭据。
- `deploy` 执行核心测试，然后由 Wrangler 自动构建、上传资源和 Worker 代码。
- 多账号登录时按提示选择目标账号；无浏览器交互的 CI 可使用 Cloudflare API Token。
- 首次使用 Workers 时按提示设置自己的 `workers.dev` 子域名。
- 后续执行 `npm run deploy` 更新同名 Worker。

登录回调超时或远程终端无法接收本机回调时：

```sh
npx wrangler login --device
```

## 方式三：连接已有 GitHub 仓库自动部署

先 Fork 本仓库，在 Cloudflare 的 Workers 创建页面选择连接 Git 仓库，然后设置：

| 项目 | 值 |
| --- | --- |
| 根目录 | `/`（本仓库根目录） |
| Node.js | `24`，也可在构建变量中明确设置 `NODE_VERSION=24` |
| Worker 名称 | 与自己的 `wrangler.jsonc` 中 `name` 一致 |
| 构建命令 | 留空，Wrangler 自动构建 |
| 部署命令 | `npm run deploy` |
| 发布目录 | 无需填写 Pages 的输出目录；Wrangler 已指定 `dist/` |

Cloudflare 的 Git 集成负责账号授权。仓库中的 GitHub Actions 只做检查，**不会自动把 Fork 部署到作者账号**。

使用自己的外部 CI 部署时，将 `CLOUDFLARE_API_TOKEN` 和目标 `CLOUDFLARE_ACCOUNT_ID` 放入 CI Secret / 环境配置，按 Cloudflare 官方说明为 Token 授予目标账号所需的 Workers 部署权限。不要把令牌写入代码或提交到仓库。[Workers Builds 设置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

## 免费额度与费用

规则核对日期：2026-09-27。

| 项目 | 免费套餐 / 费用 |
| --- | --- |
| Static Assets 请求 | 免费且不限次数 |
| Static Assets 存储 | 无额外存储费用 |
| Worker 动态请求 | 每账号每天 100,000 次，UTC 零点重置 |
| Worker CPU | 每次 HTTP 请求 10 ms |
| Workers Paid | 5 美元 / 月起，包含一定请求和 CPU 额度，超出按量计费 |
| 数据库与对象存储 | 本项目未使用，不产生相关服务费用 |
| 自定义域名 | 可选，注册 / 续费由域名注册商收费 |

静态页面匹配不进入 Worker 脚本；9 个本地工具的计算也在浏览器中进行。邮件、IP 和 DNS 接口进入 Worker，会计入动态额度。等待上游网络不计 CPU 时间，JSON/MIME 解析与 HTML 清理会计入。

**免费部署不保证所有邮件处理都符合 10 ms CPU 限制。** 大邮件、复杂 HTML 或高频调用可能需要优化、减少单次邮件数量，或由部署者自行升级套餐。达到免费请求上限时动态接口会被限流，静态本地工具仍可加载。

IP 数据源和 Microsoft 接口有独立的限流、权限及可用性条件。项目没有购买这些服务的付费套餐；第三方服务未来的政策以各自条款为准。

参考：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/) · [静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [平台限制](https://developers.cloudflare.com/workers/platform/limits/)

## 绑定自定义域名

成功部署后，在 Cloudflare Dashboard 打开对应 Worker，进入 **Settings → Domains & Routes → Add → Custom Domain**，填写自己拥有且已由 Cloudflare 管理的域名，按页面提示完成绑定。

自定义域名不是运行前提；`workers.dev` 地址也可使用。具体网络可达性取决于访问者所在网络。

## 更新与回滚

CLI 用户拉取自己仓库的更新后，重新安装锁定依赖并部署：

```sh
git pull --ff-only
npm ci
npm run deploy
```

Fork 用户先同步上游变更；已启用 Cloudflare Git 集成时，向部署分支推送后会触发构建。回滚可使用 Cloudflare Worker 的部署历史选择旧版本。回滚到不含新资源的旧版本时，请一并检查页面资源是否正常。

## 常见问题

### 为什么不能只上传 `public/`？

配置转换、Cron 等依赖需要打包。生产输出是 `dist/`，邮件和网络 API 还需要 Worker 入口。使用 `npm run deploy` 会统一完成这些步骤。

### 为什么项目设置了 `private: true` 还能开源？

`package.json` 的 `private` 只阻止误发布到 npm，与 GitHub 仓库可见性、MIT 许可证和 Cloudflare 部署无关。

### 部署时要求 Python？

当前部署与默认 `npm test` 仅依赖 Node.js。Python requests 生成代码的额外验证已独立为 `npm run test:python`，GitHub CI 会安装 Python 并运行它。

### 邮件读取失败是否代表账号无效？

不能如此判断。令牌可能过期、权限不匹配、原应用需要客户端密钥，或 IMAP 未开启，也可能是微软限流或网络故障。请依据页面错误代码处理，并妥善保存微软返回的新刷新令牌。

### “域名真实 IP”一定能找到源站吗？

不能。工具展示当前公开 DNS 和 CDN 线索；CDN 边缘地址不代表源站，没有匹配到 CDN 也不能证明没有代理。

### 不想公开给其他人使用怎么办？

部署到自己的账号后，可配置部署层的访问控制。当前工具站没有内置用户登录，API 同源检查也不等于用户认证。
