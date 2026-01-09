"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RosterRow = {
  room_id: string;
  coach_id: string;
  coach_name: string;
  player_id: string;
  player_name: string;
  nfl_team: string;
  position: string;
  total_points: number;
  eliminated: boolean;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function posPillClass(pos: string) {
  const p = (pos || "").toUpperCase();
  if (p === "QB") return "bg-sky-500/20 text-sky-200 border-sky-400/30";
  if (p === "RB") return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
  if (p === "WR") return "bg-purple-500/20 text-purple-200 border-purple-400/30";
  if (p === "TE") return "bg-amber-500/20 text-amber-200 border-amber-400/30";
  if (p === "DEF" || p === "DST") return "bg-slate-500/20 text-slate-200 border-slate-400/30";
  if (p === "K") return "bg-zinc-500/20 text-zinc-200 border-zinc-400/30";
  return "bg-white/10 text-white/70 border-white/10";
}

export default function RostersPage() {
  const searchParams = useSearchParams();
  const roomCode = (searchParams.get("room") || "").trim();
  const token = (searchParams.get("token") || "").trim();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const loadRoom = async () => {
      try {
        setStatus("loading");
        setErrorMsg("");

        if (!roomCode) {
          setStatus("error");
          setErrorMsg('Missing room code. Use URL like: /rosters?room=TRIPLE2026');
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

  useEffect(() => {
    if (!roomId) return;

    const load = async () => {
      const res = await supabase
        .from("v_coach_roster_with_points")
        .select(
          "room_id, coach_id, coach_name, player_id, player_name, nfl_team, position, total_points, eliminated"
        )
        .eq("room_id", roomId);

      if (res.error) {
        setErrorMsg(res.error.message);
        return;
      }

      const data = (res.data || []) as any[];
      const normalized: RosterRow[] = data.map((d) => ({
        room_id: d.room_id,
        coach_id: d.coach_id,
        coach_name: d.coach_name,
        player_id: d.player_id,
        player_name: d.player_name,
        nfl_team: d.nfl_team,
        position: d.position,
        total_points: Number(d.total_points ?? 0),
        eliminated: Boolean(d.eliminated),
      }));

      setRows(normalized);
    };

    load();

    // realtime refresh on points and eliminations
    const ch1 = supabase
      .channel(`rosters-points-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_points", filter: `room_id=eq.${roomId}` },
        () => load()
      )
      .subscribe();

    const ch2 = supabase
      .channel(`rosters-elim-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_elimination", filter: `room_id=eq.${roomId}` },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [roomId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { coach_name: string; players: RosterRow[]; total: number }>();
    for (const r of rows) {
      const key = r.coach_id;
      if (!map.has(key)) map.set(key, { coach_name: r.coach_name, players: [], total: 0 });
      const entry = map.get(key)!;
      entry.players.push(r);
      entry.total += r.total_points;
    }

    const list = Array.from(map.entries()).map(([coach_id, v]) => ({
      coach_id,
      coach_name: v.coach_name,
      total: v.total,
      players: v.players.sort((a, b) => b.total_points - a.total_points || a.player_name.localeCompare(b.player_name)),
    }));

    // sort teams by total points desc
    list.sort((a, b) => b.total - a.total || a.coach_name.localeCompare(b.coach_name));

    return list;
  }, [rows]);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Rosters</h1>
              <p className="mt-1 text-white/70">
                Room: <span className="font-mono">{roomCode || "—"}</span>
                {roomName ? <span className="text-white/50"> — {roomName}</span> : null}
              </p>
            </div>

            <div className="flex gap-2">
              <a
                href={roomCode ? `/standings?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(token)}` : "/standings"}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                Standings
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

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {grouped.map((team) => (
            <section key={team.coach_id} className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{team.coach_name}</h2>
                <div className="text-sm text-white/70">
                  Total: <span className="font-mono text-white">{team.total.toFixed(1)}</span>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-white/70">
                    <tr>
                      <th className="px-3 py-2 text-left">Player</th>
                      <th className="px-3 py-2 text-left w-24">Pos</th>
                      <th className="px-3 py-2 text-left w-28">Team</th>
                      <th className="px-3 py-2 text-right w-24">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.players.map((p) => (
                      <tr key={p.player_id} className="border-t border-white/10">
                        <td
                          className={cx(
                            "px-3 py-2",
                            p.eliminated && "line-through text-white/40"
                          )}
                        >
                          {p.player_name}
                          {p.eliminated ? <span className="ml-2 text-xs text-red-300/70">(ELIM)</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", posPillClass(p.position))}>
                            {p.position}
                          </span>
                        </td>
                        <td className={cx("px-3 py-2", p.eliminated && "text-white/40")}>{p.nfl_team}</td>
                        <td className={cx("px-3 py-2 text-right font-mono", p.eliminated && "text-white/40")}>
                          {p.total_points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                    {team.players.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-white/60">
                          No picks yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-white/70">
              No rosters yet (need picks).
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}