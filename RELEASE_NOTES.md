# dsh-plugin-namer 1.0.0

给已安装的第三方插件起自己的名字，而且是真的生效——名字写进那个插件自己的 `locale/*.json`（`meta.title`），所以「插件 → 已安装」里显示的就是你起的名字。

## 功能

- **插件 → 命名** 标签页：只列你自己装的第三方插件（dsh 自带官方插件默认隐藏）
- 每行显示：名字 · 包名 · 版本 · 行数 · **插件作者写的自我介绍**（两行截断，点开展开）
- 改名写进目标包自己的语言元数据，刷新页面即见；每个被改文件留 `.plugin-namer.bak` 原件，一键还原
- 三种结果有明确标记：已写入元数据 / 待重启生效 / 只读包·仅记账
- 写入一律 UTF-8 无 BOM、临时文件 + rename 原子替换；写接口只接受本机回环来源
- `POST /plugin-namer/repair` 自愈：补回为空的 `meta.description`（宿主校验要求非空）

## 安装

```bash
dsh plugin --profile <profile> add dsh-plugin-namer
```

## 它会修改你的文件（必须知道）

- 在目标包的 `locale/*.json` 写 `meta.title`
- 每个被改文件旁留 `<文件名>.plugin-namer.bak`
- 原本没有语言资源的包：新建 `locale/zh.json`、`locale/en.json`，并在该包 `package.json` 的 `exports` 补 `"./locale/*.json"`（原文件备份为 `package.json.plugin-namer.bak`）
- 账本：`<DSH_HOME>/plugin-namer/names.json`；不联网

## 已知边界

- dsh 自带的官方插件在 `app.asar` 内，只读，改不了显示名（默认也不显示它们）
- 重装/升级某个插件会覆盖它的名字——账本还在，再点一次保存即可
- 原本没有语言资源的包，改名后需重启 dsh

## 兼容

dsh `>= 0.2.1-rc.3` · Node `>= 20.11` · MIT
