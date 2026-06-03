import { useState } from "react";
import type { BattleReplay as BattleReplayType } from "../utils/battle";
import { renderAbility } from "../utils/battle";
import { UnitCard } from "./UnitCard";
import type { UnitDef } from "../types";

interface Props {
  battleReplays: Record<string, BattleReplayType>;
  roster: UnitDef[] | null;
}

export function BattleReplay({ battleReplays, roster }: Props) {
  const [currentReplay, setCurrentReplay] = useState<BattleReplayType | null>(null);
  const [replayTick, setReplayTick] = useState(0);

  const tick = currentReplay?.ticks[replayTick];

  return (
    <div className="card">
      <h2 className="card-title">Battle Replays</h2>

      {!currentReplay ? (
        <ul>
          {Object.entries(battleReplays).map(([opponent]) => (
            <li key={opponent} style={{ marginBottom: "8px" }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCurrentReplay(battleReplays[opponent]);
                  setReplayTick(0);
                }}
              >
                View Battle vs {opponent}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ marginTop: "12px" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentReplay(null)}
            style={{ marginBottom: "16px" }}
          >
            ← Back to Replays
          </button>

          <p>
            <strong>Battle vs {currentReplay.opponent}</strong> — Tick{" "}
            {replayTick + 1} / {currentReplay.ticks.length}
          </p>

          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button
              className="btn btn-secondary"
              disabled={replayTick === 0}
              onClick={() => setReplayTick((t) => t - 1)}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={replayTick >= currentReplay.ticks.length - 1}
              onClick={() => setReplayTick((t) => t + 1)}
            >
              Next
            </button>
          </div>

          {tick && (
            <div style={{ marginTop: "16px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  marginTop: "12px",
                }}
              >
                {/* Side A */}
                <div style={{ border: "1px solid #ccc", padding: "8px" }}>
                  <p>
                    <strong>Your Side (A)</strong>
                  </p>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(currentReplay.boardA ?? []).map((id, idx) => (
                      <UnitCard
                        key={`${id}-a-${idx}`}
                        id={id}
                        idx={idx}
                        def={roster?.find((r) => r.id === id)}
                        tick={tick}
                        side="a"
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <p>HP: <strong>{tick.a_health}</strong></p>
                    <p>Shield: <strong>{tick.a_shield}</strong></p>
                    <p>Fire: <strong>{tick.a_fire}</strong></p>
                  </div>
                </div>

                {/* Side B */}
                <div style={{ border: "1px solid #ccc", padding: "8px" }}>
                  <p>
                    <strong>Opponent (B)</strong>
                  </p>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(currentReplay.boardB ?? []).map((id, idx) => (
                      <UnitCard
                        key={`${id}-b-${idx}`}
                        id={id}
                        idx={idx}
                        def={roster?.find((r) => r.id === id)}
                        tick={tick}
                        side="b"
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <p>HP: <strong>{tick.b_health}</strong></p>
                    <p>Shield: <strong>{tick.b_shield}</strong></p>
                    <p>Fire: <strong>{tick.b_fire}</strong></p>
                  </div>
                </div>
              </div>

              {tick.events.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <p>
                    <strong>Events:</strong>
                  </p>
                  <ul>
                    {tick.events.map((event: any, idx: number) => (
                      <li key={idx}>
                        Unit {event.id} ({event.side ? "Your Side" : "Opponent"}
                        ): {renderAbility(event.ability)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
