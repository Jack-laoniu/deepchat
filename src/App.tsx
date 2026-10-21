import { AnimatePresence, motion } from 'framer-motion';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { isMuted, setMuted } from './fx/fx';
import { GameProvider, useGame } from './game';
import { onHostLesson } from './host';
import { optionsOf } from './lesson/engine';
import { asksOf, parseLesson } from './lesson/schema';
import { Home } from './screens/Home';
import { Intro } from './screens/Intro';
import { Play } from './screens/Play';
import { Win } from './screens/Win';
import { preload } from './ui/Emoji';

/** 兜底：任何画面出错都回到首页，而不是整页空白 */
class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  fails = 0;
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error(e);
    if (++this.fails > 3) return; // 回首页也一直出错就别死循环了
    this.props.onError();
    this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SafeScreens() {
  const g = useGame();
  return (
    <Boundary onError={g.home}>
      <Screens />
    </Boundary>
  );
}

function Screens() {
  const g = useGame();

  // 商店宿主里：模型已经通过工具调用把关卡传进来了，直接开局
  useEffect(
    () =>
      onHostLesson((data) => {
        const r = parseLesson(data);
        if (r.ok) g.open(r.lesson);
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 开局就把整关会用到的动画表情拉下来，避免玩的时候闪
  useEffect(() => {
    if (!g.lesson) return;
    const l = g.lesson;
    preload([
      '🔥', '✨', '💥', '🎙️', l.emoji,
      ...l.rounds.flatMap((r) => [...asksOf(r).flatMap((a) => a.options.map((o) => o.emoji)), ...(r.type === 'map' ? r.spots.map((s) => s.emoji) : [])]),
      ...l.rounds.flatMap((r) =>
        r.type === 'chain' ? r.cards.flatMap((c) => [c.emoji, c.left.emoji, c.right.emoji]) :
        r.type === 'sort' ? [...r.cards.map((c) => c.emoji), ...r.bins.map((b) => b.emoji)] :
        r.type === 'place' ? [...r.things.map((x) => x.emoji), ...r.zones.map((z) => z.emoji)] :
        r.type === 'day' ? r.moments.flatMap((m) => [m.emoji, ...m.options.map((o) => o.emoji)]) : [],
      ),
      '💰', '😌', '🎯', '🛡️', '👆', '🌅', '☀️', '🌇', '🌙',
      ...l.guess.items.map((i) => i.emoji),
      ...l.rounds.flatMap((r) => [r.emoji, ...optionsOf(r).flatMap((o) => [o.emoji, ...o.add.map((i) => i.emoji)])]),
    ]);
  }, [g.lesson]);

  const screen = { home: <Home />, intro: <Intro />, play: <Play />, win: <Win /> }[g.phase];
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={g.phase + (g.lesson?.title ?? '')}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        {screen}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [muted, setM] = useState(isMuted());
  return (
    <GameProvider>
      <div className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-white">
        <SafeScreens />
        <button
          onClick={() => {
            setMuted(!muted);
            setM(!muted);
          }}
          className="absolute bottom-2 right-3 z-10 text-lg opacity-40 hover:opacity-80"
          aria-label="sound"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </GameProvider>
  );
}
