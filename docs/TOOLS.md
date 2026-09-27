# 功能与开发说明

[返回项目首页](../README.md) · [部署与费用指南](DEPLOYMENT.md)

## 工具

- `/tools/json/`：格式化、压缩、校验、文件导入、复制和下载。支持 2/4 空格和 Tab 缩进。
- `/tools/timestamp/`：Unix 秒/毫秒时间戳与日期双向转换，支持本地时区、UTC、负数和当前时间。
- `/tools/encode/`：Base64、URL 参数编码与解码，支持 UTF-8 中文。
- `/tools/outlook/`：单邮箱 Outlook / Hotmail 读取验证，支持四字段输入、Graph / IMAP OAuth、收件箱与垃圾邮件、关键词筛选、HTML 格式化 / 纯文本切换、验证码和新令牌复制。

- `/tools/ip/`：当前公网 IP 检测、指定 IPv4 / IPv6 的归属地、网络组织与 ASN 查询。
- `/tools/domain/`：域名公开 DNS 记录、解析 IP、CDN 线索与识别依据。
- `/tools/diff/`：逐行比较两段文本，显示新增、删除和未变内容。
- `/tools/regex/`：正则表达式实时匹配、高亮、索引和捕获组查看。
- `/tools/jwt/`：本地解码 JWT Header / Payload，查看常用声明、签发与过期时间；不验证签名。
- `/tools/config/`：JSON、YAML、TOML 六个方向的配置转换，支持复制、下载与类型损失检查。
- `/tools/cron/`：五字段 Cron 中文解释、未来 10 次执行预览、Unix / Cloudflare 基础模式及时区切换。
- `/tools/curl/`：解析单条 cURL 请求，展示方法、请求头、参数与正文，生成 JavaScript fetch / Python requests。

## JWT、配置、Cron 和 cURL

这四个工具均在浏览器中处理，不向 Daykit Worker 上传输入。

