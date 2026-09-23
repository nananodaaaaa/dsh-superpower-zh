# 平台适配：Claude Code 工具名 → DeepSeek Harness 工具名

superpower-zh 的技能正文沿用 Claude Code 的工具名。在本 Harness 中按下表对应，语义一一对应，不需要额外配置。

| 技能正文中的名字 | 本 Harness 的工具 | 说明 |
| --- | --- | --- |
| `Task`（子智能体分派） | `subagent` / `subagent_fork` | `subagent` 起一个全新上下文的子智能体，`subagent_fork` 继承当前对话已完成的轮次；两者默认后台运行，结果通过通知返回 |
| `TodoWrite` | `todo_write` | 每次传入**完整**清单，整体替换上一版 |
| `Read` | `read` | 返回带行号的文本内容 |
| `Write` | `write` | 创建或整体替换文件 |
| `Edit` / `MultiEdit` | `edit`（`replace_all: true` 等价 MultiEdit） | 先读再改；`old_string` 默认必须唯一匹配 |
| `Glob` | `glob` | 按路径模式找文件 |
| `Grep` | `grep` | 正则搜索文件内容 |
| `Bash` | `pwsh`（Windows）/ `bash`（POSIX） | 每次调用是新进程，不保留 cwd 与变量；用 `workdir` 参数而不是 `cd` |
| `WebFetch` / `WebSearch` | `web_fetch` / `web_search` | |
| `Skill`（加载技能） | `skill` | 传技能名，返回 SKILL.md 正文 |
| `TaskOutput` / 查看子智能体 | `send_message`（直接子智能体）/ `job_output`（后台命令） | |
| `ExitPlanMode` | `exit_plan_mode` | 仅在 plan mode 下可用 |
| `AskUserQuestion` | `ask_user_question` | 仅用于用户自己的选择或检视无法回答的歧义 |
| 向用户交付文件 | `present` | 声明最终交付物路径 |

## 与 AgentTeams 的分工

- `dispatching-parallel-agents` 与 `subagent-driven-development` 描述的是**当前会话内**的委派形态：用 `subagent` / `subagent_fork` / `workflow`。
- 一旦用户要求 AgentTeams（多人团队、任务依赖图、审批门禁、成员邮箱），编排权交给 `agent_teams_*` 工具；此时这些技能只提供**质量纪律**（TDD、系统性调试、完成前验证），不再决定"怎么派活"，避免两套编排同时驱动同一批任务。
