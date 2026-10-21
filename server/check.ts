import { loadConfig } from './config';
import { chatFromConfig, generateLesson, UpstreamError } from './generate';
import { ttsFromConfig } from './tts';

/**
 * 在服务器上直接测试模型接口（不经过网页）：
 *   node server.mjs --check            → 发一句话，看接口通不通、多久回
 *   node server.mjs --check 我想养只猫   → 完整生成一关，打印每一轮的校验结果和耗时
 */
export async function check(need: string) {
  const { config, error, fromFile } = loadConfig();
  console.log(`配置：${fromFile ? '配置文件' : '环境变量'}${error ? `（${error}）` : ''}`);
  const model = chatFromConfig(config);
  if (!model) return fail('没有可用的模型配置（key / model 没填？）');
  console.log(`模型：${model.label}`);

  let t = Date.now();
  try {
    const r = await model.start('Reply with exactly: OK').send('ping');
    if ('refused' in r) return fail('模型拒绝回答');
    console.log(`✅ 接口通了，${((Date.now() - t) / 1000).toFixed(1)} 秒，回复：${JSON.stringify(r.text.slice(0, 80))}`);
    if (!r.text.trim()) console.log('⚠️ 回复是空的：这个接口可能不支持流式输出，或者模型把内容放在别的字段里');
  } catch (e) {
    return fail(e instanceof UpstreamError ? `接口报错 ${e.message}` : `连不上：${(e as Error).message}`);
  }

  const tts = ttsFromConfig(config);
  if (tts) {
    t = Date.now();
    try {
      const mp3 = await tts('你好', 'f');
      console.log(`✅ 服务器朗读可用，${((Date.now() - t) / 1000).toFixed(1)} 秒，${mp3.length} 字节`);
    } catch (e) {
      console.log(`❌ 服务器朗读失败：${(e as Error).message}`);
    }
  }

  if (!need) return console.log('想测完整生成：在 --check 后面加一句需求');
  t = Date.now();
  console.log(`开始生成：${need}（一般 30~120 秒）`);
  try {
    const r = await generateLesson(model.start, need, /[\u4e00-\u9fff]/.test(need) ? 'zh' : 'en');
    const s = ((Date.now() - t) / 1000).toFixed(0);
    if (r.ok) console.log(`✅ 生成成功，${s} 秒：「${r.lesson.title}」，${r.lesson.rounds.length} 关`);
    else fail(`生成失败（${r.error}），${s} 秒；上面有每一轮的校验错误`);
  } catch (e) {
    fail(e instanceof UpstreamError ? `生成时接口报错 ${e.message}` : `生成时出错：${(e as Error).message}`);
  }
}

function fail(msg: string) {
  console.log(`❌ ${msg}`);
  process.exitCode = 1;
}
