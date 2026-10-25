import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { loadCode, useCanGenerate } from '../api';
import { bondOf, CHAT_AT, friends, heartsOf, touchBond } from '../bond';
import { CAMEOS, cameoById, isCameo } from '../chars/cameos';
import { Character } from '../chars/Character';
import { charById, GUIDE } from '../chars/library';
import { sfx } from '../fx/fx';
import { hush, speak, speakNow } from '../fx/voice';
import { useGame } from '../game';
import { inHost } from '../host';
import { getLang, t, type MsgKey } from '../i18n';
import { memoryText } from '../memory';
import { Hearts } from '../ui/Hearts';
import { Discuss, type Turn } from './Discuss';

const ERR: Record<string, MsgKey> = { code: 'genCode', rate_ip: 'genRate', rate_day: 'genRate', busy: 'genBusy' };
export const JOIN = 'join';

export const nameOf = (id: string) => {
  const cameo = cameoById(id);
  return cameo ? cameo.name[getLang() === 'en' ? 'en' : 'zh'] : (charById(id)?.name[getLang()] ?? id);
};
const voiceOf = (id: string) => cameoById(id)?.voice ?? charById(id)?.voice ?? {};

/** 头像：固定角色画出来，客串的古典人物用 emoji */
export function Avatar({ id, size, talking }: { id: string; size: number; talking?: boolean }) {
  const cameo = cameoById(id);
  if (cameo)
    return (
      <span className="flex items-center justify-center rounded-full bg-amber-100" style={{ width: size, height: size, fontSize: size * 0.6 }}>
        {cameo.emoji}
      </span>
    );
  return (
    <span className="block overflow-hidden rounded-full bg-white">
      <Character id={id} size={size} bust mood="happy" talking={talking} />
    </span>
  );
}

/**
 * 结算后的多人讨论：小芳主持，熟人（交情够的）和古典名著人物可以随时被请进来插话。
 * 每次用户说一句，在场的人里 1–3 位接话，可以互相接茬；新进来的人先打个招呼、从自己的角度说一句。
 * 没有服务器（嵌在 ChatGPT / Claude 里、或网页版没配 key）时退回原来的「交给 AI / 复制」。
 */
