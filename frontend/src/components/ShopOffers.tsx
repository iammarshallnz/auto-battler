import { renderAbility } from "../utils/battle";
import type { UnitDef } from "../types";

interface Props {
  shop: UnitDef[];
  selectedShop: number[];
  lockLoading: boolean;
  onToggle: (id: number) => void;
  onLock: () => void;
}

export function ShopOffers({
  shop,
  selectedShop,
  lockLoading,
  onToggle,
  onLock,
}: Props) {
  return (
    <div className="card">
      <h2 className="card-title">Shop Offers</h2>
      {shop.length ? (
        <>
          <p className="muted">Select up to 3 units to lock into your board.</p>
          <ul className="shop-list">
            {shop.map((item) => {
              const selected = selectedShop.includes(item.id);
              const disabled = !selected && selectedShop.length >= 3;
              return (
                <li
                  key={item.id}
                  className={`shop-item ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => onToggle(item.id)}
                    />
                    <div>
                      <strong>{item.name}</strong> (ID: {item.id}) —{" "}
                      {item.enabled ? "Enabled" : "Disabled"}
                      <div className="hint">
                        Abilities: {item.abilitys.map(renderAbility).join(", ")}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          <div style={{ marginTop: 8 }}>
            <span className="muted">Selected: {selectedShop.length}/3</span>
            {selectedShop.length === 3 && (
              <button
                className="btn btn-primary"
                style={{ marginLeft: 12 }}
                disabled={lockLoading}
                onClick={onLock}
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
  );
}
