import type { PlayerState } from "../types";

interface Props {
  playerState: PlayerState | null;
}

export function PlayerSummary({ playerState }: Props) {
  return (
    <div className="card">
      <h2 className="card-title">Player Summary</h2>
      <p>
        <strong>Status:</strong> {playerState?.status ?? "Unknown"}
      </p>
      <p>
        <strong>Season:</strong>{" "}
        {playerState?.season_id !== null ? playerState?.season_id : "N/A"}
      </p>
      <p>
        <strong>Games played:</strong> {playerState?.games_played ?? 0}
      </p>
      <p>
        <strong>Games won:</strong> {playerState?.games_won ?? 0}
      </p>
      <p>
        <strong>Seed:</strong>{" "}
        {playerState?.seed
          ? playerState.seed.join(", ")
          : "No seed available"}
      </p>
    </div>
  );
}
