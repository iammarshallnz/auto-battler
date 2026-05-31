export type Ability =
    | { Damage: { amount: number; lifesteal: boolean } }
    | { Heal: { amount: number } }
    | { Shield: { amount: number } }
    | { FireDot: { amount: number } }
    | { Stun: { duration: number; amount_of_targets: number } }
    | "Cleanse"
    | "None";

export interface UnitDef {
    id: number;
    name: string;
    base_cooldown: number;
    abilitys: Ability[];
    enabled: boolean;
}


type PlayerStatus = "Unregistered" | "HasShop" | "Ready" | "AtBazaar" | "InBattle";

export interface UnitUpgrade {
    unit_id: number;
    upgrade: UpgradeType;
}

type UpgradeType =
    | { BonusDamage: { amount: number } }
    | { BonusCooldown: { reduction: number } }
    | { ExtraAbility: { ability: Ability } }
    | { Evolve: { into_id: number } };

export interface PlayerState {
    status: PlayerStatus;
    seed: number[] | null;
    shop_offer: number[] | null;
    board: number[] | null;
    bazaar_offers: UnitUpgrade[] | null;
    upgrades: UnitUpgrade[];
    games_played: number;
    games_won: number;
    season_id: number | null;
}