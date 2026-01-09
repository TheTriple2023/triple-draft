"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type StandingsRow = {
  coach_id: string;
  coach_name: string;
  total_points: number;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export default function StandingsClient({
  roomCode,
  token,
}: {
  roomCode: string;
  token: string;
}) {

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // load room_id from roomCode
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

  // load standings rows
  useEffect(() => {
    if (!roomId) return;

    const load = async () => {
      const res = await supabase
        // ✅ CHANGE THIS VIEW NAME if yours is different
        .from("v_standings")
        .select("coach_id, coach_name, total_points")
        .eq("room_id", roomId);

      if (res.error) {
        setErrorMsg(res.error.message);
        return;
      }

      const data = (res.data || []) as any[];
      const normalized: StandingsRow[] = data.map((d) => ({
        coach_id: d.coach_id,
        coach_name: d.coach_name,
        total_points: Number(d.total_points ?? 0),
      }));

      // sort high -> low
      normalized.sort((a, b) => b.total_points - a.total_points || a.coach_name.localeCompare(b.coach_name));
      setRows(normalized);
    };

    load();

    // refresh on points + eliminations + picks (any can affect totals)
    const ch1 = supabase
      .channel(`standings-points-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_points", filter: `room_id=eq.${roomId}` },
        () => load()
      )
      .subscribe();

    const ch2 = supabase
      .channel(`standings-elim-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nfl_team_status", filter: `room_id=eq.${roomId}` },
        () => load()
      )
      .subscribe();

    const ch3 = supabase
      .channel(`standings-picks-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "picks", filter: `room_id=eq.${roomId}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [roomId]);

  const ranked = useMemo(() => {
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows]);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Standings</h1>
              <p className="mt-1 text-white/70">
                Room: <span className="font-mono">{roomCode || "—"}</span>
                {roomName ? <span className="text-white/50"> — {roomName}</span> : null}
              </p>
            </div>

            <div className="flex gap-2">
              <a
                href={roomCode ? `/rosters?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(token)}` : "/rosters"}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Rosters
              </a>
              <a
                href={roomCode ? `/draft/${roomCode}?token=${encodeURIComponent(token)}` : "/"}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Back to Draft
              </a>
            </div>
          </div>

          {status === "error" ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-white/80">
              {errorMsg}
            </div>
          ) : null}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/70">
              <tr>
                <th className="px-4 py-3 text-left w-16">Rank</th>
                <th className="px-4 py-3 text-left">Coach</th>
                <th className="px-4 py-3 text-right w-32">Points</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.coach_id} className="border-t border-white/10">
                  <td className="px-4 py-3 font-mono">{r.rank}</td>
                  <td className="px-4 py-3">{r.coach_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.total_points.toFixed(1)}</td>
                </tr>
              ))}

              {!ranked.length ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-white/60">
                    No standings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}