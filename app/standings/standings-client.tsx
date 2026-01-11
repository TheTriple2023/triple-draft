"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RosterRow = {
  coach_id: string;
  coach_name: string;
  total_points: number;
};

type StandingsRow = {
  coach_id: string;
  coach_name: string;
  total_points: number;
  rank: number;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function tierRowClass(rank: number) {
  // 1-4 green, 5-8 yellow, 9-12 red
  if (rank >= 1 && rank <= 4) return "bg-emerald-500/10 ring-1 ring-emerald-400/15";
  if (rank >= 5 && rank <= 8) return "bg-amber-500/10 ring-1 ring-amber-400/15";
  return "bg-red-500/10 ring-1 ring-red-400/15";
}

export default function StandingsClient() {
  const searchParams = useSearchParams();
  const roomCode = (searchParams.get("room") || "").trim();
  const token = (searchParams.get("token") || "").trim();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Load roomId from roomCode
  useEffect(() => {
    const loadRoom = async () => {
      try {
        setStatus("loading");
        setErrorMsg("");

        if (!roomCode) {
          setStatus("error");
          setErrorMsg("Missing room code. Use URL like: /standings?room=TRIPLE2026");
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

  // Load roster rows (source of truth)
  useEffect(() => {
    if (!roomId) return;

    const load = async () => {
      const res = await supabase
        .from("v_coach_roster_with_points")
        .select("coach_id, coach_name, total_points")
        .eq("room_id", roomId);

      if (res.error) {
        setErrorMsg(res.error.message);
        return;
      }

      const data = (res.data || []) as any[];
      const normalized: RosterRow[] = data.map((d) => ({
        coach_id: String(d.coach_id),
        coach_name: String(d.coach_name),
        total_points: Number(d.total_points ?? 0),
      }));

      setRows(normalized);
    };

    load();

    // Realtime refresh when any of these change
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

  // Compute totals by coach
  const standings: StandingsRow[] = useMemo(() => {
    const map = new Map<string, { coach_name: string; total: number }>();

    for (const r of rows) {
      if (!map.has(r.coach_id)) map.set(r.coach_id, { coach_name: r.coach_name, total: 0 });
      map.get(r.coach_id)!.total += Number(r.total_points ?? 0);
    }

    const list = Array.from(map.entries()).map(([coach_id, v]) => ({
      coach_id,
      coach_name: v.coach_name,
      total_points: v.total,
      rank: 0,
    }));

    list.sort(
      (a, b) =>
        b.total_points - a.total_points ||
        a.coach_name.localeCompare(b.coach_name)
    );

    return list.map((r, idx) => ({ ...r, rank: idx + 1 })).slice(0, 12);
  }, [rows]);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
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
                href={roomCode ? `/draft/${encodeURIComponent(roomCode)}?token=${encodeURIComponent(token)}` : "/"}
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
                <th className="px-4 py-3 text-left w-20">Place</th>
                <th className="px-4 py-3 text-left">Coach</th>
                <th className="px-4 py-3 text-right w-32">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r) => (
                <tr key={r.coach_id} className={cx("border-t border-white/10", tierRowClass(r.rank))}>
                  <td className="px-4 py-3 font-mono font-semibold">{r.rank}</td>
                  <td className="px-4 py-3">{r.coach_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.total_points.toFixed(1)}</td>
                </tr>
              ))}

              {!standings.length ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-white/60">
                    No standings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-white/50">
          <span className="mr-3">Top 4: green</span>
          <span className="mr-3">5–8: yellow</span>
          <span>9–12: red</span>
        </div>
      </div>
    </main>
  );
}