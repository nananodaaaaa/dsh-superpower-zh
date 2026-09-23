# dsh-ppt-plugin

DeepSeek Harness 的 **PPT 插件**：3 个把「图片」和「PPT」互相转换的技能，装完即对所有会话生效，与 [`dsh-superpower-zh`](../dsh-superpower-zh/README.md)、`@nanmicoder/dsh-agent-teams` 并行共存。

## 装了什么

| 行 id | 插件 | 作用 |
| --- | --- | --- |
| `skill-filesystem-ppt-plugin` | `@deepseek-ai/dsh-skill-filesystem` | 第二个技能 provider（`providerName: ppt-plugin`），把本包 `skills/` 注册进全局技能目录 |
| `ppt-plugin` | 本包 `index.js` | 往系统提示注册常驻路由段 `ppt-plugin:policy`（order 710） |

## 3 个技能

| 技能名 | 用途 |
| --- | --- |
| `gorden-image-ppt-gen` | 由主题/内容生成「图片型 PPT」：设计 → imagegen 出图 → 合成每页一张全幅图的 `.pptx` |
| `gorden-image2pptx` | 把 PPT 图片/截图逆向还原成**可编辑 `.pptx`**：背景图 → 骨架图（绿幕抠图）→ 元素图标 → 文本（视觉提取），四层强制 |
| `gorden-super-ppt-skill` | 端到端编排：先跑 `gorden-image-ppt-gen`，再对每页跑 `gorden-image2pptx`，一次交付全部产物 |

每个技能自带 `SKILL.md`、`references/`、`scripts/`（Python：`compose_pptx.py`、`chroma_key.py`、`slice_grid.py`、`layout_guard.py` 等）；`gorden-image-ppt-gen` 还带 5 套风格参考图（`参考图/`，共 38 张 PNG）。

## 名字为什么变了

原技能名是 `GordenImage2PPTX` / `GordenImagePPTGen` / `GordenSuperPPTSkill`。DSH 的技能加载器只接受小写 kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`），大写名会被**静默跳过**——模型侧看不到任何报错，技能直接消失。因此改为：

| 原名 | 现名 |
| --- | --- |
| `GordenSuperPPTSkill` | `gorden-super-ppt-skill` |
| `GordenImage2PPTX` | `gorden-image2pptx` |
| `GordenImagePPTGen` | `gorden-image-ppt-gen` |

`scripts/rename-refs.mjs` 负责把技能正文里的产品名与相对路径引用（`../GordenImagePPTGen/SKILL.md` 等）一起改写，可重跑核对。

## 安装

```powershell
# 从本仓库本地目录安装（把 web 换成你实际用的 profile 名）
dsh plugin --profile web add .\dsh-ppt-plugin

# 或直接从 GitHub 安装
dsh plugin --profile web add github:nananodaaaaa/dsh-superpower-zh#path:/dsh-ppt-plugin
```

装完需要**重启 DSH 进程**才会加载新层。卸载：`dsh plugin --profile web remove dsh-ppt-plugin`。

## 运行前提：必须有图像生成能力

三个技能的核心硬门禁是**图片层必须由图像生成模型产出**：禁止用 Python/PIL、SVG、HTML、Canvas、matplotlib、PPT 原生 shapes、截图渲染替代"出图"，也禁止在已生成图片上用代码补字盖字。技能正文沿用 Codex 描述（`$CODEX_HOME/generated_images/<thread-id>/`、imagegen 工具名）；在本 Harness 中应理解为**调用当前可用的图像生成能力**。

若本 Profile 没挂载任何图像生成工具，常驻规则段要求模型**停下来说明阻塞原因**，而不是用代码绘图凑一份"看起来像"的结果。这一条属于已知缺口：本插件只提供方法论，不提供图像生成工具本身。

## 验证

```powershell
node ..\dsh-superpower-zh\scripts\verify-skills.mjs .      # 3 个技能都能被真实加载器识别
node scripts\rename-refs.mjs .                             # 重跑引用改写并核对 frontmatter name
```

更完整的组合级验证（bundle patch 合法性 + 真启动一次完整组合）见 `dsh-superpower-zh/scripts/`。
