"use client";
import Image from "next/image";

import { useState } from "react";

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const [token, setToken] = useState("");

  const go = () => {
    const rc = roomCode.trim();
    const t = token.trim();
    if (!rc || !t) return;

    window.location.href = `/draft/${encodeURIComponent(rc)}?token=${encodeURIComponent(t)}`;
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
      <div className="flex justify-center mb-4">
  <Image
    src="/logo.png"
    alt="League Logo"
    width={120}
    height={120}
    priority
  />
</div>
        <h1 className="text-2xl font-semibold">Join Draft Room</h1>
        <p className="mt-2 text-sm text-white/70">
          Enter your room code and your coach token (from the invite link).
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-white/80">Room Code</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none focus:border-white/30"
              placeholder="TRIPLE2026"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
          </div>

          <div>
            <label className="block text-sm text-white/80">Coach Token</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none focus:border-white/30"
              placeholder="brad-9f2k1"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
          </div>

          <button
            className="w-full rounded-xl bg-white text-black py-3 font-semibold disabled:opacity-50"
            onClick={go}
            disabled={!roomCode.trim() || !token.trim()}
          >
            Enter Draft
          </button>

          <p className="text-xs text-white/60">
            Commissioner-generated tokens keep each coach locked to their own drafts (no logins required).
          </p>
        </div>
      </div>
    </main>
  );
}