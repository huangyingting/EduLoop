import type { Metadata } from "next";
import { GraduationCap, Sparkles } from "lucide-react";
import { LearnerProfileForm } from "@/components/learner-profile-form";

export const metadata: Metadata = { title: "学习档案" };

export default function ProfilePage() {
  return <div className="mx-auto max-w-[820px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
    <header className="rounded-[30px] border-2 border-ink bg-lime p-6 shadow-[0_7px_0_#242136] sm:p-8">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><Sparkles size={17} /> Learner profile</div>
      <div className="mt-3 flex items-center gap-3"><GraduationCap size={34} /><h1 className="font-display text-3xl font-black tracking-[-.04em] sm:text-4xl">学习档案</h1></div>
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-ink/70">用少量信息给题目一个更合适的起点。它不会限制你能学什么，也不会代替练习中的真实表现。</p>
    </header>
    <LearnerProfileForm />
  </div>;
}
