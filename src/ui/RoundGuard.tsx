import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
import type { Round } from '../lesson/schema';
import { Btn } from './kit';
import { Emoji } from './Emoji';

/**
 * 回合保护：某一关（多半是模型写出来的奇怪内容）渲染时出错，不要整页白屏——
 * 显示「这一步出了点问题」，可以跳过这一步接着玩；同时把错误和这一回合的内容报给服务器，写进日志方便排查。
 */
type Props = { round: Round; title: string; onSkip: () => void; onHome: () => void; children: ReactNode };

export class RoundGuard extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    report(error, this.props.title, this.props.round);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <Emoji e="🧩" size={84} />
        <div className="text-2xl font-black text-slate-700">{t('roundBroken')}</div>
        <div className="text-sm font-bold text-slate-400">{t('roundBrokenSub')}</div>
        <div className="max-w-full break-all rounded-xl bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-400">{error.message.slice(0, 160)}</div>
        <Btn onClick={this.props.onSkip}>{t('roundSkip')}</Btn>
        <button onClick={this.props.onHome} className="text-sm font-black text-slate-400">
          {t('roundHome')}
        </button>
      </div>
    );
  }
}

/** 整个应用的最后一道保护（开场、结算页等不在回合里的地方出错）：不白屏，给个「重新开始」 */
export class AppGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    report(error, document.title, null);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Emoji e="🧩" size={84} />
        <div className="text-2xl font-black text-slate-700">{t('roundBroken')}</div>
        <div className="max-w-full break-all rounded-xl bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-400">{error.message.slice(0, 160)}</div>
        <Btn onClick={() => location.reload()}>{t('roundHome')}</Btn>
      </div>
    );
  }
}

/**
 * 弹层 / 面板的保护（聊天、讨论）：出错不白屏，显示错误和「关闭」，同时报给服务器。
 * 有 onClose 时铺满屏幕（弹层），否则在原地显示一张小卡片。
 */
export class PanelGuard extends Component<{ name: string; onClose?: () => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    report(error, `panel:${this.props.name}`, null);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { onClose } = this.props;
    return (
      <div className={onClose ? 'fixed inset-0 z-50 mx-auto flex max-w-md flex-col items-center justify-center gap-3 bg-white px-6 text-center' : 'mt-4 flex flex-col items-center gap-2 rounded-3xl bg-slate-50 p-4 text-center'}>
        <Emoji e="🧩" size={onClose ? 72 : 40} />
        <div className="text-lg font-black text-slate-700">{t('roundBroken')}</div>
        <div className="max-w-full break-all rounded-xl bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-400">{error.message.slice(0, 160)}</div>
        {onClose && <Btn onClick={onClose}>{t('friendClose')}</Btn>}
      </div>
    );
  }
}

/** 报给服务器（网页版才有；嵌在 ChatGPT / Claude 里没有服务器就算了） */
function report(error: Error, title: string, round: Round | null) {
  try {
    void fetch('/api/clientlog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: error.message, stack: (error.stack ?? '').slice(0, 2000), title, round: round ? JSON.stringify(round).slice(0, 20000) : '' }),
    }).catch(() => {});
  } catch {
    /* 没有网络也无所谓 */
  }
}
