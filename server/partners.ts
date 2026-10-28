import { appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from './config';
import { CITY_NAMES } from '../src/travel/cities';

/**
 * 结算页的「让它成真」：预订入口（联盟链接）和「联系本地导游」。
 * 链接模板在配置文件 partners 里（{city} 换成城市英文名），填上自己的联盟链接就开始计佣；
 * 没填时英文用户给几个普通的搜索链接，中文用户不给（国内用户有自己常用的平台）。
 */

export type PartnerLink = { id: string; emoji: string; url: string };

const DEFAULTS: Record<string, { emoji: string; url: string }> = {
  hotels: { emoji: '🏨', url: 'https://www.booking.com/searchresults.html?ss={city}&checkin={checkin}&checkout={checkout}&group_adults={adults}&group_children={children}&no_rooms={rooms}' },
  tours: { emoji: '🎟️', url: 'https://www.getyourguide.com/s/?q={city}&date_from={checkin}&date_to={checkout}' },
  esim: { emoji: '📶', url: 'https://www.airalo.com/china-esim' },
};

/** 文牒登记的硬条件：入住 / 离店日期、大人、孩子、房间（链接里预先填好，用户不用再选一遍） */
export type TripQuery = { checkin?: string; checkout?: string; adults?: number; children?: number; rooms?: number };

/**
 * 把模板里的 {占位符} 换掉。没有值的占位符：整个 &参数=… 去掉（比如日期没定就不带日期），不留空参数。
 * 占位符：{city} {checkin} {checkout} {adults} {children} {rooms}
 */
export function fillLink(tpl: string, city: string, trip: TripQuery = {}): string {
  const v: Record<string, string> = { city, checkin: trip.checkin ?? '', checkout: trip.checkout ?? '', adults: trip.adults ? String(trip.adults) : '', children: trip.children !== undefined ? String(trip.children) : '', rooms: trip.rooms ? String(trip.rooms) : '' };
  return tpl
    .replace(/[?&][\w-]+=\{(\w+)\}/g, (m, k: string) => (k in v && !v[k] ? '' : m))
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? encodeURIComponent(v[k]) : m))
    .replace(/^([^?]*)&/, '$1?');
}

export function partnerLinks(config: Config, city: string, lang: 'zh' | 'en', trip: TripQuery = {}): PartnerLink[] {
  const name = CITY_NAMES[city];
  if (!name) return [];
  const conf = config.partners ?? {};
  return Object.entries(DEFAULTS).flatMap(([id, d]) => {
    const tpl = conf[id as keyof typeof conf] || (lang === 'en' ? d.url : '');
    return tpl ? [{ id, emoji: d.emoji, url: fillLink(tpl, name.en, trip) }] : [];
  });
}

/** trip：文牒登记的硬条件（日期、晚数、人数、房间），导游按它排期报价 */
export type Lead = { city: string; lang: string; name: string; contact: string; note: string; plan: string; trip?: unknown };

/** 用户同意后，把需求单和联系方式存下来（一行一条），之后转给他选的本地导游 */
export function saveLead(l: Lead): string | null {
  const dir = process.env.STATE_DIRECTORY || process.env.NEED_QUEST_DATA || join(tmpdir(), 'need-quest');
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'leads.jsonl');
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...l }) + '\n', { mode: 0o600 });
    return file;
  } catch {
    return null;
  }
}
