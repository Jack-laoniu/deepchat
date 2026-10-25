import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Character, type Mood } from '../chars/Character';
import { charById, GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { canListen, hush, listen, prefetchSpeech, speak, speakNow } from '../fx/voice';
import { useGame } from '../game';
import { getLang, t } from '../i18n';
import { matchFree, walkBeats, type Replies } from '../lesson/engine';
import { requestReact, useCanGenerate } from '../api';
import { inHost } from '../host';
import type { AskBeat, Beat, Line, TalkRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

// ---------------- 角色 ----------------

const COLORS = ['text-sky-600', 'text-purple-600', 'text-orange-600', 'text-pink-600', 'text-teal-600', 'text-indigo-600'];

export interface Who {
  id: string;
  name: string;
  /** 在这个故事里的身份 */
  as?: string;
  color: string;
  pitch: number;
  rate: number;
  gender: 'f' | 'm';
}

/** speaker id → 显示名、颜色、声音。名字跟随界面语言 */
export function useCast() {
  const cast = useGame().lesson!.cast;
  return useMemo(() => {
    const lang = getLang();
    return (id: string): Who => {
      const def = charById(id);
      const i = cast.findIndex((c) => c.id === id);
      const as = cast[i]?.as;
      return {
        id,
        name: def ? def.name[lang] : '',
        as,
        color: id === 'me' ? 'text-green-600' : id === GUIDE ? 'text-orange-500' : COLORS[Math.max(0, i) % COLORS.length],
        pitch: def?.voice.pitch ?? 1,
        rate: def?.voice.rate ?? 1,
        gender: def?.voice.gender ?? 'f',
      };
    };
  }, [cast]);
}

const label = (w: Who) => (w.as ? `${w.as} · ${w.name}` : w.name);

// ---------------- 对话脚本 → 逐条显示的时间线 ----------------

type Item = { key: string; kind: 'line'; who: string; say: string; mood?: Mood } | { key: string; kind: 'ask'; beat: AskBeat };

function transcript(beats: Beat[], replies: Replies, baseFlags: Set<string>): Item[] {
  const out: Item[] = [];
  const { visible } = walkBeats(beats, replies, baseFlags);
  const push = (key: string, l: Line) => out.push({ key, kind: 'line', who: l.who, say: l.say, mood: l.mood });
  visible.forEach((b, i) => {
    if (b.type === 'line') return push(`l${i}`, b);
    out.push({ key: `a${b.id}`, kind: 'ask', beat: b });
    const r = replies[b.id];
    if (!r) return;
    if ('option' in r) {
      const o = b.options.find((x) => x.id === r.option);
      if (!o) return;
      push(`m${b.id}`, { who: 'me', say: `${o.emoji} ${o.label}` });
      o.reply.forEach((l, j) => push(`r${b.id}${j}`, { ...l, mood: l.mood ?? o.mood }));
    } else {
      push(`m${b.id}`, { who: 'me', say: r.text });
      if (r.react) return push(`r${b.id}0`, { who: b.who, say: r.react.say, mood: r.react.mood });
      const hits = b.free ? matchFree(b.free, r.text) : [];
      const reacts = hits.flatMap((m) => m.reply);
      (reacts.length ? reacts : b.free?.reply ?? []).forEach((l, j) => push(`r${b.id}${j}`, l));
    }
  });
  return out;
}

/** 这段对话里出场的角色（不含用户和旁白），按出场顺序 */
function speakersOf(beats: Beat[]): string[] {
  const ids: string[] = [];
  const add = (w: string) => w !== 'me' && w !== 'narrator' && !ids.includes(w) && ids.push(w);
  for (const b of beats) {
    add(b.who);
    if (b.type === 'ask') b.options.forEach((o) => o.reply.forEach((l) => add(l.who)));
  }
  return ids;
}

// ---------------- 舞台：角色站成一排，说话的人动起来 ----------------

function Stage({ ids, speaker, mood, talking }: { ids: string[]; speaker: string | null; mood: Mood; talking: boolean }) {
  const who = useCast();
  const idx = speaker ? ids.indexOf(speaker) : -1;
  return (
    <div className="relative mb-2 h-[150px] shrink-0 overflow-hidden rounded-3xl bg-gradient-to-b from-sky-100 to-amber-50">
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-lime-200 to-lime-300" />
      <div className="absolute inset-x-0 bottom-3 flex items-end justify-center gap-1">
        {ids.map((id, i) => {
          const active = id === speaker;
          return (
            <motion.div
              key={id}
              className="flex flex-col items-center"
              animate={{ scale: active ? 1.08 : 0.94, y: active ? -2 : 0, opacity: speaker && !active ? 0.85 : 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <Character
                id={id}
                size={ids.length > 3 ? 62 : 76}
                mood={active ? mood : 'neutral'}
                talking={active && talking}
                facing={idx >= 0 && i > idx ? 'left' : 'right'}
                gaze={idx < 0 || active ? 0 : i < idx ? 1 : -1}
              />
              <span className={`-mt-1 rounded-full bg-white/90 px-1.5 text-[10px] font-black ${who(id).color}`}>{who(id).as ?? who(id).name}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- 对话播放器 ----------------

export function Dialogue({
  beats,
  style,
  partner,
  baseFlags,
  onDone,
}: {
  beats: Beat[];
  style: 'story' | 'chat';
  partner?: string;
  baseFlags: Set<string>;
  onDone: (r: Replies) => void;
}) {
  const who = useCast();
  const [replies, setReplies] = useState<Replies>({});
  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);
  const [talking, setTalking] = useState(false);
  const items = useMemo(() => transcript(beats, replies, baseFlags), [beats, replies, baseFlags]);
  const speakers = useMemo(() => speakersOf(beats), [beats]);
  const scroller = useRef<HTMLDivElement>(null);
  const last = items[Math.min(shown, items.length) - 1];
  const waitingAsk = last?.kind === 'ask' && !replies[last.beat.id] ? last.beat : null;
  const finished = shown >= items.length && !waitingAsk;
  const lastSpeaker = last ? (last.kind === 'line' ? last.who : last.beat.who) : null;
  const npcSpeaker = lastSpeaker && lastSpeaker !== 'me' && lastSpeaker !== 'narrator' ? lastSpeaker : null;
  const mood: Mood = last?.kind === 'line' && last.mood ? last.mood : waitingAsk ? 'thinking' : 'neutral';

  // 新台词：朗读，嘴巴跟着动，滚动到底。
  // 同一句只念一次：念到最后一句后 shown 还会再加（点「继续」/答题），但最后一句没变，不能再念一遍
  const spoken = useRef<string | null>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    if (last && spoken.current === last.key) return;
    spoken.current = last?.key ?? null;
    // 往下走了（点「继续」/答题）：上一句没念完也不念了，不排队，直接念眼前这句
    hush();
    if (!last || !npcSpeaker) {
      setTalking(false); // 轮到「我」或旁白：上一句的嘴型别卡住（聊天模式要等它结束才出下一句）
      return;
    }
    const text = last.kind === 'line' ? last.say : last.beat.q;
    const c = who(npcSpeaker);
    // 服务器朗读时，提前把下一句的语音要来，免得等
    const upcoming = items[shown];
    if (upcoming && !(upcoming.kind === 'line' && (upcoming.who === 'me' || upcoming.who === 'narrator'))) {
      const n = who(upcoming.kind === 'line' ? upcoming.who : upcoming.beat.who);
      prefetchSpeech(upcoming.kind === 'line' ? upcoming.say : upcoming.beat.q, { rate: n.rate, gender: n.gender });
    }
    setTalking(true);
    let alive = true;
    // 嘴型至少动这么久（中文一个字约 110ms，英文一个字母约 50ms）；真正念完以朗读结束为准
    const minTalk = new Promise((r) => setTimeout(r, 400 + [...text].length * (getLang() === 'zh' || getLang() === 'ja' ? 110 : 50)));
    void Promise.all([speak(text, { pitch: c.pitch, rate: c.rate, gender: c.gender }), minTalk]).then(() => alive && setTalking(false));
    return () => {
      alive = false;
    };
  }, [shown, last?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => hush, []);

  // 聊天模式自动往下走，带「正在输入」；等上一句念完再出下一句，免得语音被打断
  useEffect(() => {
    if (style !== 'chat' || waitingAsk || talking || shown >= items.length) return;
    const next = items[shown];
    const isMe = next.kind === 'line' && next.who === 'me';
    setTyping(!isMe);
    const len = next.kind === 'line' ? next.say.length : next.beat.q.length;
    const timer = setTimeout(() => {
      setTyping(false);
      sfx.tap();
      setShown((n) => n + 1);
    }, isMe ? 250 : 500 + len * 45);
    return () => clearTimeout(timer);
  }, [style, shown, items, waitingAsk, talking]);

  // 网页版服务器有 key 时，用户自己打的字由提问的角色现场回应；否则用关卡里预设的台词
  const g = useGame();
  const cfg = useCanGenerate();
  const live = !!cfg?.generate && !inHost();
  const [pending, setPending] = useState<string | null>(null);

  const answer = async (beat: AskBeat, r: Replies[string]) => {
    sfx.good();
    if ('text' in r && live) {
      setPending(r.text);
      const c = who(beat.who);
      const react = await requestReact({
        need: g.lesson?.need ?? '',
        who: beat.who,
        as: c.as,
        q: beat.q,
        options: beat.options.map((o) => o.label),
        text: r.text,
        recent: items
          .slice(Math.max(0, shown - 6), shown)
          .map((it) => (it.kind === 'ask' ? `${who(it.beat.who).name}: ${it.beat.q}` : `${it.who === 'me' ? 'Player' : who(it.who).name || 'Narrator'}: ${it.say}`)),
      });
      setPending(null);
      if (react) r = { ...r, react: { say: react.say, mood: react.mood as Line['mood'] } };
    }
    setReplies((x) => ({ ...x, [beat.id]: r }));
    setShown((n) => n + 1);
  };

  const visible = items.slice(0, shown);
  const p = partner ? who(partner) : null;

  return (
    <div className="flex h-full flex-col">
      {style === 'story' && speakers.length > 0 && <Stage ids={speakers} speaker={npcSpeaker} mood={mood} talking={talking} />}
      {style === 'chat' && p && (
        <div className="relative mb-2 flex h-[132px] shrink-0 items-end gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-100 via-sky-50 to-emerald-50 px-3">
          <Character id={p.id} size={96} bust mood={typing ? 'thinking' : npcSpeaker === p.id ? mood : 'neutral'} talking={npcSpeaker === p.id && talking} />
          <div className="mb-4">
            <div className="text-lg font-black text-slate-700">{label(p)}</div>
            <div className="text-xs font-bold text-green-500">● {typing ? t('typing') : t('online')}</div>
          </div>
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2 pr-1">
        <AnimatePresence initial={false}>
          {visible.map((it, i) =>
            it.kind === 'ask' ? (
              <Bubble key={it.key} who={who(it.beat.who)} text={it.beat.q} ask current={i === visible.length - 1} chat={style === 'chat'} />
            ) : it.who === 'narrator' ? (
              <motion.div key={it.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-6 text-center text-sm font-bold italic text-slate-400">
                {it.say}
              </motion.div>
            ) : (
              <Bubble key={it.key} who={who(it.who)} text={it.say} mine={it.who === 'me'} current={i === visible.length - 1} chat={style === 'chat'} />
            ),
          )}
        </AnimatePresence>
        {pending !== null && <Bubble who={who('me')} text={pending} mine current chat={style === 'chat'} />}
        {(pending !== null || (typing && p)) && (
          <div className="flex gap-1 pl-1">
            <div className="flex gap-1 rounded-2xl bg-slate-100 px-3 py-3">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-2 w-2 rounded-full bg-slate-400" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: d * 0.15 }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-3">
        {pending !== null ? null : waitingAsk ? (
          <AnswerPanel key={waitingAsk.id} ask={waitingAsk} onAnswer={(r) => void answer(waitingAsk, r)} />
        ) : finished ? (
          <Btn onClick={() => onDone(replies)}>{t('done')}</Btn>
        ) : style === 'story' ? (
          <Btn
            onClick={() => {
              sfx.tap();
              setShown((n) => Math.min(items.length, n + 1));
            }}
          >
            {t('next')}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}

function Bubble({ who, text, mine, ask, current, chat }: { who: Who; text: string; mine?: boolean; ask?: boolean; current?: boolean; chat?: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: !chat && !current && !mine ? 0.75 : 1, y: 0, scale: 1 }}
      className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}
    >
      {!chat && (
        <button onClick={() => !mine && speakNow(text, { pitch: who.pitch, rate: who.rate, gender: who.gender })} className="shrink-0 overflow-hidden rounded-full bg-slate-100">
          <Character id={who.id} size={40} bust />
        </button>
      )}
      <div className={`max-w-[78%] ${mine ? 'text-right' : ''}`}>
        {!chat && !mine && <div className={`mb-0.5 text-xs font-black ${who.color}`}>{label(who)}</div>}
        <div
          className={`inline-block rounded-2xl border-2 px-3 py-2 text-left text-[17px] font-bold leading-snug ${
            mine ? 'border-green-500 bg-green-500 text-white' : ask ? 'border-sky-300 bg-sky-50 text-slate-700' : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          {ask && <span className="mr-1">❓</span>}
          {text}
        </div>
      </div>
    </motion.div>
  );
}

/** 回答面板：点一个现成回答，或用自己的话（打字 / 语音）——每个问题都可以自己说 */
function AnswerPanel({ ask, onAnswer }: { ask: AskBeat; onAnswer: (r: { option: string } | { text: string }) => void }) {
  const [writing, setWriting] = useState(ask.options.length === 0);
  const [text, setText] = useState('');
  const [mic, setMic] = useState<null | (() => void)>(null);

  if (!writing) {
    return (
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-2">
        {ask.options.map((o) => (
          <motion.button
            key={o.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => onAnswer({ option: o.id })}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
          >
            <Emoji e={o.emoji} size={34} />
            <span className="text-[17px] font-extrabold text-slate-700">{o.label}</span>
          </motion.button>
        ))}
        {/* 现成的回答都不对时，总能用自己的话说（没有预设关键词规则也行） */}
        {(
          <button
            onClick={() => {
              sfx.tap();
              setWriting(true);
            }}
            className="w-full rounded-2xl border-2 border-dashed border-sky-300 py-2.5 text-[16px] font-extrabold text-sky-600"
          >
            {t('sayOwn')}
          </button>
        )}
      </motion.div>
    );
  }

  const free = ask.free ?? { chips: [], placeholder: '' };
  const send = () => text.trim() && onAnswer({ text: text.trim() });
  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-2">
      {free.chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {free.chips.map((c) => (
            <button key={c} onClick={() => setText((x) => (x ? `${x}, ${c}` : c))} className="rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-sm font-extrabold text-slate-600">
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={free.placeholder || t('ownPh')}
          className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-4 py-3 text-[17px] font-bold outline-none focus:border-sky-400"
        />
        {canListen() && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            animate={mic ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={mic ? { repeat: Infinity, duration: 0.8 } : {}}
            onClick={() => {
              if (mic) return mic();
              setMic(() => listen(setText, () => setMic(null)));
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-b-4 ${mic ? 'border-rose-500 bg-rose-500' : 'border-slate-200 bg-white'}`}
            aria-label="mic"
          >
            <Emoji e="🎙️" size={28} />
          </motion.button>
        )}
      </div>
      <div className="flex gap-2">
        {ask.options.length > 0 && (
          <Btn tone="white" className="w-1/3" onClick={() => setWriting(false)}>
            {t('back')}
          </Btn>
        )}
        <Btn disabled={!text.trim()} onClick={send}>
          {t('saidIt')}
        </Btn>
      </div>
    </motion.div>
  );
}

// ---------------- 剧情关 ----------------

export function Talk({ round }: { round: TalkRound }) {
  const g = useGame();
  return (
    <div className="flex h-full flex-col">
      {round.style === 'story' && (
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-700">
            {round.emoji} {round.title}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Dialogue beats={round.beats} style={round.style} partner={round.with} baseFlags={g.played!.flags} onDone={(r) => g.talk(round, r)} />
      </div>
    </div>
  );
}
