# 发布清单（RELEASING）

这个目录已经是可发布的包：`npm pack` 通过，tarball 9 个文件 / 16.2 kB。
下面每一步都是复制粘贴即可，只有两处必须换成你自己的信息。

## 0. 两处占位必须先替换

| 占位 | 出现位置 | 换成 |
|---|---|---|
| `otm1998` | `package.json`（repository/homepage/bugs）、`README.md`（clone 命令）、`market-entry.json`（owner/url） | 你的 GitHub 用户名 |
| `NPM_TOKEN` | 只在 GitHub Actions 里引用 | 仓库 Settings → Secrets 里配置的 npm token |

```powershell
$user = 'your-github-name'
Get-ChildItem -Recurse -File | Where-Object { $_.Extension -in '.json', '.md' } | ForEach-Object {
  $text = Get-Content $_.FullName -Raw
  if ($text.Contains('otm1998')) {
    $text.Replace('otm1998', $user) | Set-Content $_.FullName -NoNewline -Encoding utf8
    "patched $($_.Name)"
  }
}
```

## 1. 自检（已通过，改代码后再跑）

```bash
node --check index.js && node --check client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
npm pack --dry-run
```

## 2. 建仓库并推上去

```bash
git init
git add -A
git commit -m "feat: dsh-plugin-namer 1.0.0 — rename installed third-party plugins for real"
git branch -M main
git remote add origin https://github.com/<你的用户名>/dsh-plugin-namer.git
git push -u origin main
```

## 3. 发 npm

先确认包名没被占（当前 `npm view dsh-plugin-namer` 返回 404，可用）：

```bash
npm login
npm whoami
npm publish --access public
npm view dsh-plugin-namer version
```

发版打 tag，Actions 会自动按 tag 发布后续版本：

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## 4. 进市场（可选，但这是「很多人能看到」的那一步）

dsh 的插件市场列表来自 **awesome-dsh-plugin** 目录仓库，不是市场应用本身：

1. 打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
2. 按其 `plugins.json` 已有条目的形状，加一条 `market-entry.json` 里的内容（`category` 要换成该目录 `categories` 里已有的 id，`added` 用 PR 日期）
3. 提 PR

合并后，站点与市场约一天内自动出现。也可以在 dsh 里手动加索引源：
**插件 → 发现 → 索引源 → 加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`**。

## 5. 发完自测

在一台干净的机器/新 profile 上：

```bash
dsh plugin --profile test add dsh-plugin-namer
```

打开 **插件 → 命名**：应能看到第三方插件列表、作者介绍、可改名并刷新后生效。

## 版本规则

- 只改文案/样式 → `1.0.1`
- 新增能力（例如按 bundle 隐藏规则可配置） → `1.1.0`
- 改动写入策略或账本格式（`names.json` 结构） → 升 major，并在 CHANGELOG 写迁移说明

账本格式变更要兼容旧文件：`loadState` 容忍缺字段，老 `names` 直接可用。
