"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type StandingRow = {
  room_id: string;
  coach_id: string;
  coach_name: string;
  team_points: number;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export default function StandingsPage() {
  const searchParams = useSearchParams();
  const roomCode = (searchParams.get("room") || "").trim();
  const token = (searchParams.get("token") || "").trim(); // optional; you can ignore this if you want

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Resolve room_id from room code (so standings can load by URL)
  useEffect(() => {
    const loadRoom = async () => {
      try {
        setStatus("loading");
        setErrorMsg("");

        if (!roomCode) {
          setStatus("error");
          setErrorMsg('Missing room code. Use URL like: /standings?room=TRIPLE2026');
          return;
        }

        const r = await supabase
          .from("rooms")
          .select("id,name")
          .eq("room_code", roomCode)
          .maybeSingle();

        if (r.error || !r.data) {
          setStatus("error");
          setErrorMsg(r.error?.message || "Room not found.");
          return;
        }

        setRoomId(r.data.id);
        setRoomName(r.data.name);
        setStatus("ok");
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e?.message || "Failed to load room.");
      }
    };

    loadRoom();
  }, [roomCode]);

  // Load standings from the view
  useEffect(() => {
    if (!roomId) return;

    const loadStandings = async () => {
      const res = await supabase
        .from("v_standings")
        .select("room_id, coach_id, coach_name, team_points")
        .eq("room_id", roomId);

      if (res.error) {
        setErrorMsg(res.error.message);
        return;
      }

      const data = (res.data || []) as any[];
      // ensure number
      const normalized: StandingRow[] = data.map((d) => ({
        room_id: d.room_id,
        coach_id: d.coach_id,
        coach_name: d.coach_name,
        team_points: Number(d.team_points ?? 0),
      }));

      setRows(normalized);
    };

    loadStandings();

    // Optional realtime refresh whenever points update
    const channel = supabase
      .channel(`standings-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_points", filter: `room_id=eq.${roomId}` },
        () => loadStandings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const ranked = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.team_points - a.team_points || a.coach_name.localeCompare(b.coach_name));
    return sorted.map((r, idx) => ({ ...r, rank: idx + 1 }));
  }, [rows]);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto rounded-2xl border border-white/10 bg-black/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Standings</h1>
            <p className="mt-1 text-white/70">
              Room: <span className="font-mono">{roomCode || "—"}</span>
              {roomName ? <span className="text-white/50"> — {roomName}</span> : null}
            </p>
          </div>

          <a
            href={roomCode ? `/draft/${roomCode}?token=${encodeURIComponent(token)}` : "/"}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Back to Draft
          </a>
        </div>

        {status === "error" ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-white/80">
            {errorMsg}
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/70">
              <tr>
                <th className="px-3 py-2 text-left w-16">Rank</th>
                <th className="px-3 py-2 text-left">Coach</th>
                <th className="px-3 py-2 text-right w-40">Points</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.coach_id} className="border-t border-white/10">
                  <td className="px-3 py-2 font-mono">{r.rank}</td>
                  <td className="px-3 py-2">{r.coach_name}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.team_points.toFixed(1)}</td>
                </tr>
              ))}
              {ranked.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-white/60">
                    No standings yet (need picks + points).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-white/50">
          Tip: share this link: <span className="font-mono">/standings?room={roomCode || "TRIPLE2026"}</span>
        </p>
      </div>
    </main>
  );
}