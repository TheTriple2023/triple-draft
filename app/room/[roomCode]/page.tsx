"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Room = { id: string; name: string; room_code: string };

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export default function RoomHubPage() {
  const params = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();

  const roomCode = useMemo(
    () => decodeURIComponent(params.roomCode ?? "").trim(),
    [params.roomCode]
  );

  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    const loadRoom = async () => {
      try {
        setStatus("loading");
        setErrorMsg("");

        if (!roomCode) {
          setStatus("error");
          setErrorMsg("Missing room code in URL.");
          return;
        }

        const res = await supabase
          .from("rooms")
          .select("id, name, room_code")
          .eq("room_code", roomCode)
          .maybeSingle();

        if (res.error) {
          setStatus("error");
          setErrorMsg(res.error.message);
          return;
        }

        if (!res.data) {
          setStatus("error");
          setErrorMsg("Room not found. Check the room code.");
          return;
        }

        setRoom(res.data as Room);
        setStatus("ok");
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e?.message ?? "Unknown error");
      }
    };

    loadRoom();
  }, [roomCode]);

  // Build links that preserve token + room
  const draftHref = useMemo(() => {
    const t = token ? `?token=${encodeURIComponent(token)}` : "";
    return `/draft/${encodeURIComponent(roomCode)}${t}`;
  }, [roomCode, token]);

  const standingsHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set("room", roomCode);
    if (token) q.set("token", token); // optional; harmless to include
    return `/standings?${q.toString()}`;
  }, [roomCode, token]);

  const rostersHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set("room", roomCode);
    if (token) q.set("token", token); // optional
    return `/rosters?${q.toString()}`;
  }, [roomCode, token]);

  if (status === "loading") {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-xl mx-auto rounded-2xl border border-white/10 bg-black/40 p-6 text-white/80">
          Loading room…
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-xl mx-auto rounded-2xl border border-red-500/30 bg-red-950/20 p-6">
          <h1 className="text-xl font-semibold text-white">Room Hub</h1>
          <p className="mt-2 text-white/80">{errorMsg}</p>
          <Link className="inline-block mt-4 underline text-white" href="/">
            Back to Join
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white">{room?.name ?? "Room Hub"}</h1>
              <p className="mt-1 text-white/70">
                Room code: <span className="font-mono">{roomCode}</span>
              </p>

              {token ? (
                <p className="mt-1 text-white/60 text-sm">
                  Token detected ✅ (draft access enabled)
                </p>
              ) : (
                <p className="mt-1 text-amber-200/80 text-sm">
                  No token in URL — Draft button may not work. Use your invite link.
                </p>
              )}
            </div>

            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 text-white"
            >
              Join Page
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href={draftHref}
              className={cx(
                "rounded-2xl border px-4 py-4 text-center transition",
                token
                  ? "border-white/15 bg-white/5 hover:bg-white/10 text-white"
                  : "border-white/10 bg-white/5 text-white/40 cursor-not-allowed pointer-events-none"
              )}
            >
              <div className="text-lg font-semibold">Enter Draft</div>
              <div className="mt-1 text-xs text-white/60">Live draft room</div>
            </Link>

            <Link
              href={standingsHref}
              className="rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-4 text-center text-white transition"
            >
              <div className="text-lg font-semibold">Standings</div>
              <div className="mt-1 text-xs text-white/60">Leaderboard</div>
            </Link>

            <Link
              href={rostersHref}
              className="rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-4 text-center text-white transition"
            >
              <div className="text-lg font-semibold">Rosters</div>
              <div className="mt-1 text-xs text-white/60">All teams</div>
            </Link>
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="text-sm text-white/80 font-semibold">Shareable link format</div>
            <div className="mt-2 text-xs text-white/60 font-mono break-all">
              /room/{roomCode}?token=YOUR_COACH_TOKEN
            </div>
            <div className="mt-2 text-xs text-white/50">
              (Each coach should use their own token link so they can draft.)
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}