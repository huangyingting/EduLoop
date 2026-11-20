import { RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useT } from "@/i18n/client";

export function SessionProgress({ completed, goal, disabled, onRestart }: {
  completed: number;
  goal: number;
  disabled: boolean;
  onRestart: () => void;
}) {
  const t = useT();
  const shown = Math.min(completed, goal);
  return (
    <div className="mt-4 flex items-center gap-3">
      <div role="progressbar" aria-label={t("practice.progress.label", { goal })} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={shown} className="h-3 flex-1 overflow-hidden rounded-full border border-ink/10 bg-white">
        <div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.min((completed / goal) * 100, 100)}%` }} />
      </div>
      <span className="text-xs font-black text-muted">{completed} / {goal}</span>
      <button onClick={onRestart} disabled={disabled} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-black text-muted hover:bg-white hover:text-violet disabled:opacity-40" title={t("practice.progress.restartTitle")}><RotateCcw size={14} /> {t("practice.progress.restart")}</button>
    </div>
  );
}

export function RoundComplete({ goal, correct, isAuthenticated }: { goal: number; correct: number; isAuthenticated: boolean }) {
  const t = useT();
  return (
    <div role="status" className="reward-pop mt-7 rounded-[26px] border-2 border-ink bg-lime p-6 text-center shadow-[0_7px_0_#242136]">
      <Trophy className="mx-auto text-violet" size={38} />
      <h2 className="mt-2 font-display text-2xl font-black">{t("practice.progress.completeTitle", { goal })}</h2>
      <p className="mt-1 text-sm font-bold text-ink/65">{t("practice.progress.completeBody", { correct })}</p>
      {isAuthenticated ? null : <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm font-bold text-ink">
        <p>{t("practice.progress.guestBody")}</p>
        <Link href="/register?next=%2Fpractice" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">{t("practice.progress.guestCta")}</Link>
      </div>}
    </div>
  );
}
