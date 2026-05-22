use near_sdk::{BorshStorageKey, near};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Players,
    Battles,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]

pub enum Ability {
    Damage {
        amount: u32,
        lifesteal: bool,
    },
    Heal {
        amount: u32,
    },
    Shield {
        amount: u32,
    },
    FireDot {
        amount: u32,
    }, // damage over time
    Stun {
        duration: u32,
        amount_of_targets: u8,
    },
    Cleanse, // remove fire
    None,
}
// Unit definition of what it does
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct UnitDef {
    pub id: u8,
    pub name: String,
    pub base_cooldown: u32, // ticks between attacks
    pub abilitys: Vec<Ability>,
    pub enabled: bool,
}

// Unit 'on the board'
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Unit {
    pub def_id: u8,
    pub cooldown_remaining: u32,
    pub stunned: u32,
    pub base_cooldown: u32,
    pub abilitys: Vec<Ability>,
}
impl Unit {
    pub fn from_def(def: &UnitDef) -> Self {
        Self {
            def_id: def.id,
            cooldown_remaining: def.base_cooldown,
            stunned: 0,
            base_cooldown:def.base_cooldown,
            abilitys: def.abilitys.clone()
        }
    }
}
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct UnitUpgrade {
    pub unit_id: u8,
    pub upgrade: UpgradeType,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub enum UpgradeType {
    BonusDamage { amount: u32 },
    BonusCooldown { reduction: u32 }, // faster attacks
    ExtraAbility { ability: Ability },
    Evolve { into_id: u8 },           // transform into a stronger unit
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum PlayerStatus {
    Unregistered,
    HasShop, // shop offer generated, board not yet locked
    Ready,   // board locked, waiting for battle contract to pick them up
    AtBazaar,
}
#[derive(Clone, Debug)]
#[near(serializers = [borsh])]
pub struct PlayerState {
    pub status: PlayerStatus,
    pub seed: Option<Vec<u8>>,       // derived after reveal
    pub shop_offer: Option<Vec<u8>>, // unit IDs offered to this player
    pub board: Option<Vec<u8>>,      // locked unit IDs
    pub bazaar_offers: Option<Vec<UnitUpgrade>>,
    pub upgrades: Vec<UnitUpgrade>, // persists across battles
    pub player_life: u8,
}

impl PlayerState {
    pub fn new() -> Self {
        Self {
            status: PlayerStatus::Unregistered,
            seed: None,
            shop_offer: None,
            board: None,
            bazaar_offers: None,
            upgrades: Vec::new(),
            player_life: 10
        }
    }
}
