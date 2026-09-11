"use client";

import { ArrowRight, BadgeCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RecoveryShell } from "@/components/password-recovery-form";

type ChangeState = "checking" | "changed" | "conflict" | "invalid";

export function EmailChangeForm() {
  const [state, setState] = useState<ChangeState>("checking");
  const pendingFragmentToken = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let requestVersion = 0;
    function consumeFragment() {
      const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
      if (fragmentToken) pendingFragmentToken.current = fragmentToken;
      const token = fragmentToken || pendingFragmentToken.current || "";
      window.history.replaceState(null, "", "/change-email");
      const version = ++requestVersion;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        pendingFragmentToken.current = null;
        if (!token) {
          if (active && version === requestVersion) setState("invalid");
          return;
        }
        setState("checking");
        void fetch("/api/auth/email-change", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).then((response) => {
          if (!active || version !== requestVersion) return;
          setState(response.ok ? "changed" : response.status === 409 ? "conflict" : "invalid");
        }).catch(() => {
          if (active && version === requestVersion) setState("invalid");
        });
      }, 0);
    }
    consumeFragment();
    window.addEventListener("hashchange", consumeFragment);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", consumeFragment);
    };
  }, []);

  if (state === "checking") {
    return <RecoveryShell><p role="status" className="mt-8 flex items-center gap-2 font-bold text-muted"><LoaderCircle className="animate-spin" size={18} /> 正在确认新邮箱…</p></RecoveryShell>;
  }
  if (state === "changed") {
    return <RecoveryShell><div role="status" className="mt-7 rounded-2xl border-2 border-lime bg-[#f7fadf] p-5"><BadgeCheck className="text-[#557000]" /><h1 className="mt-3 font-display text-3xl font-black">登录邮箱已更新</h1><p className="mt-2 text-sm font-semibold leading-6 text-muted">所有旧登录会话都已退出。请使用新邮箱密码或已连接的社交登录方式重新登录。</p><Link href="/login" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white">前往登录 <ArrowRight size={16} /></Link></div></RecoveryShell>;
  }

  const conflict = state === "conflict";
  return <RecoveryShell><div role="alert" className="mt-7 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-5"><h1 className="font-display text-3xl font-black text-coral">{conflict ? "新邮箱已被使用" : "邮箱更改链接无效"}</h1><p className="mt-2 text-sm font-semibold leading-6 text-muted">{conflict ? "其他账号已使用这个邮箱。请登录原账号后重新申请其他地址。" : "链接可能不完整、已经使用或已经过期。请登录原账号重新申请。"}</p><Link href="/login?next=%2Fprivacy" className="mt-5 inline-flex min-h-11 items-center gap-2 font-black text-violet">返回账号安全设置 <ArrowRight size={16} /></Link></div></RecoveryShell>;
}
