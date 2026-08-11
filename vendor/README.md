# Vendored Pi source

`vendor/pi` 是 AI novel 内置的完整 Pi 源码。

- 上游仓库：https://github.com/earendil-works/pi
- 版本：v0.84.1
- 提交：`53fa77ccd8a279eb87e92294ef3687b03ff80112`
- 许可证：MIT，详见 `pi/LICENSE`

AI novel 直接导入 `pi/packages/coding-agent/dist/index.js`。项目不依赖 AI novel 目录以外的 Pi 源码，也不从根目录 `node_modules` 加载 npm 版 `pi-coding-agent`。

首次准备本地源码：

```bash
npm run setup
```

修改 `vendor/pi` 后重新构建：

```bash
npm run pi:build
```
