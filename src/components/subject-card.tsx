import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

type Props = { slug: string; name: string; icon: string; description: string; count: string; accent: string; index: number };

export function SubjectCard({ slug, name, icon, description, count, accent, index }: Props) {
  return (
    <Link href={`/practice?subject=${slug}`} className="subject-card group relative overflow-hidden rounded-[28px] border-2 border-ink/10 bg-white p-5 shadow-[0_7px_0_#e3dfd4] transition hover:-translate-y-1 hover:shadow-[0_11px_0_#d9d3f5]">
      <div className="absolute -right-7 -top-8 size-24 rounded-full opacity-20" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <span className="grid size-14 place-items-center rounded-[19px] text-2xl font-black text-white" style={{ background: accent }}>{icon}</span>
        <span className="grid size-9 place-items-center rounded-full border-2 border-ink/10 text-ink transition group-hover:rotate-12 group-hover:bg-ink group-hover:text-white"><ArrowUpRight size={18} /></span>
      </div>
      <p className="mt-7 text-[11px] font-black uppercase tracking-[0.18em] text-muted">TRACK {String(index + 1).padStart(2, "0")}</p>
      <h3 className="mt-1 font-display text-2xl font-black tracking-tight text-ink">{name}</h3>
      <p className="mt-2 min-h-10 text-sm font-medium leading-5 text-muted">{description}</p>
      <div className="mt-5 flex items-center gap-2 border-t border-dashed border-ink/15 pt-4 text-xs font-bold text-ink/65">
        <span className="size-2 rounded-full" style={{ background: accent }} /> {count} 道题
      </div>
    </Link>
  );
}
