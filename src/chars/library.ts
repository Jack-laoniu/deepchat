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
export type Accessory = 'glasses' | 'squareGlasses' | 'mustache' | 'beard' | 'strawHat' | 'hardHat' | 'cap' | 'headset' | 'earrings' | 'freckles' | 'wrinkles' | 'headscarf';

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
  /** 帽子 / 头巾的颜色 */
  hatColor?: string;
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
 * 角色阵容按美术设定图（docs/art-brief.md 第 2 节；设定图由设计提供）。
 * 外形尽量不带职业标志，名字不带头衔：同一个人在不同需求里可能演医生、房东、销售，
 * 靠「as」给身份，靠性格和长相区分。
 * 代码里的小人是占位，正式素材（Rive / 分层 SVG）到了按 id 替换。
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'xiaofang',
    name: { zh: '小芳', en: 'Fang', ja: 'ファン', es: 'Fang' },
    persona: '向导。元气满满，有点冲动，很会照顾人；永远站在用户这边，会替用户吐槽不靠谱的人。笑点：兴奋过头，什么都想「顺便」再加一项，被人按住才停；爱给小事起响亮的名字（「第一章：识破黄牛」），兴奋了跳起来比耶。',
    roles: '向导、主持人、闺蜜/好朋友（每关都可用）',
    voice: { pitch: 1.25, rate: 1.1, gender: 'f' },
    look: { skin: '#F6CFB0', hair: { style: 'bun', color: '#6B3E26' }, top: '#F27C9A', accent: '#FBD3DE', bottom: '#2D2D3A', outfit: 'hoodie', acc: ['freckles'] },
  },
  {
    id: 'mei',
    name: { zh: '美姐', en: 'Mei', ja: 'メイ', es: 'Mei' },
    persona: '理性又温柔，细心爱操心，说话有点毒舌；精打细算，一针见血地问「值不值」。笑点：随身算账，什么都折算成「这够吃几顿火锅」；推一下眼镜，就是要开始算了。',
    roles: '伴侣、姐姐、家里管钱的人、合伙人',
    voice: { pitch: 1.1, rate: 1.0, gender: 'f' },
    look: { skin: '#F7D2B6', hair: { style: 'long', color: '#3B2A20' }, top: '#B9A2E0', accent: '#E9DDFB', bottom: '#E8DCC4', outfit: 'shirt', acc: ['glasses', 'earrings'] },
  },
  {
    id: 'wang',
    name: { zh: '老王', en: 'Old Wang', ja: '王さん', es: 'Don Wang' },
    persona: '嘴上不饶人，心地善良，关键时刻靠得住；过来人。笑点：每个坑他都踩过，还坚持「我那次更惨」，背着手「啧」一声开讲；嘴硬，被说中了就转移话题。',
    roles: '过来人、老邻居、父亲/长辈、老师傅',
    voice: { pitch: 0.8, rate: 0.95, gender: 'm' },
    look: { skin: '#E2B48C', hair: { style: 'short', color: '#1F1F1F' }, top: '#2E3F5C', accent: '#4A5D80', bottom: '#3D3D3D', outfit: 'shirt', acc: ['wrinkles'] },
  },
  {
    id: 'daliu',
    name: { zh: '大刘', en: 'Big Liu', ja: 'リュウ', es: 'Liu' },
    persona: '热情爱分享，话多，有点小浮夸；能说会道，总想推荐「更好的」、让你加钱升级，但确实懂行。笑点：什么都是「限时」「最后一个」，被戳穿立刻打哈哈、换一个推荐，双手比赞。',
    roles: '销售、中介、热心朋友、推荐达人',
    voice: { pitch: 1, rate: 1.18, gender: 'm' },
    look: { skin: '#EDC29E', hair: { style: 'short', color: '#4A3020' }, top: '#C5D33A', accent: '#E7EE9A', bottom: '#3A4A6B', outfit: 'hoodie', acc: ['cap', 'headset'], hatColor: '#2F6B4F' },
  },
  {
    id: 'xiaoting',
    name: { zh: '小婷', en: 'Ting', ja: 'ティン', es: 'Ting' },
    persona: '温暖治愈，爱生活，喜欢小动物；关心感受和氛围，会问「你开心吗」「这样过日子舒服吗」。笑点：总能在任何计划里找到「可以撸猫、看日落」的那一刻，计划表边上偷偷画小花。',
    roles: '朋友、室友、妹妹、用户的另一半、有经验的同龄人',
    voice: { pitch: 1.3, rate: 1.0, gender: 'f' },
    look: { skin: '#F8D5BC', hair: { style: 'long', color: '#7A4A2A' }, top: '#F28C38', accent: '#FFD2A8', bottom: '#5A6B8C', outfit: 'hoodie', acc: [] },
  },
  {
    id: 'ajie',
    name: { zh: '阿杰', en: 'Jay', ja: 'ジェイ', es: 'Jay' },
    persona: '冷静少言，技术宅，细节控；只讲参数和事实，话很少但句句到点上，点头就是认可。笑点：一本正经地讲冷笑话；迷信看起来很正规的东西（工作证、参数表），生活常识偶尔掉线，被点醒时淡定地说「……数据有误」。',
    roles: '懂技术的朋友、同事、发烧友、工程师',
    voice: { pitch: 0.95, rate: 1.05, gender: 'm' },
    look: { skin: '#EBC09B', hair: { style: 'short', color: '#1A1A1A' }, top: '#2B2B2E', accent: '#45454A', bottom: '#8C7B55', outfit: 'hoodie', acc: ['cap'], hatColor: '#1F1F22' },
  },
  {
    id: 'ayi',
    name: { zh: '阿姨', en: 'Auntie', ja: 'おばさん', es: 'Tía' },
    persona: '热心肠，话不多但很有主意；心疼人，最怕不安全、怕你吃亏，笑眯眯地拿主意。笑点：什么事都先问「吃了没」，口袋里永远掏得出纸巾、零食和创可贴，护短护得理直气壮。',
    roles: '妈妈/长辈、热心邻居、房东、家里的老人',
    voice: { pitch: 1.15, rate: 0.92, gender: 'f' },
    look: { skin: '#F0C9A6', hair: { style: 'bun', color: '#4A3326' }, top: '#5E8A55', accent: '#F4EFE6', bottom: '#4A4A55', outfit: 'cardigan', acc: ['headscarf', 'wrinkles'], hatColor: '#D9824A' },
  },
  {
    id: 'xiaobei',
    name: { zh: '小北', en: 'Bei', ja: 'ベイ', es: 'Bei' },
    persona: '温和理性，喜欢思考，可靠但有点社恐；讲数据和标准，专门提醒风险和隐患。笑点：一紧张就引用数据（「据统计……」），要先喝口咖啡才敢反驳人，但一反驳就特别准。',
    roles: '专家、顾问、医生、律师、老师、工程师',
    voice: { pitch: 0.9, rate: 1, gender: 'm' },
    look: { skin: '#F2C9A0', hair: { style: 'short', color: '#2A2420' }, top: '#C9B08A', accent: '#EFE6D6', bottom: '#2E3440', outfit: 'cardigan', acc: ['glasses'] },
  },
];