export function GroupChat({ plan, turns, setTurns, join }: { plan: string; turns: Turn[]; setTurns: (f: (t: Turn[]) => Turn[]) => void; join?: { id: string; n: number } }) {
  const cfg = useCanGenerate();
  const g = useGame();
  const live = !inHost() && !!cfg?.generate;
  const [members, setMembers] = useState<string[]>(() => [GUIDE, ...g.guests]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const helped = useRef(new Set<string>());
  // 回调里拿最新的对话和在场的人（请人进来和发消息可能连着发生）
  const latest = useRef({ turns, members });
  latest.current = { turns, members };

  // 花括号不能省：有的浏览器 scrollIntoView 会返回 Promise，React 会把返回值当清理函数去调用（「x is not a function」）
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns.length, busy]);
  useEffect(() => hush, []);

  const request = async (message: string, joined?: string) => {
    const { turns: history, members: present } = latest.current;
    setBusy(true);
    setNote('');
    try {
      const r = await fetch('/api/discuss', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plan,
          history: toHistory(history),
          message,
          joined,
          members: present.map((id) => (isCameo(id) || id === GUIDE ? { id } : { id, hearts: heartsOf(bondOf(id).xp), quests: bondOf(id).quests })),
          lang: getLang() === 'en' ? 'en' : 'zh',
          code: loadCode(),
          memory: memoryText(g.lesson?.need) || undefined,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { replies?: { who: string; say: string }[]; error?: string };
      if (!d.replies?.length) throw new Error(d.error ?? 'fail');
      // 一个一个冒出来、一个一个念
      for (const [i, line] of d.replies.entries()) {
        if (i) await new Promise((ok) => setTimeout(ok, 650));
        setTurns((ts) => [...ts, { role: 'assistant', who: line.who, content: line.say }]);
        sfx.tap();
        void speak(line.say, voiceOf(line.who)).then(() => setSpeaking((s) => (s === line.who ? null : s)));
        setSpeaking(line.who);
        if (!isCameo(line.who) && line.who !== GUIDE && !helped.current.has(line.who)) {
          helped.current.add(line.who);
          touchBond(line.who);
        }
      }
      return true;
    } catch (e) {
      setNote(t(ERR[(e as Error).message] ?? 'discussFail'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    hush();
    sfx.tap();
    setText('');
    setTurns((ts) => [...ts, { role: 'user', content: q }]);
    latest.current.turns = [...latest.current.turns, { role: 'user', content: q }];
    if (!(await request(q))) {
      setTurns((ts) => ts.slice(0, -1));
      setText(q);
    }
  };

  const invite = async (id: string) => {
    setPicking(false);
    if (latest.current.members.includes(id) || busy) return;
    sfx.good();
    hush();
    const next = [...latest.current.members, id];
    setMembers(next);
    latest.current.members = next;
    const marker: Turn = { role: 'user', who: JOIN, content: nameOf(id) };
    setTurns((ts) => [...ts, marker]);
    latest.current.turns = [...latest.current.turns, marker];
    await request('', id);
  };

  // 从结算页「请某某进来一起聊」
  useEffect(() => {
    if (join && live) void invite(join.id);
  }, [join?.n, live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cfg && !live) return <Discuss plan={plan} turns={turns} setTurns={setTurns} />;

  return (
    <div className="mt-5 rounded-3xl border-2 border-b-4 border-sky-200 bg-sky-50/60 p-3">
      <div className="mb-2 flex items-center gap-1">
        <div className="flex -space-x-2">
          {members.map((id) => (
            <motion.span key={id} initial={{ scale: 0 }} animate={{ scale: speaking === id ? 1.15 : 1 }} className="rounded-full ring-2 ring-white">
              <Avatar id={id} size={34} talking={speaking === id} />
            </motion.span>
          ))}
        </div>
        <span className="ml-1 min-w-0 flex-1 truncate text-sm font-black text-sky-700">{t('discussTitle')}</span>
        <button onClick={() => (sfx.tap(), setPicking(true))} className="shrink-0 rounded-full border-2 border-b-4 border-rose-200 bg-white px-3 py-1 text-xs font-black text-rose-500">
          {t('groupInvite')}
        </button>
      </div>

      <div className="space-y-2">
        <Said who={GUIDE} text={t('discussHi')} />
        {turns.map((m, i) =>
          m.who === JOIN ? (
            <div key={i} className="text-center text-xs font-black text-slate-400">
              {t('groupJoined', { name: m.content })}
            </div>
          ) : m.role === 'user' ? (
            <Mine key={i} text={m.content} />
          ) : (
            <Said key={i} who={m.who ?? GUIDE} text={m.content} />
          ),
        )}
        {busy && (
          <div className="flex gap-1 pl-10">
            {[0, 1, 2].map((d) => (
              <motion.span key={d} className="h-2 w-2 rounded-full bg-sky-300" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: d * 0.15 }} />
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      {!busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t('discussChips')
            .split('|')
            .filter((c) => !turns.some((m) => m.content === c))
            .map((c) => (
              <button key={c} onClick={() => send(c)} className="rounded-full border-2 border-b-4 border-sky-200 bg-white px-3 py-1 text-sm font-extrabold text-sky-700 active:translate-y-0.5 active:border-b-2">
                {c}
              </button>
            ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 400))}
          placeholder={t('discussPh')}
          className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[16px] font-bold text-slate-700 outline-none focus:border-sky-400"
        />
        <button disabled={busy || !text.trim()} className="shrink-0 rounded-2xl border-b-4 border-sky-600 bg-sky-500 px-4 font-black text-white disabled:opacity-40">
          {t('discussSend')}
        </button>
      </form>
      {note && <div className="mt-2 text-center text-xs font-black text-slate-500">{note}</div>}

      <AnimatePresence>{picking && <InviteSheet present={members} need={g.lesson?.need ?? ''} onPick={(id) => void invite(id)} onClose={() => setPicking(false)} />}</AnimatePresence>
    </div>
  );
}

/** 发给服务器的历史：必须从用户开始、一问一答交替；同一轮里几个人的话合成一条，「某某加入」算用户这边的一条 */
function toHistory(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const m of turns) {
    const content = m.role === 'assistant' ? `${m.who ?? GUIDE}: ${m.content}` : m.who === JOIN ? `(${m.content} joins the chat)` : m.content;
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += `\n${content}`;
    else out.push({ role: m.role, content });
  }
  while (out[0]?.role === 'assistant') out.shift();
  if (out.at(-1)?.role === 'user') out.pop(); // 最后一条用户消息就是这次发的（或「加入」），不进历史
  return out.slice(-16);
}

/** 请人进来：交情够的熟人 + 按需求推荐的名著人物（讨论区和关卡里共用） */
export function InviteSheet({
  present,
  need,
  minHearts = CHAT_AT,
  title,
  onPick,
  onClose,
}: {
  present: string[];
  need: string;
  minHearts?: number;
  title?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const close = friends().filter((f) => f.hearts >= minHearts && !present.includes(f.id));
  const [picks, setPicks] = useState<{ id: string; hook: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/cameos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ need, lang: getLang() === 'en' ? 'en' : 'zh', code: loadCode() }) })
      .then((r) => r.json())
      .then((d: { picks?: { id: string; hook: string }[] }) => alive && setPicks(d.picks ?? []))
      .catch(() => alive && setPicks([]));
    return () => {
      alive = false;
    };
  }, [need]);
  const hooks = new Map((picks ?? []).map((p) => [p.id, p.hook]));
  // 推荐的排在前面
  const cameos = [...CAMEOS].filter((c) => !present.includes(c.id)).sort((a, b) => Number(hooks.has(b.id)) - Number(hooks.has(a.id)));

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5"
      >
        {title && <div className="mb-3 text-lg font-black text-slate-700">{title}</div>}
        {close.length > 0 && (
          <>
            <div className="text-base font-black text-rose-500">{t('groupFriends')}</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {close.map((f) => (
                <button key={f.id} onClick={() => onPick(f.id)} className="flex flex-col items-center rounded-2xl border-2 border-b-4 border-rose-100 bg-rose-50 p-1.5">
                  <Avatar id={f.id} size={48} />
                  <span className="text-xs font-black text-slate-700">{nameOf(f.id)}</span>
                  <Hearts n={f.hearts} size={7} />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 text-base font-black text-amber-600">{t('groupCameos')}</div>
        <div className="text-[11px] font-bold text-slate-400">{t('groupCameoNote')}</div>
        <div className="mt-2 space-y-1.5">
          {cameos.map((c) => (
            <button key={c.id} onClick={() => onPick(c.id)} className={`flex w-full items-center gap-2 rounded-2xl border-2 border-b-4 p-2 text-left ${hooks.has(c.id) ? 'border-amber-300 bg-amber-50' : 'border-slate-100 bg-white'}`}>
              <Avatar id={c.id} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-700">
                  {nameOf(c.id)} <span className="text-xs font-bold text-slate-400">· {c.from[getLang() === 'en' ? 'en' : 'zh']}</span>
                </div>
                {hooks.get(c.id) && <div className="truncate text-xs font-black text-amber-600">✨ {hooks.get(c.id)}</div>}
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Said({ who, text }: { who: string; text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2">
      <button onClick={() => speakNow(text, voiceOf(who))} className="shrink-0">
        <Avatar id={who} size={34} />
      </button>
      <div className="max-w-[80%]">
        <div className="mb-0.5 text-[11px] font-black text-slate-400">{nameOf(who)}</div>
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border-2 border-slate-200 bg-white px-3 py-2 text-[15px] font-bold leading-snug text-slate-700">{text}</div>
      </div>
    </motion.div>
  );
}

function Mine({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-end">
      <span className="max-w-[80%] rounded-2xl rounded-br-sm bg-green-500 px-3 py-2 text-[15px] font-bold text-white">{text}</span>
    </motion.div>
  );
}
