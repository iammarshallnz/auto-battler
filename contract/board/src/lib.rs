use near_sdk::json_types::{U64, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, env, near, near_bindgen,
};

// Player signs up and gets a random number. "registering"

// Then player gets to roll a shop based on there number

// Then the player locks in the shop from what is available
// This sets them as ready to play

//# cross contract
// Allow battle contract to get the current players board so the battle can play

// # extra:
// Function for a player to reset the random number and get a new shop
// Function for admin to add units to the shop and remove units.
pub mod structs;
use crate::structs::*;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BoardRegistry {
    pub admin: AccountId,
    pub players: LookupMap<String, PlayerState>,
    pub ready_players: Vec<AccountId>, 
    pub roster: Vec<UnitDef>,
    pub battle_contract: AccountId, // only this contract can call set_player_in_battle
}

#[near_bindgen]
impl BoardRegistry {
    #[init]
    pub fn new(battle_contract: AccountId) -> Self {
        let roster = vec![
            UnitDef {
                id: 0,
                name: "Goblin".into(),
                base_cooldown: 2,
                abilitys: vec![Ability::Damage {
                    amount: 5,
                    lifesteal: true,
                }],
                enabled: true,
            },
            UnitDef {
                id: 1,
                name: "Knight".into(),
                base_cooldown: 4,
                abilitys: vec![
                    Ability::Damage {
                        amount: 5,
                        lifesteal: false,
                    },
                    Ability::Shield { amount: 3 },
                ],
                enabled: true,
            },
            UnitDef {
                id: 2,
                name: "Archer".into(),
                base_cooldown: 3,
                abilitys: vec![
                    Ability::Damage {
                        amount: 5,
                        lifesteal: false,
                    },
                    Ability::FireDot { amount: 2 },
                ],
                enabled: true,
            },
            UnitDef {
                id: 3,
                name: "Mage".into(),
                base_cooldown: 5,
                abilitys: vec![Ability::Damage {
                    amount: 10,
                    lifesteal: false,
                }],
                enabled: true,
            },
            UnitDef {
                id: 4,
                name: "Paladin".into(),
                base_cooldown: 4,
                abilitys: vec![
                    Ability::Damage {
                        amount: 5,
                        lifesteal: false,
                    },
                    Ability::Heal { amount: 8 },
                ],
                enabled: true,
            },
            UnitDef {
                id: 5,
                name: "Rogue".into(),
                base_cooldown: 3,
                abilitys: vec![
                    Ability::Damage {
                        amount: 5,
                        lifesteal: false,
                    },
                    Ability::Stun {
                        duration: 3,
                        amount_of_targets: 1,
                    },
                ],
                enabled: true,
            },
            UnitDef {
                id: 6,
                name: "Pyro".into(),
                base_cooldown: 4,
                abilitys: vec![Ability::FireDot { amount: 3 }],
                enabled: true,
            },
            UnitDef {
                id: 7,
                name: "Horse".into(),
                base_cooldown: 2,
                abilitys: vec![
                    Ability::Damage {
                        amount: 10,
                        lifesteal: false,
                    },
                    Ability::Stun {
                        duration: 1,
                        amount_of_targets: 1,
                    },
                ],
                enabled: true,
            },
            UnitDef {
                id: 8,
                name: "Vampire".into(),
                base_cooldown: 5,
                abilitys: vec![Ability::Damage {
                    amount: 10,
                    lifesteal: true,
                }],
                enabled: true,
            },
            UnitDef {
                id: 9,
                name: "Gladiator".into(),
                base_cooldown: 5,
                abilitys: vec![
                    Ability::Damage {
                        amount: 7,
                        lifesteal: false,
                    },
                    Ability::Shield { amount: 4 },
                ],
                enabled: true,
            },
        ];

        Self {
            admin: env::predecessor_account_id(),
            players: LookupMap::new(StorageKey::Players),
            ready_players: Vec::new(),
            roster,
            battle_contract,
        }
    }

