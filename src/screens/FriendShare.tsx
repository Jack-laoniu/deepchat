import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { attachShareVoices, createShare, decideShare, getShare, keepFriendVoices, uploadVoice, myReplies, myShares, replyShare, saveMyShares, type Choice, type ShareData, type ShareReply, type Voice } from '../api';
import { VoiceLine } from './FriendVoice';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import { advisorLesson, companionLesson, reviewPicks, type ShareRole } from '../lesson/friends';
import { picksOf, splitsOf, type Pick, type Split, type Splits } from '../lesson/picks';
import type { Lesson } from '../lesson/schema';
import { copyText } from '../ui/copy';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

const site = () => (typeof location !== 'undefined' ? location.origin : '');
const input = 'w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[15px] font-bold text-slate-700 outline-none focus:border-sky-400';

/** 两个人的分歧：路线不一样的、大分歧（醒目）、小不同（折起来）、一样的几处 */
function SplitsView({ sp, a, b, children }: { sp: Splits; a: string; b: string; children?: (s: Split) => ReactNode }) {
  const [more, setMore] = useState(false);
  const row = (d: Split, big: boolean) => (
    <div key={d.key} className={`rounded-2xl p-2 text-xs font-bold text-slate-600 ${big ? 'border-2 border-amber-300 bg-amber-50' : 'bg-white'}`}>
      <div className="text-slate-400">{d.q}</div>
      <div>
        {a}：{d.mine.emoji} {d.mine.label}
      </div>
      <div>
        {b}：{d.theirs.emoji} <b>{d.theirs.label}</b>
      </div>
      {children?.(d)}
    </div>
  );
  const route = sp.route.mine.length > 0 || sp.route.theirs.length > 0;
  return (
    <div className="mt-2 space-y-1.5">
      {route && (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-2 text-xs font-black text-rose-700">
          {t('splitRoute', { a, b, x: sp.route.mine.join(' / ') || '—', y: sp.route.theirs.join(' / ') || '—' })}
        </div>
      )}
      {sp.big.length > 0 ? <div className="text-sm font-black text-amber-700">⚡ {t('splitBig', { n: sp.big.length })}</div> : !route && <div className="text-sm font-black text-emerald-600">🎉 {t('splitNone')}</div>}
      {sp.big.map((d) => row(d, true))}
      {sp.small.length > 0 && (
        <button onClick={() => setMore((x) => !x)} className="text-xs font-black text-slate-400">
          {more ? '▾' : '▸'} {t('splitSmall', { n: sp.small.length })}
        </button>
      )}
      {more && sp.small.map((d) => row(d, false))}
      <div className="text-xs font-black text-emerald-600">✅ {t('sendBackSame', { n: sp.same.length })}</div>
    </div>
  );
}

/** 分享的人：结算页上「让真实的朋友一起看看」——选同行的人还是参谋的人，生成链接 */
export function ShareWithFriends({ myPicks }: { myPicks: Pick[] }) {
  const g = useGame();
  const l = g.lesson!;
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (role: ShareRole) => {
    sfx.tap();
    setBusy(true);
    setNote('');
    const id = await createShare(role, name.trim(), l, myPicks);
    if (!id) {
      setBusy(false);
      return setNote(t('shareFail'));
    }
    // 自己按住说话回答的那几题：把录音传上去挂到分享上，朋友玩到同一题时能听到原声
    const said = myPicks.flatMap((p) => {
      const c = p.own && g.clips.find((x) => x.ask === p.key.split('.').pop() && x.text === p.label);
      return c ? [{ key: p.key, blob: c.blob }] : [];
    });
    if (said.length) {
      const up = await Promise.all(said.map(async (s) => ({ key: s.key, v: await uploadVoice(id, s.blob) })));
      const voices = Object.fromEntries(up.flatMap((u) => ('error' in u.v ? [] : [[u.key, u.v]])));
      if (Object.keys(voices).length) await attachShareVoices(id, voices);
    }
    setBusy(false);
    const text = `${t(role === 'companion' ? 'shareInviteCompanion' : 'shareInviteAdvisor', { title: l.title })}\n${site()}/?s=${id}`;
    try {
      if (navigator.share) return void (await navigator.share({ text }));
    } catch {
      return;
    }
    if (await copyText(text)) setNote(t('shareCopied'));
  };

  const tile = (role: ShareRole, title: string, sub: string) => (
    <motion.button whileTap={{ scale: 0.97 }} disabled={busy || (role === 'advisor' && myPicks.filter((p) => !p.own).length < 3)} onClick={() => go(role)} className="rounded-2xl border-2 border-b-4 border-sky-200 bg-white p-3 text-left disabled:opacity-50">
      <div className="text-[15px] font-black text-slate-700">{title}</div>
      <div className="mt-0.5 text-xs font-bold leading-snug text-slate-400">{sub}</div>
    </motion.button>
  );

  return (
    <div className="mt-5 rounded-3xl border-2 border-b-4 border-sky-200 bg-sky-50/60 p-3">
      <div className="text-base font-black text-sky-700">👫 {t('shareFriendsTitle')}</div>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder={t('shareYourName')} className={`${input} mt-2`} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        {tile('companion', t('shareCompanion'), t('shareCompanionSub'))}
        {tile('advisor', t('shareAdvisor'), t('shareAdvisorSub'))}
      </div>
      {note && <div className="mt-2 text-center text-xs font-black text-sky-700">{note}</div>}
    </div>
  );
}

