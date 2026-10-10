import type { Metadata } from "next";
import { Database, EyeOff, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { PrivacyControls } from "@/components/privacy-controls";

export const metadata: Metadata = { title: "数据与隐私" };

const privacyCards = [
  { icon: Database, title: "保存什么", copy: "登录账号的邮箱、可选昵称、知识阶段与年级、答题记录、收藏、XP、连续学习、复习计划和练习偏好。" },
  { icon: EyeOff, title: "不会做什么", copy: "不建立公开档案、不做排行榜、不出售数据，也不采集精确位置。" },
  { icon: Trash2, title: "由你控制", copy: "你可以随时导出账号与学习记录、单独删除学习数据，或永久删除完整账号。" },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[960px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
      <header className="rounded-[32px] border-2 border-ink bg-lime p-7 shadow-[0_8px_0_#242136] sm:p-10">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><ShieldCheck size={18} /> Privacy by design</div>
        <h1 className="mt-3 font-display text-4xl font-black tracking-[-.05em]">数据与隐私</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-ink/70">匿名访客只能进行不留记录的练习。登录后，学习数据才会保存，用于呈现你的练习、复习和成长记录，以及生成不含个人身份的学习循环汇总。</p>
      </header>
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        {privacyCards.map(({ icon: Icon, title, copy }) => <article key={title} className="rounded-[24px] border-2 border-ink/10 bg-white p-5"><Icon className="text-violet" size={25} /><h2 className="mt-4 font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">{copy}</p></article>)}
      </section>
      <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">学生与监护人须知</h2>
        <div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-muted">
          <p>访客答题只在当前练习页面的内存中处理；不会创建学习档案，也不会把答案、筛选或进度写入浏览器存储或数据库。关闭或刷新页面后，本轮状态即消失。</p>
          <p>账号保存规范化邮箱、可选昵称、社交账号关联，以及设置密码时的单向哈希。Auth.js 登录状态保存在加密的 HttpOnly Cookie 中，并通过数据库会话版本即时撤销。系统仅记录答错后是否打开解析，不记录阅读内容之外的页面行为。</p>
          <p>学校或机构部署时，仍应补充当地适用的监护人同意、账号恢复、访问控制和数据保留流程。题目反馈中请勿填写姓名、联系方式等个人信息。</p>
          <p>当前公共账号仅限成年学习者或父母、法定监护人操作。完整说明见 <Link href="/privacy-policy" className="font-black text-violet underline">隐私说明</Link> 和 <Link href="/terms" className="font-black text-violet underline">服务条款</Link>。</p>
        </div>
      </section>
      <PrivacyControls />
    </div>
  );
}
