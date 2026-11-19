import { Check, Flag, Lightbulb, LoaderCircle, RotateCcw, Send, Sparkles, Trophy, X } from "lucide-react";
import Image from "next/image";
import type { AttemptResult, QuestionPayload } from "@/lib/contracts/practice";
import { QUESTION_TYPE, REPORT_CATEGORIES } from "@/lib/domain-constants";
import { CustomSelect } from "../custom-select";
import { MathText } from "../math-text";
import type { PracticeState } from "./practice-machine";

const REPORT_CATEGORY_LABELS: Record<(typeof REPORT_CATEGORIES)[number], string> = {
  WRONG_ANSWER: "答案或解析有误",
  MISSING_FIGURE: "缺少图片或图表",
  UNCLEAR: "题意不清楚",
  FORMATTING: "公式或排版问题",
  OTHER: "其他问题",
};
const reportCategoryOptions = REPORT_CATEGORIES.map((value) => ({ value, label: REPORT_CATEGORY_LABELS[value] }));

export function HintPanel({ hint, onReveal }: { hint: PracticeState["hint"]; onReveal: () => void }) {
  return <div className="mt-6">
    {hint.text
      ? <div aria-live="polite" className="border-l-4 border-lime bg-[#f7fadf] px-4 py-3 text-sm"><p className="flex items-center gap-2 font-black"><Lightbulb size={17} /> 解题提示</p><div className="mt-2 whitespace-pre-line font-medium leading-6 text-ink/75"><MathText>{hint.text}</MathText></div></div>
      : <button onClick={onReveal} disabled={hint.loading} aria-keyshortcuts="H" className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink/10 bg-canvas px-4 text-sm font-black text-muted transition hover:border-lime hover:text-ink disabled:opacity-50">{hint.loading ? <LoaderCircle className="animate-spin" size={17} /> : <Lightbulb size={17} />} 查看提示</button>}
    {hint.error ? <p role="alert" className="mt-2 text-sm font-bold text-coral">{hint.error}</p> : null}
  </div>;
}

export function AnswerOptions({ question, selected, result, disabled, onToggle }: {
  question: QuestionPayload;
  selected: string[];
  result: AttemptResult | null;
  disabled: boolean;
  onToggle: (label: string) => void;
}) {
  const hasOptionAssets = question.options.some((option) => option.asset);
  return <div role="group" aria-label={question.type === QUESTION_TYPE.MULTIPLE_CHOICE ? "可多选的答案选项" : "答案选项"} className={`mt-7 grid gap-3 ${hasOptionAssets ? "sm:grid-cols-2" : ""}`}>{question.options.map((option, optionIndex) => {
    const chosen = selected.includes(option.label);
    const expected = result?.correctLabels.includes(option.label);
    const wrong = result?.isCorrect === false && chosen && !expected;
    return <button key={option.label} onClick={() => onToggle(option.label)} disabled={disabled} aria-pressed={chosen} aria-keyshortcuts={String(optionIndex + 1)} className={`flex w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition ${expected ? "border-[#2c9b73] bg-[#e6f8ef]" : wrong ? "border-coral bg-[#fff0ed]" : chosen ? "border-violet bg-[#f0edff] shadow-[0_4px_0_#c9c1f7]" : "border-ink/10 bg-[#fbfaf7] hover:border-violet/45 hover:bg-white"}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black ${expected ? "bg-[#2c9b73] text-white" : wrong ? "bg-coral text-white" : chosen ? "bg-violet text-white" : "border-2 border-ink/10 bg-white"}`}>{expected ? <Check size={17} /> : wrong ? <X size={17} /> : option.label}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-2 whitespace-pre-line pt-1 text-[15px] font-semibold leading-6">
        {option.asset ? <Image src={option.asset.path} alt={option.asset.altText} width={240} height={150} className="h-auto w-full max-w-60 self-center rounded-xl" /> : null}
        {option.content ? <MathText>{option.content}</MathText> : null}
      </span>
    </button>;
  })}</div>;
}

export function WrittenAnswer({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <>
    <label htmlFor="written-answer" className="sr-only">写下你的思路或答案</label>
    <textarea id="written-answer" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="写下你的思路或答案…" className="mt-7 min-h-32 w-full resize-y rounded-2xl border-2 border-ink/10 bg-[#fbfaf7] p-4 text-[15px] font-medium leading-6 outline-none transition focus:border-violet focus:bg-white" />
  </>;
}

export function ResultPanel({ result, combo, isAuthenticated, assessing, panelRef, explanationRef, onExplanationOpened, onAssess }: {
  result: AttemptResult;
  combo: number;
  isAuthenticated: boolean;
  assessing: boolean;
  panelRef: React.Ref<HTMLDivElement>;
  explanationRef: React.Ref<HTMLDetailsElement>;
  onExplanationOpened: () => void;
  onAssess: (isCorrect: boolean) => void;
}) {
  const tone = result.isCorrect ? "border-[#2c9b73]/30 bg-[#e6f8ef]" : result.isCorrect === false ? "border-coral/30 bg-[#fff0ed]" : "border-violet/25 bg-[#f0edff]";
  const badge = result.isCorrect ? "bg-[#2c9b73]" : result.isCorrect === false ? "bg-coral" : "bg-violet";
  const heading = result.isCorrect ? `答对了，连胜 ${combo}！` : result.isCorrect === false ? "差一点，找到新线索了" : "对照答案，检查你的思路";
  return <div ref={panelRef} role="status" aria-live="polite" tabIndex={-1} className={`reward-pop mt-7 rounded-[22px] border-2 p-5 outline-none ${tone}`}>
    <div className="flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${badge}`}>{result.isCorrect ? <Check /> : result.isCorrect === false ? <X /> : <Sparkles />}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-lg font-black">{heading}</h3>{isAuthenticated ? <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-black text-lime">+{result.earnedXp} XP</span> : null}</div>
        {result.answer && <div className="mt-3 text-sm font-semibold leading-6"><span className="font-black">参考答案：</span><MathText>{result.answer}</MathText></div>}
        {result.explanation && <details ref={explanationRef} onToggle={(event) => { if (event.currentTarget.open) onExplanationOpened(); }} className="mt-3 text-sm"><summary className="font-black text-violet">展开解析</summary><div className="mt-2 whitespace-pre-line font-medium leading-6 text-ink/75"><MathText>{result.explanation}</MathText></div></details>}
      </div>
    </div>
    {isAuthenticated ? result.newBadges.map((badgeEarned) => <div key={badgeEarned.name} className="mt-4 flex items-center gap-2 rounded-xl bg-white/80 p-3 text-sm font-black"><Trophy size={18} className="text-coral" /> 新徽章：{badgeEarned.icon} {badgeEarned.name}</div>) : null}
    {isAuthenticated && result.streakFreezeUsed ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#eaf8ff] p-3 text-sm font-black text-ink">🛡️ 连续练习保护已生效，昨天的空档没有中断记录。还剩 {result.streakFreezes} 枚保护盾。</div> : null}
    {result.isCorrect === null ? <div className="mt-5 border-t border-violet/15 pt-4"><p className="text-sm font-black">对照参考答案后，你的思路正确吗？</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => onAssess(true)} disabled={assessing} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#2c9b73] px-4 text-sm font-black text-white"><Check size={17} /> 思路正确</button><button onClick={() => onAssess(false)} disabled={assessing} className="flex min-h-11 items-center gap-2 rounded-xl bg-coral px-4 text-sm font-black text-white"><RotateCcw size={16} /> 还需练习</button></div></div> : null}
  </div>;
}

export function ReportForm({ report, onToggle, onChange, onSubmit }: {
  report: PracticeState["report"];
  onToggle: () => void;
  onChange: (change: { category?: string; detail?: string }) => void;
  onSubmit: () => void;
}) {
  return <div className="mt-6 border-t border-dashed border-ink/10 pt-4">
    {report.submitted
      ? <p role="status" className="flex items-center gap-2 text-xs font-bold text-[#2c9b73]"><Check size={15} /> 已收到反馈，谢谢你帮助改进题目。</p>
      : <button onClick={onToggle} aria-expanded={report.open} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-muted hover:bg-canvas hover:text-coral"><Flag size={15} /> 这道题有问题</button>}
    {report.open && !report.submitted ? <div className="mt-3 rounded-2xl border-2 border-ink/10 bg-canvas p-4">
      <p className="text-sm font-black">告诉我们哪里需要改进</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]">
        <CustomSelect label="问题类型" value={report.category} options={reportCategoryOptions} onValueChange={(category) => onChange({ category })} className="w-full" />
        <input value={report.detail} onChange={(event) => onChange({ detail: event.target.value })} maxLength={1000} placeholder="可选：补充具体情况" className="min-h-11 rounded-xl border-2 border-ink/10 bg-white px-3 text-sm font-medium outline-none focus:border-violet" />
      </div>
      <div className="mt-3 flex justify-end"><button onClick={onSubmit} disabled={report.submitting} className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-50">{report.submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} 提交反馈</button></div>
    </div> : null}
  </div>;
}
