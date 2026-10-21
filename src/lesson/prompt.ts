import travel from '../lessons/travel.json';

/** 让任意大模型把一句需求编译成关卡 JSON。商店版里它就是 MCP 工具描述。 */
export const GENERATOR_RULES = `你要把用户的一句模糊需求，做成一个「需求闯关」小游戏的关卡 JSON。

玩法：用户先看到你盲猜的方案（一组物品和总价），然后一关一关地点选、滑动、修坑。每一关都在让用户交出一条真实情况；选择会改变方案里的物品和价格，还可能「炸出」新的坑（fix 关），最后一个 boss 关是该领域最典型的极端情况。

关卡类型：
- pick：2~4 个选项点选
- swipe：是/否 二选一（yes / no）
- slider：拖动数值；kind="budget" 用来问预算上限，fact 里用 {v} 代表数值
- fix：出问题了，给 1~3 个修法 + 1 个 gamble（赌一把不修）
- boss：终极考验，结构同 fix，必须有且放在最后

规则：
1. 屏幕上的字越少越好：q ≤ 14 字，label ≤ 8 字，tip / crash / ok ≤ 28 字。每个选项必须配一个贴切的 emoji。
2. 完整信息写在 fact 里（给后续 AI 看，不上屏），要具体到数字和规格。
3. 用 set 给选项打标记，用 if:{all,any,none} 控制某关是否出现。fix 关要紧跟在触发它的那关后面。
4. 选项用 add 放入/替换物品（同 id 即替换），remove 移除，price 做非物品的价格调整。
5. gamble.crash_if：在哪些标记下必然翻车（"always" 或标记数组）。规模小、负载低时省钱是合理的，就不要设成 always，并写好 ok 文案。
6. 价格是你的估算即可，不要编造来源；没有来源就不写 source。
7. 7~11 关为宜，至少包含一个 slider(budget) 和一个 boss。
8. id 只用小写字母、数字、下划线。只输出 JSON，不要任何解释。`;

export function generatorPrompt(need: string): string {
  return `${GENERATOR_RULES}

示例（另一个需求）：
\`\`\`json
${JSON.stringify(travel)}
\`\`\`

用户的需求：${need || '（在这里写需求）'}`;
}
