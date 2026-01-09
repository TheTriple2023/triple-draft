import { Suspense } from "react";
import RostersPage from "./rosters-client";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-6">
          <div className="max-w-6xl mx-auto rounded-2xl border border-white/10 bg-black/40 p-5 text-white/70">
            Loading rosters…
          </div>
        </main>
      }
    >
      <RostersPage />
    </Suspense>
  );
}