import { useState } from 'react';
import { useGame } from '../game';
import { optionDelta } from '../lesson/engine';
import type { PickRound } from '../lesson/schema';
import { Btn, PriceBadge, Tile } from '../ui/kit';
import { Ask } from './Ask';
import { t } from '../i18n';

export function Pick({ round }: { round: PickRound }) {
  const g = useGame();
  const [sel, setSel] = useState<string | null>(null);
  const cart = g.played!.cart;

  return (
    <div className="flex h-full flex-col">
      <Ask emoji={round.emoji} q={round.q} />
      <div className={`grid flex-1 content-center gap-3 ${round.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {round.options.map((o) => (
          <Tile
            key={o.id}
            emoji={o.emoji}
            label={o.label}
            selected={sel === o.id}
            onClick={() => setSel(o.id)}
            size={round.options.length === 3 ? 64 : 80}
            badge={<PriceBadge delta={optionDelta(cart, o)} />}
          />
        ))}
      </div>
      <Btn disabled={!sel} onClick={() => sel && g.choose(round, sel)} className="mt-4">
        {t('confirm')}
      </Btn>
    </div>
  );
}
