/**
 * 固定角色库。每个角色有固定的长相、性格和声音，所有关卡复用；
 * 大模型生成关卡时只挑角色、给他安排一个身份（as），不重新设计人物。
 */

export const LANGS = ['zh', 'en', 'ja', 'es'] as const;
export const MOODS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'worried', 'smug', 'thinking'] as const;
export type Mood = (typeof MOODS)[number];
export type Lang = (typeof LANGS)[number];
type L10n = Record<Lang, string>;

export type HairStyle = 'short' | 'curly' | 'bun' | 'long' | 'bald' | 'spiky' | 'slick' | 'bob';
export type Outfit = 'tee' | 'hoodie' | 'shirt' | 'plaid' | 'suit' | 'cardigan' | 'vest';
export type Accessory = 'glasses' | 'squareGlasses' | 'mustache' | 'beard' | 'strawHat' | 'hardHat' | 'cap' | 'headset' | 'earrings' | 'freckles' | 'wrinkles';

export interface Look {
  skin: string;
  hair: { style: HairStyle; color: string };
  top: string;
  /** 外套/马甲/领带等的第二颜色 */
  accent: string;
  bottom: string;
  outfit: Outfit;
  acc: Accessory[];
  /** 身高比例，小孩更矮 */
  scale?: number;
}

export interface CharacterDef {
  id: string;
  name: L10n;
  /** 给大模型看的性格与适合的身份 */
  persona: string;
  roles: string;
  voice: { pitch: number; rate: number; gender: 'f' | 'm' };
  look: Look;
}

