"use client";

import { Check, ImageUp, LoaderCircle, Plus, Search, Send, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useT } from "@/i18n/client";
import { apiErrorFromResponse, apiRequest, describeApiError } from "@/lib/api-client";
import { ASSET_REVIEW_STATUS, HINT_SOURCE, HINT_STATUS, REVISION_STATUS } from "@/lib/domain-constants";
import type { StudioQuestionDetail } from "@/lib/studio/questions";
import { MathText } from "../math-text";

type SearchResult = { id: string; stem: string; status: string; subject: string; grade: string; edited: boolean; revisions: number };
type Draft = {
  stem: string;
  options: Array<{ label: string; content: string }>;
  answer: string;
  correctLabels: string[];
  explanation: string;
  topicTagIds: string[];
  reason: string;
};

const LABELS = ["A", "B", "C", "D", "E"];
const revisionStatusLabels: Record<string, string> = {
  [REVISION_STATUS.DRAFT]: "待审核",
  [REVISION_STATUS.APPROVED]: "已生效",
  [REVISION_STATUS.REJECTED]: "已驳回",
  [REVISION_STATUS.SUPERSEDED]: "已被替换",
};

function draftFrom(question: StudioQuestionDetail): Draft {
  return {
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    correctLabels: question.correctLabels,
    explanation: question.explanation ?? "",
    topicTagIds: question.topicTags.map(({ id }) => id),
    reason: "",
  };
}

