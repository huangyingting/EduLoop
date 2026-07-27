import type { Metadata } from "next";
import { Database, EyeOff, ShieldCheck, Trash2 } from "lucide-react";
import { PrivacyControls } from "@/components/privacy-controls";

export const metadata: Metadata = { title: "数据与隐私" };

const privacyCards = [
  { icon: Database, title: "保存什么", copy: "随机设备标识、答题记录、收藏、XP、连续学习、复习计划和本机练习偏好。" },
  { icon: EyeOff, title: "不会做什么", copy: "不建立公开档案、不做排行榜、不出售数据，也不采集精确位置。" },
  { icon: Trash2, title: "由你控制", copy: "你可以随时删除此设备对应的全部学习记录，操作无法撤销。" },
];

export default function PrivacyPage() {
  return <div className="mx-auto max-w-[960px] px-5 pb-20 pt-8 sm:px-8 lg:px-12"><header className="rounded-[32px] border-2 border-ink bg-lime p-7 shadow-[0_8px_0_#242136] sm:p-10"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><ShieldCheck size={18} /> Privacy by design</div><h1 className="mt-3 font-display text-4xl font-black tracking-[-.05em]">数据与隐私</h1><p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-ink/70">EduLoop 默认以匿名访客方式工作，不要求姓名、手机号或公开个人资料。学习数据只用于呈现你的练习、复习和成长记录。</p></header><section className="mt-7 grid gap-4 sm:grid-cols-3">{privacyCards.map(({ icon: Icon, title, copy }) => <article key={title} className="rounded-[24px] border-2 border-ink/10 bg-white p-5"><Icon className="text-violet" size={25} /><h2 className="mt-4 font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">{copy}</p></article>)}</section><section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8"><h2 className="font-display text-2xl font-black">学生与监护人须知</h2><div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-muted"><p>浏览器会保存随机访客标识和最近的练习筛选偏好，用于恢复本机进度与学习路线。清除浏览器数据会生成新的标识，原记录不会自动连接到新标识。</p><p>当前版本不提供账号或跨设备同步。学校或机构部署时，应在启用实名账号前补充当地适用的监护人同意、访问控制和数据保留流程。</p><p>题目问题反馈会与匿名访客标识关联，以便防止滥用和跟进内容质量；反馈中请勿填写姓名、联系方式等个人信息。</p></div></section><PrivacyControls /></div>;
}
