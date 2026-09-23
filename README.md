# dsh-superpower-zh

把 **Superpowers 中文增强版技能包（superpower-zh）** 封装成 **DeepSeek Harness (DSH) profile 插件**，装完即对所有会话生效，并与 [`@nanmicoder/dsh-agent-teams`](https://www.npmjs.com/package/@nanmicoder/dsh-agent-teams)（AgentTeams）等已有插件**并行共存**。

> 技能正文来自上游 superpower-zh 技能包，本仓库**不改动其方法论内容**，只做 DSH 集成封装（外加 3 个技能名的 kebab-case 更正与引用改写）。

本仓库是一个 monorepo，装两个可独立安装的插件：

| 目录 | 包名 | 内容 |
| --- | --- | --- |
| [`dsh-superpower-zh/`](dsh-superpower-zh/README.md) | `dsh-superpower-zh` | 21 个通用中文技能 + 常驻核心规则段 |
| [`dsh-ppt-plugin/`](dsh-ppt-plugin/README.md) | `dsh-ppt-plugin` | 3 个 PPT 技能（图片型 PPT / 图片转可编辑 PPTX / 端到端编排） |

## 这是什么形态的插件

不是"动态 Cordis 插件"（那种进程一重启就没了），而是**社区插件的标准形态**：npm 包 + 在 `package.json` 里声明 `dsh.bundle.patch`，用 `dsh plugin add` 安装。该命令会把包安装进 profile 的 `node_modules`，并把声明了 `dsh.bundle` 的依赖自动并入 `dsh.profile.bundles` 层列表——和 AgentTeams 走的是完全同一条路径。

每个插件贡献两行：

```yaml
- insert:
    - id: skill-filesystem-<name>
      name: '@deepseek-ai/dsh-skill-filesystem'
      config:
        providerName: <name>        # 每个插件必须独立，provider 名每进程只能注册一次
        includeDefaultRoots: false  # 隔离：不重复扫描项目/用户/内置技能根
        customSkillDirs: [./skills] # 相对本 patch 文件锚定
    - id: <name>
      name: ./index.js              # 往 systemPrompt 注册常驻规则段
```

技能正文是**惰性文本**：不调用 `skill` 工具就不会进上下文，所以只增加技能目录行的开销，不增加工具。

## 快速开始

```powershell
git clone https://github.com/nananodaaaaa/dsh-superpower-zh.git
cd dsh-superpower-zh

# 装进你的 dsh profile（把 web 换成你实际用的 profile 名）
dsh plugin --profile web add .\dsh-superpower-zh
dsh plugin --profile web add .\dsh-ppt-plugin

# 重启 dsh 进程后生效
```

只想要其中一个也完全可以——两个插件各自注册独立的 `skill-filesystem` provider 名，互不依赖。

卸载：

```powershell
dsh plugin --profile web remove dsh-superpower-zh
dsh plugin --profile web remove dsh-ppt-plugin
```

## 与 AgentTeams 并行共存

三者注册的名字空间互不重叠，可以同时启用：

| 插件 | 系统提示段 | 工具 | 技能 provider |
| --- | --- | --- | --- |
| AgentTeams | `agent-teams:usage`（order 117） | `agent_teams_*` | — |
| dsh-superpower-zh | `superpower-zh:policy`（order 700） | 无 | `superpower-zh` |
| dsh-ppt-plugin | `ppt-plugin:policy`（order 710） | 无 | `ppt-plugin` |

分工由常驻规则段写死：**用户明确要多人团队 / 任务依赖图 / 审批门禁 → 用 AgentTeams 编排**；**其余情况 → 用 superpower-zh 的流程技能**（需要委派时用 `subagent` / `subagent_fork` / `workflow`）。两者同时适用时，AgentTeams 决定"谁来做、按什么依赖顺序做"，superpower-zh 决定"质量纪律"（TDD、系统性调试、完成前验证）。`dispatching-parallel-agents` / `subagent-driven-development` 描述的是**单会话内**的委派形态，一旦升级为团队协作就不再由它们驱动编排。

## 验证

三档，由浅入深，全部可重跑：

```powershell
# 1. 技能包能否被真实加载器识别（用 provider 自己的 name 语法：小写 kebab-case）
node dsh-superpower-zh/scripts/verify-skills.mjs dsh-superpower-zh
node dsh-superpower-zh/scripts/verify-skills.mjs dsh-ppt-plugin

# 2. bundle patch：!!js 求值 + 真实 Config schema + customSkillDirs 实际解析结果 + provider 名唯一 + apply() 真注册
node dsh-superpower-zh/scripts/verify-patches.mjs

# 3. 真启动一次完整组合（临时 profile，外部 cwd，空闲端口，跑完自动清理）
powershell -NoProfile -File dsh-superpower-zh/scripts/boot-probe.ps1
```

第 3 档的两个关键点：`skill-filesystem` 行若没激活，DSH 启动会 fail-loud；而**子进程强制从 `C:\` 启动**，所以任何"相对 cwd 才成立"的配置都会在这里暴露（见下）。脚本会新建临时 profile、走一遍普通 `dsh plugin add`、抓启动日志判定，然后删除该临时 profile 并结束自己启动的进程——不碰你自己的 profile。

### 踩过的坑：`customSkillDirs` 必须是绝对路径

`dsh-skill-filesystem` 内部是 `customSkillDirs.map((root) => resolve(root))` —— 相对项按 **DSH 进程的 cwd** 解析，既不是相对 patch 文件，也不是相对 profile。我们第一版写了 `./skills`：

- 恰好从插件父目录启动时（我最初的探针就是 `cd` 过去跑的）能发现 24 个技能 → **探针假通过**；
- 真实 GUI 进程从别处启动 → 该目录根本不存在 → **静默发现 0 个技能**，启动不报任何错，但规则段正常注册，于是表现为"系统提示里有规则、`skill` 工具却找不到任何技能"。

现在改用 `!!js` 从 patch 自身位置求值：

```yaml
customSkillDirs:
  - !!js >-
      process.getBuiltinModule('node:url').fileURLToPath(new URL('./skills/', baseUrl ?? process.cwd() + '/'))
```

`verify-patches.mjs` 也据此重写：它现在用**加载器自己的 `interpolate()`** 求值 `!!js`（因此能证明 `baseUrl` 真的可用），再按 provider 的方式 `resolve()` 并用 provider 的 name 语法扫描结果目录，相对路径会直接判失败。这就是"验证要按对方的方式做，不能按自己的方式做"。

## 为什么 PPT 单独一个插件

原技能名 `GordenImage2PPTX` / `GordenImagePPTGen` / `GordenSuperPPTSkill` 用了大写。DSH 的技能加载器只接受 `^[a-z0-9]+(?:-[a-z0-9]+)*$`，这 3 个会被**静默跳过**——模型侧看不到任何报错，技能直接消失（只在 host 日志里 warn 一行）。这正是 `verify-skills.mjs` 扫出来的问题。

处理方式：拆成独立插件、名字转 kebab-case（`gorden-image2pptx` / `gorden-image-ppt-gen` / `gorden-super-ppt-skill`），并用 `dsh-ppt-plugin/scripts/rename-refs.mjs` 同步改写技能正文里的产品名与相对路径引用。拆开的另一个好处是 PPT 那 10 MB 参考图不会拖累通用技能包。

## 已知限制

- **改动需要重启 DSH 进程**：profile 层在进程启动时组合，装完/改完要重启才生效。
- **技能正文保持原样**：没有改动任何技能的方法论内容。正文里残留的 Claude Code / Codex 工具名（`Task`、`TodoWrite`、`$CODEX_HOME` 等）通过常驻规则段和 `dsh-superpower-zh/skills/using-superpowers/references/dsh-tools.md` 做映射说明。
- **PPT 三技能依赖图像生成能力**：本插件只提供方法论，不提供图像生成工具。若 profile 里没有图像生成能力，规则段要求模型**停机说明阻塞**，而不是用代码绘图伪造图片。
- **`using-superpowers` 的强制调用被降级**：原文要求"任何响应之前必须调用 Skill 工具"，已降级为规则段里的"先查技能（哪怕只有 1% 可能）"，避免它在每次对话开头强制一次技能调用。

## License

MIT
