import { describe, expect, it, vi } from 'vitest';

// 模拟 iPhone 的语音列表（按字母顺序，搞怪语音排在前面）
const v = (name: string, lang: string, localService = true) => ({ name, lang, localService, voiceURI: name, default: false });
const IOS = [
  v('Albert', 'en-US'), v('Bad News', 'en-US'), v('Bahh', 'en-US'), v('Bells', 'en-US'), v('Boing', 'en-US'),
  v('Bubbles', 'en-US'), v('Cellos', 'en-US'), v('Daniel', 'en-GB'), v('Eddy (English (US))', 'en-US'), v('Fred', 'en-US'),
  v('Good News', 'en-US'), v('Jester', 'en-US'), v('Karen', 'en-AU'), v('Organ', 'en-US'), v('Samantha', 'en-US'),
  v('Superstar', 'en-US'), v('Trinoids', 'en-US'), v('Whisper', 'en-US'), v('Zarvox', 'en-US'),
  v('Tingting', 'zh-CN'), v('Li-mu', 'zh-CN'),
];
vi.stubGlobal('window', { speechSynthesis: { getVoices: () => IOS, addEventListener: () => {} } });

describe('voice selection', async () => {
  const { pickVoice } = await import('./voice');

  it('never picks novelty voices for English', () => {
    expect(pickVoice('en-US', 'f')?.name).toBe('Samantha');
    expect(pickVoice('en-US', 'm')?.name).toBe('Daniel');
  });

  it('picks gendered Chinese voices', () => {
    expect(pickVoice('zh-CN', 'f')?.name).toBe('Tingting');
    expect(pickVoice('zh-CN', 'm')?.name).toBe('Li-mu');
  });
});
