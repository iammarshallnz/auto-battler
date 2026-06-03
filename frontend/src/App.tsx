import { useEffect, useState } from "react";
import type { PlayerState, UnitDef } from "./types";
import {
  getAccountId,
  getShop,
  getCurrentState,
  getBoard,
  getRoster,
  getReadyPlayers,
  amIAdmin,
  rollSeed,
  lockBoard,
  startBattle,
  isSignedIn,
  showModal,
  signOut,
} from "./wallet";

import { PlayerSummary } from "./components/PlayerSummary";
import { CurrentBoard } from "./components/CurrentBoard";
import { ShopOffers } from "./components/ShopOffers";
import { Opponents } from "./components/Opponents";
import { BattleReplay } from "./components/BattleReplay";
import { AdminPanel } from "./components/AdminPanel";
import {
  parseBattleLogsFromTransaction,
  computeBattleState,
} from "./utils/battle";
import type { BattleReplay as BattleReplayType } from "./utils/battle";

export default function App() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [shop, setShop] = useState<UnitDef[] | null>(null);
  const [selectedShop, setSelectedShop] = useState<number[]>([]);
  const [roster, setRoster] = useState<UnitDef[] | null>(null);
  const [readyPlayers, setReadyPlayers] = useState<string[] | null>(null);
  const [battleLogs, setBattleLogs] = useState<string[]>([]);
  const [battleLoading, setBattleLoading] = useState<string | null>(null);
  const [battleReplays, setBattleReplays] = useState<Record<string, BattleReplayType>>({});
  const [error, setError] = useState<string | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [unregistered, setUnregistered] = useState(false);
  const [isAdmin, setIsAdmin] = useState<string>("");

  // ── Data loading ───────────────────────────────────────────────────────────

  async function loadPlayerData(account: string) {
    setLoading(true);
    setError(null);
    try {
      const current: any = await getCurrentState(account);
      if (current === null || current.status === "Unregistered") {
        setUnregistered(true);
        setPlayerState(null);
        setShop(null);
        setRoster(null);
        setReadyPlayers(null);
      } else {
        setUnregistered(false);
        if (typeof current !== "string") setPlayerState(current);

        const [shopData, rosterData, readyPlayersData] = await Promise.all([
          getShop(account).catch(() => [] as any),
          getRoster(),
          getReadyPlayers().catch(() => [] as any),
        ]);

        setShop(shopData);
        setRoster(rosterData);
        setReadyPlayers(readyPlayersData);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("Player not registered")) {
        setUnregistered(true);
        setPlayerState(null);
        setShop(null);
        setRoster(null);
        setReadyPlayers(null);
        setError(null);
      } else {
        setError(message);
        setPlayerState(null);
        setShop(null);
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
          setIsAdmin(await amIAdmin());
          await loadPlayerData(id);
          return;
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  //  Wallet handlers 

  async function handleConnect() {
    showModal();
    const interval = setInterval(async () => {
      if (isSignedIn()) {
        const id = await getAccountId();
        if (id) {
          clearInterval(interval);
          setAccountId(id);
          setIsAdmin(await amIAdmin());
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
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await loadPlayerData(accountId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setRegisterLoading(false);
    }
  }

  //  Shop handlers 

  function handleShopToggle(id: number) {
    setSelectedShop((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function handleLockBoard() {
    if (!accountId) return;
    setLockLoading(true);
    try {
      await lockBoard(selectedShop);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await loadPlayerData(accountId);
      setSelectedShop([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to lock board");
    } finally {
      setLockLoading(false);
    }
  }

  //  Battle handler

  async function handleBattle(opponent: string) {
    if (!accountId) return;
    setError(null);
    setBattleLoading(opponent);
    try {
      const result = await startBattle(opponent);
      const logs = parseBattleLogsFromTransaction(result);
      if (logs.length) {
        const [boardAState, boardBState] = await Promise.all([
          getBoard(accountId),
          getBoard(opponent),
        ]);
        const replay = computeBattleState(
          logs[0],
          opponent,
          roster ?? [],
          boardAState?.board ?? [],
          boardBState?.board ?? [],
        );
        if (replay) {
          setBattleReplays((prev) => ({ ...prev, [opponent]: replay }));
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
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await loadPlayerData(accountId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start battle");
    } finally {
      setBattleLoading(null);
    }
  }

  //  Render 

  const readyOpponentList =
    readyPlayers?.filter((p) => p !== accountId) ?? [];

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
        {error && (
          <div className="card error">
            <p>{error}</p>
          </div>
        )}

        {!accountId ? (
          <div className="card">
            <h2>Welcome</h2>
            <p className="muted">
              Connect your NEAR wallet to show your current auto battler game data.
            </p>
          </div>
        ) : unregistered ? (
          <div className="card">
            <h2 className="card-title">Register</h2>
            <p className="muted">
              You are not registered yet. Register now by sending 1 NEAR to the contract.
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
            <PlayerSummary playerState={playerState} />
            <CurrentBoard playerState={playerState} />

            {playerState?.status === "HasShop" && (
              <ShopOffers
                shop={shop ?? []}
                selectedShop={selectedShop}
                lockLoading={lockLoading}
                onToggle={handleShopToggle}
                onLock={handleLockBoard}
              />
            )}

            {playerState?.status === "Ready" && (
              <Opponents
                opponents={readyOpponentList}
                battleLoading={battleLoading}
                onBattle={handleBattle}
              />
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
              <BattleReplay battleReplays={battleReplays} roster={roster} />
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
              <AdminPanel onRosterUpdate={setRoster} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
