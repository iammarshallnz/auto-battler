import { useEffect, useState } from "react";
import type { PlayerState, UnitDef, UnitUpgrade } from "./types";
import {
  getAccountId,
  getShop,
  getCurrentState,
  getBoard,
  getRoster,
  getReadyPlayers,
  amIAdmin,
  createSeason,
  setActiveSeason,
  finishEditingSeason,
  addUnitToSeason,
  // getBazaarOffers,
  rollSeed,
  lockBoard,
  startBattle,
  isSignedIn,
  showModal,
  signOut,
} from "./wallet";

function renderAbility(ability: unknown) {
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

function renderUpgrade(upgrade: UnitUpgrade) {
  const [type, value] = Object.entries(upgrade.upgrade)[0];
  if (value === null) return type;
  return `${type}: ${JSON.stringify(value)}`;
}

interface BattleTickState {
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
}

interface BattleReplay {
  ticks: BattleTickState[];
  opponent: string;
  boardA?: number[];
  boardB?: number[];
}

function parseBattleLogsFromTransaction(result: any): string[] {
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

function computeBattleState(
  battleLogJson: string,
  opponent: string,
  rosterDefs: UnitDef[],
  boardAIds: number[],
  boardBIds: number[],
): BattleReplay | null {
  try {
    const rawTicks = JSON.parse(battleLogJson);
    if (!Array.isArray(rawTicks)) return null;
    // Build roster map for lookup
    const rosterMap = new Map<number, UnitDef>();
    for (const def of rosterDefs) rosterMap.set(def.id, def);

    // Initialize units for both sides from board ids
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

    let a_health = 100;
    let a_shield = 0;
    let a_fire = 0;
    let b_health = 100;
    let b_shield = 0;
    let b_fire = 0;

    const ticks: BattleTickState[] = [];

    for (const rawTick of rawTicks) {
      const tick = rawTick.tick ?? 0;
      const events = rawTick.events ?? [];

      // Reset activated flags
      for (const u of a_units) u.activated = false;
      for (const u of b_units) u.activated = false;

      // Simulate per-contract unit cooldown/stun decrement and mark actors
      for (const side of ["a", "b"] as const) {
        const units = side === "a" ? a_units : b_units;
        for (const unit of units) {
          if (unit.cooldown_remaining > 0) {
            if (unit.stunned > 0) {
              unit.stunned -= 1;
            } else {
              unit.cooldown_remaining -= 1;
            }
          } else {
            // This unit will act this tick (contract sets cooldown after action)
            unit.activated = true;
            unit.cooldown_remaining = unit.base_cooldown;
          }
        }
      }

      // Apply each event to compute aggregated state and mark specific units
      for (const event of events) {
        const ability = event.ability;
        const side = event.side; // true = player A fired, false = player B fired

        // Find matching unit instance to highlight (first match of def_id)
        const units = side ? a_units : b_units;
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
        }
      }

      // Apply fire damage on even ticks
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

      // collect activated ids for UI highlighting and cooldowns for display
      const activatedA = a_units
        .filter((u) => u.activated)
        .map((u) => u.def_id);
      const activatedB = b_units
        .filter((u) => u.activated)
        .map((u) => u.def_id);
      const cooldownsA = a_units.map((u) => u.cooldown_remaining ?? 0);
      const cooldownsB = b_units.map((u) => u.cooldown_remaining ?? 0);

      ticks.push({
        tick,
        a_health,
        a_shield,
        a_fire,
        b_health,
        b_shield,
        b_fire,
        events,
        activatedA,
        activatedB,
        cooldownsA,
        cooldownsB,
      });
    }

    return { ticks, opponent, boardA: boardAIds, boardB: boardBIds };
  } catch (e) {
    console.error("Failed to parse battle log:", e);
    return null;
  }
}

export default function App() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [shop, setShop] = useState<UnitDef[] | null>(null);
  const [selectedShop, setSelectedShop] = useState<number[]>([]);
  // const [bazaarOffers, setBazaarOffers] = useState<UnitUpgrade[] | null>(null)
  const [roster, setRoster] = useState<UnitDef[] | null>(null);
  const [readyPlayers, setReadyPlayers] = useState<string[] | null>(null);
  const [battleLogs, setBattleLogs] = useState<string[]>([]);
  const [battleLoading, setBattleLoading] = useState<string | null>(null);
  const [battleReplays, setBattleReplays] = useState<
    Record<string, BattleReplay>
  >({});
  const [currentReplay, setCurrentReplay] = useState<BattleReplay | null>(null);
  const [replayTick, setReplayTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [unregistered, setUnregistered] = useState(false);
  const [adminSeasonId, setAdminSeasonId] = useState<string>("");
  const [adminSeasonName, setAdminSeasonName] = useState<string>("");
  const [adminRosterJson, setAdminRosterJson] = useState<string>("");
  const [adminUnitJson, setAdminUnitJson] = useState<string>("");
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<string>("");

  async function loadPlayerData(account: string) {
    setLoading(true);
    setError(null);

    try {
      
      // The contract may return either a full PlayerState, a PlayerStatus string, or null for new players.
      const current: any = await getCurrentState(account);
      console.log(current);
      if (current === null || current.status === "Unregistered") {
        setUnregistered(true);
        setPlayerState(null);
        setShop(null);
        //setBazaarOffers(null)
        setRoster(null);
        setReadyPlayers(null);
      } else {
        setUnregistered(false);

        if (typeof current !== "string") {
          setPlayerState(current);
        }

        const [shopData, rosterData, readyPlayersData] = await Promise.all([
          getShop(account).catch(() => [] as any),
          //getBazaarOffers(account).catch(() => [] as any),
          getRoster(),
          getReadyPlayers().catch(() => [] as any),
        ]);

        setShop(shopData);
        // setBazaarOffers(bazaarData)
        setRoster(rosterData);
        setReadyPlayers(readyPlayersData);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("Player not registered")) {
        setUnregistered(true);
        setPlayerState(null);
        setShop(null);
        //setBazaarOffers(null)
        setRoster(null);
        setReadyPlayers(null);
        setError(null);
      } else {
        setError(message);
        setPlayerState(null);
        setShop(null);
        //setBazaarOffers(null)
        setRoster(null);
        setReadyPlayers(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      if (isSignedIn()) {
        const id = await getAccountId();
        if (id) {
          setAccountId(id);
          const admin = await amIAdmin();
          console.log(admin)
          setIsAdmin(admin);
          await loadPlayerData(id);
          return;
        }
      }
      setLoading(false);
    }

    init();
  }, []);

  // ── Wallet connection ──────────────────────────────────────────────────────

  // ── Wallet connection ──────────────────────────────────────────────────────

  async function handleConnect() {
    showModal();
    const interval = setInterval(async () => {
      if (isSignedIn()) {
        const id = await getAccountId();
        if (id) {
          clearInterval(interval);
          setAccountId(id);
          const admin = await amIAdmin();
          setIsAdmin(admin);
          await loadPlayerData(id);
        }
      }
    }, 500);
  }

  async function handleSignOut() {
    await signOut();
    setAccountId(null);
    setPlayerState(null);
    setShop(null);
    //setBazaarOffers(null)
    setRoster(null);
    setReadyPlayers(null);
    setBattleLogs([]);
    setSelectedShop([]);
    setUnregistered(false);
    setError(null);
    setIsAdmin("");
    setLoading(false);
  }

  async function handleRegister() {
    if (!accountId) return;
    setRegisterLoading(true);
    setError(null);
    setUnregistered(false);
    try {
      await rollSeed(1, "1");
      // Wait for transaction to be finalized on-chain
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await loadPlayerData(accountId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setRegisterLoading(false);
    }
  }

  const readyOpponentList =
    readyPlayers?.filter((opponent) => opponent !== accountId) ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading player data…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1 className="site-title">Auto Battler Dashboard</h1>

        {accountId ? (
          <div className="account-bar">
            <span className="account-id">{accountId}</span>
            <button className="btn btn-secondary" onClick={handleSignOut}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleConnect}>
            Connect Wallet
          </button>
        )}
      </header>

      <main>
        {error ? (
          <div className="card error">
            <p>{error}</p>
          </div>
        ) : null}

        {!accountId ? (
          <div className="card">
            <h2>Welcome</h2>
            <p className="muted">
              Connect your NEAR wallet to show your current auto battler game
              data.
            </p>
          </div>
        ) : unregistered ? (
          <div className="card">
            <h2 className="card-title">Register</h2>
            <p className="muted">
              You are not registered yet. Register now by sending 1 NEAR to the
              contract.
            </p>
            <button
              className="btn btn-primary"
              disabled={registerLoading}
              onClick={handleRegister}
            >
              {registerLoading ? "Registering…" : "Register for 1 NEAR"}
            </button>
          </div>
        ) : (
          <>
            <div className="card">
              <h2 className="card-title">Player Summary</h2>
              <p>
                <strong>Status:</strong> {playerState?.status ?? "Unknown"}
              </p>
              <p>
                <strong>Season:</strong>{" "}
                {playerState?.season_id !== null
                  ? playerState?.season_id
                  : "N/A"}
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

            {playerState?.status === "HasShop" && (
              <div className="card">
                <h2 className="card-title">Shop Offers</h2>
                {shop?.length ? (
                  <>
                    <p className="muted">
                      Select up to 3 units to lock into your board.
                    </p>
                    <ul className="shop-list">
                      {shop.map((item) => {
                        const selected = selectedShop.includes(item.id);
                        const disabled = !selected && selectedShop.length >= 3;
                        return (
                          <li
                            key={item.id}
                            className={`shop-item ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                          >
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={disabled}
                                onChange={() => {
                                  setSelectedShop((prev) => {
                                    if (prev.includes(item.id))
                                      return prev.filter(
                                        (id) => id !== item.id,
                                      );
                                    if (prev.length >= 3) return prev;
                                    return [...prev, item.id];
                                  });
                                }}
                              />
                              <div>
                                <strong>{item.name}</strong> (ID: {item.id}) —{" "}
                                {item.enabled ? "Enabled" : "Disabled"}
                                <div className="hint">
                                  Abilities:{" "}
                                  {item.abilitys.map(renderAbility).join(", ")}
                                </div>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    <div style={{ marginTop: 8 }}>
                      <span className="muted">
                        Selected: {selectedShop.length}/3
                      </span>
                      {selectedShop.length === 3 && (
                        <button
                          className="btn btn-primary"
                          style={{ marginLeft: 12 }}
                          disabled={lockLoading}
                          onClick={async () => {
                            if (!accountId) return;
                            setLockLoading(true);
                            try {
                              await lockBoard(selectedShop);
                              // Wait for transaction to be finalized on-chain
                              await new Promise((resolve) =>
                                setTimeout(resolve, 3000),
                              );
                              // reload player data to reflect locked board
                              await loadPlayerData(accountId);
                              setSelectedShop([]);
                            } catch (e: unknown) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Failed to lock board",
                              );
                            } finally {
                              setLockLoading(false);
                            }
                          }}
                        >
                          {lockLoading ? "Locking…" : "Lock Board"}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="muted">No shop offers loaded yet.</p>
                )}
              </div>
            )}

            {playerState?.status === "Ready" && (
              <div className="card">
                <h2 className="card-title">Possible Opponents</h2>
                {readyOpponentList.length ? (
                  <ul>
                    {readyOpponentList.map((opponent) => (
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
                          onClick={async () => {
                            if (!accountId) return;
                            setError(null);
                            setBattleLoading(opponent);
                            try {
                              const result = await startBattle(opponent);
                              const logs =
                                parseBattleLogsFromTransaction(result);
                              if (logs.length) {
                                const battleLogJson = logs[0];
                                // fetch both players' boards to build per-unit displays
                                const [boardAState, boardBState] =
                                  await Promise.all([
                                    getBoard(accountId),
                                    getBoard(opponent),
                                  ]);
                                const boardAIds = boardAState?.board ?? [];
                                const boardBIds = boardBState?.board ?? [];
                                const replay = computeBattleState(
                                  battleLogJson,
                                  opponent,
                                  roster ?? [],
                                  boardAIds,
                                  boardBIds,
                                );
                                if (replay) {
                                  setBattleReplays((prev) => ({
                                    ...prev,
                                    [opponent]: replay,
                                  }));
                                  setBattleLogs((prev) => [
                                    ...prev,
                                    `Battle vs ${opponent}: ${replay.ticks.length} ticks`,
                                  ]);
                                } else {
                                  setBattleLogs((prev) => [
                                    ...prev,
                                    `Battle vs ${opponent}: failed to parse log`,
                                  ]);
                                }
                              } else {
                                setBattleLogs((prev) => [
                                  ...prev,
                                  `Battle vs ${opponent}: no BATTLE_LOG returned`,
                                ]);
                              }
                              await new Promise((resolve) =>
                                setTimeout(resolve, 3000),
                              );
                              await loadPlayerData(accountId);
                            } catch (e: unknown) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Failed to start battle",
                              );
                            } finally {
                              setBattleLoading(null);
                            }
                          }}
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
            )}
            {battleLogs.length > 0 && (
              <div className="card">
                <h2 className="card-title">Battle Logs</h2>
                <ul>
                  {battleLogs.map((log, index) => (
                    <li key={`${log}-${index}`}>{log}</li>
                  ))}
                </ul>
              </div>
            )}

            {Object.keys(battleReplays).length > 0 && (
              <div className="card">
                <h2 className="card-title">Battle Replays</h2>
                {!currentReplay ? (
                  <ul>
                    {Object.entries(battleReplays).map(
                      ([opponent, _replay]) => (
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
                      ),
                    )}
                  </ul>
                ) : (
                  <div style={{ marginTop: "12px" }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCurrentReplay(null)}
                      style={{ marginBottom: "16px" }}
                    >
                      Back to Replays
                    </button>
                    <div
                      style={{ marginTop: "16px", display: "flex", gap: "8px" }}
                    >
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
                    <div style={{ marginBottom: "16px" }}>
                      <p>
                        <strong>Battle vs {currentReplay.opponent}</strong> —
                        Tick {replayTick + 1} / {currentReplay.ticks.length}
                      </p>

                      {currentReplay.ticks[replayTick] && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "16px",
                            marginTop: "12px",
                          }}
                        >
                          <div
                            style={{ border: "1px solid #ccc", padding: "8px" }}
                          >
                            <p>
                              <strong>Your Side (A)</strong>
                            </p>
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              {(currentReplay.boardA ?? []).map((id, idx) => {
                                const def = roster?.find((r) => r.id === id);
                                const activated =
                                  currentReplay.ticks[
                                    replayTick
                                  ]?.activatedA?.includes(id);
                                const cd =
                                  currentReplay.ticks[replayTick]?.cooldownsA?.[
                                    idx
                                  ];
                                // compute damage events for this unit this tick
                                const damageEvents = (
                                  currentReplay.ticks[replayTick]?.events || []
                                ).filter(
                                  (ev) =>
                                    ev.side === true &&
                                    ev.id === id &&
                                    ev.ability?.Damage,
                                );
                                const totalDamage = damageEvents.reduce(
                                  (sum, ev) =>
                                    sum + (ev.ability?.Damage?.amount ?? 0),
                                  0,
                                );
                                return (
                                  <div
                                    key={id + "-a-" + idx}
                                    style={{
                                      border: `4px solid ${activated ? "#00ff08" : "#ddd"}`,
                                      padding: "8px",
                                      minWidth: "140px",
                                      background: activated
                                        ? "#428948"
                                        : "#428948",
                                      position: "relative",
                                    }}
                                  >
                                    <div style={{ fontWeight: 600 }}>
                                      {def?.name ?? `Unit ${id}`}
                                    </div>
                                    <div
                                      style={{ fontSize: 12, color: "#555" }}
                                    >
                                      ID: {id}
                                    </div>
                                    <div style={{ fontSize: 12 }}>
                                      CD:{" "}
                                      <strong>
                                        {cd ?? def?.base_cooldown ?? "?"}
                                      </strong>
                                    </div>
                                    <div style={{ fontSize: 12, marginTop: 6 }}>
                                      {def?.abilitys
                                        ?.slice(0, 2)
                                        .map((a, i) => (
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
                                          background: "#c8e6c9",
                                          color: "#1b5e20",
                                          padding: "4px 6px",
                                          borderRadius: 4,
                                          fontWeight: 700,
                                        }}
                                      >
                                        {totalDamage}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div style={{ marginTop: 8 }}>
                              <p>
                                HP:{" "}
                                <strong>
                                  {currentReplay.ticks[replayTick].a_health}
                                </strong>
                              </p>
                              <p>
                                Shield:{" "}
                                <strong>
                                  {currentReplay.ticks[replayTick].a_shield}
                                </strong>
                              </p>
                              <p>
                                Fire:{" "}
                                <strong>
                                  {currentReplay.ticks[replayTick].a_fire}
                                </strong>
                              </p>
                            </div>
                          </div>

                          <div
                            style={{ border: "1px solid #ccc", padding: "8px" }}
                          >
                            <p>
                              <strong>Opponent (B)</strong>
                            </p>
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              {(currentReplay.boardB ?? []).map((id, idx) => {
                                const def = roster?.find((r) => r.id === id);
                                const activated =
                                  currentReplay.ticks[
                                    replayTick
                                  ]?.activatedB?.includes(id);
                                const cd =
                                  currentReplay.ticks[replayTick]?.cooldownsB?.[
                                    idx
                                  ];
                                const damageEvents = (
                                  currentReplay.ticks[replayTick]?.events || []
                                ).filter(
                                  (ev) =>
                                    ev.side === false &&
                                    ev.id === id &&
                                    ev.ability?.Damage,
                                );
                                const totalDamage = damageEvents.reduce(
                                  (sum, ev) =>
                                    sum + (ev.ability?.Damage?.amount ?? 0),
                                  0,
                                );
                                return (
                                  <div
                                    key={id + "-b-" + idx}
                                    style={{
                                      border: `4px solid ${activated ? "#f81505" : "#ddd"}`,
                                      padding: "8px",
                                      minWidth: "140px",
                                      background: activated
                                        ? "#672b34"
                                        : "#672b34",
                                      position: "relative",
                                    }}
                                  >
                                    <div style={{ fontWeight: 600 }}>
                                      {def?.name ?? `Unit ${id}`}
                                    </div>
                                    <div
                                      style={{ fontSize: 12, color: "#555" }}
                                    >
                                      ID: {id}
                                    </div>
                                    <div style={{ fontSize: 12 }}>
                                      CD:{" "}
                                      <strong>
                                        {cd ?? def?.base_cooldown ?? "?"}
                                      </strong>
                                    </div>
                                    <div style={{ fontSize: 12, marginTop: 6 }}>
                                      {def?.abilitys
                                        ?.slice(0, 2)
                                        .map((a, i) => (
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
                                          background: "#ffcdd2",
                                          color: "#b71c1c",
                                          padding: "4px 6px",
                                          borderRadius: 4,
                                          fontWeight: 700,
                                        }}
                                      >
                                        {totalDamage}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <div style={{ marginTop: 8 }}>
                              <p>
                                HP:{" "}
                                <strong>
                                  {currentReplay.ticks[replayTick].b_health}
                                </strong>
                              </p>
                              <p>
                                Shield:{" "}
                                <strong>
                                  {currentReplay.ticks[replayTick].b_shield}
                                </strong>
                              </p>
                              <p>
                                Fire:{" "}
                                <strong>
                                  {currentReplay.ticks[replayTick].b_fire}
                                </strong>
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {currentReplay.ticks[replayTick]?.events.length > 0 && (
                        <div style={{ marginTop: "16px" }}>
                          <p>
                            <strong>Events:</strong>
                          </p>
                          <ul>
                            {currentReplay.ticks[replayTick].events.map(
                              (event, idx) => (
                                <li key={idx}>
                                  Unit {event.id} (
                                  {event.side ? "Your Side" : "Opponent"}):
                                  {renderAbility(event.ability)}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <h2 className="card-title">Unit Roster</h2>
              {roster?.length ? (
                <ul>
                  {roster.slice(0, 10).map((unit) => (
                    <li key={unit.id}>
                      {unit.name} (ID: {unit.id})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Roster data is not available.</p>
              )}
            </div>

            {isAdmin === accountId && (
              <div className="card">
                <h2 className="card-title">Admin Panel</h2>
                <p className="muted">
                  Admin-only season management. Contract will reject non-admins.
                </p>
                <div style={{ marginBottom: 8 }}>
                  <label>Season ID</label>
                  <input
                    value={adminSeasonId}
                    onChange={(e) => setAdminSeasonId(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>Season Name</label>
                  <input
                    value={adminSeasonName}
                    onChange={(e) => setAdminSeasonName(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>Roster JSON (array of UnitDef)</label>
                  <textarea
                    value={adminRosterJson}
                    onChange={(e) => setAdminRosterJson(e.target.value)}
                    rows={4}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setAdminMessage(null);
                      try {
                        const id = Number(adminSeasonId);
                        const rosterParsed = adminRosterJson
                          ? JSON.parse(adminRosterJson)
                          : [];
                        await createSeason(
                          id,
                          adminSeasonName || `Season ${id}`,
                          rosterParsed,
                        );
                        setAdminMessage("Season created (or call succeeded).");
                        const newRoster = await getRoster();
                        setRoster(newRoster);
                      } catch (e: unknown) {
                        setAdminMessage(
                          e instanceof Error ? e.message : String(e),
                        );
                      }
                    }}
                  >
                    Create Season
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      setAdminMessage(null);
                      try {
                        const id = Number(adminSeasonId);
                        await setActiveSeason(id);
                        setAdminMessage("Set active season.");
                      } catch (e: unknown) {
                        setAdminMessage(
                          e instanceof Error ? e.message : String(e),
                        );
                      }
                    }}
                  >
                    Set Active
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      setAdminMessage(null);
                      try {
                        const id = Number(adminSeasonId);
                        await finishEditingSeason(id);
                        setAdminMessage("Finished editing season.");
                      } catch (e: unknown) {
                        setAdminMessage(
                          e instanceof Error ? e.message : String(e),
                        );
                      }
                    }}
                  >
                    Finish Editing
                  </button>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label>Unit JSON (single UnitDef)</label>
                  <textarea
                    value={adminUnitJson}
                    onChange={(e) => setAdminUnitJson(e.target.value)}
                    rows={3}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      setAdminMessage(null);
                      try {
                        const id = Number(adminSeasonId);
                        const unit = adminUnitJson
                          ? JSON.parse(adminUnitJson)
                          : null;
                        if (!unit) throw new Error("Unit JSON required");
                        await addUnitToSeason(id, unit);
                        setAdminMessage("Unit added to season.");
                        const newRoster = await getRoster();
                        setRoster(newRoster);
                      } catch (e: unknown) {
                        setAdminMessage(
                          e instanceof Error ? e.message : String(e),
                        );
                      }
                    }}
                  >
                    Add Unit
                  </button>
                </div>
                {adminMessage && <p style={{ marginTop: 8 }}>{adminMessage}</p>}
              </div>
            )}
          </>
        )} 
      </main>
    </div>
  );
}