// Editorial overrides: an approved revision replaces the served content and is
// re-applied after every catalog import; answer-key fixes re-grade attempts.
export function QuestionEditor() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [question, setQuestion] = useState<StudioQuestionDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newHint, setNewHint] = useState("");

  const open = useCallback(async (id: string) => {
    setBusy("open"); setError(""); setMessage("");
    try {
      const detail = await apiRequest<StudioQuestionDetail>("/api/studio/questions", { query: { id } });
      setQuestion(detail);
      setDraft(draftFrom(detail));
    } catch (cause) {
      setError(describeApiError(cause, "题目加载失败。", t));
    } finally {
      setBusy("");
    }
  }, [t]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy("search"); setError("");
    try {
      setResults((await apiRequest<{ questions: SearchResult[] }>("/api/studio/questions", { query: { query } })).questions);
    } catch (cause) {
      setError(describeApiError(cause, "搜索失败。", t));
    } finally {
      setBusy("");
    }
  }

  async function run(label: string, action: () => Promise<unknown>, success: string) {
    if (!question) return;
    setBusy(label); setError(""); setMessage("");
    try {
      await action();
      setMessage(success);
      await open(question.id);
    } catch (cause) {
      setError(describeApiError(cause, "操作失败，请重试。", t));
    } finally {
      setBusy("");
    }
  }

  function updateOption(index: number, content: string) {
    setDraft((current) => current && { ...current, options: current.options.map((option, position) => position === index ? { ...option, content } : option) });
  }

  return <section aria-labelledby="question-editor-title" className="mt-8 rounded-[28px] border-2 border-ink/10 bg-white p-5 sm:p-7">
    <h2 id="question-editor-title" className="font-display text-2xl font-black">题目编辑</h2>
    <p className="mt-1 text-sm font-semibold text-muted">修订经审核生效后会覆盖题库内容，并在每次重新导入后自动重新应用；更正答案会重新判定已有作答。</p>
    <form onSubmit={search} className="mt-4 flex gap-2">
      <label className="sr-only" htmlFor="studio-question-search">题目 ID 或题干关键词</label>
      <input id="studio-question-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题目 ID 或题干关键词" className="min-h-11 flex-1 rounded-xl border-2 border-ink/10 bg-canvas/60 px-4 text-sm font-semibold outline-none focus:border-violet" />
      <button disabled={busy === "search"} className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-50">{busy === "search" ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />} 搜索</button>
    </form>
    {results ? <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">{results.map((result) => <li key={result.id}><button onClick={() => void open(result.id)} className={`w-full rounded-xl border-2 p-3 text-left text-sm ${question?.id === result.id ? "border-violet bg-[#f0edff]" : "border-ink/10 hover:border-violet/40"}`}><span className="text-xs font-black text-muted">{result.subject} · {result.grade} · {result.id}{result.edited ? " · 已编辑" : ""}</span><span className="mt-1 line-clamp-2 block font-semibold">{result.stem}</span></button></li>)}{results.length === 0 ? <li className="text-sm font-bold text-muted">没有找到匹配的题目。</li> : null}</ul> : null}

    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
    {message ? <p role="status" className="mt-4 rounded-xl bg-[#e6f8ef] px-4 py-3 text-sm font-bold text-[#247a59]">{message}</p> : null}

    {question && draft ? <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); void run("revise", () => apiRequest("/api/studio/revisions", { method: "POST", body: {
        questionId: question.id, stem: draft.stem, options: draft.options, answer: draft.answer, correctLabels: draft.correctLabels,
        explanation: draft.explanation.trim() || null, topicTagIds: draft.topicTagIds, reason: draft.reason,
      } }), "修订已提交，等待审核。"); }} className="space-y-4">
        <label className="block text-sm font-black">题干<textarea value={draft.stem} onChange={(event) => setDraft({ ...draft, stem: event.target.value })} rows={6} className="mt-1 w-full rounded-xl border-2 border-ink/10 p-3 text-sm font-medium" /></label>
        <fieldset className="space-y-2"><legend className="text-sm font-black">选项与正确答案</legend>
          {draft.options.map((option, index) => <div key={option.label} className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs font-black"><input type="checkbox" checked={draft.correctLabels.includes(option.label)} onChange={(event) => setDraft({ ...draft, correctLabels: event.target.checked ? [...draft.correctLabels, option.label] : draft.correctLabels.filter((label) => label !== option.label) })} aria-label={`${option.label} 是正确答案`} />{option.label}</label>
            <input value={option.content} onChange={(event) => updateOption(index, event.target.value)} aria-label={`选项 ${option.label}`} className="min-h-10 flex-1 rounded-lg border-2 border-ink/10 px-3 text-sm" />
            <button type="button" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, position) => position !== index).map((item, position) => ({ ...item, label: LABELS[position] })), correctLabels: [] })} aria-label={`删除选项 ${option.label}`} className="grid size-9 place-items-center rounded-lg text-muted hover:text-coral"><Trash2 size={15} /></button>
          </div>)}
          {draft.options.length < LABELS.length ? <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, { label: LABELS[draft.options.length], content: "" }] })} className="flex items-center gap-1 text-xs font-black text-violet"><Plus size={14} /> 添加选项</button> : null}
        </fieldset>
        <label className="block text-sm font-black">参考答案<input value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border-2 border-ink/10 px-3 text-sm" /></label>
        <label className="block text-sm font-black">解析<textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} rows={5} className="mt-1 w-full rounded-xl border-2 border-ink/10 p-3 text-sm font-medium" /></label>
        <fieldset><legend className="text-sm font-black">知识主题</legend><div className="mt-2 flex flex-wrap gap-2">{question.availableTopics.map((topic) => {
          const chosen = draft.topicTagIds.includes(topic.id);
          return <button type="button" key={topic.id} aria-pressed={chosen} onClick={() => setDraft({ ...draft, topicTagIds: chosen ? draft.topicTagIds.filter((id) => id !== topic.id) : [...draft.topicTagIds, topic.id] })} className={`rounded-full px-3 py-1 text-xs font-bold ${chosen ? "bg-violet text-white" : "bg-canvas text-muted"}`}>{topic.label}</button>;
        })}</div></fieldset>
        <label className="block text-sm font-black">修订原因（必填）<input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} minLength={3} required placeholder="例如：核对原卷后更正答案" className="mt-1 min-h-10 w-full rounded-lg border-2 border-ink/10 px-3 text-sm" /></label>
        <button disabled={Boolean(busy)} className="flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white disabled:opacity-50">{busy === "revise" ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} 提交修订</button>
      </form>

      <div className="space-y-5">
        <div className="rounded-2xl border-2 border-ink/10 p-4"><h3 className="text-sm font-black">预览</h3><div className="mt-2 whitespace-pre-line text-sm leading-7"><MathText>{draft.stem}</MathText></div><ol className="mt-2 space-y-1 text-sm">{draft.options.map((option) => <li key={option.label}><b>{option.label}.</b> <MathText>{option.content}</MathText>{draft.correctLabels.includes(option.label) ? " ✓" : ""}</li>)}</ol></div>

        <div className="rounded-2xl border-2 border-ink/10 p-4"><h3 className="text-sm font-black">修订记录</h3>
          {question.revisions.length ? <ol className="mt-2 space-y-2">{question.revisions.map((revision) => <li key={revision.id} className="rounded-xl bg-canvas p-3 text-xs">
            <p className="font-black">{revisionStatusLabels[revision.status] ?? revision.status} · {revision.author ?? "已删除账号"} · {new Date(revision.createdAt).toLocaleString("zh-CN")}</p>
            <p className="mt-1 font-semibold">{revision.reason}</p>
            {revision.reviewNote ? <p className="mt-1 text-muted">审核意见：{revision.reviewNote}</p> : null}
            {revision.status === REVISION_STATUS.DRAFT ? <div className="mt-2 flex gap-2">
              <button onClick={() => void run(`approve-${revision.id}`, () => apiRequest("/api/studio/revisions", { method: "PATCH", body: { revisionId: revision.id, action: "APPROVE" } }), "修订已生效。")} disabled={Boolean(busy)} className="flex items-center gap-1 rounded-lg bg-[#2c9b73] px-3 py-1.5 font-black text-white"><Check size={13} /> 批准生效</button>
              <button onClick={() => void run(`reject-${revision.id}`, () => apiRequest("/api/studio/revisions", { method: "PATCH", body: { revisionId: revision.id, action: "REJECT" } }), "修订已驳回。")} disabled={Boolean(busy)} className="flex items-center gap-1 rounded-lg bg-coral px-3 py-1.5 font-black text-white"><X size={13} /> 驳回</button>
            </div> : null}
          </li>)}</ol> : <p className="mt-2 text-xs font-bold text-muted">还没有修订。</p>}
        </div>

        <div className="rounded-2xl border-2 border-ink/10 p-4"><h3 className="text-sm font-black">提示</h3>
          <ol className="mt-2 space-y-2">{question.hints.map((hint) => <li key={hint.id} className={`rounded-xl p-3 text-xs ${hint.reviewStatus === HINT_STATUS.REJECTED ? "bg-canvas text-muted line-through" : "bg-[#f7fadf]"}`}>
            <span className="font-black">{hint.source === HINT_SOURCE.CURATED ? "编辑" : "自动"} · </span><MathText>{hint.content}</MathText>
            <button onClick={() => void run(`hint-${hint.id}`, () => apiRequest("/api/studio/hints", { method: "PATCH", body: { hintId: hint.id, reviewStatus: hint.reviewStatus === HINT_STATUS.REJECTED ? HINT_STATUS.APPROVED : HINT_STATUS.REJECTED } }), "提示状态已更新。")} className="ml-2 font-black text-violet no-underline">{hint.reviewStatus === HINT_STATUS.REJECTED ? "恢复" : "停用"}</button>
          </li>)}</ol>
          <div className="mt-2 flex gap-2"><input value={newHint} onChange={(event) => setNewHint(event.target.value)} placeholder="新增一条不泄露答案的提示" aria-label="新增提示" className="min-h-10 flex-1 rounded-lg border-2 border-ink/10 px-3 text-xs" /><button onClick={() => void run("hint-add", async () => { await apiRequest("/api/studio/hints", { method: "POST", body: { questionId: question.id, content: newHint } }); setNewHint(""); }, "提示已添加。")} disabled={newHint.trim().length < 4 || Boolean(busy)} className="rounded-lg bg-ink px-3 text-xs font-black text-white disabled:opacity-40">添加</button></div>
        </div>

        <AssetPanel question={question} busy={busy} onUpload={(form) => run("asset", () => fetch("/api/studio/assets", { method: "POST", body: form }).then(async (response) => { if (!response.ok) throw await apiErrorFromResponse(response); }), "图片已上传，批准后对学生可见。")} onReview={(assetId, reviewStatus) => run(`asset-${assetId}`, () => apiRequest("/api/studio/assets", { method: "PATCH", body: { assetId, reviewStatus } }), "图片状态已更新。")} />
      </div>
    </div> : null}
  </section>;
}

