import { useEffect, useState } from "react";
import type { PlayerState, UnitDef, UnitUpgrade } from "./types";
import {
  getAccountId,
  getShop,
  getCurrentState,
  getRoster,
  getReadyPlayers,
  // getBazaarOffers,
  rollSeed,
  lockBoard,
  startBattle,
  isSignedIn,
  showModal,
  signOut,
} from "./wallet";

function renderAbility(ability: unknown) {
  if (typeof ability === "string") return ability;
  if (typeof ability !== "object" || ability === null)
    return JSON.stringify(ability);
  const [type, value] = Object.entries(ability)[0] ?? ["Unknown", null];
  if (value === null) return type;
  return `${type}: ${JSON.stringify(value)}`;
}

function renderUpgrade(upgrade: UnitUpgrade) {
  const [type, value] = Object.entries(upgrade.upgrade)[0];
  if (value === null) return type;
  return `${type}: ${JSON.stringify(value)}`;
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
  const [error, setError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [unregistered, setUnregistered] = useState(false);

  async function loadPlayerData(account: string) {
    setLoading(true);
    setError(null);

    try {
      // The contract may return either a full PlayerState, a PlayerStatus string, or null for new players.
      const current: any = await getCurrentState(account);
      console.log(current)
      if (
        current === null || current.status === "Unregistered"
      ) {
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
      await new Promise(resolve => setTimeout(resolve, 3000));
      await loadPlayerData(accountId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setRegisterLoading(false);
    }
  }

  const readyOpponentList = readyPlayers?.filter(
    (opponent) => opponent !== accountId,
  ) ?? [];

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
                                      return prev.filter((id) => id !== item.id);
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
                              await new Promise(resolve => setTimeout(resolve, 3000));
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
                      <li key={opponent} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                              const logs = parseBattleLogsFromTransaction(result);
                              if (logs.length) {
                                setBattleLogs((prev) => [
                                  ...prev,
                                  `Battle vs ${opponent}: ${logs.join(" | ")}`,
                                ]);
                              } else {
                                setBattleLogs((prev) => [
                                  ...prev,
                                  `Battle vs ${opponent}: no BATTLE_LOG returned`,
                                ]);
                              }
                              await new Promise((resolve) => setTimeout(resolve, 3000));
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

            {/* <div className="card">
              <h2 className="card-title">Bazaar Offers</h2>
              {bazaarOffers?.length ? (
                <ul>
                  {bazaarOffers.map((offer, index) => (
                    <li key={index}>
                      Unit ID: {offer.unit_id} — {renderUpgrade(offer)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No bazaar offers available.</p>
              )}
            </div> */}

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
          </>
        )}
      </main>
    </div>
  );
}
