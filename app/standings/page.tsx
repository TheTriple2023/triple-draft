import StandingsClient from "./standings-client";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: { room?: string; token?: string };
}) {
  const roomCode = (searchParams.room ?? "").trim();
  const token = (searchParams.token ?? "").trim();

  return <StandingsClient roomCode={roomCode} token={token} />;
}