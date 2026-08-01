"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileWarning, LoaderCircle, RotateCcw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { hasRecentAuthentication, SENSITIVE_ACTION_MAX_AGE_SECONDS } from "@/lib/auth-validation";
import { useAuth } from "@/lib/use-auth";
import { isContentOperator } from "@/lib/user-roles";
import { MathText } from "./math-text";
import { LearningHealthPanel } from "./learning-health-panel";

type ReviewAction = {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  actor: { displayName: string | null; email: string } | null;
};

type Report = {
  id: string;
  questionId: string;
  category: string;
  detail: string | null;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  reporterErasedAt: string | null;
  question: {
    stem: string;
    answer: string;
    explanation: string | null;
    importStatus: string;
    status: string;
    quarantinedAt: string | null;
    sourceFile: string;
    sourceId: string;
    sourceType: string;
    subject: { name: string };
    grade: { name: string };
    options: Array<{ label: string; content: string }>;
    assets: Array<{ role: string; path: string; altText: string; reviewStatus: string }>;
  };
  reviewActions: ReviewAction[];
};

type StudioResponse = {
  reports: Report[];
  counts: { open: number; resolved: number };
  pagination: { page: number; limit: number; total: number; pages: number };
};

const categoryLabels: Record<string, string> = {
  WRONG_ANSWER: "答案疑似错误",
  MISSING_FIGURE: "图片或图形缺失",
  UNCLEAR: "题意不清",
  FORMATTING: "排版问题",
  OTHER: "其他问题",
};

