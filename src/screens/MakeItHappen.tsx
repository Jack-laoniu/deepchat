import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sfx } from '../fx/fx';
import { getLang, t, type MsgKey } from '../i18n';
import { CITY_NAMES } from '../travel/cities';
import { Btn } from '../ui/kit';
import { Emoji } from '../ui/Emoji';

type Link = { id: string; emoji: string; url: string };

/**
 * 旅游关通关后「让它成真」：预订入口（联盟链接，服务器按配置给）和「找本地导游」。
 * 导游那一块必须用户自己勾同意，才把需求单和联系方式发出去。只在我们自己的网页上显示。
 */
export function MakeItHappen({ city, plan }: { city: string; plan: string }) {
  const lang = getLang() === 'zh' ? 'zh' : 'en';
  const name = CITY_NAMES[city]?.[lang] ?? city;
  const [links, setLinks] = useState<Link[]>([]);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'fail'>('idle');

  useEffect(() => {
    fetch(`/api/partners?city=${encodeURIComponent(city)}&lang=${lang}`)
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((d: { links?: Link[] }) => setLinks(d.links ?? []))
      .catch(() => setLinks([]));
  }, [city, lang]);

  const send = async () => {
    sfx.tap();
    setState('sending');
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city, lang, name: who, contact, note, plan, consent: agree }),
      });
      setState(res.ok ? 'sent' : 'fail');
    } catch {
      setState('fail');
    }
  };

  const input = 'w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[15px] font-bold text-slate-700 outline-none focus:border-emerald-400';

  return (
    <div className="mt-5 rounded-3xl border-2 border-b-4 border-emerald-200 bg-emerald-50/60 p-3">
      <div className="text-base font-black text-emerald-700">✨ {t('goTitle')}</div>

      {links.length > 0 && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noreferrer sponsored"
                onClick={() => sfx.tap()}
                className="flex flex-col items-center gap-1 rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-2 text-center"
              >
                <Emoji e={l.emoji} size={30} />
                <span className="text-xs font-black leading-tight text-slate-600">{t(`go_${l.id}` as MsgKey, { city: name })}</span>
              </a>
            ))}
          </div>
          <div className="mt-1 text-center text-[10px] font-bold text-slate-400">{t('goNote')}</div>
        </>
      )}

      {/* 找本地导游：先展开，填联系方式，勾同意才发 */}
      {state === 'sent' ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-3 rounded-2xl bg-white p-3 text-center text-sm font-black text-emerald-700">
          {t('guideSent')}
        </motion.div>
      ) : !open ? (
        <button
          onClick={() => {
            sfx.tap();
            setOpen(true);
          }}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 border-emerald-300 bg-white p-3 text-left"
        >
          <Emoji e="🧑‍🏫" size={36} />
          <div>
            <div className="text-[15px] font-black text-slate-700">{t('guideTitle')}</div>
            <div className="text-xs font-bold text-slate-400">{t('guideSub', { city: name })}</div>
          </div>
        </button>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2">
          <input value={who} onChange={(e) => setWho(e.target.value.slice(0, 60))} placeholder={t('guideName')} className={input} />
          <input value={contact} onChange={(e) => setContact(e.target.value.slice(0, 120))} placeholder={t('guideContact')} className={input} />
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder={t('guideNote')} className={`${input} resize-none`} />
          <label className="flex items-start gap-2 text-xs font-bold leading-snug text-slate-500">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t('guideConsent')}{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" className="underline">
                {t('privacy')}
              </a>
            </span>
          </label>
          <Btn disabled={!agree || !contact.trim() || state === 'sending'} onClick={send}>
            {t('guideSend')}
          </Btn>
          {state === 'fail' && <div className="text-center text-xs font-black text-rose-500">{t('guideFail')}</div>}
        </motion.div>
      )}
    </div>
  );
}
