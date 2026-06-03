interface Props {
  opponents: string[];
  battleLoading: string | null;
  onBattle: (opponent: string) => void;
}

export function Opponents({ opponents, battleLoading, onBattle }: Props) {
  return (
    <div className="card">
      <h2 className="card-title">Possible Opponents</h2>
      {opponents.length ? (
        <ul>
          {opponents.map((opponent) => (
            <li
              key={opponent}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{opponent}</span>
              <button
                className="btn btn-primary"
                disabled={battleLoading === opponent}
                onClick={() => onBattle(opponent)}
              >
                {battleLoading === opponent ? "Battling…" : "Battle"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No other players are ready yet.</p>
      )}
    </div>
  );
}
