"use client";

import { ArrowRight, BookOpenCheck, GraduationCap, LoaderCircle, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { getProviders, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { safeReturnPath } from "@/lib/auth-validation";
import { useAuth } from "@/lib/use-auth";
import { CustomSelect } from "./custom-select";

type SocialProvider = { id: string; name: string };
type GradeBandOption = { slug: string; name: string };

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [knowledgeBand, setKnowledgeBand] = useState("");
  const [error, setError] = useState(() => authErrorMessage(searchParams.get("error")));
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [gradeBands, setGradeBands] = useState<GradeBandOption[]>([]);
  const isLogin = mode === "login";
  const next = safeReturnPath(searchParams.get("next"));

  useEffect(() => {
    if (auth.status === "authenticated") return;
    void getProviders().then((available) => {
      setProviders(Object.values(available ?? {})
        .filter((provider) => provider.type !== "credentials")
        .map(({ id, name }) => ({ id, name })));
    }).catch(() => setProviders([]));
  }, [auth.status]);

  useEffect(() => {
    if (isLogin || auth.status !== "guest") return;
    void fetch("/api/catalog")
      .then((response) => response.ok ? response.json() as Promise<{ gradeBands: GradeBandOption[] }> : Promise.reject())
      .then((catalog) => setGradeBands(catalog.gradeBands))
      .catch(() => setGradeBands([]));
  }, [auth.status, isLogin]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    router.replace(next);
  }, [auth.status, next, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!isLogin) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: displayName.trim() || undefined,
            knowledgeBand: knowledgeBand || undefined,
          }),
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "暂时无法创建账号，请稍后重试。");
      }
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        redirectTo: next,
      });
      if (!result.ok) throw new Error(authErrorMessage(result.error) || "邮箱或密码不正确。");
      router.replace(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法登录，请稍后重试。");
      setBusy(false);
    }
  }

  async function socialLogin(provider: SocialProvider) {
    if (socialBusy || busy) return;
    setSocialBusy(provider.id);
    setError("");
    try {
      await signIn(provider.id, { redirectTo: next });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法开始社交登录，请稍后重试。");
      setSocialBusy(null);
    }
  }

  const alternate = isLogin ? "/register" : "/login";
  const alternateHref = next === "/" ? alternate : `${alternate}?next=${encodeURIComponent(next)}`;

  if (auth.status !== "guest") {
    return <main id="main-content" className="grid min-h-screen place-items-center bg-canvas p-6"><p role="status" className="font-bold text-muted">{auth.status === "authenticated" ? "正在返回学习空间…" : "正在确认登录状态…"}</p></main>;
  }

  return (
    <main id="main-content" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-6 sm:px-6">
      <div className="dot-grid absolute inset-0 opacity-45" />
      <div className="absolute -left-28 -top-28 size-72 rounded-full bg-sky/70 blur-2xl" />
      <div className="absolute -bottom-32 -right-24 size-80 rounded-full bg-[#d9d3f5]/80 blur-2xl" />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[30px] border-2 border-ink bg-white shadow-[8px_9px_0_#242136] lg:grid-cols-[.82fr_1.18fr]">
        <section className="relative hidden overflow-hidden bg-violet p-8 text-white lg:block">
          <div className="dot-grid absolute inset-0 opacity-20" />
          <div className="relative">
            <Link href="/practice" className="inline-flex items-center gap-2 font-display text-2xl font-black"><span className="grid size-10 place-items-center rounded-2xl bg-lime text-ink">∞</span>EduLoop</Link>
            <div className="mt-12 inline-flex -rotate-2 items-center gap-2 rounded-full border-2 border-ink bg-lime px-3 py-1.5 text-xs font-black text-ink shadow-[3px_3px_0_#242136]"><Sparkles size={14} /> 进度跟着你走</div>
            <h1 className="mt-5 font-display text-3xl font-black leading-tight">把今天的努力，<br />带到每一台设备。</h1>
            <ul className="mt-6 space-y-3 text-sm font-bold text-white/85">
              <li className="flex items-center gap-3"><BookOpenCheck className="text-lime" /> 保留 XP、连续学习和答题记录</li>
              <li className="flex items-center gap-3"><Sparkles className="text-lime" /> 同步错题、收藏和复习计划</li>
              <li className="flex items-center gap-3"><LockKeyhole className="text-lime" /> 安全会话，密码不会明文保存</li>
            </ul>
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:p-9">
          <Link href="/practice" className="inline-flex items-center gap-2 font-display text-xl font-black lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-lime">∞</span>EduLoop</Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-coral lg:mt-0">{isLogin ? "Welcome back" : "Start your learning loop"}</p>
          <h2 className="mt-1.5 font-display text-[28px] font-black tracking-tight">{isLogin ? "欢迎回来，探索者" : "创建你的学习账号"}</h2>
          <p className="mt-1.5 text-sm font-semibold leading-5 text-muted">{isLogin ? "登录后继续你的学习路线。" : "告诉我们适合你的知识阶段，第一题就更合适。"}</p>

          {providers.length ? <>
            <div className="mt-5 space-y-2">
              {providers.map((provider) => <button key={provider.id} type="button" disabled={Boolean(socialBusy) || busy} onClick={() => void socialLogin(provider)} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border-2 border-ink/10 bg-white px-5 text-sm font-black transition hover:border-violet/40 hover:bg-canvas disabled:opacity-60">
                {socialBusy === provider.id ? <LoaderCircle className="animate-spin" size={18} /> : <ProviderIcon id={provider.id} />}
                使用 {providerLabel(provider)} 继续
              </button>)}
            </div>
            <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-ink/10" /><span className="text-xs font-black text-muted">或使用邮箱</span><span className="h-px flex-1 bg-ink/10" /></div>
          </> : null}

          <form onSubmit={submit} className={`${providers.length ? "" : "mt-5"} space-y-3`}>
            {!isLogin ? <Field label="昵称（选填）" icon={<UserRound size={18} />}><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={50} autoComplete="name" placeholder="例如：星空探索者" className={inputClass} /></Field> : null}
            {!isLogin && gradeBands.length ? <div><span className="mb-1 block text-xs font-black">适合我的知识阶段（选填）</span><CustomSelect label="适合我的知识阶段" value={knowledgeBand} options={[{ value: "", label: "暂不设置，练习全部题目" }, ...gradeBands.map((band) => ({ value: band.slug, label: band.name }))]} onValueChange={setKnowledgeBand} leadingIcon={<GraduationCap size={18} />} className="w-full" /></div> : null}
            <Field label="邮箱" icon={<Mail size={18} />}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="student@example.com" className={inputClass} /></Field>
            <Field label="密码" icon={<LockKeyhole size={18} />}><input type="password" required minLength={isLogin ? undefined : 8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isLogin ? "current-password" : "new-password"} placeholder={isLogin ? "输入密码" : "至少 8 位字符"} className={inputClass} /></Field>

            {error ? <p role="alert" className="rounded-xl border-2 border-coral/30 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral">{error}</p> : null}
            <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 font-black text-white shadow-[0_4px_0_#6c5ce7] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60">
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <>{isLogin ? "登录并继续" : "创建账号"}<ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="mt-4 text-center text-sm font-semibold text-muted">{isLogin ? "还没有账号？" : "已经有账号？"} <Link href={alternateHref} className="font-black text-violet hover:underline">{isLogin ? "免费注册" : "直接登录"}</Link></p>
          <p className="mt-2.5 text-center text-xs font-semibold text-muted"><Link href="/practice" className="hover:text-ink hover:underline">暂时以匿名访客练习（不保存记录）</Link></p>
        </section>
      </div>
    </main>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border-2 border-ink/10 bg-canvas/60 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-violet focus:bg-white";

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-black">{label}</span><span className="relative block"><span className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted">{icon}</span>{children}</span></label>;
}

function providerLabel(provider: SocialProvider) {
  if (provider.id === "microsoft-entra-id") return "Microsoft";
  return provider.name;
}

function authErrorMessage(error: string | null | undefined) {
  if (!error) return "";
  if (error === "CredentialsSignin") return "邮箱或密码不正确。";
  if (error === "OAuthAccountNotLinked") return "该邮箱已有账号。请先用原方式登录，再到“数据与隐私”中连接此社交账号。";
  if (error === "AccessDenied") return "该社交账号没有提供可验证的邮箱，无法登录。";
  return "登录没有完成，请重试。";
}

function ProviderIcon({ id }: { id: string }) {
  if (id === "google") return <span aria-hidden className="font-black text-[#4285f4]">G</span>;
  if (id === "microsoft-entra-id") return <span aria-hidden className="grid grid-cols-2 gap-px">{["#f25022", "#7fba00", "#00a4ef", "#ffb900"].map((color) => <span key={color} className="size-2" style={{ backgroundColor: color }} />)}</span>;
  if (id === "facebook") return <span aria-hidden className="grid size-5 place-items-center rounded-full bg-[#1877f2] text-sm font-black text-white">f</span>;
  return <UserRound aria-hidden size={18} />;
}