/**
 * 角色外形不带职业标志（安全帽、草帽、耳麦、反光背心…），名字也不带头衔：
 * 同一个人在不同需求里可能演医生、房东、销售，靠「as」给身份，靠性格和长相区分。
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'lele',
    name: { zh: '乐乐', en: 'Lele', ja: 'レレ', es: 'Lele' },
    persona: '向导。热情话多，爱打比方，永远站在用户这边，会替用户吐槽不靠谱的人。',
    roles: '向导、主持人（每关都可用）',
    voice: { pitch: 1.25, rate: 1.1, gender: 'f' },
    look: { skin: '#F5C7A1', hair: { style: 'curly', color: '#5B3A29' }, top: '#FF8A3D', accent: '#FFD7B5', bottom: '#3B4A6B', outfit: 'hoodie', acc: ['freckles'] },
  },
  {
    id: 'wang',
    name: { zh: '老王', en: 'Old Wang', ja: '王さん', es: 'Don Wang' },
    persona: '过来人。干了二十年，嘴硬心软，爱讲自己踩过的坑，看不惯花冤枉钱。',
    roles: '过来人、老师傅、邻居、父亲',
    voice: { pitch: 0.8, rate: 0.95, gender: 'm' },
    look: { skin: '#D9A066', hair: { style: 'bald', color: '#8A8A8A' }, top: '#4C8C4A', accent: '#2F5E2E', bottom: '#6B5B45', outfit: 'plaid', acc: ['cap', 'mustache', 'wrinkles'] },
  },
  {
    id: 'qian',
    name: { zh: '钱哥', en: 'Qian', ja: '銭さん', es: 'Qian' },
    persona: '能说会道、八面玲珑，总想让你加钱升级，但确实懂行；被戳穿时会打哈哈。',
    roles: '商家、销售、中介、装修公司',
    voice: { pitch: 1, rate: 1.18, gender: 'm' },
    look: { skin: '#F2C9A0', hair: { style: 'slick', color: '#1F1F1F' }, top: '#2F3E66', accent: '#D7263D', bottom: '#2F3E66', outfit: 'suit', acc: [] },
  },
  {
    id: 'mei',
    name: { zh: '美姐', en: 'Mei', ja: 'メイ', es: 'Mei' },
    persona: '精打细算，说话直接，一针见血地问「值不值」「真的需要吗」。',
    roles: '伴侣、家人、合伙人、财务',
    voice: { pitch: 1.35, rate: 1.08, gender: 'f' },
    look: { skin: '#F7D2B6', hair: { style: 'bun', color: '#2B1B17' }, top: '#8E5CC9', accent: '#E9D8FD', bottom: '#3F3D56', outfit: 'cardigan', acc: ['glasses', 'earrings'] },
  },
  {
    id: 'zack',
    name: { zh: '阿哲', en: 'Zack', ja: 'ザック', es: 'Zack' },
    persona: '发烧友性格。爱抠参数和细节，看不惯奸商，说话快、爱用术语。',
    roles: '懂技术的朋友、发烧友、程序员',
    voice: { pitch: 1.15, rate: 1.2, gender: 'm' },
    look: { skin: '#EBC09B', hair: { style: 'spiky', color: '#22223B' }, top: '#2EC4B6', accent: '#0B7A70', bottom: '#30343F', outfit: 'hoodie', acc: ['squareGlasses'] },
  },
  {
    id: 'nana',
    name: { zh: '奶奶', en: 'Nana', ja: 'ナナばあちゃん', es: 'Abuela Nana' },
    persona: '长辈。心疼人、最怕不安全，总担心你累着、被骗，爱念叨。',
    roles: '长辈、母亲、奶奶、房东阿姨',
    voice: { pitch: 1.4, rate: 0.9, gender: 'f' },
    look: { skin: '#F3CFB0', hair: { style: 'bun', color: '#E6E6E6' }, top: '#E07A5F', accent: '#F4C7B8', bottom: '#5C4D7D', outfit: 'cardigan', acc: ['glasses', 'wrinkles'] },
  },
  {
    id: 'lu',
    name: { zh: '陆爷爷', en: 'Grandpa Lu', ja: '陸じいちゃん', es: 'Abuelo Lu' },
    persona: '老人家。倔、爱面子，心里藏着一个想圆的心愿，嘴上说「不用花钱」。',
    roles: '长辈、父亲、爷爷',
    voice: { pitch: 0.7, rate: 0.88, gender: 'm' },
    look: { skin: '#E2B48C', hair: { style: 'short', color: '#D9D9D9' }, top: '#5B7DB1', accent: '#3A5A8C', bottom: '#4A4A4A', outfit: 'shirt', acc: ['mustache', 'wrinkles'] },
  },
  {
    id: 'gong',
    name: { zh: '老龚', en: 'Gong', ja: 'ゴンさん', es: 'Gong' },
    persona: '冷静严谨，讲数据和标准，专门提醒风险和隐患。',
    roles: '工程师、专家、医生、律师、老师',
    voice: { pitch: 0.9, rate: 1, gender: 'm' },
    look: { skin: '#B97A4F', hair: { style: 'short', color: '#1A1A1A' }, top: '#3D5A80', accent: '#9FB4D3', bottom: '#293241', outfit: 'shirt', acc: ['beard', 'glasses'] },
  },
  {
    id: 'dou',
    name: { zh: '豆豆', en: 'Dou', ja: 'ドウ', es: 'Dou' },
    persona: '小孩。童言无忌，总问最直白、大人不好意思问的问题。',
    roles: '孩子、弟弟妹妹、学生',
    voice: { pitch: 1.6, rate: 1.15, gender: 'f' },
    look: { skin: '#FAD7BD', hair: { style: 'bob', color: '#6B3E26' }, top: '#4CC9F0', accent: '#FFFFFF', bottom: '#F72585', outfit: 'tee', acc: [], scale: 0.8 },
  },
];

/** 玩家本人 */
export const ME: CharacterDef = {
  id: 'me',
  name: { zh: '我', en: 'Me', ja: 'わたし', es: 'Yo' },
  persona: '',
  roles: '',
  voice: { pitch: 1, rate: 1, gender: 'f' },
  look: { skin: '#F1C9A5', hair: { style: 'short', color: '#3B2A20' }, top: '#22C55E', accent: '#15803D', bottom: '#334155', outfit: 'tee', acc: [] },
};

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id) as [string, ...string[]];
export const GUIDE = 'lele';
export const charById = (id: string) => (id === 'me' ? ME : CHARACTERS.find((c) => c.id === id));

/** 给大模型的角色清单 */
export const characterCatalog = () =>
  CHARACTERS.map((c) => `- ${c.id}（${c.name.zh} / ${c.name.en}）：${c.persona} 适合：${c.roles}`).join('\n');