function AssetPanel({ question, busy, onUpload, onReview }: {
  question: StudioQuestionDetail;
  busy: string;
  onUpload: (form: FormData) => Promise<void>;
  onReview: (assetId: string, reviewStatus: string) => Promise<void>;
}) {
  const [role, setRole] = useState("STEM");
  const [altText, setAltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return <div className="rounded-2xl border-2 border-ink/10 p-4"><h3 className="text-sm font-black">配图</h3>
    <ul className="mt-2 space-y-2">{question.assets.map((asset) => <li key={asset.id} className="flex items-center gap-2 rounded-xl bg-canvas p-2 text-xs">
      <a href={asset.path} target="_blank" rel="noreferrer" className="font-black text-violet">{asset.role}</a>
      <span className="text-muted">{asset.reviewStatus === ASSET_REVIEW_STATUS.APPROVED ? "已对学生可见" : "待批准"}</span>
      <button onClick={() => void onReview(asset.id, asset.reviewStatus === ASSET_REVIEW_STATUS.APPROVED ? ASSET_REVIEW_STATUS.DRAFT : ASSET_REVIEW_STATUS.APPROVED)} disabled={Boolean(busy)} className="ml-auto font-black text-violet">{asset.reviewStatus === ASSET_REVIEW_STATUS.APPROVED ? "撤回" : "批准"}</button>
    </li>)}</ul>
    <div className="mt-3 grid gap-2">
      <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="图片位置" className="min-h-10 rounded-lg border-2 border-ink/10 px-2 text-xs"><option value="STEM">题干图</option>{["A", "B", "C", "D", "E"].map((label) => <option key={label} value={`OPTION_${label}`}>选项 {label} 图</option>)}</select>
      <input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="图片文字说明（无障碍必填）" aria-label="图片文字说明" className="min-h-10 rounded-lg border-2 border-ink/10 px-3 text-xs" />
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-label="选择图片文件" className="text-xs" />
      <button onClick={() => {
        if (!file) return;
        const form = new FormData();
        form.set("questionId", question.id); form.set("role", role); form.set("altText", altText); form.set("file", file);
        void onUpload(form);
      }} disabled={!file || altText.trim().length < 2 || Boolean(busy)} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink text-xs font-black text-white disabled:opacity-40"><ImageUp size={14} /> 上传图片</button>
    </div>
  </div>;
}