/** 玩家本人（小明） */
export const ME: CharacterDef = {
  id: 'me',
  name: { zh: '我', en: 'Me', ja: 'わたし', es: 'Yo' },
  persona: '',
  roles: '',
  voice: { pitch: 1, rate: 1, gender: 'm' },
  look: { skin: '#F1C9A5', hair: { style: 'spiky', color: '#3B2A20' }, top: '#6B7344', accent: '#F4F1EA', bottom: '#2F3540', outfit: 'hoodie', acc: [] },
};

/** 旧角色 id → 新阵容里最接近的人（旧关卡、缓存、模型偶尔还用旧名字） */
export const LEGACY_IDS: Record<string, string> = {
  lele: 'xiaofang',
  qian: 'daliu',
  nana: 'ayi',
  lu: 'wang',
  zack: 'ajie',
  gong: 'xiaobei',
  dou: 'xiaoting',
};

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id) as [string, ...string[]];
export const GUIDE = 'xiaofang';
export const charById = (id: string) => (id === 'me' ? ME : CHARACTERS.find((c) => c.id === (LEGACY_IDS[id] ?? id)));

/** 给大模型的角色清单 */
export const characterCatalog = () =>
  CHARACTERS.map((c) => `- ${c.id}（${c.name.zh} / ${c.name.en}）：${c.persona} 适合：${c.roles}`).join('\n');
