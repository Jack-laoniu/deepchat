import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { sfx } from './fx/fx';
import { detectLang, money, pickCheer, setLocale, t } from './i18n';
import { gambleCrashes, optionsOf, play, revealsProblem, type Answer, type Crash, type Played, type Replies } from './lesson/engine';
import type { FixRound, Lesson, Round } from './lesson/schema';

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

interface Game {
  lesson: Lesson | null;
  phase: Phase;
  played: Played | null;
  hearts: number;
  streak: number;
  crashes: Crash[];
  feedback: Feedback | null;
  open(lesson: Lesson): void;
  begin(): void;
  choose(round: Round, optionId: string): void;
  setValue(round: Round, value: number): void;
  /** 剧情关 / 地图关整体提交 */
  talk(round: Round, replies: Replies | Record<string, Replies>): void;
  gamble(round: Round): void;
  next(): void;
  undo(): void;
  home(): void;
}

const Ctx = createContext<Game | null>(null);
export const useGame = () => useContext(Ctx)!;

const MAX_HEARTS = 3;

export function GameProvider({ children }: { children: ReactNode }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [phase, setPhase] = useState<Phase>('home');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [streak, setStreak] = useState(0);
  const [crashes, setCrashes] = useState<Crash[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const played = useMemo(() => (lesson ? play(lesson, answers) : null), [lesson, answers]);

  const commit = (a: Answer, fb: (before: Played, after: Played, problem: FixRound | null) => Feedback) => {
    if (!lesson) return;
    const after = [...answers, a];
    const pb = play(lesson, answers);
    const pa = play(lesson, after);
    const problem = revealsProblem(lesson, answers, after);
    const f = fb(pb, pa, problem);
    setAnswers(after);
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

  const game: Game = {
    lesson,
    phase,
    played,
    hearts,
    streak,
    crashes,
    feedback,
    open(l) {
      setLocale(l.lang, l.currency);
      setLesson(l);
      setAnswers([]);
      setHearts(MAX_HEARTS);
      setStreak(0);
      setCrashes([]);
      setFeedback(null);
      setPhase('intro');
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
    },
    gamble(round) {
      if (!lesson || !played || (round.type !== 'fix' && round.type !== 'boss')) return;
      const g = round.gamble;
      if (gambleCrashes(g, played.flags)) {
        sfx.crash();
        setHearts((h) => Math.max(0, h - 1));
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
      setLocale(detectLang(), 'CNY');
      setPhase('home');
      setLesson(null);
    },
  };

  return <Ctx.Provider value={game}>{children}</Ctx.Provider>;
}


