# dsh-plugin-namer · 插件命名

给**已安装的第三方插件**起一个你自己的名字，并且让它真的生效——不是记在一个小本本里自娱自乐，而是写进那个插件自己的语言元数据，于是「插件 → 已安装」列表里显示的就是你起的名字。

DeepSeek Harness（dsh）插件。中英双语界面。

```
插件市场                            →  改成「市场台」后，列表里就是 市场台
dshmarket · v1.73.3 · 1 行
逛一逛，点一下，装好。               ← 插件作者写的自我介绍，两行截断，点开看全文
```

## 它解决什么

dsh 的插件标题来自包里的 `locale/*.json`（`meta.title`）。很多插件的名字是包名、或者是作者写在英文里的一串词，装多了以后「已安装」列表很难扫。这个插件给你一个统一的改名台：

- 列出你装的第三方插件，一行一个：名字 + 包名 + 版本 + 作者介绍
- 改完写进该包自己的 locale，**列表里立刻是真名**
- 一键还原，按备份逐字回写

## 安装

在 dsh 里安装（dsh 0.2.1+）：

```
dsh plugin --profile <你的 profile> add dsh-plugin-namer
```

或者在应用里：**插件 → 发现 / 市场 → 搜索 dsh-plugin-namer → 安装**。

装好后打开 **插件 → 命名** 标签。

## 用法

1. 在输入框里给某个插件起名，回车保存
2. 刷新页面 → 「已安装」里就是新名字
3. 想改回去点「清除」，按 `.bak` 还原

三种结果，界面上直接标出来：

| 标记 | 含义 | 什么时候出现 |
|---|---|---|
| 已写入元数据 | 宿主已经读到新名字 | 该包本来就有 `locale/*.json` |
| 待重启生效 | 文件已写好，但宿主在启动时读了 `exports` 映射，结构变更要等重启 | 该包原本没有语言资源，插件替它补了 `./locale/*.json` 导出键 |
| 只读包 · 仅记账 | 包在 `app.asar` 内、磁盘上没有可写目录 | 主要是 dsh 安装自带的官方包（默认不显示） |

## 它对你的磁盘做了什么

这个插件**会修改你已安装插件的文件**——这是它能改名的方式，你需要知道具体改了什么：

- 在目标包的 `locale/*.json` 里写 `meta.title`
- 每个被改的文件旁边留一份原件 `<文件名>.plugin-namer.bak`
- 原本没有语言资源的包：新建 `locale/zh.json`、`locale/en.json`，并在该包 `package.json` 的 `exports` 里补一个 `"./locale/*.json": "./locale/*.json"`（原 `package.json` 备份为 `package.json.plugin-namer.bak`）
- 备份只写一次，不会覆盖最初的原始内容；「清除」会把它还原回去

不改任何代码文件、不改插件配置、不联网。改名账本在本机：`<DSH_HOME>/plugin-namer/names.json`。

## 已知边界

- **只列第三方插件**：随 dsh 安装自带的官方插件（`availability: installation`）默认不显示，它们的名字是官方写好的。需要排查时可以给本插件行配置 `showBundled: true`。
- **官方内置包改不了显示名**：它们在 `app.asar` 里，只读。
- **重装/升级某个插件会丢名字**：名字写在那个包里面，重装即覆盖。账本还在，把那行再点一次保存即可批量找回。
- **改完要刷新页面**：宿主元数据是每次读取现读磁盘，页面本身有自己的取数时机。
- 原本没有语言资源的包，改名后**重启 dsh** 才会显示。

## 兼容性

- dsh `>= 0.2.1-rc.3`
- 客户端落在「插件」页的 `plugins.tab` / `settings.plugins.tab` 两个 slot，老新两套插件页都能挂上
- 不依赖任何第三方运行时包

## 开发

```bash
git clone https://github.com/otm1998/dsh-plugin-namer
cd dsh-plugin-namer
node --check index.js && node --check client.js
# 本地装进某个 profile：
dsh plugin --profile <profile> add "$PWD"
```

文件就四个：`index.js`（Host：读 `listBundles()`、写 locale、备份还原、本地 HTTP 路由）、`client.js`（Web：手写 `__ModuleLoader__` 工厂，零构建）、`locale/*.json`（本插件自己的显示名）、`icon.svg`。

## English

**dsh-plugin-namer** renames your installed third-party dsh plugins for real: the name is written into that plugin's own `locale/*.json` (`meta.title`), so the Plugins → Installed list shows it. Every touched file keeps a `.plugin-namer.bak` original, and *Clear* restores it byte for byte.

```bash
dsh plugin --profile <profile> add dsh-plugin-namer
```

- Lists third-party plugins only (bundled official plugins are hidden by default; `showBundled: true` on this plugin's row reveals them)
- Shows each plugin's own description, two-line clamp, click to expand
- Status chips: *written to metadata* (refresh the page), *applies after restart* (package had no locale resource, so an `exports` key was added), *read-only · ledger only* (packages inside `app.asar`)
- Ledger: `<DSH_HOME>/plugin-namer/names.json`

MIT.

## License

MIT © YG
