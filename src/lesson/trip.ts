import type { Item, TripRound } from './schema';

/**
 * 文牒登记的回答：哪天到（start = YYYY-MM-DD；还没定就只给 month），住几晚，几个大人几个孩子，几间房。
 * 这几样是订酒店、订票、找导游时的检索条件，所以单独结构化保存，不只是一句 fact。
 */
export type Trip = { start?: string; month?: number; nights: number; adults: number; kids: number; rooms: number };

const pad = (n: number) => String(n).padStart(2, '0');

/** 离店日期（入住日期 + 晚数）；日期没定返回 undefined */
export function checkout(t: Trip): string | undefined {
  if (!t.start) return undefined;
  const d = new Date(`${t.start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + t.nights);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 这趟旅行占了哪些「月-日」（只知道月份就取那个月的 15 号） */
function days(t: Trip): string[] {
  if (t.start) {
    const d = new Date(`${t.start}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()))
      return Array.from({ length: Math.max(1, t.nights) }, (_, i) => {
        const x = new Date(d);
        x.setUTCDate(d.getUTCDate() + i);
        return `${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
      });
  }
  return t.month ? [`${pad(t.month)}-15`] : [];
}

const inRange = (md: string, from: string, to: string) => (from <= to ? md >= from && md <= to : md >= from || md <= to);

/** 按日期、人数、天数自动打的标记 */
export function tripFlags(r: TripRound, t: Trip): string[] {
  const out = new Set<string>();
  if (t.kids > 0) out.add('kids');
  if (t.adults === 1 && t.kids === 0) out.add('solo');
  if (t.adults + t.kids >= 5) out.add('group');
  if (t.nights <= 2) out.add('short');
  if (t.nights >= 4) out.add('long');
  if (t.nights >= 10) out.add('stay');
  const ds = days(t);
  for (const s of r.seasons) if (ds.some((d) => inRange(d, s.from, s.to))) out.add(s.set);
  return [...out];
}

/** 跟着天数 / 人数走的那几样：按登记的数重新算价，名字里的 {n} 换成数 */
export function scaled(r: TripRound, t: Trip, cart: Map<string, Item>): Item[] {
  return r.scale.flatMap((s) => {
    const old = cart.get(s.item);
    if (!old) return [];
    const people = t.adults + t.kids;
    const [n, shown] = s.per === 'room_night' ? [t.nights * t.rooms, t.nights] : s.per === 'person_day' ? [people * (t.nights + 1), t.nights + 1] : [people, people];
    return [{ ...old, price: Math.round(s.price * n), name: s.name ? s.name.replace('{n}', String(shown)) : old.name }];
  });
}

const T = {
  zh: {
    when: (t: Trip) => (t.start ? `${t.start} 到 ${checkout(t)}` : t.month ? `${t.month} 月，具体日期未定` : '日期未定'),
    fact: (t: Trip, when: string) => `出行：${when}（住 ${t.nights} 晚）；${t.adults} 个大人${t.kids ? `、${t.kids} 个孩子` : ''}；${t.rooms} 间房`,
    dates: (t: Trip) => (t.start ? `${Number(t.start.slice(5, 7))}月${Number(t.start.slice(8, 10))}日到` : t.month ? `${t.month} 月` : '未定'),
    nights: (t: Trip) => `${t.nights} 晚`,
    party: (t: Trip) => `${t.adults} 大${t.kids ? ` ${t.kids} 小` : ''}`,
    q: { dates: '哪天到？', nights: '住几晚？', party: '几个人？' },
  },
  en: {
    when: (t: Trip) => (t.start ? `${t.start} to ${checkout(t)}` : t.month ? `month ${t.month}, exact dates open` : 'dates open'),
    fact: (t: Trip, when: string) => `Trip: ${when} (${t.nights} nights); ${t.adults} adult${t.adults > 1 ? 's' : ''}${t.kids ? `, ${t.kids} kid${t.kids > 1 ? 's' : ''}` : ''}; ${t.rooms} room${t.rooms > 1 ? 's' : ''}`,
    dates: (t: Trip) => (t.start ? `from ${t.start.slice(5)}` : t.month ? ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.month] : 'open'),
    nights: (t: Trip) => `${t.nights} nights`,
    party: (t: Trip) => `${t.adults} adult${t.adults > 1 ? 's' : ''}${t.kids ? ` + ${t.kids} kid${t.kids > 1 ? 's' : ''}` : ''}`,
    q: { dates: 'Arriving when?', nights: 'How many nights?', party: 'Who’s coming?' },
  },
};

/** 给下游 AI / 导游的那句事实 */
export const tripFact = (t: Trip, lang: string) => {
  const L = T[lang === 'zh' ? 'zh' : 'en'];
  return L.fact(t, L.when(t));
};

/** 拆成三个可以比较的选择（日期、晚数、人数），同行的人逐条对比 */
export function tripPicks(id: string, t: Trip, lang: string) {
  const L = T[lang === 'zh' ? 'zh' : 'en'];
  return [
    { key: `${id}.dates`, q: L.q.dates, label: L.dates(t), emoji: '📅' },
    { key: `${id}.nights`, q: L.q.nights, label: L.nights(t), emoji: '🛏️' },
    { key: `${id}.party`, q: L.q.party, label: L.party(t), emoji: '👥' },
  ];
}
