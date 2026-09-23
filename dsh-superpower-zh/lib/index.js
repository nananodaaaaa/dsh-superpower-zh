/**
 * dsh-superpower-zh host half.
 *
 * One responsibility: register the always-on "superpowers-zh" policy into
 * `ctx.systemPrompt`, so every session of the profile knows the skill family
 * exists, what it demands, and how it coexists with AgentTeams.
 *
 * The 24 skill bodies themselves are NOT registered here — `cordis.patch.yml`
 * mounts a second `dsh-skill-filesystem` provider whose `customSkillDirs` is
 * this package's own `skills/` directory. That provider already owns
 * discovery, frontmatter parsing, watching, and the `skill` catalog/loader, so
 * this plugin stays a pure prompt contribution.
 */

/** Readonly host logger; fell back to the global console outside Cordis. */
const log = typeof console !== 'undefined' ? console : { error() {} }

/**
 * Unique section name. Folded into the first-party slot between TEAM_POLICY
 * (600) and PTC_ONLY (800): routing discipline is a procedure rule, so it
 * precedes the per-tool guidance below it and stays stable across presets.
 */
const SECTION_NAME = 'superpower-zh:policy'
const SECTION_ORDER = 700

const POLICY = `## Superpower-ZH 技能框架

本 Profile 已挂载 superpower-zh 技能包（24 个中文技能）。它们的完整目录由 \`skill\` 工具按需列出，下面是常驻的强制规则。

**核心规则（优先级高于默认行为，但低于用户的明确指令）**

1. **先查技能** — 收到任务时，只要存在某种可能性某个技能适用，就先调用 \`skill\` 工具查看它，再动手。
2. **设计先于编码** — 收到功能/组件/行为需求时，先用 \`brainstorming\` 澄清意图与需求，再写代码。
3. **测试先于实现** — 写实现代码之前先写测试（\`test-driven-development\`）。
4. **验证先于完成** — 声称"完成/已修复/通过"之前必须实际运行验证命令并看到输出（\`verification-before-completion\`）。没有证据就不要下结论。
5. **先定位根因** — 遇到 bug、测试失败或异常行为，先用 \`systematic-debugging\` 定位根因，再提修复方案。

**路由表**

| 场景 | 技能 |
| --- | --- |
| 任何创造性工作之前（新功能、新组件、行为变更） | \`brainstorming\` |
| 有需求，需要多步骤实现 | \`writing-plans\` → \`executing-plans\` |
| 实现功能 / 修 bug | \`test-driven-development\` |
| 任何 bug、测试失败、异常行为 | \`systematic-debugging\` |
| 计划中含相互独立的实现任务 | \`subagent-driven-development\` |
| 2 个以上无共享状态的独立任务 | \`dispatching-parallel-agents\` |
| 完成任务 / 合并 / 提 PR 之前 | \`requesting-code-review\` → \`receiving-code-review\` |
| 收到审查意见、动手修改之前 | \`receiving-code-review\` |
| 声称完成之前 | \`verification-before-completion\` |
| 需要与当前工作区隔离地开发 | \`using-git-worktrees\` |
| 实现完成，决定如何合并/清理 | \`finishing-a-development-branch\` |
| 编写中文技术文档 / README | \`chinese-documentation\` |
| 编写中文 commit message | \`chinese-commit-conventions\` |
| 中文代码审查沟通 | \`chinese-code-review\` |
| Gitee / Coding / 极狐 GitLab | \`chinese-git-workflow\` |
| 构建 MCP 服务器 | \`mcp-builder\` |
| 编写或修改技能本身 | \`writing-skills\` |
| 去除文本的 AI 味 | \`humanizer-zh\` |
| 运行 agency-orchestrator YAML 工作流 | \`workflow-runner\` |
| 不确定该用哪个技能 | \`using-superpowers\` |

**PPT 相关任务不在这里**：图片型 PPT、图片还原可编辑 PPTX、端到端 PPT 流水线由独立的 \`ppt-plugin\` 提供（3 个技能），路由规则见下方「PPT 技能」一节。两者互不依赖，可以分别安装。

**与 AgentTeams 并行共存（重要）**

AgentTeams 的 \`agent_teams_*\` 工具与 superpower-zh 技能是**并行能力，互不替代**，按下面的边界选择：

- **用户明确要求 AgentTeams**，或任务需要多人团队、任务 DAG、依赖调度、成员邮箱与审查门禁时 → 用 AgentTeams（\`agent_teams_create\` / \`agent_teams_status\` / \`agent_teams_send_message\` 等）。
- **其余情况** → 遵循 superpower-zh 的流程技能；需要委派时用普通 \`subagent\` / \`subagent_fork\` / \`workflow\`。
- **两者同时适用**（例如"用 AgentTeams 实现 X，并保证测试先于实现"）→ 流程纪律仍由 superpower-zh 技能决定：\`test-driven-development\`、\`systematic-debugging\`、\`verification-before-completion\` 约束每个成员的产出；AgentTeams 只负责"谁来做、按什么依赖顺序做"。
- \`dispatching-parallel-agents\` 与 \`subagent-driven-development\` 描述的是**单会话内**的委派形态；一旦升级为团队协作，改用 AgentTeams 的 create/plan/approve 流程，不要两套编排同时驱动同一批任务。
- \`workflow-runner\` 面向外部 agency-orchestrator YAML；如果用户要的是 DSH 原生编排，用 \`workflow\` 工具或 AgentTeams。

**平台适配**

这些技能正文沿用 Claude Code 的工具名。映射到本 Harness 的对应关系见技能 \`using-superpowers\` 的资源目录 \`references/dsh-tools.md\`：\`Task\` → \`subagent\`/\`subagent_fork\`、\`TodoWrite\` → \`todo_write\`、\`Read\`/\`Write\`/\`Edit\` → \`read\`/\`write\`/\`edit\`、\`Glob\`/\`Grep\` → \`glob\`/\`grep\`、\`Bash\` → \`pwsh\`（Windows）/ \`bash\`。技能正文出现的其他平台名（Copilot、Hermes、Gemini、Qoder）可忽略。

**技能类型**

- **刚性技能**（\`test-driven-development\`、\`systematic-debugging\`、\`verification-before-completion\`）：严格遵循，不要变通。
- **灵活技能**（各类模式与规范）：按上下文调整原则。

用户指令说明"做什么"，不意味着跳过上述流程。`

/**
 * Register the Superpower-ZH policy section.
 * @param {object} ctx - the Cordis context this row mounted in.
 */
function apply(ctx) {
  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: POLICY,
  })
  log.log(`[dsh-superpower-zh] registered prompt section ${SECTION_NAME} (order ${SECTION_ORDER})`)
}

/** Cordis plugin identity: a hard dependency on the prompt registry. */
export const name = 'superpower-zh'
export const inject = ['systemPrompt']
export { apply }
export default { name, inject, apply }
