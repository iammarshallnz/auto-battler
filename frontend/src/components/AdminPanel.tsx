import { useState } from "react";
import {
  createSeason,
  setActiveSeason,
  finishEditingSeason,
  addUnitToSeason,
  getRoster,
} from "../wallet";
import type { UnitDef } from "../types";

interface Props {
  onRosterUpdate: (roster: UnitDef[]) => void;
}

export function AdminPanel({ onRosterUpdate }: Props) {
  const [seasonId, setSeasonId] = useState("");
  const [seasonName, setSeasonName] = useState("");
  const [rosterJson, setRosterJson] = useState("");
  const [unitJson, setUnitJson] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function withMessage(fn: () => Promise<string>) {
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="card">
      <h2 className="card-title">Admin Panel</h2>
      <p className="muted">
        Admin-only season management. Contract will reject non-admins.
      </p>

      <div style={{ marginBottom: 8 }}>
        <label>Season ID</label>
        <input value={seasonId} onChange={(e) => setSeasonId(e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Season Name</label>
        <input
          value={seasonName}
          onChange={(e) => setSeasonName(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>Roster JSON (array of UnitDef)</label>
        <textarea
          value={rosterJson}
          onChange={(e) => setRosterJson(e.target.value)}
          rows={4}
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          className="btn btn-primary"
          onClick={() =>
            withMessage(async () => {
              const id = Number(seasonId);
              const rosterParsed = rosterJson ? JSON.parse(rosterJson) : [];
              await createSeason(id, seasonName || `Season ${id}`, rosterParsed);
              const newRoster = await getRoster();
              onRosterUpdate(newRoster);
              return "Season created (or call succeeded).";
            })
          }
        >
          Create Season
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            withMessage(async () => {
              await setActiveSeason(Number(seasonId));
              return "Set active season.";
            })
          }
        >
          Set Active
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            withMessage(async () => {
              await finishEditingSeason(Number(seasonId));
              return "Finished editing season.";
            })
          }
        >
          Finish Editing
        </button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>Unit JSON (single UnitDef)</label>
        <textarea
          value={unitJson}
          onChange={(e) => setUnitJson(e.target.value)}
          rows={3}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={() =>
            withMessage(async () => {
              const unit = unitJson ? JSON.parse(unitJson) : null;
              if (!unit) throw new Error("Unit JSON required");
              await addUnitToSeason(Number(seasonId), unit);
              const newRoster = await getRoster();
              onRosterUpdate(newRoster);
              return "Unit added to season.";
            })
          }
        >
          Add Unit
        </button>
      </div>

      {message && <p style={{ marginTop: 8 }}>{message}</p>}
    </div>
  );
}
