# Changelog

## 1.0.0 — 2026-11-01

首个公开发布。

- 在「插件」页新增「命名」标签：列出所有第三方插件，逐个起名
- 名字写进目标包自己的 `locale/*.json`（`meta.title`），「已安装」列表直接显示
- 只列 `availability: profile` 的第三方插件；dsh 自带的官方插件默认隐藏（`showBundled: true` 可展开）
- 每行显示插件作者写的自我介绍（两行截断，超过 72 字可展开）
- 三种写入结果的状态标记：已写入元数据 / 待重启生效 / 只读包·仅记账
- 每个被改文件留 `.plugin-namer.bak` 原件，一键还原
- `POST /plugin-namer/repair` 自愈接口：补回空的 `meta.description`（宿主校验要求非空），修复早期版本留下的空壳文件
- 写入一律 UTF-8 无 BOM、临时文件 + rename 原子替换；只接受本机回环来源的写请求
