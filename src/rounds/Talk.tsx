import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../fx/fx';
import { canListen, hush, listen, speak } from '../fx/voice';
import { useGame } from '../game';
import { matchFree, walkBeats, type Replies } from '../lesson/engine';
import type { AskBeat, Beat, Character, Line, TalkRound } from '../lesson/schema';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

// ---------------- 角色 ----------------

const COLORS = ['text-sky-600', 'text-purple-600', 'text-orange-600', 'text-pink-600', 'text-teal-600', 'text-indigo-600'];

export function useCast() {
  const cast = useGame().lesson!.cast;
  return useMemo(() => {
    const map = new Map<string, Character & { color: string }>();
    map.set('me', { id: 'me', name: '我', emoji: '🙂', pitch: 1, rate: 1, color: 'text-green-600' });
    map.set('fox', { id: 'fox', name: '狐狐', emoji: '🦊', pitch: 1.3, rate: 1.05, color: 'text-orange-500' });
    cast.forEach((c, i) => map.set(c.id, { ...c, color: COLORS[i % COLORS.length] }));
    return (id: string) => map.get(id) ?? { id, name: '', emoji: '💬', pitch: 1, rate: 1, color: 'text-slate-500' };
  }, [cast]);
}

// ---------------- 对话脚本 → 逐条显示的台词 ----------------

type Item = { key: string; kind: 'line'; who: string; say: string } | { key: string; kind: 'ask'; beat: AskBeat };

/** 把台词、提问、用户的回答和角色的即时反应摊平成一条时间线 */
function transcript(beats: Beat[], replies: Replies, baseFlags: Set<string>): Item[] {
  const out: Item[] = [];
  const { visible } = walkBeats(beats, replies, baseFlags);
  const push = (key: string, l: Line) => out.push({ key, kind: 'line', who: l.who, say: l.say });
  visible.forEach((b, i) => {
    if (b.type === 'line') return push(`l${i}`, b);
    out.push({ key: `a${b.id}`, kind: 'ask', beat: b });
    const r = replies[b.id];
    if (!r) return;
    if ('option' in r) {
      const o = b.options.find((x) => x.id === r.option);
      if (!o) return;
      push(`m${b.id}`, { who: 'me', say: `${o.emoji} ${o.label}` });
      o.reply.forEach((l, j) => push(`r${b.id}${j}`, l));
    } else {
      push(`m${b.id}`, { who: 'me', say: r.text });
      const hits = b.free ? matchFree(b.free, r.text) : [];
      const reacts = hits.flatMap((m) => m.reply);
      (reacts.length ? reacts : b.free?.reply ?? []).forEach((l, j) => push(`r${b.id}${j}`, l));
    }
  });
  return out;
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
  const items = useMemo(() => transcript(beats, replies, baseFlags), [beats, replies, baseFlags]);
  const scroller = useRef<HTMLDivElement>(null);
  const last = items[Math.min(shown, items.length) - 1];
  const waitingAsk = last?.kind === 'ask' && !replies[last.beat.id] ? last.beat : null;
  const finished = shown >= items.length && !waitingAsk;

  // 新台词出现：朗读 + 滚动到底
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    if (!last) return;
    const text = last.kind === 'line' ? last.say : last.beat.q;
    const speaker = last.kind === 'line' ? last.who : last.beat.who;
    if (speaker !== 'me') {
      const c = who(speaker);
      void speak(text, { pitch: c.pitch, rate: c.rate });
    }
  }, [shown, last?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => hush, []);

  // 聊天模式自动往下走，带「对方正在输入」
  useEffect(() => {
    if (style !== 'chat' || waitingAsk || shown >= items.length) return;
    const next = items[shown];
    const isMe = next.kind === 'line' && next.who === 'me';
    setTyping(!isMe);
    const len = next.kind === 'line' ? next.say.length : next.beat.q.length;
    const t = setTimeout(() => {
      setTyping(false);
      sfx.tap();
      setShown((n) => n + 1);
    }, isMe ? 250 : 500 + len * 45);
    return () => clearTimeout(t);
  }, [style, shown, items, waitingAsk]);

  const answer = (beatId: string, r: Replies[string]) => {
    sfx.good();
    setReplies((x) => ({ ...x, [beatId]: r }));
    setShown((n) => n + 1);
  };

  const advance = () => {
    sfx.tap();
    setShown((n) => Math.min(items.length, n + 1));
  };

  const visible = items.slice(0, shown);
  const p = partner ? who(partner) : null;

  return (
    <div className="flex h-full flex-col">
      {style === 'chat' && p && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-slate-50 p-2">
          <Emoji e={p.emoji} size={48} loop />
          <div>
            <div className="font-black text-slate-700">{p.name}</div>
            <div className="text-xs font-bold text-green-500">● {typing ? '正在输入…' : '在线'}</div>
          </div>
        </div>
      )}

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto pb-2 pr-1">
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
        {typing && p && (
          <div className="flex items-center gap-2">
            <Emoji e={p.emoji} size={32} />
            <div className="flex gap-1 rounded-2xl bg-slate-100 px-3 py-3">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-2 w-2 rounded-full bg-slate-400" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: d * 0.15 }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-3">
        {waitingAsk ? (
          <AnswerPanel key={waitingAsk.id} ask={waitingAsk} onAnswer={(r) => answer(waitingAsk.id, r)} />
        ) : finished ? (
          <Btn onClick={() => onDone(replies)}>完成 ✓</Btn>
        ) : style === 'story' ? (
          <Btn onClick={advance}>继续</Btn>
        ) : null}
      </div>
    </div>
  );
}

