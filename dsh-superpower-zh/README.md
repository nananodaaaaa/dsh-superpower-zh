# dsh-superpower-zh

把桌面的 `superpower-zh` 技能包封装成 **DeepSeek Harness 的 profile 插件**：21 个中文技能 + 一段常驻核心规则，装完即对**所有会话**生效，并与 `@nanmicoder/dsh-agent-teams`（AgentTeams）等已有插件**并行共存**。

（另有 3 个 PPT 技能拆到了独立插件 [`dsh-ppt-plugin`](../dsh-ppt-plugin/README.md)，原因见文末「为什么拆成两个插件」。）

## 装了什么

| 行 id | 插件 | 作用 |
| --- | --- | --- |
| `skill-filesystem-superpower-zh` | `@deepseek-ai/dsh-skill-filesystem` | 第二个技能 provider（`providerName: superpower-zh`），把本包的 `skills/` 注册进全局技能目录 |
| `superpower-zh` | 本包 `index.js` | 往系统提示注册常驻规则段 `superpower-zh:policy`（order 700） |

技能正文是**惰性文本**：不调用 `skill` 工具就不会进上下文，因此只增加目录行的开销，不增加工具。

## 21 个技能

```
brainstorming                      chinese-code-review            chinese-commit-conventions
chinese-documentation              chinese-git-workflow           dispatching-parallel-agents
executing-plans                    finishing-a-development-branch humanizer-zh
mcp-builder                        receiving-code-review          requesting-code-review
subagent-driven-development        systematic-debugging           test-driven-development
using-git-worktrees                using-superpowers              verification-before-completion
workflow-runner                    writing-plans                  writing-skills
```

常驻规则段做四件事：① 强制「先查技能 / 设计先于编码 / 测试先于实现 / 验证先于完成」；② 给出技能路由表；③ 写明与 AgentTeams 的**分工边界**；④ 说明技能正文里的 Claude Code 工具名如何映射到本 Harness（完整对照见 `skills/using-superpowers/references/dsh-tools.md`）。

## 安装

```powershell
# 从本仓库本地目录安装（把 web 换成你实际用的 profile 名）
dsh plugin --profile web add .\dsh-superpower-zh

# 或直接从 GitHub 安装
dsh plugin --profile web add github:nananodaaaaa/dsh-superpower-zh#path:/dsh-superpower-zh
```

`dsh plugin add` 做两件事：把包装进 profile 的 `node_modules`，并把声明了 `dsh.bundle` 的依赖自动并入 `dsh.profile.bundles` 层列表（见 `$DSH_HOME/profiles/web/package.json`）。装完需要**重启 DSH 进程**才会加载新层。

卸载：

```powershell
dsh plugin --profile web remove dsh-superpower-zh
```

## 与 AgentTeams 并行共存

三者注册的名字空间互不重叠，因此可以同时启用：

| 插件 | 系统提示段 | 工具 | 技能 provider |
| --- | --- | --- | --- |
| AgentTeams | `agent-teams:usage`（order 117） | `agent_teams_*` | — |
| 本插件 | `superpower-zh:policy`（order 700） | 无 | `superpower-zh` |
| dsh-ppt-plugin | `ppt-plugin:policy`（order 710） | 无 | `ppt-plugin` |

分工由规则段写死：**用户明确要团队/依赖图/审批门禁 → 用 AgentTeams 编排**；**其余情况 → 用 superpower-zh 的流程技能**（需要委派时用 `subagent` / `workflow`）。两者同时适用时，AgentTeams 决定「谁来做、按什么顺序」，superpower-zh 决定「质量纪律」（TDD、系统性调试、完成前验证）。`dispatching-parallel-agents` / `subagent-driven-development` 描述的是单会话内的委派形态，升级为团队协作时不再由它们驱动编排。

## 验证

三档，由浅入深：

```powershell
# 1. 技能包能否被真实加载器识别（用 provider 自己的 name 语法）
node scripts/verify-skills.mjs

# 2. bundle patch 是否合法、provider 名是否唯一、apply() 是否真能注册提示段
node scripts/verify-patches.mjs "$env:USERPROFILE\.dsh\profiles\web" . ..\dsh-ppt-plugin

# 3. 真启动一次完整组合（临时 profile，跑完自动删除）
powershell -NoProfile -File scripts/boot-probe.ps1
```

三者当前均通过。第 3 档的实测输出：

```
[dsh-superpower-zh] registered prompt section superpower-zh:policy (order 700)
[dsh-ppt-plugin]     registered prompt section ppt-plugin:policy (order 710)
activation problems: (none)
```

`boot-probe.ps1` 会新建临时 profile、走一遍普通 `dsh plugin add`、在空闲端口起服务、抓启动日志判定，然后**删除该临时 profile 并结束自己启动的进程**——不碰你自己的 `web` profile。

## 为什么拆成两个插件

原先 24 个技能里有 3 个（`GordenImage2PPTX` / `GordenImagePPTGen` / `GordenSuperPPTSkill`）用了大写名字。DSH 的技能加载器只接受 `^[a-z0-9]+(?:-[a-z0-9]+)*$`，这 3 个会被**静默跳过**（只在 host 日志里 warn 一行，模型侧看不到任何提示）。处理方式：

1. 按你的要求拆成独立插件 `dsh-ppt-plugin`，名字转成 kebab-case：
   `gorden-image2pptx` / `gorden-image-ppt-gen` / `gorden-super-ppt-skill`；
2. 同步改写技能正文里的交叉引用（含 `../GordenImagePPTGen/SKILL.md` 这类相对路径），脚本为 `dsh-ppt-plugin/scripts/rename-refs.mjs`；
3. 本插件因此只剩 21 个技能，路由表里也删掉了 PPT 三行。

两个插件各自注册**独立的** `skill-filesystem` provider 名（provider 名每进程只能注册一次，复用会直接冲突），所以可以只装其中一个，也可以都装。

## 已知限制

- **改动需要重启 Harness**：profile 层在进程启动时组合，装完/改完要重启 `dsh` 进程才会生效。
- **技能正文保持原样**：没有改动任何技能的方法论内容，只改了被升级的那 3 个技能名及其引用。正文里残留的 Claude Code / Codex 工具名通过规则段和 `references/dsh-tools.md` 做映射说明。
- **PPT 三技能依赖图像生成能力**：本 Harness 若没挂载图像生成工具，规则段要求模型**停机说明阻塞**，而不是用代码绘图伪造图片。
- **`using-superpowers` 的「必须调用 Skill 工具」**：本插件把它降级为规则段里的「先查技能（哪怕只有 1% 可能）」，避免它在每次对话开头强制一次技能调用。
