"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DEFAULT_ROOM = "TRIPLE2026";
const LS_ROOM = "triple_room_code";
const LS_TOKEN = "triple_coach_token";

export default function Home() {
  const [roomCode, setRoomCode] = useState(DEFAULT_ROOM);
  const [token, setToken] = useState("");

  // Load saved values once
  useEffect(() => {
    try {
      const savedRoom = localStorage.getItem(LS_ROOM);
      const savedToken = localStorage.getItem(LS_TOKEN);

      if (savedRoom) setRoomCode(savedRoom);
      if (savedToken) setToken(savedToken);
    } catch {
      // ignore (some browsers / settings can block storage)
    }
  }, []);

  const go = () => {
    const rc = roomCode.trim();
    const t = token.trim();
    if (!rc || !t) return;

    // Save for next time
    try {
      localStorage.setItem(LS_ROOM, rc);
      localStorage.setItem(LS_TOKEN, t);
    } catch {
      // ignore
    }

    window.location.href = `/room/${encodeURIComponent(rc)}?token=${encodeURIComponent(t)}`;
  };

  const clearSaved = () => {
    try {
      localStorage.removeItem(LS_ROOM);
      localStorage.removeItem(LS_TOKEN);
    } catch {
      // ignore
    }
    setRoomCode(DEFAULT_ROOM);
    setToken("");
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg">
        <div className="flex justify-center mb-4">
          <Image src="/logo.png" alt="League Logo" width={120} height={120} priority />
        </div>

        <h1 className="text-2xl font-semibold">Welcome to The Triple Network</h1>
        <p className="mt-2 text-sm text-white/70">
          Enter your coach token to access your league hub.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-white/80">Room Code</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none focus:border-white/30"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
            <p className="mt-1 text-xs text-white/50">Pre-filled for this season.</p>
          </div>

          <div>
            <label className="block text-sm text-white/80">Coach Token</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none focus:border-white/30"
              placeholder="your-token-here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
            <p className="mt-1 text-xs text-white/50">
              We’ll remember this on this device (until you clear it).
            </p>
          </div>

          <button
            className="w-full rounded-xl bg-white text-black py-3 font-semibold disabled:opacity-50"
            onClick={go}
            disabled={!roomCode.trim() || !token.trim()}
          >
            Continue to Triple Network
          </button>

          <button
            className="w-full rounded-xl border border-white/15 bg-white/5 py-2 text-sm text-white/80 hover:bg-white/10"
            onClick={clearSaved}
            type="button"
          >
            Clear saved token on this device
          </button>

          <p className="text-xs text-white/60">
            Commissioner-generated tokens keep each coach locked to their own drafts (no logins required).
          </p>
        </div>
      </div>
    </main>
  );
}