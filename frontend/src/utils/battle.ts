import type { UnitDef, UnitUpgrade } from "../types";

//  Types 

export interface BattleTickState {
  tick: number;
  a_health: number;
  a_shield: number;
  a_fire: number;
  b_health: number;
  b_shield: number;
  b_fire: number;
  events: any[];
  activatedA?: number[];
  activatedB?: number[];
  cooldownsA?: number[];
  cooldownsB?: number[];
  stunsA?: number[];
  stunsB?: number[];
  targetsA?: number[];
  targetsB?: number[];
}

export interface BattleReplay {
  ticks: BattleTickState[];
  opponent: string;
  boardA?: number[];
  boardB?: number[];
}

//  Render helpers 
// AI helped make this look nice 
export function renderAbility(ability: unknown): string {
  if (typeof ability === "string") {
    if (ability === "Cleanse") return "🧼 Cleanse";
    if (ability === "None") return "⚪ None";
    return ability;
  }
  if (typeof ability !== "object" || ability === null)
    return JSON.stringify(ability);
  const [type, value] = Object.entries(ability)[0] ?? ["Unknown", null];
  switch (type) {
    case "Damage":
      return `⚔️ Damage ${value?.amount ?? "?"}${value?.lifesteal ? " (lifesteal)" : ""}`;
    case "Heal":
      return `❤️ Heal ${value?.amount ?? "?"}`;
    case "Shield":
      return `🛡️ Shield ${value?.amount ?? "?"}`;
    case "FireDot":
      return `🔥 Fire over time ${value?.amount ?? "?"}`;
    case "Stun":
      return `💫 Stun ${value?.duration ?? "?"} for ${value?.amount_of_targets ?? "?"} target(s)`;
    default:
      return `${type}: ${JSON.stringify(value)}`;
  }
}

export function renderUpgrade(upgrade: UnitUpgrade): string {
  const [type, value] = Object.entries(upgrade.upgrade)[0];
  if (value === null) return type;
  return `${type}: ${JSON.stringify(value)}`;
}

//  Log parsing 

export function parseBattleLogsFromTransaction(result: any): string[] {
  const logs: string[] = [];

  const collect = (item: any) => {
    if (!item) return;
    if (Array.isArray(item.outcome?.logs)) {
      for (const log of item.outcome.logs) {
        if (typeof log === "string") logs.push(log);
      }
    }
    if (Array.isArray(item.logs)) {
      for (const log of item.logs) {
        if (typeof log === "string") logs.push(log);
      }
    }
  };

  if (result?.transaction_outcome || result?.receipts_outcome) {
    collect(result.transaction_outcome);
    for (const receipt of result.receipts_outcome ?? []) {
      collect(receipt);
    }
  } else if (Array.isArray(result)) {
    for (const item of result) {
      collect(item);
    }
  }

  return logs
    .filter((log) => log.startsWith("BATTLE_LOG:"))
    .map((log) => log.slice("BATTLE_LOG:".length));
}

