import { RotateCcw, Trophy } from "lucide-react";

export function SessionProgress({ completed, goal, disabled, onRestart }: {
  completed: number;
  goal: number;
  disabled: boolean;
  onRestart: () => void;
}) {
  const shown = Math.min(completed, goal);
  return (
    <div className="mt-4 flex items-center gap-3">
      <div role="progressbar" aria-label={`${goal} 题挑战进度`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={shown} className="h-3 flex-1 overflow-hidden rounded-full border border-ink/10 bg-white">
        <div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min((completed / goal) * 100, 100)}%` }} />
      </div>
      <span className="text-xs font-black text-muted">{completed} / {goal}</span>
      <button onClick={onRestart} disabled={disabled} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-black text-muted hover:bg-white hover:text-violet disabled:opacity-40" title="保留答题记录并重新开始本轮"><RotateCcw size={14} /> 重开</button>
    </div>
  );
}

export function RoundComplete({ goal, correct }: { goal: number; correct: number }) {
  return (
    <div role="status" className="reward-pop mt-7 rounded-[26px] border-2 border-ink bg-lime p-6 text-center shadow-[0_7px_0_#242136]">
      <Trophy className="mx-auto text-violet" size={38} />
      <h2 className="mt-2 font-display text-2xl font-black">{goal} 题挑战完成！</h2>
      <p className="mt-1 text-sm font-bold text-ink/65">本轮答对 {correct} 题。休息一下，或者继续探索。</p>
    </div>
  );
}
