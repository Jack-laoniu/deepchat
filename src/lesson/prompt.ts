import { characterCatalog, GUIDE, LANGS, MOODS } from '../chars/library';
import dog from '../lessons/dog.json';

/** 让任意大模型把一句需求编译成关卡 JSON。商店版里它就是 MCP 工具描述。 */
export const GENERATOR_RULES = `You turn a user's vague one-line need into a JSON level for "Need Quest", a Duolingo-style mini game.

GOAL: never make the user fill a form. Inside the game they naturally reveal their real situation and their real intent:
- a short STORY (several characters bickering, read aloud like a listening story) acts out the pitfalls this need runs into in real life, and pauses to ask "which one are you?";
- a CHAT / roleplay lets the user say, in their own words, their motivation, worries and wishes;
- a MAP lets the user walk around and ask several people, each covering one aspect (seller → the plan, old-timer → pitfalls, family → motivation & budget).
Choices change the plan's items and price and can "blow up" new problems (fix rounds). The last round is the FINALE ("type": "boss"): not a fight, but the deep-talk ending that makes the need fully clear — recap, choose a direction among the approaches the industry really uses, answer sharper follow-up questions, and confirm which materials the user can provide.

LANGUAGE: write ALL text in the user's language. Set "lang" to one of ${LANGS.join(', ')} and "currency" to the ISO code they'd pay in (CNY, USD, JPY, EUR…).

WHAT IS THE "BUDGET"? Decide this FIRST, before writing anything else.
- If the need is mainly about spending money (buying, renting, renovating, travelling…), the budget is money: omit "goal"; prices are in "currency".
- If the need is NOT mainly about money (a sleep schedule, a study plan, getting fit, quitting a habit, organising the family's chores…), money would make every number zero. Instead pick ONE countable resource the user actually has to spend and trade off, and set "goal": {"name","unit","emoji"}, e.g. {"name":"时间","unit":"分钟/天","emoji":"⏱️"}, {"name":"精力","unit":"点","emoji":"⚡"}, {"name":"time","unit":"min/day","emoji":"⏱️"}. Then EVERY "price" (items, option price, the guess) and the budget slider are in that unit: items cost minutes/points, cheaper options save minutes/points, the slider asks how much of it they can really spare. Keep the numbers realistic (e.g. a bedtime routine of 20–60 min/day, energy 0–100). The plan's items are the habits/steps/tools that make up the plan.

CHARACTERS: do NOT invent characters. Pick 2–4 from this fixed library and give each an "as" role for this story (e.g. {"id":"wang","as":"Dad"}). Pick people whose personalities clash.
${characterCatalog()}
Reserved speakers usable without being in cast: "me" (the user), "narrator", "${GUIDE}" (the guide, use for the opening chat).
Each line may have "mood": ${MOODS.join(' | ')} — use them, it makes the characters act.

ROUND TYPES
- talk: style "story" (narrator + characters) or "chat" (with one character, field "with")
- map: a little 3D place the player walks around (like Duolingo Adventures). "scene": street | park | home | shop | office. 2–4 spots (x, y from 0–100; keep y between 20 and 75); each spot has a character ("who"), a chat (beats) and a big "prop" the character stands at: building | counter | car | sofa | bench | kiosk | desk | shelf | table | bed. Give at least one spot a "gift": something that character hands over after the chat that SAVES the user money (or goal units) — a coupon (negative "price"), an insider price (same item id, cheaper "add"), or advice that drops an unnecessary item ("remove"). Shape: an option plus optional "say" (≤ 28, what they say when handing it over) and optional "if" (only given when the user answered something smart, e.g. asked about a hidden fee).
- pick: 2–4 option cards
- swipe: yes / no
- slider: drag a number; kind "budget" asks the budget cap; "{v}" in fact is the value
- fix: a problem appeared; 1–3 fixes + 1 gamble (skip the fix and hope)
- boss (the FINALE, required, must be last): "who" = the most knowledgeable character, "q" = the decision to make (≤ 14). "options" = 2–4 approaches people in this field actually use (e.g. for gout: 急性期先止痛就医 / 长期降尿酸药 / 只靠饮食运动), each with "pros" and "cons" (≤ 16 each), a full "fact", and set a flag. "probe" = 3–6 beats of follow-up chat that dig deeper into the chosen approach (questions with "if" on that flag, with "free" for the user's own words) — ask what an expert would need to know next (numbers, history, constraints, what they already tried). "bring" = 2–5 materials the downstream AI will need before giving a concrete plan (e.g. 最近一次尿酸化验单, 正在吃的药, 车位产权证明), each {id, emoji, label ≤ 10, fact}. No "gamble" in the finale.
- sort: drag 3–8 cards into 2–3 bins (e.g. must / nice / skip). No right answers — it reveals priorities. A card with "item" joins the plan when dropped in a bin with keep:true, and leaves it otherwise. Each drop sets the flag "<card id>_<bin id>".
- place: an illustrated scene ("room" | "yard" | "office" | "street") with 2–4 spots (x 5–95, y 10–80) and 1–4 things; the user drags each thing to where it would go in their life. It reveals space, context and who uses it. A spot can list "bad" things with a short "warn" (it shakes and warns; the user may move it). Each placement sets "<thing id>_<spot id>".
- day: a wordless day (Florence-style) — NOT an ordinary routine day. Pick THE day where this need really hurts or gets tested, the one people complain about (first car → driving home for Spring Festival stuck in a highway jam; new puppy → the first night it cries; renovation → move-in day; study plan → the night before the exam). 3–5 moments ("at": morning | noon | evening | night, plus "time" like "04:30" for the clock), each moment a pain point with a scene emoji and 2–3 options shown as BIG emoji only (label is a tiny caption ≤ 4 CJK / 7 letters) revealing how the user would cope. "scene": daily | road (highway, traffic, service area) | outdoor | home. Pick emojis that are obvious without words.
- chain: 3–6 dilemma cards in a row (Reigns-style). Each card: a character ("who") says one line, the user swipes "left" or "right" (each side is an option with score / price / add / remove / set). Four meters (money, ease, results, safety) move with each choice; the first one to hit zero "crashes" and tells us what the user keeps sacrificing. Make the cards realistic everyday situations a few weeks after the purchase, each side costing something different.

DIALOGUE
- beats = lines {"who","say","mood"} and questions {"id","who","q","options":[...],"free":{...}}.
- options may carry "reply": the characters' immediate reaction (tease, push back, warn).
- "free" lets the user answer in their own words (typing or voice). "{v}" in fact is their words; "match" sets flags by keywords and reacts; "chips" are quick phrases. Use free at least twice: once for the motivation (why), once for the biggest worry or wish.
- Besides pitfalls, characters also share what WORKS: the common or best-practice approaches in this field and who they suit ("most people in your case start with…", "the clinic usually…"). Let the user react to them; this is how they discover what they really want.
- Dialogue is where the user feels cared for and hears REAL experience. Make each talk / map spot feel like a real person talking: 6–12 lines, characters share a concrete personal story with specific numbers and details ("my first winter, range dropped from 500 to 300 km", "I tried waking at 6 for a week and crashed by Thursday"), disagree with each other, then ask. Every talk round asks at least 2 questions; react to answers with "reply".
- any line or question can have "if" to appear depending on earlier answers (e.g. the user said they're rarely home but picked manual control → a character calls it out).

RULES
1. Very little text on screen. Limits are in "width" (a CJK char = 1, a Latin letter ≈ 0.55): round q ≤ 14, card label ≤ 8, dialogue reply label ≤ 14, line say ≤ 40, dialogue question q ≤ 24, tip / crash / ok ≤ 28, fix/boss problem ≤ 12. At most 4 free.chips, 4 options per question. Every chain card MUST have both "left" and "right". Every option needs a fitting emoji.
2. Put the full detail in "fact" (for the downstream AI, never shown): concrete numbers and specs.
3. Use "set" flags on options and "if": {all, any, none} to show rounds conditionally. A fix round must come right after the round that triggers it.
4. Options "add" items to the plan (same id = replace), "remove" items, "price" adjusts non-item cost.
   To make something CHEAPER (downgrade, second-hand, smaller, skip it), the replacement MUST reuse the SAME id as the item it replaces (or put the old id in "remove"); a new id keeps both items and the total goes UP. A cost-cutting option must lower the total; a non-item saving is a negative "price".
5. gamble.crash_if: flags under which it must crash ("always" or a list). When saving money is reasonable for a small scale / light load, don't use "always" and write an "ok" text.
6. Prices are your estimates; never invent sources.
7. "rounds" is a FLAT array of 8–12 separate round objects — never put the whole level inside one talk round (a talk has at most 24 beats; aim for 6–12). 8–12 rounds: open with a chat with "${GUIDE}" asking the motivation, include at least one story, one map, one slider (kind budget, in money or in the goal unit), one sort (what they really need among optional extras), one chain (living with the choice), and a place (when space matters) or a day (the hardest, most telling day of this need), and end with the boss. Max 16 rounds.
8. ids use lowercase letters, digits, underscores only. Output JSON only, no explanation.
9. Never put a raw double quote (") inside a string value. To quote speech inside text use 「」 (Chinese) or ‘ ’ (English).
10. No repeats: every sort card, chain card, pick option and question covers something NEW. Do not ask the same thing twice in different rounds or wordings (e.g. two chain cards both about 'waiting for a discount'), and do not put a card in sort that a chain card already decided.`;

export function generatorPrompt(need: string, lang: 'zh' | 'en' = 'zh'): string {
  return `${GENERATOR_RULES}

Example (a different need):
\`\`\`json
${JSON.stringify(dog)}
\`\`\`

Write ALL text in ${lang === 'zh' ? 'Simplified Chinese (lang "zh")' : 'English (lang "en")'}.

The user's need: ${need || '(write the need here)'}`;
}
