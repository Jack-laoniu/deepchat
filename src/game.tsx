import { picksOf, splitsOf, type Pick } from './lesson/picks';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { requestFinale, requestScene, serverConfig, type Voice } from './api';
import { inHost } from './host';
import { branchOf, withOwnScene } from './lesson/branch';
import { sfx } from './fx/fx';
import { hush } from './fx/voice';
import { jingle } from './fx/music';
import { detectLang, money, pickCheer, setLocale, t } from './i18n';
import { gambleCrashes, optionsOf, play, revealsProblem, type Answer, type Crash, type Meter, type Played, type Replies } from './lesson/engine';
import { bossOf, journeyText, withBoss } from './lesson/journey';
import { isCameo } from './chars/cameos';
import { asksOf, parseLesson, type FixRound, type Lesson, type MapRound, type Round } from './lesson/schema';

/** 一关最多请几位客人 */
export const MAX_GUESTS = 2;

export type Phase = 'home' | 'intro' | 'play' | 'win';

export interface Feedback {
  tone: 'good' | 'warn' | 'risk' | 'crash';
  title: string;
  tip?: string;
  delta: number;
  /** 这次选择用的 emoji，反馈条上显示 */
  emoji?: string;
  /** 刚答完的那一关：点「继续」前画面停留在这里 */
  round: Round;
}

export type ShareCtx = { id: string; role: 'companion' | 'advisor'; from: string; picks: Pick[] };

/**
 * 请朋友留一段原声的时机：同行的人和分享的人在一个大分歧上选得不一样（split），
 * 或者参谋的人对 TA 的某个决定点了「再想想」（rethink）。sharer = 分享的人那边的选择，me = 朋友自己的
 */
export type VoiceAsk = { key: string; q: string; kind: 'split' | 'rethink'; sharer?: Pick; me?: Pick };
/** 一局最多请朋友录几次 */
export const MAX_VOICE_ASKS = 3;

interface Game {
  lesson: Lesson | null;
  phase: Phase;
  played: Played | null;
  streak: number;
  crashes: Crash[];
  feedback: Feedback | null;
  /** 个性化终章还在后台生成，而用户已经走到终章了：先等一下 */
  finaleWaiting: boolean;
  /** 不等个性化终章了，用关卡里原来的 */
  skipFinaleWait(): void;
  /** 用户自己说的路线：新场景还在后台写，而用户已经走到这一关了：先等一下 */
  sceneWaiting: { goal: string } | null;
  /** 不等了，先用占位的场景 */
  skipSceneWait(): void;
  /** 请进这一关的客人（熟人或名著人物，最多 2 位）：他们会加入正在进行的对话 */
  guests: string[];
  /** 请来的熟人（第一位）：他主持终章 */
  guest: string | null;
  /** 请一位客人进来。熟人：加入角色表、主持终章，个性化终章按他的角度重写；名著人物：只在对话里插话 */
  invite(id: string): void;
  /** 这一局的全部回答（分享给朋友时提取选择用） */
  answers: Answer[];
  /** 朋友分享过来的这一局：分享的人是谁、请我当同行还是参谋、TA 的选择（结算时对比 / 交回） */
  share: ShareCtx | null;
  /** 现在请朋友留一句原声（null = 不用） */
  voiceAsk: VoiceAsk | null;
  /** 朋友录好了（或打了字）/ 跳过（null） */
  answerVoice(v: Voice | null): void;
  /** 朋友这一局留下的原声：选择的 key → 原声 */
  voices: Record<string, Voice>;
  open(lesson: Lesson, share?: ShareCtx): void;
  begin(): void;
  choose(round: Round, optionId: string): void;
  setValue(round: Round, value: number): void;
  /** 剧情关 / 地图关整体提交 */
  talk(round: Round, replies: Replies | Record<string, Replies>): void;
  gamble(round: Round): void;
  /** 连环取舍整轮提交；accepted = 某条槽见底后用户选择接受 */
  chain(round: Round, picks: Record<string, 'left' | 'right'>, accepted?: Meter): void;
  /** 整理归类整轮提交：卡片 → 筐 */
  sort(round: Round, bins: Record<string, string>): void;
  /** 摆进生活整轮提交：东西 → 位置 */
  place(round: Round, spots: Record<string, string>): void;
  /** 无文字的一天整轮提交：时刻 → 选项 */
  day(round: Round, picks: Record<string, string>): void;
  /** 终章整轮提交：选的做法、追问回答、资料有没有 */
  finale(round: Round, answer: Extract<Answer, { finale: unknown }>['finale']): void;
  next(): void;
  undo(): void;
  home(): void;
}

