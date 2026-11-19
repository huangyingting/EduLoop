import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "暂时离线", robots: { index: false } };

// Served by the service worker when a page cannot be reached. It is static and
// cached at install time, so it renders without a network connection.
export default function OfflinePage() {
  return <div className="grid min-h-[70vh] place-items-center px-6 text-center"><div className="max-w-md">
    <WifiOff className="mx-auto text-violet" size={44} />
    <h1 className="mt-4 font-display text-2xl font-black">暂时连不上网络</h1>
    <p className="mt-2 text-sm font-semibold leading-6 text-muted">网络恢复后刷新页面即可继续练习。已提交的答案都已保存在你的账号里。</p>
  </div></div>;
}
