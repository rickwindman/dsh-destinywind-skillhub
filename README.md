# dsh-destinywind-skillhub

在 DeepSeek Harness 设置里管理技能：**本机 DSH 技能可增删启停，其它 agent 的技能只能看、只能手动导入。**

基于 [deronghe/dsh-skills-manager](https://github.com/deronghe/dsh-skills-manager)（Apache-2.0）改造。

## 它解决什么

一台机器上往往装着好几个用技能（skills）的 agent，各自把技能放在自己的家目录：

| 来源 | 目录 | 本插件对它 |
|---|---|---|
| DSH（本 agent） | `%USERPROFILE%\.dsh\skills` | 可启停、可删除、可导入 |
| 公共 Agent 约定位置 | `%USERPROFILE%\.agents\skills` | **只读** |
| Trae CN | `%USERPROFILE%\.trae-cn\skills` | **只读** |
| WorkBuddy | `%USERPROFILE%\.workbuddy\skills` | **只读** |

于是别的 agent 攒下的好技能，在 DSH 里只能靠手工拷文件。本插件把这件事搬进设置面板：

1. **发现** —— 自动扫描上表中存在的每个目录
2. **展示** —— 和其它技能并排列出，带描述、形态与「已存在」标记
3. **只读** —— 外部来源**不能就地启停、不能删除、不能覆盖**（服务端拒绝，不只是界面禁用）
4. **手动导入** —— 每个外部技能卡片上有一个「导入」按钮，点了才把它**复制**进 `$DSH_HOME\skills`

**「发现」与「使用」是分开的**：能看见 ≠ 能生效。只有你按下「导入」，技能才真正进入本 agent 的技能库。

## 安全边界

| 行为 | 外部来源 | DSH 库 |
|---|---|---|
| 列出 | ✅ | ✅ |
| 启用 / 停用 | ❌ `error.root.readonly` | ✅ |
| 删除 | ❌ `error.root.readonly` | ✅ |
| 就地覆盖 | ❌ | — |
| 导入进 DSH | ✅（唯一的写操作） | — |

- 导入是**复制**：来源目录一个字节都不会被改写。
- 目标库已有同名技能时**默认跳过**，界面显示「已存在」，不会覆盖你现有的技能。
- 导入只接受目录型技能（含 `SKILL.md` 的目录），连同目录内的脚本、模板等资源整体复制。
- 所有写接口要求 loopback Host + 自定义请求头 + JSON，防止浏览器跨站调用。

## 安装

```
dsh-destinywind-skillhub@github:rickwindman/dsh-destinywind-skillhub
```

装完重启 DSH，打开 **设置 → 技能**。

> 注意：`plugin_manager` 的 `install_bundle` 必须带 `dsh-destinywind-skillhub@` 前缀。用裸 `github:owner/repo` 会让 DSH 无法识别装的是哪个包，报 `ambiguous-install`。

## 来源目录可配置

新增来源不必改代码，设置环境变量 `DSH_SKILLHUB_SOURCES` 即可（分号分隔，`key=相对家目录的路径`）：

```
DSH_SKILLHUB_SOURCES=codex=.codex;marvis=.marvis
```

未设置时使用默认的 `.trae-cn` 与 `.workbuddy`。

## HTTP 接口

前缀 `/api/dsh-skills-manager`，仅本机 loopback 调用。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/state` | 全部来源根与技能的完整快照（外部条目带 `existsInDsh` / `importable`） |
| GET | `/external/list` | 只列可导入的外部来源 |
| POST | `/external/import` | 导入单个外部技能，body `{ root, name, conflict?, dryRun? }` |
| POST | `/import` | 按本机路径导入（上游能力） |
| POST | `/enable` `/disable` `/delete` | 仅对 DSH 根生效 |
| GET/POST | `/config` | 来源仓库配置 |
| POST | `/push` | 把 DSH 技能推回来源仓库 |

响应：成功 `{ ok: true, data }`；失败 `{ ok: false, error, code, params }`。

## 测试

```
npm test
```

三个套件：
- `test/core-test.mjs` —— 上游全量（332 项）
- `test/locale-test.mjs` —— 词典完整性（1143 项）
- `test/external-import-test.mjs` —— 本 fork 新增能力（24 项）

全部在临时目录里跑，不会碰真实技能库。

## 许可

Apache-2.0，随上游。源代码未压缩，目录结构与上游一致，便于日后拆包与二次改造。