//  Replay computation 
//  COPY FROM THE CONTRACT
export function computeBattleState(
  battleLogJson: string,
  opponent: string,
  rosterDefs: UnitDef[],
  boardAIds: number[],
  boardBIds: number[],
): BattleReplay | null {
  try {
    const rawTicks = JSON.parse(battleLogJson);
    if (!Array.isArray(rawTicks)) return null;

    const rosterMap = new Map<number, UnitDef>();
    for (const def of rosterDefs) rosterMap.set(def.id, def);

    const makeUnits = (ids: number[]) =>
      ids.map((id) => {
        const def = rosterMap.get(id) ?? ({} as UnitDef);
        return {
          def_id: id,
          name: def?.name ?? `Unit ${id}`,
          base_cooldown: def?.base_cooldown ?? 1,
          cooldown_remaining: def?.base_cooldown ?? 1,
          stunned: 0,
          activated: false,
        };
      });

    const a_units = makeUnits(boardAIds ?? []);
    const b_units = makeUnits(boardBIds ?? []);

    let a_health = 100, a_shield = 0, a_fire = 0;
    let b_health = 100, b_shield = 0, b_fire = 0;

    const ticks: BattleTickState[] = [];

    for (const rawTick of rawTicks) {
      const tick = rawTick.tick ?? 0;
      const events = rawTick.events ?? [];
      const targetsA_this_tick: number[] = [];
      const targetsB_this_tick: number[] = [];

      for (const u of a_units) u.activated = false;
      for (const u of b_units) u.activated = false;

      for (const side of ["a", "b"] as const) {
        const units = side === "a" ? a_units : b_units;
        for (const unit of units) {
          if (unit.stunned > 0) {
            unit.stunned = Math.max(0, unit.stunned - 1);
            unit.cooldown_remaining = unit.base_cooldown;
          } else if (unit.cooldown_remaining > 0) {
            unit.cooldown_remaining -= 1;
          } else {
            unit.activated = true;
            unit.cooldown_remaining = unit.base_cooldown;
          }
        }
      }

      for (const event of events) {
        const ability = event.ability;
        const side = event.side;

        const units = side ? a_units : b_units;
        const targetUnits = side ? b_units : a_units;
        const unit = units.find((u) => u.def_id === event.id);
        if (unit) unit.activated = true;

        if (ability?.Damage) {
          const { amount, lifesteal } = ability.Damage;
          if (side) {
            const absorbed = Math.min(b_shield, amount);
            b_shield -= absorbed;
            b_health -= amount - absorbed;
            if (lifesteal) a_health += amount;
          } else {
            const absorbed = Math.min(a_shield, amount);
            a_shield -= absorbed;
            a_health -= amount - absorbed;
            if (lifesteal) b_health += amount;
          }
        } else if (ability?.Heal) {
          const { amount } = ability.Heal;
          if (side) a_health += amount;
          else b_health += amount;
        } else if (ability?.Shield) {
          const { amount } = ability.Shield;
          if (side) a_shield += amount;
          else b_shield += amount;
        } else if (ability?.FireDot) {
          const { amount } = ability.FireDot;
          if (side) b_fire += amount;
          else a_fire += amount;
        } else if (ability?.Cleanse) {
          if (side) a_fire = 0;
          else b_fire = 0;
        } else if (ability?.Stun) {
          const { duration, amount_of_targets } = ability.Stun;
          const evtTargets = event.target;
          if (Array.isArray(evtTargets) && evtTargets.length > 0) {
            for (const rawIdx of evtTargets) {
              const idx = Number(rawIdx);
              const t = targetUnits[idx];
              if (t) t.stunned = Math.max(t.stunned ?? 0, duration ?? 1);
              if (side) targetsB_this_tick.push(idx);
              else targetsA_this_tick.push(idx);
            }
          } else {
            for (let i = 0; i < (amount_of_targets ?? 1); i++) {
              const t = targetUnits[i];
              if (t) t.stunned = Math.max(t.stunned ?? 0, duration ?? 1);
              if (side) targetsB_this_tick.push(i);
              else targetsA_this_tick.push(i);
            }
          }
        }
      }

      if (tick % 2 === 0) {
        const b_absorbed = Math.min(b_shield, b_fire);
        b_shield -= b_absorbed;
        b_health -= b_fire - b_absorbed;
        b_fire = Math.max(0, b_fire - 1);

        const a_absorbed = Math.min(a_shield, a_fire);
        a_shield -= a_absorbed;
        a_health -= a_fire - a_absorbed;
        a_fire = Math.max(0, a_fire - 1);
      }

      ticks.push({
        tick,
        a_health, a_shield, a_fire,
        b_health, b_shield, b_fire,
        events,
        activatedA: a_units.filter((u) => u.activated).map((u) => u.def_id),
        activatedB: b_units.filter((u) => u.activated).map((u) => u.def_id),
        cooldownsA: a_units.map((u) => u.cooldown_remaining ?? 0),
        stunsA: a_units.map((u) => u.stunned ?? 0),
        cooldownsB: b_units.map((u) => u.cooldown_remaining ?? 0),
        stunsB: b_units.map((u) => u.stunned ?? 0),
        targetsA: targetsA_this_tick,
        targetsB: targetsB_this_tick,
      });
    }

    return { ticks, opponent, boardA: boardAIds, boardB: boardBIds };
  } catch (e) {
    console.error("Failed to parse battle log:", e);
    return null;
  }
}
