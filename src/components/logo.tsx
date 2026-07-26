import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="EduLoop 首页">
      <span className="grid size-10 place-items-center rounded-[14px] bg-ink text-xl font-black text-white shadow-[0_6px_0_#17152a] transition-transform group-hover:-translate-y-0.5">
        e°
      </span>
      <span className="font-display text-[22px] font-black tracking-[-0.04em] text-ink">EduLoop</span>
    </Link>
  );
}
