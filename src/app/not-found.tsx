import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return <div className="grid min-h-screen place-items-center p-6 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-lime"><Compass size={31} /></span><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-violet">404 · Uncharted</p><h1 className="mt-2 font-display text-3xl font-black">这片知识地图还没画好</h1><p className="mt-3 text-sm font-semibold text-muted">回到学习大厅，换一条路线继续探索。</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white"><ArrowLeft size={17} /> 返回学习大厅</Link></div></div>;
}
