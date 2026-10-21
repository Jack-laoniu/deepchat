import { Character, MOODS, type Act } from './Character';
import { CHARACTERS, ME } from './library';

/** 开发用：打开 #gallery 查看所有角色、表情和动作 */
export function Gallery() {
  const acts: Act[] = ['idle', 'walk', 'wave', 'jump'];
  return (
    <div className="space-y-6 bg-white p-4">
      <div className="flex flex-wrap items-end gap-2">
        {[...CHARACTERS, ME].map((c) => (
          <div key={c.id} className="flex flex-col items-center">
            <Character id={c.id} size={110} />
            <span className="text-xs font-black text-slate-600">{c.name.zh}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <div key={m} className="flex flex-col items-center">
            <Character id="lele" size={80} bust mood={m} />
            <span className="text-xs text-slate-500">{m}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {acts.map((a) => (
          <div key={a} className="flex flex-col items-center">
            <Character id="wang" size={90} act={a} />
            <span className="text-xs text-slate-500">{a}</span>
          </div>
        ))}
        <div className="flex flex-col items-center">
          <Character id="qian" size={90} talking mood="smug" />
          <span className="text-xs text-slate-500">talking</span>
        </div>
      </div>
    </div>
  );
}
