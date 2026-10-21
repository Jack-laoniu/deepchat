import { characterCatalog, GUIDE, LANGS, MOODS } from '../chars/library';
import dog from '../lessons/dog.json';

/** 让任意大模型把一句需求编译成关卡 JSON。商店版里它就是 MCP 工具描述。 */
export const GENERATOR_RULES = `You turn a user's vague one-line need into a JSON level for "Need Quest", a Duolingo-style mini game.

GOAL: never make the user fill a form. Inside the game they naturally reveal their real situation and their real intent:
- a short STORY (several characters bickering, read aloud like a listening story) acts out the pitfalls this need runs into in real life, and pauses to ask "which one are you?";
- a CHAT / roleplay lets the user say, in their own words, their motivation, worries and wishes;
- a MAP lets the user walk around and ask several people, each covering one aspect (seller → the plan, old-timer → pitfalls, family → motivation & budget).
Choices change the plan's items and price and can "blow up" new problems (fix rounds). The last round is a boss: the most typical extreme situation in this field.

LANGUAGE: write ALL text in the user's language. Set "lang" to one of ${LANGS.join(', ')} and "currency" to the ISO code they'd pay in (CNY, USD, JPY, EUR…).

CHARACTERS: do NOT invent characters. Pick 2–4 from this fixed library and give each an "as" role for this story (e.g. {"id":"wang","as":"Dad"}). Pick people whose personalities clash.
${characterCatalog()}
Reserved speakers usable without being in cast: "me" (the user), "narrator", "${GUIDE}" (the guide, use for the opening chat).
Each line may have "mood": ${MOODS.join(' | ')} — use them, it makes the characters act.

ROUND TYPES
- talk: style "story" (narrator + characters) or "chat" (with one character, field "with")
- map: 2–4 spots (x, y from 0–100; keep y between 20 and 75), each spot has a character ("who") and a chat (beats)
- pick: 2–4 option cards
- swipe: yes / no
- slider: drag a number; kind "budget" asks the budget cap; "{v}" in fact is the value
- fix: a problem appeared; 1–3 fixes + 1 gamble (skip the fix and hope)
- boss: final test, same shape as fix, required, must be last

DIALOGUE
- beats = lines {"who","say","mood"} and questions {"id","who","q","options":[...],"free":{...}}.
- options may carry "reply": the characters' immediate reaction (tease, push back, warn).
- "free" lets the user answer in their own words (typing or voice). "{v}" in fact is their words; "match" sets flags by keywords and reacts; "chips" are quick phrases. Use free at least twice: once for the motivation (why), once for the biggest worry or wish.
- any line or question can have "if" to appear depending on earlier answers (e.g. the user said they're rarely home but picked manual control → a character calls it out).

RULES
1. Very little text on screen. Limits are in "width" (a CJK char = 1, a Latin letter ≈ 0.55): round q ≤ 14, card label ≤ 8, dialogue reply label ≤ 14, line say ≤ 40, dialogue question q ≤ 24, tip / crash / ok ≤ 28. Every option needs a fitting emoji.
2. Put the full detail in "fact" (for the downstream AI, never shown): concrete numbers and specs.
3. Use "set" flags on options and "if": {all, any, none} to show rounds conditionally. A fix round must come right after the round that triggers it.
4. Options "add" items to the plan (same id = replace), "remove" items, "price" adjusts non-item cost.
5. gamble.crash_if: flags under which it must crash ("always" or a list). When saving money is reasonable for a small scale / light load, don't use "always" and write an "ok" text.
6. Prices are your estimates; never invent sources.
7. 8–12 rounds: open with a chat with "${GUIDE}" asking the motivation, include at least one story, one map, one slider(budget), and end with the boss.
8. ids use lowercase letters, digits, underscores only. Output JSON only, no explanation.`;

export function generatorPrompt(need: string): string {
  return `${GENERATOR_RULES}

Example (a different need):
\`\`\`json
${JSON.stringify(dog)}
\`\`\`

The user's need: ${need || '(write the need here)'}`;
}
