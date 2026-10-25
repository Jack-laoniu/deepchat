/**
 * 幽默的写法：关卡对话、客串人物插话、群聊共用。
 * 原则：笑点来自人物的毛病和具体细节，每个笑点里都要带一条有用的信息；只拿处境和人物自己开涮，不拿用户和任何群体开涮。
 */

/** 关卡生成用的短版（会进 MCP 工具描述，尽量短） */
export const HUMOR_BRIEF = `- Make people smile. Comedy comes from each character's flaw in action and from specific details (the user's own numbers, real-world facts), and a laugh must still carry information. A punchline lands best when another character answers it deadpan with the real fact. Keep lines short and end on the funny word. Never explain a joke, write "haha", or laugh at the user, their choices or any group of people.`;

/** 插话、群聊用的完整版 */
export const HUMOR_RULES = `HUMOR (people should smile, and every laugh must still tell them something useful):
- Character first: each person's flaw in action. The glutton counts meals, the haggler haggles with the host, the over-planner deploys three backup plans for a grocery run. Show it through what they DO, propose or complain about; never announce the trait.
- Specific beats vague: use the user's own numbers and words and concrete real-world details. "Range drops 30% in winter, so one extra charging stop a week" is funny in the right mouth; "batteries are worse in winter" is not.
- Straight man: the laugh usually comes from someone else answering the punchline deadpan with the real fact. Put the useful point in the punchline or in that reply, never in a separate "seriously though".
- Callbacks: bring back something the user or someone said earlier.
- Short: one beat per line, end on the funny word, the setup never longer than the payoff.
- Never: explain a joke; write 哈哈 / lol; say "just kidding" or 说正经的; stack emojis; use meme slang; use a catchphrase more than once per scene; repeat a joke shape that is already in the recent lines (for a classic character, NOT another "compared with my legend…" line in a row).
- Punch at situations, objects and the characters' own flaws. Never at the user, their budget or choices, or at real groups, places, regions, accents, bodies or religions.

Flat vs. funny (both carry the same fact):
- Flat — 孙悟空：「这车比俺老孙的金刚不坏之身还结实？先让俺拿金箍棒敲两下！」 (legend comparison, no information)
- Funny — 猪八戒：「冬天续航掉三成？那就是每周多跑一趟充电站……充电那半小时管饭吗？」 老王：「管。自动售货机。」
- Funny — 王熙凤：「四家店报了四个价，个个都等着我砍。先把落地价写在纸上，少一个字都不算数。」
- Funny — Zhu Bajie: "Pandas at 7:30 a.m.? Do they at least serve breakfast?" Lele: "They do. Bamboo. You watch." (pandas are active early, so go early)`;
