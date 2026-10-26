import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createShare, getShare, myShares, replyShare, saveMyShares, type ShareData, type ShareReply } from '../api';
import { sfx } from '../fx/fx';
import { useGame } from '../game';
import { t } from '../i18n';
import { advisorLesson, companionLesson, type ShareRole } from '../lesson/friends';
import { comparePicks, picksOf, type Pick } from '../lesson/picks';
import { copyText } from '../ui/copy';
import { Emoji } from '../ui/Emoji';
import { Btn } from '../ui/kit';

const site = () => (typeof location !== 'undefined' ? location.origin : '');
const input = 'w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[15px] font-bold text-slate-700 outline-none focus:border-sky-400';

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
    setBusy(false);
    if (!id) return setNote(t('shareFail'));
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
  const start = () => {
    sfx.good();
    const lesson = data.role === 'advisor' ? (advisorLesson(data.lesson, from, data.picks) ?? companionLesson(data.lesson, from, data.picks)) : companionLesson(data.lesson, from, data.picks);
    g.open(lesson, { id, role: data.role, from, picks: data.picks });
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
      <div className="mt-2 text-xs font-black text-slate-400">{t('friendPicked')}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {data.picks
          .filter((p) => !p.own)
          .slice(0, 6)
          .map((p) => (
            <span key={p.key} className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600">
              {p.emoji} {p.label}
            </span>
          ))}
      </div>
      <Btn className="mt-3" onClick={start}>
        {t('friendCardStart')}
      </Btn>
    </motion.div>
  );
}

/** 朋友玩完：同行的人看看和 TA 哪里一样、哪里不一样；参谋的人看看自己点了多少「这个好」；然后交回给 TA */
export function SendBack({ plan }: { plan: string }) {
  const g = useGame();
  const s = g.share!;
  const mine = picksOf(g.lesson!, g.answers);
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'fail'>('idle');
  const cmp = s.role === 'companion' ? comparePicks(s.picks, mine) : null;
  const review = mine.filter((p) => p.key.startsWith('adv_review.'));
  const ok = review.filter((p) => p.emoji === '👍').length;

  const send = async () => {
    sfx.tap();
    setState('sending');
    setState((await replyShare(s.id, s.role, name.trim(), mine, plan)) ? 'sent' : 'fail');
  };

  return (
    <div className="mt-5 rounded-3xl border-2 border-b-4 border-sky-300 bg-sky-50 p-3">
      <div className="text-base font-black text-sky-800">💌 {t('sendBackTitle', { from: s.from })}</div>
      {cmp && (
        <div className="mt-2 space-y-1.5">
          <div className="text-sm font-black text-emerald-600">✅ {t('sendBackSame', { n: cmp.same.length })}</div>
          {cmp.diff.length > 0 && <div className="text-sm font-black text-amber-600">⚠️ {t('sendBackDiff')}</div>}
          {cmp.diff.slice(0, 8).map((d) => (
            <div key={d.mine.key} className="rounded-2xl bg-white p-2 text-xs font-bold text-slate-600">
              <div className="text-slate-400">{d.q}</div>
              <div>
                {s.from}：{d.mine.emoji} {d.mine.label}
              </div>
              <div>
                {t('sendBackYou')}：{d.theirs.emoji} {d.theirs.label}
              </div>
            </div>
          ))}
        </div>
      )}
      {!cmp && <div className="mt-2 text-sm font-black text-slate-600">{t('sendBackAdvice', { ok, no: review.length - ok })}</div>}
      {state === 'sent' ? (
        <div className="mt-3 rounded-2xl bg-white p-3 text-center text-sm font-black text-emerald-700">{t('sendBackDone', { from: s.from })}</div>
      ) : (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder={t('sendBackName')} className={input} />
          <Btn disabled={state === 'sending'} onClick={send}>
            {t('sendBackBtn', { from: s.from })}
          </Btn>
          {state === 'fail' && <div className="text-center text-xs font-black text-rose-500">{t('shareFail')}</div>}
        </div>
      )}
    </div>
  );
}

/** 分享的人回到首页：朋友回复了就冒出来，点开看 */
export function RepliesCard() {
  const [items, setItems] = useState<{ id: string; title: string; data: ShareData }[]>([]);
  const [open, setOpen] = useState<{ title: string; data: ShareData } | null>(null);
  useEffect(() => {
    let alive = true;
    const list = myShares().slice(0, 5);
    void Promise.all(list.map(async (m) => ({ m, data: await getShare(m.id) }))).then((rs) => {
      if (!alive) return;
      setItems(rs.flatMap(({ m, data }) => (data && data.replies.length > m.seen ? [{ id: m.id, title: m.title, data }] : [])));
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
        return (
          <motion.button
            key={it.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={() => {
              sfx.good();
              seen(it.id, it.data.replies.length);
              setItems((x) => x.filter((y) => y.id !== it.id));
              setOpen({ title: it.title, data: it.data });
            }}
            className="mt-3 w-full rounded-2xl border-2 border-b-4 border-rose-200 bg-rose-50 px-3 py-2 text-left text-[15px] font-black text-rose-700"
          >
            {t('repliesNew', { name: last.name || t('friendSomeone'), title: it.title })}
          </motion.button>
        );
      })}
      <AnimatePresence>{open && <RepliesView title={open.title} data={open.data} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  );
}

function RepliesView({ title, data, onClose }: { title: string; data: ShareData; onClose: () => void }) {
  const said = (r: ShareReply) => r.picks.filter((p) => p.own);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} onClick={(e) => e.stopPropagation()} className="max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5">
        <div className="text-lg font-black text-slate-700">
          {t('repliesTitle')} · {title}
        </div>
        {data.replies.map((r, i) => {
          const cmp = r.role === 'companion' ? comparePicks(data.picks, r.picks) : null;
          const rethink = r.picks.filter((p) => p.key.startsWith('adv_review.') && p.emoji === '🤔');
          const verdict = r.picks.find((p) => p.key === 'adv_verdict');
          return (
            <div key={i} className="mt-3 rounded-2xl border-2 border-slate-100 p-3">
              <div className="text-[15px] font-black text-slate-700">
                {r.name || t('friendSomeone')} · {t(r.role === 'advisor' ? 'repliesAdvisor' : 'repliesCompanion')}
                {verdict && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{verdict.emoji} {verdict.label}</span>}
              </div>
              {cmp && (
                <div className="mt-1 space-y-1 text-xs font-bold text-slate-600">
                  <div className="text-emerald-600">✅ {t('sendBackSame', { n: cmp.same.length })}</div>
                  {cmp.diff.slice(0, 8).map((d) => (
                    <div key={d.mine.key}>
                      ⚠️ {d.q}：{d.mine.label} → <b>{d.theirs.label}</b>
                    </div>
                  ))}
                </div>
              )}
              {rethink.length > 0 && (
                <div className="mt-1 text-xs font-bold text-amber-700">
                  {t('repliesRethink')} {rethink.map((p) => p.q).join(' · ')}
                </div>
              )}
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
