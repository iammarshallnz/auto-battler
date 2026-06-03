import { renderAbility } from "../utils/battle";
import type { BattleTickState } from "../utils/battle";
import type { UnitDef } from "../types";

interface Props {
  id: number;
  idx: number;
  def: UnitDef | undefined;
  tick: BattleTickState;
  side: "a" | "b";
}

export function UnitCard({ id, idx, def, tick, side }: Props) {
  const isA = side === "a";
  const activated = isA
    ? tick.activatedA?.includes(id)
    : tick.activatedB?.includes(id);
  const cd = isA ? tick.cooldownsA?.[idx] : tick.cooldownsB?.[idx];
  const stun = isA ? tick.stunsA?.[idx] : tick.stunsB?.[idx];
  const isTarget = isA
    ? (tick.targetsA || []).includes(idx)
    : (tick.targetsB || []).includes(idx);

  const damageEvents = (tick.events || []).filter(
    (ev) => ev.side === isA && ev.id === id && ev.ability?.Damage,
  );
  const totalDamage = damageEvents.reduce(
    (sum: number, ev: any) => sum + (ev.ability?.Damage?.amount ?? 0),
    0,
  );

  const activeBorderColor = isA ? "#00ff08" : "#f81505";
  const bgColor = isA ? "#428948" : "#672b34";

  return (
    <div
      style={{
        border: `4px solid ${activated ? activeBorderColor : "#ddd"}`,
        padding: "8px",
        minWidth: "140px",
        background: bgColor,
        position: "relative",
      }}
    >
      <div style={{ fontWeight: 600 }}>{def?.name ?? `Unit ${id}`}</div>
      <div style={{ fontSize: 12, color: "#555" }}>ID: {id}</div>
      <div style={{ fontSize: 12 }}>
        CD: <strong>{cd ?? def?.base_cooldown ?? "?"}</strong>
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}>
        {def?.abilitys?.slice(0, 2).map((a: unknown, i: number) => (
          <div key={i} style={{ fontSize: 11 }}>
            {renderAbility(a)}
          </div>
        ))}
      </div>

      {activated && totalDamage > 0 && (
        <div
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            background: isA ? "#c8e6c9" : "#ffcdd2",
            color: isA ? "#1b5e20" : "#b71c1c",
            padding: "4px 6px",
            borderRadius: 4,
            fontWeight: 700,
          }}
        >
          {totalDamage}
        </div>
      )}

      {(stun ?? 0) > 0 && (
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            background: "#ffeb3b",
            color: "#000",
            padding: "2px 6px",
            borderRadius: 4,
            fontWeight: 700,
          }}
        >
          💫 {stun} 
        </div>
      )}

      {/* {isTarget && (
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            background: "#ff9800",
            color: "#fff",
            padding: "2px 6px",
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          TARGET
        </div>
      )} */}
    </div>
  );
}