const actionLabels: Record<string, string> = {
  QUARANTINE: "已隔离题目",
  RESOLVE: "已解决报告",
  REOPEN: "重新打开报告",
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ContentStudio() {
  const auth = useAuth();
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudioResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [authenticationCheckAt, setAuthenticationCheckAt] = useState(
    () => Math.floor(Date.now() / 1000),
  );
  const authenticatedAt = auth.user?.authenticatedAt ?? 0;
  const hasRecentLogin = auth.status === "authenticated"
    && hasRecentAuthentication(authenticatedAt, authenticationCheckAt);

  const load = useCallback(async () => {
    if (!isContentOperator(auth.user) || !hasRecentLogin) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/studio/reports?status=${status}&page=${page}&limit=20`, { cache: "no-store" });
      const body = await response.json() as StudioResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "审核队列加载失败。");
      if (page > body.pagination.pages) {
        setPage(body.pagination.pages);
        return;
      }
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "审核队列加载失败。");
    } finally {
      setLoading(false);
    }
  }, [auth.user, hasRecentLogin, page, status]);

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const currentTimeUpdate = window.setTimeout(() => {
      setAuthenticationCheckAt(Math.floor(Date.now() / 1000));
    }, 0);
    if (auth.status !== "authenticated" || !hasRecentAuthentication(authenticatedAt, now)) {
      return () => window.clearTimeout(currentTimeUpdate);
    }

    const expiresAt = authenticatedAt + SENSITIVE_ACTION_MAX_AGE_SECONDS + 1;
    const expirationUpdate = window.setTimeout(() => {
      setAuthenticationCheckAt(Math.floor(Date.now() / 1000));
    }, Math.max(0, expiresAt * 1000 - Date.now()));
    return () => {
      window.clearTimeout(currentTimeUpdate);
      window.clearTimeout(expirationUpdate);
    };
  }, [auth.status, authenticatedAt]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function applyAction(report: Report, action: "QUARANTINE" | "RESOLVE" | "REOPEN") {
    if (!hasRecentLogin) return;
    const note = notes[report.id]?.trim() || "";
    if (action === "RESOLVE" && note.length < 3) {
      setError("解决报告前，请填写至少 3 个字符的审核结论。");
      return;
    }
    if (action === "QUARANTINE" && !window.confirm("确认立即隔离这道题？学生将无法继续抽到它。")) return;
    setActing(`${report.id}:${action}`);
    setError("");
    try {
      const response = await fetch("/api/studio/reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id, action, note: note || undefined }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "审核操作失败。");
      setNotes((current) => ({ ...current, [report.id]: "" }));
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "审核操作失败。");
    } finally {
      setActing(null);
    }
  }

  function navigateTabs(event: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextStatus = event.key === "ArrowLeft" || event.key === "Home" ? "OPEN" : "RESOLVED";
    setStatus(nextStatus);
    setPage(1);
    window.requestAnimationFrame(() => document.getElementById(`studio-${nextStatus.toLowerCase()}-tab`)?.focus());
  }

  async function reauthenticate() {
    try {
      await auth.logout();
    } finally {
      window.location.assign("/login?next=%2Fstudio");
    }
  }

  if (auth.status === "loading") {
    return <Loading label="正在确认审核权限…" />;
  }
  if (auth.status === "guest") {
    return <AccessMessage title="请先登录" detail="内容审核台只对授权的内容编辑开放。"><Link href="/login?next=%2Fstudio" className="mt-5 inline-flex rounded-xl bg-violet px-5 py-3 text-sm font-black text-white">登录账号</Link></AccessMessage>;
  }
  if (!isContentOperator(auth.user)) {
    return <AccessMessage title="没有审核权限" detail="你的学习账号没有内容编辑角色。如需权限，请联系系统管理员。" />;
  }
  if (!hasRecentLogin) {
    return <AccessMessage title="重新验证审核账号" detail="完整答案、学习指标和题目状态变更只在登录验证后的 10 分钟内开放。"><button type="button" onClick={() => void reauthenticate()} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-violet px-5 py-3 text-sm font-black text-white">重新登录验证</button></AccessMessage>;
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
      <header className="rounded-[32px] border-2 border-ink bg-[#fff7dc] p-6 shadow-[0_8px_0_#242136] sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-coral">Content review</p><h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">内容审核台</h1><p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">核对学生报告与完整题目上下文。无法立即确认的题目先隔离；修复源数据并验证后，再记录审核结论。</p></div>
          <div className="rounded-2xl border-2 border-ink/10 bg-white px-5 py-4 text-sm font-black"><span className="text-coral">{data?.counts.open ?? "—"}</span> 条待处理</div>
        </div>
      </header>

      <LearningHealthPanel />

      <div role="tablist" aria-label="报告状态" onKeyDown={navigateTabs} className="mt-8 flex max-w-md gap-2 rounded-2xl border-2 border-ink/10 bg-white p-1.5">
        {(["OPEN", "RESOLVED"] as const).map((value) => <button key={value} id={`studio-${value.toLowerCase()}-tab`} role="tab" aria-selected={status === value} aria-controls="studio-report-panel" tabIndex={status === value ? 0 : -1} onClick={() => { setStatus(value); setPage(1); }} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${status === value ? "bg-ink text-white" : "text-muted"}`}>{value === "OPEN" ? <FileWarning size={17} /> : <CheckCircle2 size={17} />}{value === "OPEN" ? `待处理 ${data?.counts.open ?? ""}` : `已解决 ${data?.counts.resolved ?? ""}`}</button>)}
      </div>

      {error ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-4 text-sm font-bold text-coral"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><span>{error}</span><button onClick={() => void load()} className="ml-auto shrink-0 underline">重试</button></div> : null}
      {loading && !data ? <Loading label="正在整理报告…" /> : null}
      {!loading && data?.reports.length === 0 ? <div className="mt-8 rounded-[28px] border-2 border-dashed border-ink/15 bg-white p-12 text-center"><CheckCircle2 className="mx-auto text-[#2c9b73]" size={42} /><h2 className="mt-4 text-xl font-black">这里已经清空</h2><p className="mt-2 text-sm font-semibold text-muted">当前状态下没有题目报告。</p></div> : null}

      <div id="studio-report-panel" role="tabpanel" aria-labelledby={`studio-${status.toLowerCase()}-tab`} className={`mt-6 space-y-6 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {data?.reports.map((report) => <article key={report.id} className="overflow-hidden rounded-[28px] border-2 border-ink/10 bg-white shadow-[0_6px_0_#e3dfd4]">
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink/10 bg-canvas px-5 py-4 text-xs font-black text-muted sm:px-7"><span className="rounded-full bg-coral/10 px-3 py-1 text-coral">{categoryLabels[report.category] ?? report.category}</span><span>{report.question.subject.name} · {report.question.grade.name}</span><span>·</span><span>{displayDate(report.createdAt)}</span><span className={`ml-auto rounded-full px-3 py-1 ${report.question.status === "PUBLISHED" ? "bg-[#e6f8ef] text-[#247a59]" : "bg-[#fff0ed] text-coral"}`}>{report.question.status === "PUBLISHED" ? "学生可见" : "已隔离"}</span></div>
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="min-w-0">
              {report.detail ? <div className="mb-5 rounded-2xl border-2 border-coral/20 bg-[#fff7f4] p-4"><p className="text-xs font-black text-coral">学生补充</p><p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6">{report.detail}</p></div> : report.reporterErasedAt ? <div className="mb-5 rounded-2xl border-2 border-ink/10 bg-canvas p-4 text-sm font-semibold leading-6 text-muted">报告人已删除学习数据；身份关联和自由文本已清除，分类与审核记录继续保留。</div> : null}
              <p className="whitespace-pre-wrap text-base font-bold leading-8"><MathText>{report.question.stem}</MathText></p>
              {report.question.options.length ? <ol className="mt-4 grid gap-2 sm:grid-cols-2">{report.question.options.map((option) => <li key={option.label} className="rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-semibold"><span className="mr-2 font-black text-violet">{option.label}</span><MathText>{option.content}</MathText></li>)}</ol> : null}
              <details className="mt-5 rounded-2xl border-2 border-ink/10 p-4"><summary className="cursor-pointer text-sm font-black">查看答案与解析</summary><div className="mt-3 space-y-3 text-sm font-semibold leading-6"><p><span className="font-black">答案：</span><MathText>{report.question.answer}</MathText></p><p><span className="font-black">解析：</span><MathText>{report.question.explanation || "暂无解析"}</MathText></p></div></details>
              {report.question.assets.length ? <div className="mt-4 flex flex-wrap gap-2">{report.question.assets.map((asset) => <a key={asset.role} href={asset.path} target="_blank" rel="noreferrer" className="rounded-lg bg-[#f0edff] px-3 py-2 text-xs font-black text-violet">{asset.role} · {asset.reviewStatus}</a>)}</div> : null}
            </div>
            <aside className="rounded-2xl border-2 border-ink/10 bg-canvas p-4">
              <h2 className="text-sm font-black">审核操作</h2>
              <textarea value={notes[report.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={500} rows={4} placeholder="记录核对来源、判断或修复说明（解决时必填）" className="mt-3 w-full resize-y rounded-xl border-2 border-ink/10 bg-white p-3 text-sm font-medium outline-none focus:border-violet" />
              <div className="mt-3 grid gap-2">
                {report.status === "OPEN" ? <>
                  <button onClick={() => void applyAction(report, "RESOLVE")} disabled={Boolean(acting)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2c9b73] px-4 text-sm font-black text-white disabled:opacity-50">{acting === `${report.id}:RESOLVE` ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} 记录为已解决</button>
                  {report.question.status === "PUBLISHED" ? <button onClick={() => void applyAction(report, "QUARANTINE")} disabled={Boolean(acting)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-coral/30 bg-white px-4 text-sm font-black text-coral disabled:opacity-50">{acting === `${report.id}:QUARANTINE` ? <LoaderCircle className="animate-spin" size={16} /> : <ShieldAlert size={16} />} 立即隔离题目</button> : null}
                </> : <button onClick={() => void applyAction(report, "REOPEN")} disabled={Boolean(acting)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white disabled:opacity-50">{acting === `${report.id}:REOPEN` ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />} 重新打开</button>}
              </div>
              <dl className="mt-5 space-y-2 border-t border-ink/10 pt-4 text-xs"><div><dt className="font-black text-muted">来源</dt><dd className="mt-0.5 break-all font-semibold">{report.question.sourceFile} / {report.question.sourceId}</dd></div><div><dt className="font-black text-muted">原始类型</dt><dd className="mt-0.5 font-semibold">{report.question.sourceType}</dd></div>{report.question.quarantinedAt ? <div><dt className="font-black text-muted">导入审核状态</dt><dd className={`mt-0.5 font-black ${report.question.importStatus === "PUBLISHED" ? "text-[#247a59]" : "text-coral"}`}>{report.question.importStatus === "PUBLISHED" ? "源数据已通过；解决最后一条报告后恢复" : "源数据仍需修复；解决报告也不会公开"}</dd></div> : null}</dl>
              {report.reviewActions.length ? <div className="mt-5 border-t border-ink/10 pt-4"><h3 className="text-xs font-black text-muted">操作记录</h3><ol className="mt-2 space-y-3">{report.reviewActions.map((action) => <li key={action.id} className="text-xs font-semibold leading-5"><p className="font-black">{actionLabels[action.action] ?? action.action} · {action.actor?.displayName || action.actor?.email || "已删除的账号"}</p>{action.note ? <p className="text-muted">{action.note}</p> : null}<time className="text-muted">{displayDate(action.createdAt)}</time></li>)}</ol></div> : null}
            </aside>
          </div>
        </article>)}
      </div>

      {data && data.pagination.pages > 1 ? <nav aria-label="审核队列分页" className="mt-8 flex items-center justify-center gap-4"><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="grid size-11 place-items-center rounded-xl border-2 border-ink/10 bg-white disabled:opacity-40" aria-label="上一页"><ChevronLeft /></button><span className="text-sm font-black">{page} / {data.pagination.pages}</span><button onClick={() => setPage((value) => Math.min(data.pagination.pages, value + 1))} disabled={page >= data.pagination.pages || loading} className="grid size-11 place-items-center rounded-xl border-2 border-ink/10 bg-white disabled:opacity-40" aria-label="下一页"><ChevronRight /></button></nav> : null}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <div role="status" aria-live="polite" className="grid min-h-[45vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={36} /><p className="mt-3 text-sm font-bold text-muted">{label}</p></div></div>;
}

function AccessMessage({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <div className="grid min-h-[75vh] place-items-center px-6 text-center"><div><ShieldAlert className="mx-auto text-coral" size={44} /><h1 className="mt-4 font-display text-3xl font-black">{title}</h1><p className="mt-2 text-sm font-semibold text-muted">{detail}</p>{children}</div></div>;
}
