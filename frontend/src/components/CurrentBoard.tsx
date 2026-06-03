import type { PlayerState } from "../types";

interface Props {
  playerState: PlayerState | null;
}

export function CurrentBoard({ playerState }: Props) {
  return (
    <div className="card">
      <h2 className="card-title">Current Board</h2>
      {playerState?.board?.length ? (
        <ul>
          {playerState.board.map((unitId) => (
            <li key={unitId}>Unit ID: {unitId}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No board units available.</p>
      )}
    </div>
  );
}
