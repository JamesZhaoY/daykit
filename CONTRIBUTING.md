# 参与贡献

欢迎提交修复、工具改进和文档更新。

## 本地开发

```sh
git clone https://github.com/JamesZhaoY/daykit.git
cd daykit
npm ci
npm run dev
```

使用 Node.js 24。打开 http://127.0.0.1:8787 。

## 提交前验证

```sh
npm run check:deploy
```

保持开发服务运行，在另一个终端执行 `npm run test:workers`。修改 cURL 代码生成逻辑时，还需安装 Python 3 并运行 `npm run test:python`。

浏览器操作测试位于 `tests/*-browser.js`，运行方法见 [功能与开发说明](docs/TOOLS.md)。涉及页面变动时，请检查桌面和手机布局。

## 新增工具

1. 在 `public/tools/<id>/index.html` 创建独立页面，并设置 `data-page`。
2. 在 `public/app.js` 注册名称、分类、搜索词、页面入口与动态模块加载。
3. 将独立 CSS 加入 `scripts/build.mjs` 的入口列表。
4. 为解析、转换或复杂分支添加有价值的测试，并登记在 `package.json`。
5. 更新 README 功能清单、`tests/workers.test.mjs` 路由表及首页工具数量检查。

输入应保持为数据：不执行用户命令、不把外部 HTML 直接插入应用 DOM；复杂正则或计划计算应在线程中运行并设置超时。第三方网络查询只连接明确的数据服务。

提交 PR 时说明问题、实际行为和验证结果。不要包含真实账号、密码、令牌、Cookie、私有邮件或测试导出文件。

贡献内容按本项目 [MIT 许可证](LICENSE) 分发，第三方依赖继续遵循各自许可证。