/** 朋友：打开链接（/?s=…）看到的卡片：谁请你、当同行还是参谋、TA 已经定了什么，然后开始 */
export function FriendLanding({ id }: { id: string }) {
  const g = useGame();
  const [data, setData] = useState<ShareData | null | 'gone'>(null);
  useEffect(() => {
    void getShare(id).then((d) => setData(d ?? 'gone'));
  }, [id]);
  if (!data) return <div className="mt-3 h-24 animate-pulse rounded-3xl bg-sky-50" />;
  if (data === 'gone') return <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-500">{t('friendCardGone')}</div>;
  const from = data.from || t('friendSomeone');
  const mineReply = data.replies.find((r) => r.rid && r.rid === myReplies()[id]);
  const start = () => {
    sfx.good();
    const lesson = data.role === 'advisor' ? advisorLesson(data.lesson, from) : companionLesson(data.lesson, from);
    g.open(lesson, { id, role: data.role, from, picks: data.picks, voices: data.voices });
  };
  return (
    <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-3 rounded-3xl border-2 border-b-4 border-sky-300 bg-sky-50 p-3">
      <div className="flex items-center gap-2">
        <Emoji e={data.role === 'advisor' ? '🧐' : '🧳'} size={36} />
        <div>
          <div className="text-[15px] font-black text-sky-800">{t(data.role === 'advisor' ? 'friendCardAdvisor' : 'friendCardCompanion', { from })}</div>
          <div className="text-sm font-black text-slate-600">
            {data.lesson.emoji} {data.lesson.title}
          </div>
        </div>
      </div>
      {/* 不在这里摆出 TA 的决定：每一步先自己选，选完再揭晓 TA 选了什么 */}
      <div className="mt-2 text-xs font-bold text-slate-500">{t(data.role === 'advisor' ? 'friendHowAdvisor' : 'friendHowCompanion', { from })}</div>
      {mineReply && data.role === 'companion' && <Decided lesson={data.lesson} from={from} sharer={data.picks} reply={mineReply} />}
      <Btn className="mt-3" tone={mineReply ? 'white' : undefined} onClick={start}>
        {mineReply ? t('playAgain') : t('friendCardStart')}
      </Btn>
    </motion.div>
  );
}

/** 朋友回头打开链接：分享的人对分歧怎么拍板的 */
function Decided({ lesson, from, sharer, reply }: { lesson: Lesson; from: string; sharer: Pick[]; reply: ShareReply }) {
  if (!reply.decisions || !Object.keys(reply.decisions).length) return <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-500">⏳ {t('decidedWait', { from })}</div>;
  const sp = splitsOf(lesson, sharer, reply.picks);
  const by = new Map([...sp.big, ...sp.small].map((d) => [d.key, d]));
  return (
    <div className="mt-3 rounded-2xl border-2 border-violet-200 bg-white p-2">
      <div className="text-sm font-black text-violet-700">{t('decidedTitle', { from })}</div>
      {Object.entries(reply.decisions).flatMap(([k, c]) => {
        const d = by.get(k);
        if (!d) return [];
        const pick = c === 'theirs' ? d.theirs : d.mine;
        return [
          <div key={k} className="mt-1 text-xs font-bold text-slate-600">
            <span className="text-slate-400">{d.q}</span> → {c === 'both' ? `${d.mine.label} + ${d.theirs.label}` : `${pick.emoji ?? ''} ${pick.label}`}{' '}
            <span className="text-violet-500">({t(c === 'mine' ? 'decidedTheirs' : c === 'theirs' ? 'decidedYours' : 'decidedBoth', { from })})</span>
          </div>,
        ];
      })}
    </div>
  );
}

