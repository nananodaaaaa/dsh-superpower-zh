/**
 * dsh-ppt-plugin host half: the always-on routing policy for the three PPT
 * skills. The skill bodies themselves are contributed by the second
 * `skill-filesystem` row in `cordis.patch.yml`, not from here.
 */

/** Readonly host logger; fell back to the global console outside Cordis. */
const log = typeof console !== 'undefined' ? console : { error() {} }

/**
 * Unique section name, one step after the Superpower-ZH policy (700) and
 * before PTC_ONLY (800): both are procedure policies, and this one is the
 * narrower, more specific rule.
 */
const SECTION_NAME = 'ppt-plugin:policy'
const SECTION_ORDER = 710

const POLICY = `## PPT 技能（ppt-plugin）

本 Profile 另挂了 \`ppt-plugin\`，提供 3 个把「图片」和「PPT」互相转换的技能。完整说明由 \`skill\` 工具按需加载，下面是常驻路由规则。

| 用户意图 | 技能 |
| --- | --- |
| 「做一份 PPT / 生成图片版 PPT / AI 出图幻灯片」 | \`gorden-image-ppt-gen\` |
| 「把这些 PPT 图片/截图转成可编辑 PPTX / 抠图标 / 提取文字」 | \`gorden-image2pptx\` |
| 没点名具体功能，只给主题/内容要一份完整成品；或要「既好看又能编辑」 | \`gorden-super-ppt-skill\`（串联前两个） |

**硬门禁（不可用代码绘图兜底）**

- 这三个技能的图片层**必须由图像生成模型（imagegen）产出**：禁止用 Python/PIL、SVG、HTML、Canvas、matplotlib、PPT 原生 shapes 或截图渲染来替代"出图"，也禁止在已生成的图片上用代码补字、盖章、改字。
- 若 imagegen 不可用，必须停下来说明阻塞原因，不要用代码绘图凑出一份"看起来像"的结果。
- 可编辑 PPTX 必须保持四层结构：背景图 → 骨架图（绿幕抠图）→ 元素图标/装饰 → 文本（视觉提取，写成真文本框）；缺层即视为未完成。
- 交付前的验证遵循 superpower-zh 的 \`verification-before-completion\`：先看产物再声称完成。

**来源说明**

技能正文沿用了 Codex / Claude Code 的运行时描述（\`$CODEX_HOME/generated_images\`、imagegen 工具名等）。在本 Harness 中请把"调用 imagegen"理解为**调用当前可用的图像生成能力**；若本 Profile 没有挂载任何图像生成工具，直接按上一条硬门禁停机说明，不要伪造图片。`

/**
 * Register the PPT policy section.
 * @param {object} ctx - the Cordis context this row mounted in.
 */
function apply(ctx) {
  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: POLICY,
  })
  log.log(`[dsh-ppt-plugin] registered prompt section ${SECTION_NAME} (order ${SECTION_ORDER})`)
}

/** Cordis plugin identity: a hard dependency on the prompt registry. */
export const name = 'ppt-plugin'
export const inject = ['systemPrompt']
export { apply }
export default { name, inject, apply }