function Bubble({
  who,
  text,
  mine,
  ask,
  current,
  chat,
}: {
  who: { name: string; emoji: string; color: string; pitch: number; rate: number };
  text: string;
  mine?: boolean;
  ask?: boolean;
  current?: boolean;
  chat?: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: !chat && !current && !mine ? 0.7 : 1, y: 0, scale: 1 }}
      className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}
    >
      {!(chat && mine) && (
        <button onClick={() => !mine && speak(text, { pitch: who.pitch, rate: who.rate })} className="shrink-0">
          <Emoji e={who.emoji} size={chat ? 34 : 46} loop={!!current && !mine} />
        </button>
      )}
      <div className={`max-w-[78%] ${mine ? 'text-right' : ''}`}>
        {!chat && !mine && <div className={`mb-0.5 text-xs font-black ${who.color}`}>{who.name}</div>}
        <div
          className={`inline-block rounded-2xl border-2 px-3 py-2 text-left text-[17px] font-bold leading-snug ${
            mine
              ? 'border-green-500 bg-green-500 text-white'
              : ask
                ? 'border-sky-300 bg-sky-50 text-slate-700'
                : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          {ask && <span className="mr-1">❓</span>}
          {text}
        </div>
      </div>
    </motion.div>
  );
}

/** 回答面板：点一个现成的回答，或者用自己的话（打字 / 语音） */
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
        {ask.free && (
          <button
            onClick={() => {
              sfx.tap();
              setWriting(true);
            }}
            className="w-full rounded-2xl border-2 border-dashed border-sky-300 py-2.5 text-[16px] font-extrabold text-sky-600"
          >
            ✍️ 都不是，我自己说
          </button>
        )}
      </motion.div>
    );
  }

  const free = ask.free!;
  const send = () => text.trim() && onAnswer({ text: text.trim() });
  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-2">
      {free.chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {free.chips.map((c) => (
            <button key={c} onClick={() => setText((t) => (t ? `${t}，${c}` : c))} className="rounded-full border-2 border-slate-200 bg-white px-3 py-1 text-sm font-extrabold text-slate-600">
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
          placeholder={free.placeholder}
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
            aria-label="语音输入"
          >
            <Emoji e="🎙️" size={28} />
          </motion.button>
        )}
      </div>
      <div className="flex gap-2">
        {ask.options.length > 0 && (
          <Btn tone="white" className="w-1/3" onClick={() => setWriting(false)}>
            返回
          </Btn>
        )}
        <Btn disabled={!text.trim()} onClick={send}>
          说完了
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
        <div className="mb-3 flex items-center gap-2">
          <Emoji e={round.emoji} size={40} loop />
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-700">📖 {round.title}</span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Dialogue beats={round.beats} style={round.style} partner={round.with} baseFlags={g.played!.flags} onDone={(r) => g.talk(round, r)} />
      </div>
    </div>
  );
}
