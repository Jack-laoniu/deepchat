import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { isMuted, setMuted } from './fx/fx';
import { GameProvider, useGame } from './game';
import { hostLesson } from './host';
import { optionsOf } from './lesson/engine';
import { asksOf, parseLesson } from './lesson/schema';
import { Home } from './screens/Home';
import { Intro } from './screens/Intro';
import { Play } from './screens/Play';
import { Win } from './screens/Win';
import { preload } from './ui/Emoji';

function Screens() {
  const g = useGame();

  // 商店宿主里：模型已经通过工具调用把关卡传进来了，直接开局
  useEffect(() => {
    const data = hostLesson();
    if (!data) return;
    const r = parseLesson(data);
    if (r.ok) g.open(r.lesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 开局就把整关会用到的动画表情拉下来，避免玩的时候闪
  useEffect(() => {
    if (!g.lesson) return;
    const l = g.lesson;
    preload([
      '🦊', '🔥', '✨', '💥', '🙂', '🧑', '🎙️', l.emoji,
      ...l.cast.map((c) => c.emoji),
      ...l.rounds.flatMap((r) => [...asksOf(r).flatMap((a) => a.options.map((o) => o.emoji)), ...(r.type === 'map' ? r.spots.map((s) => s.emoji) : [])]),
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
        <Screens />
        <button
          onClick={() => {
            setMuted(!muted);
            setM(!muted);
          }}
          className="absolute bottom-2 right-3 z-10 text-lg opacity-40 hover:opacity-80"
          aria-label="声音开关"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </GameProvider>
  );
}
