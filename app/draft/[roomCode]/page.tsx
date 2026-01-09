"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Room = { id: string; name: string; draft_order: string[] };
type Coach = { id: string; coach_name: string };

type Player = {
  id: string;
  room_id: string;
  player_name: string;
  nfl_team: string;
  position: string;
  ppg: number | null;
};

type PickPlayer = {
  id: string;
  player_name: string;
  nfl_team: string;
  position: string;
  ppg: number | null;
};

type PickCoach = {
  id: string;
  coach_name: string;
};

type PickRow = {
  id: string;
  room_id: string;
  coach_id: string;
  // IMPORTANT: we are treating this as OVERALL PICK NUMBER (1,2,3...)
  round: number;
  player_id: string;
  created_at: string;
  player?: PickPlayer;
  coach?: PickCoach;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}
const teamPosStyles = (pos?: string) => {
  switch (pos) {
    case "QB":
      return { row: "bg-sky-500/10", badge: "bg-sky-500/20 text-sky-100 border-sky-400/30" };
    case "RB":
      return { row: "bg-emerald-500/10", badge: "bg-emerald-500/20 text-emerald-100 border-emerald-400/30" };
    case "WR":
      return { row: "bg-violet-500/10", badge: "bg-violet-500/20 text-violet-100 border-violet-400/30" };
    case "TE":
      return { row: "bg-amber-500/10", badge: "bg-amber-500/20 text-amber-100 border-amber-400/30" };
    default:
      return { row: "", badge: "bg-white/5 text-white/70 border-white/15" };
  }
};
// =============================
// UI helpers (pane + positions)
// =============================

function paneClass(kind: "available" | "board" | "team") {
  const base = "rounded-2xl border border-white/10 p-5";

  if (kind === "available") {
    return cx(base, "bg-slate-950/55");
  }

  if (kind === "board") {
    return cx(base, "bg-zinc-950/60");
  }

  // My Team = gold emphasis
  return cx(base, "bg-amber-950/25 border-amber-300/15");
}

function posStyles(pos?: string) {
  const p = (pos ?? "").toUpperCase();

  const row =
    p === "QB" ? "bg-sky-500/10" :
    p === "RB" ? "bg-emerald-500/10" :
    p === "WR" ? "bg-purple-500/10" :
    p === "TE" ? "bg-orange-500/10" :
    p === "K"  ? "bg-yellow-500/10" :
    p === "DST"? "bg-red-500/10" :
    "";

  const pill =
    p === "QB" ? "border-sky-400/30 bg-sky-500/15 text-sky-200" :
    p === "RB" ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" :
    p === "WR" ? "border-purple-400/30 bg-purple-500/15 text-purple-200" :
    p === "TE" ? "border-orange-400/30 bg-orange-500/15 text-orange-200" :
    p === "K"  ? "border-yellow-400/30 bg-yellow-500/15 text-yellow-100" :
    p === "DST"? "border-red-400/30 bg-red-500/15 text-red-200" :
    "border-white/15 bg-white/5 text-white/70";

  return { row, pill, label: p || "—" };
}

function PosPill({ pos }: { pos?: string }) {
  const s = posStyles(pos);
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        s.pill
      )}
    >
      {s.label}
    </span>
  );
}
function getNextCoachIdForPick(overallPickNumber: number, draftOrder: string[]) {
  // overallPickNumber is 1-based. "Up next" means overallPickNumber + 1
  return getCoachIdForPick(overallPickNumber + 1, draftOrder);
}

/**
 * Snake + 3rd round reversal
 * draftOrder is the Round 1 order (pick 1 -> 12)
 */
function getCoachIdForPick(overallPickNumber: number, draftOrder: string[]) {
  const n = draftOrder.length;
  if (!n) return null;

  const roundNumber = Math.ceil(overallPickNumber / n); // 1-based
  const indexInRound0 = (overallPickNumber - 1) % n; // 0..n-1

  // Rules:
  // R1: forward (1->12)
  // R2: reverse (12->1)
  // R3: reverse (12->1)  <-- 3rd round reversal
  // R4: forward (1->12)
  // R5: reverse, R6: forward, etc...
  const isReverse =
    roundNumber === 2 ||
    roundNumber === 3 ||
    (roundNumber >= 5 && roundNumber % 2 === 1);

  const idx = isReverse ? n - 1 - indexInRound0 : indexInRound0;
  return draftOrder[idx] ?? null;
}

function roundAndPickInRound(overallPickNumber: number, nCoaches: number) {
  const roundNumber = Math.ceil(overallPickNumber / nCoaches);
  const pickInRound = ((overallPickNumber - 1) % nCoaches) + 1;
  return { roundNumber, pickInRound };
}