const Ctx = createContext<Game | null>(null);
export const useGame = () => useContext(Ctx)!;

export function GameProvider({ children }: { children: ReactNode }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [phase, setPhase] = useState<Phase>('home');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [streak, setStreak] = useState(0);
  const [crashes, setCrashes] = useState<Crash[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const played = useMemo(() => (lesson ? play(lesson, answers) : null), [lesson, answers]);

  // 个性化终章：玩到只剩两关 + 终章时，把这一局的选择和原话交给模型，在后台重写终章；
  // 用户玩完那两关的工夫就生成好了。没有服务器、失败、超时都用关卡里原来的终章。
  const [custom, setCustom] = useState<'idle' | 'pending' | 'done'>('idle');
  // 用户自己的路线：开场用自己的话说了最想干啥 → 先放占位场景，后台按原话现写一个（玩中间几关的工夫就写好了）
  const [own, setOwn] = useState<{ goal: string; status: 'pending' | 'done' } | null>(null);
  const ownJob = useRef(0);
  // 朋友的原声：在分歧处请他说一句（一局最多 3 次）
  const [voiceAsk, setVoiceAsk] = useState<VoiceAsk | null>(null);
  const [voices, setVoices] = useState<Record<string, Voice>>({});
  const asked = useRef(new Set<string>());
  const askVoice = (after: Answer[]) => {
    if (!share || !lesson || asked.current.size >= MAX_VOICE_ASKS) return;
    const mine = picksOf(lesson, after);
    let next: VoiceAsk | null = null;
    if (share.role === 'companion') {
      const big = splitsOf(lesson, share.picks, mine).big.find((s) => !asked.current.has(s.key));
      if (big) next = { key: big.key, q: big.q, kind: 'split', sharer: big.mine, me: big.theirs };
    } else {
      const no = mine.find((p) => p.key.startsWith('adv_review.') && p.emoji === '🤔' && !asked.current.has(p.key));
      if (no) next = { key: no.key, q: no.q, kind: 'rethink' };
    }
    if (!next) return;
    asked.current.add(next.key);
    setVoiceAsk(next);
  };
  const [guests, setGuests] = useState<string[]>([]);
  const [share, setShare] = useState<ShareCtx | null>(null);
  const guest = guests.find((id) => !isCameo(id)) ?? null;
  const job = useRef(0);
  useEffect(() => {
    if (phase !== 'play' || custom !== 'idle' || !lesson || !played?.current) return;
    if (lesson.curated || !bossOf(lesson) || played.current.type === 'boss') return void setCustom('done');
    if (played.estimate - played.done > 3) return;
    const my = ++job.current;
    const base = lesson;
    const journey = journeyText(lesson, played);
    setCustom('pending');
    void serverConfig()
      .then((c) => (c.generate ? requestFinale(base, journey, guest) : null))
      .then((r) => {
        if (job.current !== my) return;
        if (r) {
          // 只换终章（和可能补进来的角色），其他回合原样保留
          const next: Lesson = { ...withBoss(base, r.boss), cast: r.cast };
          if (parseLesson(next).ok) setLesson((cur) => (cur === base ? next : cur));
        }
        setCustom('done');
      });
  }, [phase, custom, lesson, played, guest]);

  // 玩到终章时个性化的还没好：不让用户等，直接用关卡里原来的终章（晚到的结果作废）
  useEffect(() => {
    if (custom === 'pending' && played?.current?.type === 'boss' && !feedback) {
      job.current++;
      setCustom('done');
    }
  }, [custom, played, feedback]);

  const commit = (a: Answer, fb: (before: Played, after: Played, problem: FixRound | null) => Feedback) => {
    if (!lesson) return;
    const after = [...answers, a];
    const pb = play(lesson, answers);
    const pa = play(lesson, after);
    const problem = revealsProblem(lesson, answers, after);
    const f = fb(pb, pa, problem);
    setAnswers(after);
    askVoice(after);
    setFeedback(f);
    if (f.tone === 'warn') {
      sfx.warn();
      setStreak(0);
    } else {
      if (f.delta < 0) sfx.coin();
      setStreak((s) => s + 1);
    }
    return f;
  };

  /** 开场「最想干啥」用自己的话回答了：放占位场景，后台让模型按原话写新场景 */
  const ownRoute = (base: Lesson, round: Round, replies: Replies) => {
    const b = branchOf(base);
    const r = b && asksOf(round).some((a) => a.id === b.ask.id) ? replies[b.ask.id] : undefined;
    if (!b || !r || !('text' in r) || !r.text.trim()) return;
    const goal = r.text.trim();
    const placed = withOwnScene(base);
    setLesson(placed);
    const my = ++ownJob.current;
    setOwn({ goal, status: 'pending' });
    const journey = journeyText(placed, play(placed, answers));
    void serverConfig()
      .then((c) => (c.generate && !inHost() ? requestScene(placed, goal, journey) : null))
      .then((res) => {
        if (ownJob.current !== my) return;
        if (res) {
          const scene = 'scene' in res ? res.scene : placed.rounds.find((x): x is MapRound => x.id === res.use && x.type === 'map');
          const cast = 'cast' in res ? res.cast : null;
          if (scene)
            setLesson((cur) => {
              if (!cur || branchOf(cur)?.ownId !== b.ownId) return cur;
              const next = withOwnScene(cast ? { ...cur, cast: [...cur.cast, ...cast.filter((c) => !cur.cast.some((x) => x.id === c.id))] } : cur, scene);
              return parseLesson(next).ok ? next : cur;
            });
        }
        setOwn({ goal, status: 'done' });
      });
  };

  const game: Game = {
    lesson,
    phase,
    played,
    streak,
    crashes,
    feedback,
    finaleWaiting: false,
    sceneWaiting: own?.status === 'pending' && lesson && played?.current?.id === branchOf(lesson)?.ownId ? { goal: own.goal } : null,
    skipSceneWait() {
      ownJob.current++;
      setOwn((o) => (o ? { ...o, status: 'done' } : o));
    },
    skipFinaleWait() {
      job.current++;
      setCustom('done');
    },
    guests,
    guest,
    invite(id) {
      if (!lesson || guests.includes(id) || guests.length >= MAX_GUESTS) return;
      setGuests([...guests, id]);
      if (isCameo(id) || guest) return;
      const boss = bossOf(lesson);
      setLesson({
        ...lesson,
        cast: lesson.cast.some((c) => c.id === id) ? lesson.cast : [...lesson.cast, { id }],
        rounds: lesson.rounds.map((r) => (r === boss ? { ...boss, who: id } : r)),
      });
      // 终章已经在生成 / 生成好了：按他的角度重来
      if (custom !== 'idle') {
        job.current++;
        setCustom('idle');
      }
    },
    answers,
    share,
    voiceAsk,
    answerVoice(v) {
      if (v && voiceAsk) setVoices((x) => ({ ...x, [voiceAsk.key]: v }));
      setVoiceAsk(null);
    },
    voices,
    open(l, ctx) {
      job.current++;
      ownJob.current++;
      setOwn(null);
      asked.current.clear();
      setVoices({});
      setVoiceAsk(null);
      setShare(ctx ?? null);
      setCustom('idle');
      setGuests([]);
      setLocale(l.lang, l.currency, l.goal);
      setLesson(l);
      setAnswers([]);
      setStreak(0);
      setCrashes([]);
      setFeedback(null);
      // 参谋的人不需要「AI 盲猜」那一页，直接开始把关
      setPhase(ctx?.role === 'advisor' ? 'play' : 'intro');
    },
    begin: () => setPhase('play'),
    choose(round, optionId) {
      const o = optionsOf(round).find((x) => x.id === optionId);
      if (!o) return;
      const f = commit({ round: round.id, option: optionId }, (b, a, problem) => ({
        tone: problem ? 'warn' : 'good',
        title: problem ? t('oops') : round.type === 'fix' || round.type === 'boss' ? t('fixed') : pickCheer(),
        tip: problem ? problem.q : o.tip,
        delta: a.total - b.total,
        emoji: problem ? problem.emoji : o.emoji,
        round,
      }));
      if (f?.tone === 'good') (round.type === 'fix' || round.type === 'boss' ? sfx.fix : sfx.good)();
    },
    setValue(round, value) {
      sfx.good();
      commit({ round: round.id, value }, (b, a) => ({
        tone: 'good',
        title: t('gotIt'),
        tip: a.budget !== null && a.total > a.budget ? t('over', { x: money(a.total - a.budget) }) : undefined,
        delta: a.total - b.total,
        round,
      }));
    },
    talk(round, replies) {
      const a: Answer = round.type === 'map' ? { round: round.id, map: replies as Record<string, Replies> } : { round: round.id, talk: replies as Replies };
      const f = commit(a, (b, after, problem) => {
        const learned = after.facts.length - b.facts.length;
        const said = after.quotes.length - b.quotes.length;
        return {
          tone: problem ? 'warn' : 'good',
          title: problem ? t('oops') : t('gotIt'),
          tip: problem ? problem.q : said ? t('saidN', { n: said }) : learned ? t('learnedN', { n: learned }) : undefined,
          delta: after.total - b.total,
          emoji: problem ? problem.emoji : said ? '💬' : '📝',
          round,
        };
      });
      if (f?.tone === 'good') sfx.good();
      if (lesson && round.type === 'talk') ownRoute(lesson, round, replies as Replies);
    },
    chain(round, picks, accepted) {
      const f = commit({ round: round.id, chain: { picks, accepted } }, (b, a, problem) => ({
        tone: problem ? 'warn' : accepted ? 'risk' : 'good',
        title: problem ? t('oops') : accepted ? t('chainAccepted') : pickCheer(),
        tip: problem ? problem.q : undefined,
        delta: a.total - b.total,
        emoji: problem ? problem.emoji : accepted ? '⚖️' : '🏆',
        round,
      }));
      if (f?.tone === 'good') sfx.good();
    },
    sort(round, bins) {
      const f = commit({ round: round.id, sort: bins }, (b, a, problem) => ({
        tone: problem ? 'warn' : 'good',
        title: problem ? t('oops') : t('gotIt'),
        tip: problem ? problem.q : undefined,
        delta: a.total - b.total,
        emoji: problem ? problem.emoji : '🗂️',
        round,
      }));
      if (f?.tone === 'good') sfx.good();
    },
    place(round, spots) {
      const f = commit({ round: round.id, place: spots }, (b, a, problem) => ({
        tone: problem ? 'warn' : a.risks.length > b.risks.length ? 'risk' : 'good',
        title: problem ? t('oops') : t('gotIt'),
        tip: problem ? problem.q : undefined,
        delta: a.total - b.total,
        emoji: problem ? problem.emoji : '🏠',
        round,
      }));
      if (f?.tone === 'good') sfx.good();
    },
    day(round, picks) {
      const f = commit({ round: round.id, day: picks }, (b, a, problem) => ({
        tone: problem ? 'warn' : 'good',
        title: problem ? t('oops') : pickCheer(),
        tip: problem ? problem.q : undefined,
        delta: a.total - b.total,
        emoji: problem ? problem.emoji : '🌙',
        round,
      }));
      if (f?.tone === 'good') sfx.good();
    },
    finale(round, answer) {
      sfx.win();
      commit({ round: round.id, finale: answer }, (b, a) => ({
        tone: 'good',
        title: t('finaleDone'),
        tip: a.materials.length ? t('finaleBrought', { n: a.materials.filter((m) => m.state === 'have').length, m: a.materials.length }) : undefined,
        delta: a.total - b.total,
        emoji: '🧩',
        round,
      }));
    },
    gamble(round) {
      if (!lesson || !played || (round.type !== 'fix' && round.type !== 'boss') || !round.gamble) return;
      const g = round.gamble;
      if (gambleCrashes(g, played.flags)) {
        sfx.crash();
        setTimeout(() => jingle.lose(), 500);
        setStreak(0);
        setCrashes((c) => [...c, { round: round.id, msg: `${round.problem} → 「${g.label}」: ${g.crash}`, loss: g.loss }]);
        setFeedback({ tone: 'crash', title: t('crash'), tip: g.crash, delta: g.loss, emoji: '💥', round });
        return;
      }
      sfx.warn();
      commit({ round: round.id, gamble: true }, (b, a) => ({ tone: 'risk', title: t('risky'), tip: g.ok, delta: a.total - b.total, emoji: g.emoji, round }));
    },
    next() {
      const wasCrash = feedback?.tone === 'crash';
      setFeedback(null);
      if (!wasCrash && lesson && play(lesson, answers).current === null) {
        sfx.win();
        setPhase('win');
      } else sfx.whoosh();
    },
    undo() {
      setFeedback(null);
      setAnswers((a) => a.slice(0, -1));
      setPhase('play');
    },
    home() {
      // 不清空 lesson：切换动画期间旧画面还要再渲染一帧，清空会让它读到 null 而整页空白
      hush();
      setFeedback(null);
      setLocale(detectLang(), 'CNY');
      setPhase('home');
    },
  };

  return <Ctx.Provider value={game}>{children}</Ctx.Provider>;
}