    pub fn roll_seed(&mut self) {
        // Roll seed, only can be done when in Unregistered

        let player = env::predecessor_account_id();
        let key = player.to_string();

        // If they have an existing state check they aren't in a battle
        if let Some(state) = self.players.get(&key) {
            assert_eq!(
                state.status,
                PlayerStatus::Unregistered,
                "Can only roll new seed when Unregistered"
            );
        }

        // Reset state entirely — this covers both fresh register and reroll
        let mut state = PlayerState::new();
        state.seed = Some(env::random_seed());

        self.players.insert(key, state.clone());
        env::log_str(&format!("{} committed a seed", player));

        // Roll the shop also as seed is ==== to shop

        state.shop_offer = Some(Self::roll_shop(&state.seed.unwrap(), &self.roster, 5));

        state.status = PlayerStatus::HasShop;
    }

    // View shop data
    pub fn get_shop(&self, player: AccountId) -> Vec<UnitDef> {
        let state = self
            .players
            .get(&player.to_string())
            .unwrap_or_else(|| env::panic_str("Player not registered"));

        assert!(
            state.status == PlayerStatus::HasShop || state.status == PlayerStatus::Ready,
            "Reveal your seed first"
        );

        let shop_ids = state
            .shop_offer
            .as_ref()
            .unwrap_or_else(|| env::panic_str("No shop offer found"));

        shop_ids
            .iter()
            .filter_map(|id| self.roster.iter().find(|u| u.id == *id))
            .cloned()
            .collect()
    }

    // Lock in shop 'from UI probably'

    pub fn lock_board(&mut self, chosen_ids: Vec<u8>) {
        assert!(chosen_ids.len() == 3, "Pick 3 units");

        let player = env::predecessor_account_id();
        let key = player.to_string();

        let mut state = self
            .players
            .get(&key)
            .unwrap_or_else(|| env::panic_str("Player not registered"))
            .clone();

        assert_eq!(state.status, PlayerStatus::HasShop, "Roll seed first");

        let shop_ids = state
            .shop_offer
            .clone()
            .unwrap_or_else(|| env::panic_str("No shop offer found"));

        // Validate every chosen unit was actually in the shop offer
        for id in &chosen_ids {
            assert!(
                shop_ids.contains(id),
                "Unit {} was not in your shop offer",
                id
            );
        }

        state.board = Some(chosen_ids);
        state.status = PlayerStatus::Ready;
        self.ready_players.push(player.clone()); // add to vec of player ready


        self.players.insert(key, state);
        env::log_str(&format!("{} locked their board — Ready", player));
    }

    // Get what is used
    pub fn get_board(&self, player: AccountId) -> Vec<u8> {
        let state = self
            .players
            .get(&player.to_string())
            .unwrap_or_else(|| env::panic_str("Player not registered"));

        assert!(
            state.status == PlayerStatus::Ready,
            "Player does not have a locked board"
        );
        if let Some(s) = &state.board {
            return s.to_vec();
        }
        env::panic_str("No board found");
    }


    // Helper function for rolling shop
    fn roll_shop(seed: &Vec<u8>, roster: &Vec<UnitDef>, amount: usize) -> Vec<u8> {
        assert!(roster.len() >= amount, "Not enough units in roster");

        let mut indices: Vec<usize> = (0..roster.len()).collect();
        let mut results = Vec::new();

        for i in 0..amount {
            // Use seed byte i to pick from the REMAINING indices
            let remaining = indices.len();
            let pick = seed[i % seed.len()] as usize % remaining;

            // Grab the unit ID at that position
            results.push(roster[indices[pick]].id.clone());

            // Swap picked index to the end and shrink the pool
            // so it can't be picked again
            indices.swap(pick, remaining - 1);
            indices.pop();
        }

        results
    }

    // Admin functions

    pub fn add_unit(&mut self, unit: UnitDef) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        assert!(
            !self.roster.iter().any(|u| u.id == unit.id),
            "Unit with id {} already exists",
            unit.id
        );
        self.roster.push(unit);
    }

    pub fn disable_unit(&mut self, unit_id: u8) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        for unit in self.roster.iter_mut() {
            if unit.id == unit_id {
                unit.enabled = false;
                return;
            }
        }
    }
    pub fn enable_unit(&mut self, unit_id: u8) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        for unit in self.roster.iter_mut() {
            if unit.id == unit_id {
                unit.enabled = true;
                return;
            }
        }
    }   

    pub fn get_ready_players(&self) -> Vec<AccountId> {
        self.ready_players.to_vec()
    }

    pub fn get_roster(&self) -> Vec<UnitDef> {
        self.roster.clone()
    }
}