/** 朋友玩完：同行的人看看和 TA 哪里一样、哪里不一样；参谋的人看看自己点了多少「这个好」；然后交回给 TA */
export function SendBack({ plan }: { plan: string }) {
  const g = useGame();
  const s = g.share!;
  const mine = picksOf(g.lesson!, g.answers);
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'fail'>('idle');
  // 同行和参谋玩的是同一关：都能逐条对比；参谋另外数一数给 TA 的选择点了几个「好」几个「再想想」
  const sp = splitsOf(g.lesson!, s.picks, mine);
  const ok = Object.values(g.judged).filter((v) => v === 'ok').length;
  const no = Object.values(g.judged).filter((v) => v === 'rethink').length;

  const send = async () => {
    sfx.tap();
    setState('sending');
    setState((await replyShare(s.id, s.role, name.trim(), mine, plan, g.voices, g.judged)) ? 'sent' : 'fail');
  };

  return (
    <div className="mt-5 rounded-3xl border-2 border-b-4 border-sky-300 bg-sky-50 p-3">
      <div className="text-base font-black text-sky-800">💌 {t('sendBackTitle', { from: s.from })}</div>
      {s.role === 'advisor' && ok + no > 0 && <div className="mt-2 text-sm font-black text-slate-600">{t('sendBackAdvice', { ok, no })}</div>}
      <SplitsView sp={sp} a={s.from} b={t('you')} />
      {state === 'sent' ? (
        <div className="mt-3 rounded-2xl bg-white p-3 text-center text-sm font-black text-emerald-700">{t('sendBackDone', { from: s.from })}</div>
      ) : (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder={t('sendBackName')} className={input} />
          <Btn disabled={state === 'sending'} onClick={send}>
            {t(s.role === 'companion' && (sp.big.length || sp.route.mine.length || sp.route.theirs.length) ? 'sendBackDecide' : 'sendBackBtn', { from: s.from })}
          </Btn>
          {state === 'fail' && <div className="text-center text-xs font-black text-rose-500">{t('shareFail')}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * 朋友原声挂在哪个选择上，换成分享的人自己关卡里的 key：
 * 参谋的人在「把把关」里第 N 张卡上留的话，对应分享的人的第 N 个选择（卡片按这个顺序出的，见 advisorLesson）
 */
function ownKeys(data: ShareData, voices: Record<string, Voice>): Record<string, Voice> {
  const chosen = reviewPicks(data.picks, data.voices);
  return Object.fromEntries(
    Object.entries(voices).flatMap(([k, v]) => {
      const card = /^adv_review\.card_(\d+)$/.exec(k);
      const key = card ? chosen[Number(card[1]) - 1]?.key : k;
      return key ? [[key, v]] : [];
    }),
  );
}

/** 分享的人回到首页：朋友回复过的分享都在这（新回复的醒目），点开看分歧、拍板 */
export function RepliesCard() {
  const [items, setItems] = useState<{ id: string; title: string; seen: number; data: ShareData }[]>([]);
  const [open, setOpen] = useState<{ id: string; title: string; data: ShareData } | null>(null);
  useEffect(() => {
    let alive = true;
    const list = myShares().slice(0, 5);
    void Promise.all(list.map(async (m) => ({ m, data: await getShare(m.id) }))).then((rs) => {
      if (!alive) return;
      setItems(rs.flatMap(({ m, data }) => (data && data.replies.length ? [{ id: m.id, title: m.title, seen: m.seen, data }] : [])));
      // 朋友留的原声记到这台设备上：下次玩同一关、走到同一个问题时，朋友带着原声来敲门
      for (const { data } of rs) for (const r of data?.replies ?? []) if (data && r.voices) keepFriendVoices(data.lesson.need, r.name || t('friendSomeone'), ownKeys(data, r.voices), (k) => data.picks.find((p) => p.key === k)?.q ?? '');
    });
    return () => {
      alive = false;
    };
  }, []);
  const seen = (id: string, n: number) => saveMyShares(myShares().map((m) => (m.id === id ? { ...m, seen: n } : m)));

  return (
    <>
      {items.map((it) => {
        const last = it.data.replies[it.data.replies.length - 1];
        const fresh = it.data.replies.length > it.seen;
        return (
          <motion.button
            key={it.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={() => {
              sfx.good();
              seen(it.id, it.data.replies.length);
              setItems((x) => x.map((y) => (y.id === it.id ? { ...y, seen: it.data.replies.length } : y)));
              setOpen(it);
            }}
            className={`mt-3 w-full rounded-2xl border-2 border-b-4 px-3 py-2 text-left text-[15px] font-black ${fresh ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-500'}`}
          >
            {fresh ? t('repliesNew', { name: last.name || t('friendSomeone'), title: it.title }) : t('repliesSeen', { title: it.title, n: it.data.replies.length })}
          </motion.button>
        );
      })}
      <AnimatePresence>{open && <RepliesView id={open.id} title={open.title} data={open.data} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  );
}

/** 和一位同行的朋友的分歧：大分歧逐条拍板（听我的 / 听 TA 的 / 都安排），存到分享里，朋友打开链接就能看到 */
function DecideCompanion({ id, data, reply }: { id: string; data: ShareData; reply: ShareReply }) {
  const name = reply.name || t('friendSomeone');
  const sp = splitsOf(data.lesson, data.picks, reply.picks);
  const canDecide = !!reply.rid && !!myShares().find((m) => m.id === id)?.owner;
  const [picked, setPicked] = useState<Record<string, Choice>>(reply.decisions ?? {});
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'fail'>(reply.decisions ? 'saved' : 'idle');
  const choose = (k: string, c: Choice) => {
    sfx.tap();
    setPicked((x) => ({ ...x, [k]: c }));
    setState('idle');
  };
  const save = async () => {
    sfx.good();
    setState('saving');
    setState((await decideShare(id, reply.rid!, picked)) ? 'saved' : 'fail');
  };
  const chip = (k: string, c: Choice, text: string) => (
    <button key={c} onClick={() => choose(k, c)} className={`rounded-xl border-2 px-2 py-1 text-xs font-black ${picked[k] === c ? 'border-violet-500 bg-violet-500 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
      {text}
    </button>
  );
  return (
    <>
      <SplitsView sp={sp} a={t('you')} b={name}>
        {(d) => (
          <>
            {/* 朋友在这一处留的原声：先听 TA 怎么说，再拍板 */}
            {reply.voices?.[d.key] && <VoiceLine name={name} voice={reply.voices[d.key]} />}
            {canDecide && sp.big.includes(d) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {chip(d.key, 'mine', `${t('decideMe')}：${d.mine.label}`)}
                {chip(d.key, 'theirs', `${name}：${d.theirs.label}`)}
                {chip(d.key, 'both', t('decideBoth'))}
              </div>
            )}
          </>
        )}
      </SplitsView>
      {canDecide && sp.big.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-bold text-slate-400">{t('decideHint', { name })}</div>
          {state === 'saved' ? (
            <div className="mt-1 rounded-xl bg-violet-50 px-2 py-1.5 text-center text-xs font-black text-violet-700">✅ {t('decideSaved', { name })}</div>
          ) : (
            <Btn className="mt-1" disabled={state === 'saving' || !sp.big.every((d) => picked[d.key])} onClick={save}>
              {t('decideSave')}
            </Btn>
          )}
          {state === 'fail' && <div className="text-center text-xs font-black text-rose-500">{t('shareFail')}</div>}
        </div>
      )}
    </>
  );
}

function RepliesView({ id, title, data, onClose }: { id: string; title: string; data: ShareData; onClose: () => void }) {
  const said = (r: ShareReply) => r.picks.filter((p) => p.own);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} onClick={(e) => e.stopPropagation()} className="max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5">
        <div className="text-lg font-black text-slate-700">
          {t('repliesTitle')} · {title}
        </div>
        {data.replies.map((r, i) => {
          // 参谋对我每个选择点的「再想想」（旧版分享：「把把关」卡片里左滑的那几张）；连同朋友在那一处的吐槽原声
          const voices = ownKeys(data, r.voices ?? {});
          const rethink = [
            ...Object.entries(r.judged ?? {}).flatMap(([k, v]) => (v === 'rethink' ? data.picks.filter((p) => p.key === k) : [])),
            ...r.picks.filter((p) => p.key.startsWith('adv_review.') && p.emoji === '🤔'),
          ];
          // 吐槽了、但不在「再想想」里的那几处（同行的人的吐槽在分歧列表里已经有了）
          const teased = r.role === 'advisor' ? Object.keys(voices).filter((k) => !rethink.some((p) => p.key === k)) : [];
          const verdict = r.picks.find((p) => p.key === 'adv_verdict');
          return (
            <div key={r.rid ?? i} className="mt-3 rounded-2xl border-2 border-slate-100 p-3">
              <div className="text-[15px] font-black text-slate-700">
                {r.name || t('friendSomeone')} · {t(r.role === 'advisor' ? 'repliesAdvisor' : 'repliesCompanion')}
                {verdict && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{verdict.emoji} {verdict.label}</span>}
              </div>
              {r.role === 'companion' && <DecideCompanion id={id} data={data} reply={r} />}
              {rethink.length > 0 && (
                <div className="mt-1 text-xs font-bold text-amber-700">
                  {t('repliesRethink')} {rethink.map((p) => p.q).join(' · ')}
                </div>
              )}
              {r.role === 'advisor' && [...rethink.map((p) => p.key), ...teased].map((k) => voices[k] && <VoiceLine key={k} name={r.name || t('friendSomeone')} voice={voices[k]} />)}
              {said(r).length > 0 && (
                <div className="mt-1 space-y-0.5 text-xs font-bold text-slate-600">
                  {said(r).map((p) => (
                    <div key={p.key}>
                      💬 {p.q} <b>{p.label}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <Btn className="mt-4" tone="white" onClick={onClose}>
          {t('repliesClose')}
        </Btn>
      </motion.div>
    </motion.div>
  );
}