export default function DraftRoomPage() {
  const params = useParams<{ roomCode: string }>();
  const searchParams = useSearchParams();

  const roomCode = useMemo(
    () => decodeURIComponent(params.roomCode ?? ""),
    [params.roomCode]
  );

  const token = useMemo(
    () => (searchParams.get("token") ?? "").trim(),
    [searchParams]
  );

  const [status, setStatus] = useState<"loading" | "error" | "ok">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  const isCommissioner = coach?.coach_name === "Rowland";

  // Keep FULL player list in state; availability is derived from picks
  const [players, setPlayers] = useState<Player[]>([]);
  const [picks, setPicks] = useState<PickRow[]>([]);

  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);

  // ----------------------------
  // Load helpers
  // ----------------------------
  const loadPicks = async (roomId: string) => {
    const res = await supabase
      .from("picks")
      .select(
        `
        id,
        room_id,
        coach_id,
        round,
        player_id,
        created_at,
        player:players (id, player_name, nfl_team, position, ppg),
        coach:coaches (id, coach_name)
      `
      )
      .eq("room_id", roomId)
      .order("round", { ascending: true });

    if (!res.error && res.data) setPicks(res.data as any);
  };

  const loadPlayers = async (roomId: string) => {
    const res = await supabase
      .from("players")
      .select("id, room_id, player_name, nfl_team, position, ppg")
      .eq("room_id", roomId)
      .order("ppg", { ascending: false, nullsFirst: false });

    if (!res.error && res.data) setPlayers(res.data as any);
  };

  const loadCoaches = async (roomId: string) => {
    const res = await supabase
      .from("coaches")
      .select("id, coach_name")
      .eq("room_id", roomId)
      .order("coach_name", { ascending: true });

    if (!res.error && res.data) setCoaches(res.data as any);
  };

  // ----------------------------
  // Validate room/coach
  // ----------------------------
  useEffect(() => {
    const run = async () => {
      try {
        setStatus("loading");

        if (!roomCode) {
          setStatus("error");
          setErrorMsg("Missing room code in URL.");
          return;
        }

        if (!token) {
          setStatus("error");
          setErrorMsg("Missing coach token. Use your invite link.");
          return;
        }

        const roomRes = await supabase
          .from("rooms")
          .select("id, name, draft_order")
          .eq("room_code", roomCode)
          .maybeSingle();

        if (!roomRes.data) {
          setStatus("error");
          setErrorMsg("Room code not found.");
          return;
        }

        const coachRes = await supabase
          .from("coaches")
          .select("id, coach_name")
          .eq("room_id", roomRes.data.id)
          .eq("invite_token", token)
          .maybeSingle();

        if (!coachRes.data) {
          setStatus("error");
          setErrorMsg("Invalid token for this room.");
          return;
        }

        setRoom(roomRes.data as any);
        setCoach(coachRes.data as any);
        setStatus("ok");
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e?.message ?? "Unknown error");
      }
    };

    run();
  }, [roomCode, token]);

  // ----------------------------
  // Initial load
  // ----------------------------
  useEffect(() => {
    if (status !== "ok" || !room?.id) return;
    const load = async () => {
      await Promise.all([loadPlayers(room.id), loadPicks(room.id), loadCoaches(room.id)]);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, room?.id]);

  // ----------------------------
  // Realtime: picks changes (draft/undo) -> refresh picks for everyone
  // ----------------------------
  useEffect(() => {
    if (status !== "ok" || !room?.id) return;

    const channel = supabase
      .channel(`picks-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "picks", filter: `room_id=eq.${room.id}` },
        async () => {
          await loadPicks(room.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, room?.id]);

  // ----------------------------
  // Derived
  // ----------------------------
  const nCoaches = room?.draft_order?.length ?? 0;

  const draftedPlayerIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  const myPicks = useMemo(() => {
    if (!coach) return [];
    return picks
      .filter((p) => (p.coach?.id ? p.coach.id === coach.id : p.coach_id === coach.id))
      .sort((a, b) => a.round - b.round);
  }, [picks, coach]);

  const myTeamsUsed = useMemo(() => {
    return new Set(myPicks.map((p) => p.player?.nfl_team).filter(Boolean) as string[]);
  }, [myPicks]);

  const availablePlayers = useMemo(() => {
  const q = search.trim().toLowerCase();
  return players
    // ❌ Remove Kickers & DST completely
    .filter((p) => !["K", "DST"].includes(p.position))
    .filter((p) => !draftedPlayerIds.has(p.id))
    .filter((p) => (posFilter === "ALL" ? true : p.position === posFilter))
    .filter((p) => {
      if (!q) return true;
      return (
        p.player_name.toLowerCase().includes(q) ||
        p.nfl_team.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
      );
    });
}, [players, draftedPlayerIds, search, posFilter]);

  // NEXT overall pick = number of picks + 1
  const nextOverallPick = useMemo(() => picks.length + 1, [picks.length]);

  const nextSlot = useMemo(() => {
    if (!nCoaches) return { roundNumber: 0, pickInRound: 0 };
    return roundAndPickInRound(nextOverallPick, nCoaches);
  }, [nextOverallPick, nCoaches]);

  const onTheClockCoachId = useMemo(() => {
    if (!room?.draft_order?.length) return null;
    return getCoachIdForPick(nextOverallPick, room.draft_order);
  }, [room?.draft_order, nextOverallPick]);

  const onTheClockCoachName = useMemo(() => {
    if (!onTheClockCoachId) return "—";
    return coaches.find((c) => c.id === onTheClockCoachId)?.coach_name ?? "—";
  }, [coaches, onTheClockCoachId]);
  const upNextCoachId = useMemo(() => {
  if (!room?.draft_order?.length) return null;
  return getCoachIdForPick(nextOverallPick + 1, room.draft_order);
}, [room?.draft_order, nextOverallPick]);
const upNextCoachName = useMemo(() => {
  if (!upNextCoachId) return "—";
  return coaches.find((c) => c.id === upNextCoachId)?.coach_name ?? "—";
}, [coaches, upNextCoachId]);

  const isMyTurn = useMemo(() => {
    if (!coach?.id || !onTheClockCoachId) return false;
    return coach.id === onTheClockCoachId;
  }, [coach?.id, onTheClockCoachId]);

  const positions = ["ALL", "QB", "RB", "WR", "TE"];

  // ----------------------------
  // Actions
  // ----------------------------
  const draftPlayer = async (player: Player) => {
    if (!room || !coach) return;

    if (!room.draft_order?.length) {
      alert("Draft order is not set for this room.");
      return;
    }

    const expected = getCoachIdForPick(picks.length + 1, room.draft_order);
    if (expected !== coach.id) {
      alert(`Not your turn. On the clock: ${onTheClockCoachName}`);
      return;
    }

    setBusyPlayerId(player.id);

    try {
      // 1 NFL team per coach rule
      if (myTeamsUsed.has(player.nfl_team)) {
        alert(`You already drafted a player from ${player.nfl_team}. One per team.`);
        return;
      }

      // Prevent accidental duplicate in UI (DB should also enforce uniqueness if set)
      if (draftedPlayerIds.has(player.id)) {
        alert("That player is already drafted.");
        return;
      }

      const overallPickNumber = picks.length + 1;

      const { error } = await supabase.from("picks").insert({
        room_id: room.id,
        coach_id: coach.id,
        round: overallPickNumber, // we are using this column as overall pick #
        player_id: player.id,
      });

      if (error) {
        alert(error.message);
        return;
      }

      // realtime updates everyone; refresh this page immediately too
      await loadPicks(room.id);
    } catch (e: any) {
      alert(e?.message ?? "Unexpected error while drafting.");
    } finally {
      setBusyPlayerId(null);
    }
  };

  const undoLastPick = async () => {
    if (!room?.id) return;

    if (!isCommissioner) {
      alert("Commissioner only.");
      return;
    }

    const ok = confirm("Undo the most recent pick for this room?");
    if (!ok) return;

    try {
      const latest = await supabase
        .from("picks")
        .select("id, round, created_at")
        .eq("room_id", room.id)
        .order("round", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest.error) {
        alert(latest.error.message);
        return;
      }

      if (!latest.data) {
        alert("No picks to undo.");
        return;
      }

      const del = await supabase.from("picks").delete().eq("id", latest.data.id);
      if (del.error) {
        alert(del.error.message);
        return;
      }

      // realtime will update everyone; refresh this page immediately too
      await loadPicks(room.id);
    } catch (e: any) {
      alert(e?.message ?? "Undo failed.");
    }
  };

  // ----------------------------
  // Render states
  // ----------------------------
  if (status === "loading") {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-xl mx-auto">Loading draft room…</div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-xl mx-auto rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
          <h1 className="text-xl font-semibold">Can’t enter draft</h1>
          <p className="mt-2 text-white/80">{errorMsg}</p>
          <a className="inline-block mt-4 underline" href="/">
            Back to Join
          </a>
        </div>
      </main>
    );
  }

  // ----------------------------
  // Main UI
  // ----------------------------
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{room?.name}</h1>
              <p className="mt-1 text-white/70">
                Room code: <span className="font-mono">{roomCode}</span>
              </p>
              <p className="mt-1 text-white/70">
                You are drafting as: <span className="font-semibold">{coach?.coach_name}</span>
              </p>

              <p className="mt-2 text-white/80">
                On the clock:{" "}
                <span className={cx("font-semibold", isMyTurn && "text-green-300")}>
                  {onTheClockCoachName}
                </span>
                {!isMyTurn && <span className="text-white/60"> (not your turn)</span>}
              </p>
              <p className="mt-1 text-white/60">
  Up next: <span className="font-semibold">{upNextCoachName}</span>
</p>

              {isCommissioner && (
                <button
                  onClick={undoLastPick}
                  className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                >
                  Undo last pick
                </button>
              )}
            </div>

            <div className="text-sm text-white/70 text-right">
              <div>
                Overall pick: <span className="font-mono">{nextOverallPick}</span>
              </div>
              {nCoaches ? (
                <div className="mt-1 text-white/80">
                  Round <span className="font-mono">{nextSlot.roundNumber}</span>, Pick{" "}
                  <span className="font-mono">{nextSlot.pickInRound}</span>
                </div>
              ) : (
                <div className="mt-1 text-yellow-200/90">
                  Draft order not set (rooms.draft_order)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3 columns */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Player Pool */}
          <section className={paneClass("available") + " lg:col-span-5"}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Available Players</h2>
              <span className="text-sm text-white/60">{availablePlayers.length} available</span>
            </div>

            <div className="mt-4 flex flex-col md:flex-row gap-3">
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                placeholder="Search player / team / position…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-white/30"
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
              >
                {positions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {!room?.draft_order?.length && (
              <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-950/20 p-3 text-sm text-yellow-200">
                Draft order is not set for this room. Commissioner must set rooms.draft_order.
              </div>
            )}

            <div className="mt-4 max-h-[65vh] overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/60 backdrop-blur border-b border-white/10">
                  <tr className="text-left text-white/70">
                    <th className="p-3">Player</th>
                    <th className="p-3">Team</th>
                    <th className="p-3">Pos</th>
                    <th className="p-3">PPG</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {availablePlayers.map((p) => {
                    const teamUsed = myTeamsUsed.has(p.nfl_team);
                    const disabled = !isMyTurn || teamUsed || busyPlayerId === p.id;

                    return (
                      <tr
  key={p.id}
  className="border-b border-white/5"
>
                        <td className="p-3">{p.player_name}</td>
                        <td className={cx("p-3", teamUsed && "text-orange-300")}>
                          {p.nfl_team}
                        </td>
                        <td className="p-3">{p.position}</td>
                        <td className="p-3">{p.ppg ?? ""}</td>
                        <td className="p-3 text-right">
                          <button
                            className={cx(
                              "rounded-xl px-3 py-1.5 text-sm border transition",
                              disabled
                                ? "border-white/10 text-white/40 cursor-not-allowed"
                                : "border-white/20 hover:border-white/40"
                            )}
                            disabled={disabled}
                            onClick={() => draftPlayer(p)}
                            title={
                              !isMyTurn
                                ? `Not your turn. On the clock: ${onTheClockCoachName}`
                                : teamUsed
                                ? "You already drafted this NFL team"
                                : "Draft"
                            }
                          >
                            Draft
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!availablePlayers.length && (
                    <tr>
                      <td className="p-3 text-white/60" colSpan={5}>
                        No available players match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Draft Board */}
          <section className={paneClass("board") + " lg:col-span-4"}>
            <h2 className="text-lg font-semibold">Draft Board</h2>

            <div className="mt-4 max-h-[65vh] overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/60 backdrop-blur border-b border-white/10">
                  <tr className="text-left text-white/70">
                    <th className="p-3">Overall</th>
                    <th className="p-3">Round</th>
                    <th className="p-3">Coach</th>
                    <th className="p-3">Player</th>
                  </tr>
                </thead>

                <tbody>
                  {[...picks].reverse().map((pk, i, reversed) => {
                    const overallPick = pk.round; // stored as overall pick #
                    const { roundNumber, pickInRound } = nCoaches
                      ? roundAndPickInRound(overallPick, nCoaches)
                      : { roundNumber: 0, pickInRound: 0 };

                    const prev = reversed[i - 1];
                    const prevRound = prev && nCoaches
                      ? roundAndPickInRound(prev.round, nCoaches).roundNumber
                      : null;

                    const roundChanged = nCoaches ? prevRound !== roundNumber : i === 0;

                    // Alternating round shading
                    const roundTint = roundNumber % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent";

                    const isMine = pk.coach_id === coach?.id;

                    return (
                      <FragmentRow
                        key={pk.id}
                        roundChanged={roundChanged}
                        roundNumber={roundNumber}
                        rowClassName={cx(
                          "border-b border-white/5 transition",
                          roundTint,
                          isMine && "bg-sky-500/10"
                        )}
                        cells={{
                          overallPick,
                          roundLabel: nCoaches ? `${roundNumber}.${pickInRound}` : "—",
                          coachName: pk.coach?.coach_name ?? "—",
                          playerText: pk.player
                            ? `${pk.player.player_name} (${pk.player.nfl_team} ${pk.player.position})`
                            : "—",
                        }}
                      />
                    );
                  })}

                  {!picks.length && (
                    <tr>
                      <td className="p-3 text-white/60" colSpan={4}>
                        No picks yet.
                      </td>
                    </tr>
                  )}

                  {/* ON THE CLOCK row (next pick slot) */}
                  {nCoaches ? (
                    <tr className="border-t border-white/10 bg-emerald-500/10 ring-1 ring-emerald-400/20">
                      <td className="p-3 font-mono font-semibold">{nextOverallPick}</td>
                      <td className="p-3 font-mono">
                        {nextSlot.roundNumber}.{nextSlot.pickInRound}
                      </td>
                      <td className="p-3 font-semibold text-emerald-200">
                        {onTheClockCoachName} <span className="text-emerald-200/70">(ON THE CLOCK)</span>
                      </td>
                      <td className="p-3 text-white/60">—</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-white/50">
              Round.Pick format shown as <span className="font-mono">R.P</span> (example: 2.7 = Round 2, Pick 7 in round).
            </div>
          </section>

          {/* My Team */}
          <section className={paneClass("team") + " lg:col-span-3"}>
            <h2 className="text-lg font-semibold">My Team</h2>

            <div className="mt-3">
              <div className="text-sm text-white/70">Teams used</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from(myTeamsUsed).sort().map((t) => (
                  <span
                    key={t}
                    className="text-xs rounded-full border border-white/15 bg-black/30 px-2 py-1"
                  >
                    {t}
                  </span>
                ))}
                {!myTeamsUsed.size && (
                  <span className="text-sm text-white/60">None yet</span>
                )}
              </div>
            </div>

            <div className="mt-4 max-h-[52vh] overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/60 backdrop-blur border-b border-white/10">
                  <tr className="text-left text-white/70">
                    <th className="p-3">Player</th>
                    <th className="p-3">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {myPicks.map((pk) => {
  const pos = pk.player?.position ?? "";
  const s = teamPosStyles(pos);

  return (
    <tr key={pk.id} className={cx("border-b border-white/5", s.row)}>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span>{pk.player?.player_name ?? "—"}</span>

          {/* Position badge */}
          {pos ? (
            <span
              className={cx(
                "text-[11px] rounded-full border px-2 py-0.5",
                s.badge
              )}
            >
              {pos}
            </span>
          ) : null}
        </div>
      </td>

      <td className="p-3 text-white/70">{pk.player?.nfl_team ?? "—"}</td>
    </tr>
  );
})}
                  {!myPicks.length && (
                    <tr>
                      <td className="p-3 text-white/60" colSpan={2}>
                        You haven’t drafted anyone yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-white/50">
              Rule: max 1 player per NFL team (per coach). Duplicate players are blocked automatically.
              <div className="mt-2">
                <span className="inline-block mr-2 h-3 w-3 rounded bg-sky-500/30 align-middle" />
                Your picks are highlighted on the Draft Board.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * Helper component to render:
 * - Optional ROUND header row
 * - Then the pick row
 *
 * Kept at bottom for readability.
 */
function FragmentRow(props: {
  roundChanged: boolean;
  roundNumber: number;
  rowClassName: string;
  cells: {
    overallPick: number;
    roundLabel: string;
    coachName: string;
    playerText: string;
  };
}) {
  const { roundChanged, roundNumber, rowClassName, cells } = props;

  return (
    <>
      {roundChanged && (
        <tr>
          <td
            colSpan={4}
            className="px-3 py-2 text-xs font-semibold text-white/70 bg-white/5"
          >
            ROUND {roundNumber || "—"}
          </td>
        </tr>
      )}

      <tr className={rowClassName}>
        <td className="p-3 font-mono">{cells.overallPick}</td>
        <td className="p-3 font-mono">{cells.roundLabel}</td>
        <td className="p-3">{cells.coachName}</td>
        <td className="p-3">{cells.playerText}</td>
      </tr>
    </>
  );
}