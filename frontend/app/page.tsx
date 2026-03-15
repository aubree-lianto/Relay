"use client";

import dynamic from "next/dynamic";

const AmbulanceMap = dynamic(() => import("./components/AmbulanceMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm tracking-widest animate-pulse font-mono bg-slate-950">
      LOADING MAP…
    </div>
  ),
});

export default function Home() {
  return (
    <main className="flex-1 min-h-0 bg-slate-950 overflow-hidden">
      <AmbulanceMap />
    </main>
  );
}