JWT 工具支持带 `Bearer` 前缀的三段式令牌，显示 `iss`、`sub`、`aud`、权限和 `iat`、`nbf`、`exp` 时间。状态只按未验证的声明和设备时间计算；**解码不代表验签或授权成功**。五段式 JWE 需要解密密钥，不在此工具中直接解析。[JWT 标准](https://datatracker.ietf.org/doc/html/rfc7519)

配置转换默认 JSON → YAML，可选择 JSON、YAML、TOML 任意源和目标，并复制或下载。它会拦截 TOML 不支持的 `null`、不能保留类型的日期、重复键、过大别名以及可能丢失精度的数字。注释和原排版不会跨格式保留；单次输入最多 200,000 字符。

Cron 工具预览严格晚于指定开始时间的执行时刻，默认规则时区 UTC、显示时区北京时间。Unix 模式的星期从周日 `0/7` 开始，日期和星期同时受限时按 OR 解释；Cloudflare 基础模式固定 UTC，星期 `1` 是周日、`7` 是周六，未支持的扩展会明确报错。计算在线程中进行，超时会自动停止。预览只是解释结果，不会创建定时任务。[Cloudflare Cron 文档](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

cURL 工具只解析一条 POSIX / bash 风格命令，保留重复查询参数与原始正文，生成可复制的 fetch、requests 代码；不会执行输入或发送请求。文件引用、动态 shell 语法和无法安全保留语义的选项会报错。浏览器禁止手动设置的请求头及 CORS 差异会出现在转换提示中。[cURL 官方手册](https://curl.se/docs/manpage.html)

## 邮件读取验证

在邮件工具页粘贴一条 `email----password----client_id----refresh_token`，默认读取最近 5 封。自动模式先尝试 Microsoft Graph，在授权/权限类错误时尝试 IMAP；网络错误、超时和 429 不自动换接口重试。高级选项可手动选择协议及 `consumers` / `common` 登录类型。

密码仅在浏览器中保留用于重建账号行，不发送至 Worker 或 Microsoft。浏览器将邮箱、client_id、refresh_token 通过 HTTPS POST 发往同站 `/api/outlook/read`；Worker 仅向固定的 Microsoft OAuth、Graph、Outlook IMAP 端点请求。接口不写数据库、不使用 KV、不记录请求体或令牌，响应使用 `Cache-Control: no-store`。

Microsoft 返回新 refresh token 时，可以更新本页输入，或复制完整新账号行自行保存；即使后续取信失败，已刷新到的新令牌仍会返回供保存。没有长期账号库和后台轮询。

读取使用 `Mail.Read` 或 `IMAP.AccessAsUser.All` 的原有授权，适用于兼容 Microsoft v2 OAuth 端点的应用。若原应用要求 client secret，四字段不足以授权。Graph 读取令牌所属邮箱，邮箱字段只是输入标识；IMAP 使用邮箱地址认证。请核对账号行和令牌所属账号。

页面只读取邮件，不发信、不删除、不移动、不标记已读。关键词只筛选本次最近邮件。HTML 正文经标签、属性和 CSS 白名单清理后，在无脚本、无同源权限的 sandbox iframe 中渲染，保留文字、表格、颜色与间距，并可切换纯文本。脚本、表单、图片、远程资源及可导航链接被移除或禁用，复杂外部样式不保留；验证码是启发式提取。IMAP 一封原始邮件最多 512 KB，一次累计最多 2 MB；较大的邮件显示邮件头与提示。Graph 响应上限 3 MB，正文展示最多 160,000 字符。一次失败不代表邮箱应当丢弃。

测试使用虚构账号和模拟 Microsoft 返回值，覆盖协议切换、令牌更新、MIME/HTML 转文本和浏览器交互；真实邮箱的授权有效性需要由使用者在页面中验证。参考：[Microsoft OAuth IMAP](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)、[Graph 邮件读取](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)。

快捷键：`⌘/Ctrl + K` 搜索工具；首页 `/` 聚焦目录搜索；编辑器 `⌘/Ctrl + Enter` 执行格式化或编码。

## 文本 Diff 与正则表达式

两个工具都在浏览器本地处理，输入不上传、不持久保存。

文本 Diff 按行比较两段文本，展示新增、删除和未变行，可复制带 `+` / `-` 标记的结果。每侧限 1 MB 和 2,000 行；忽略空白选项会合并连续空白并忽略行首行尾空白。编辑输入后旧结果与复制会失效，避免误用。

正则工具使用当前浏览器的 JavaScript RegExp 引擎，支持常见 flags、实时高亮、匹配索引、普通及命名捕获组。表达式在独立 Web Worker 中执行，超过 1 秒会停止，修改或清空可取消旧任务。模式最多 4,096 字符、文本最多 1,000,000 字符、匹配最多 1,000 条，详情展示前 200 条；单个匹配最多 64 个捕获组，结果文本总量设有上限。高级语法的可用性取决于浏览器支持。

## IP 与域名查询

IP 工具自动检测访问者当前连接的公网出口，线上优先使用 Cloudflare 的连接地址和地理信息，不代表设备内网地址。手动查询公网 IPv4 / IPv6 使用 [IPWHOIS](https://ipwhois.io/documentation)，位置仅为近似归属地。没有连接信息的本地开发环境会通过 [ipify](https://www.ipify.org/) 查询服务出口，并明确标注与访问者地址可能不同。地理信息服务暂不可用时，通过 [RIPEstat](https://stat.ripe.net/docs/data-api/api-endpoints/prefix-overview) 的公开路由数据补充 ASN 和持有人；地理字段留空并注明数据限制，不把登记持有人当成实际地理位置。所有数据源均不可用时仍保留可确认的 IP 地址。

域名工具可输入域名或 HTTP(S) 网址，通过 [Cloudflare DoH](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) 查询 A、AAAA、CNAME、MX、NS；故障时使用 [Google DoH](https://developers.google.com/speed/public-dns/docs/doh/json)。CDN 线索依据官方 IP 网段或精确 CNAME 后缀，不把 Cloudflare DNS 托管本身当作 CDN 代理证据。

**公开 DNS 解析地址不等于源站真实 IP。** 页面会展示可确认的解析结果和识别依据；没有 CDN 线索也不会宣称已经找到源站。工具不扫描端口、不探测目标服务器，所有网络请求仅发往固定数据服务。公开 DNS 中的内网/保留地址可以作为记录展示，但不会被连接。

查询由 `/api/network/ip` 和 `/api/network/domain` 处理，要求本站同源 POST。IP 或域名会发送到对应查询服务，结果不持久保存；第三方服务有自身的数据准确度和可用性限制。

## 数据与边界

JWT、配置转换、Cron、cURL、Diff、正则及基础格式转换均在浏览器执行；邮件与网络查询的数据流见上节。网站不加载远程字体或脚本。收藏和最近访问的工具名称/时间保存到 localStorage；工具输入和输出不持久保存。刷新或离开页面会清空输入。正式域名与本机地址属于不同站点，收藏及最近使用记录彼此独立。

JSON 使用浏览器原生解析器，数字遵循 JavaScript 双精度规则。超出安全整数范围和非有限数值会被拒绝；长 ID、高精度小数请使用字符串。单次文本/文件限 2 MB。Base64 解码只支持 UTF-8 文本，不是二进制文件解码器。URL 解码保留 `+`，不按表单空格处理。

时间戳自动识别以绝对值 `10^10` 为边界，低于该值按秒，达到该值按毫秒；旧日期的毫秒值或远期日期的秒值请显式选择单位。日期表单精确到秒；本地时区采用设备设置，夏令时重复时段按浏览器的较早时间解释。

## 校验

默认测试仅需 Node.js 22.12+。Python 代码生成验证已独立，GitHub CI 会额外运行它：

```sh
npm test
npm run test:python  # 可选，需要 Python 3
npm run check:deploy
```

核心测试覆盖 JSON 错误与精度保护、UTF-8 编码往返、大文本、无效编码、时间戳单位、负数、无效日期和时区转换。`check:deploy` 还会构建生产资源并运行 Wrangler dry-run，不会上传文件。

启动 `npm run dev` 后，在另一终端执行 `npm run test:workers`。它验证独立页面、缓存头、ETag/304、资源 MIME、重定向参数保留、真实 404 及配置文件不对外暴露。可用 `DAYKIT_TEST_URL` 指定已部署网址进行只读 HTTP 校验。

已安装 `playwright-cli` 时，可在本地服务启动后运行浏览器检查：

```sh
mkdir -p artifacts
playwright-cli -s=daykit-workers open http://127.0.0.1:8787
playwright-cli -s=daykit-workers run-code --filename=tests/browser-smoke.js
playwright-cli -s=daykit-workers run-code --filename=tests/mail-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/network-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/diff-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/regex-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/jwt-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/config-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/cron-browser.js
playwright-cli -s=daykit-workers run-code --filename=tests/curl-browser.js
```

浏览器脚本使用当前打开站点，检查搜索、收藏、各工具的输入输出、移动导航与不同屏幕宽度，并将截图保存到 `artifacts/`。它使用独立测试浏览器，会修改该浏览器中的收藏和最近使用记录。
