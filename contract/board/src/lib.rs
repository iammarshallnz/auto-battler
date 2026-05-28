use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, PanicOnDefault, env, near, near_bindgen,
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
    pub seasons: LookupMap<u32, Season>,
    pub active_season: u32,
    pub battle_contract: AccountId, // only this contract can call set_player_in_battle
}

#[near_bindgen]
impl BoardRegistry {
    #[init]
    pub fn new(battle_contract: AccountId) -> Self {
        let default_roster = vec![
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

        let mut contract = Self {
            admin: env::predecessor_account_id(),
            players: LookupMap::new(StorageKey::Players),
            ready_players: Vec::new(),
            seasons: LookupMap::new(StorageKey::Season),
            active_season: 1,
            battle_contract,
        };

        contract.seasons.insert(
            1,
            Season {
                id: 1,
                name: "Season 1".into(),
                roster: default_roster,
                non_editable: true,
            },
        );

        contract
    }

    pub fn roll_seed(&mut self, season_id: u32) {
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
        let roster = self.load_roster(Some(season_id));
        // Reset state entirely — this covers both fresh register and reroll
        let mut state = PlayerState::new(Some(season_id));
        state.seed = Some(env::random_seed());

        // Roll the shop also as seed is ==== to shop
        
        state.shop_offer = Some(Self::roll_shop(&state.seed.clone().unwrap(), &roster, 5));
        state.status = PlayerStatus::HasShop;

        self.players.insert(key, state);
        env::log_str(&format!("{} committed a seed", player));
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
        let roster = self.load_roster(state.season_id);
        shop_ids
            .iter()
            .filter_map(|id| roster.iter().find(|u| u.id == *id))
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
    pub fn get_board(&self, player: AccountId) -> PlayerState {
        let state = self
            .players
            .get(&player.to_string())
            .unwrap_or_else(|| env::panic_str("Player not registered"));

        assert!(
            state.status == PlayerStatus::Ready,
            "Player does not have a locked board"
        );
        
        state.clone()
    }

    // Helper function for rolling shop
    fn roll_shop(seed: &Vec<u8>, roster: &Vec<UnitDef>, amount: usize) -> Vec<u8> {
        let enabled_roster: Vec<&UnitDef> = roster.iter().filter(|u| u.enabled).collect(); // only use enabled
        assert!(enabled_roster.len() >= amount, "Not enough enabled units");

        let mut indices: Vec<usize> = (0..enabled_roster.len()).collect();
        let mut results = Vec::new();

        for i in 0..amount {
            let remaining = indices.len();
            let pick = seed[i % seed.len()] as usize % remaining;
            results.push(enabled_roster[indices[pick]].id);
            indices.swap(pick, remaining - 1);
            indices.pop();
        }
        results
    }

    // Helper for getting current roster
    fn load_roster(&self, season_id: Option<u32>) -> Vec<UnitDef> {
        let id = season_id.unwrap_or(self.active_season);
        let season = self.seasons.get(&id)
            .unwrap_or_else(|| env::panic_str("Season not found"));
        season.roster.clone()
    }

    pub fn set_player_at_bazaar(&mut self, player: AccountId) {
        assert_eq!(
            env::predecessor_account_id(),
            self.battle_contract,
            "Battle contract only"
        );

        let key = player.to_string();
        let mut state = self
            .players
            .get(&key)
            .unwrap_or_else(|| env::panic_str("Player not found"))
            .clone();

        // Generate 3 upgrade offers using a fresh seed
        let seed = env::random_seed();
        let offers = self.roll_upgrades(&seed, &state.board.clone().unwrap());

        state.bazaar_offers = Some(offers);
        state.status = PlayerStatus::AtBazaar;
        self.players.insert(key, state);
    }

    pub fn pick_upgrade(&mut self, offer_index: usize) {
        let player = env::predecessor_account_id();
        let key = player.to_string();

        let mut state = self
            .players
            .get(&key)
            .unwrap_or_else(|| env::panic_str("Player not found"))
            .clone();

        assert_eq!(state.status, PlayerStatus::AtBazaar, "Not at bazaar");

        let offers = state
            .bazaar_offers
            .clone()
            .unwrap_or_else(|| env::panic_str("No offers found"));

        assert!(offer_index < offers.len(), "Invalid offer index");

        // Apply the chosen upgrade to their board
        let upgrade = &offers[offer_index];

        // store upgrades separately so the battle contract can apply them
        state.upgrades.push(upgrade.clone());
        state.bazaar_offers = None;
        state.status = PlayerStatus::Ready;

        self.players.insert(key, state);
        env::log_str(&format!("{} picked an upgrade", player));
    }

    // Reset
    pub fn reset_player(&mut self) {
        let player = env::predecessor_account_id();
        let key = player.to_string();

        let state = self
            .players
            .get(&key)
            .unwrap_or_else(|| env::panic_str("Player not registered"));

        assert_eq!(
            state.status,
            PlayerStatus::Ready,
            "Can only reset after board prepared"
        );

        self.players.insert(key, PlayerState::new(None));
        env::log_str(&format!("{} reset their state", player));
    }

    // Admin functions

    // pub fn add_unit(&mut self, unit: UnitDef) {
    //     assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
    //     assert!(
    //         !self.roster.iter().any(|u| u.id == unit.id),
    //         "Unit with id {} already exists",
    //         unit.id
    //     );
    //     self.roster.push(unit);
    // }

    // pub fn disable_unit(&mut self, unit_id: u8) {
    //     assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
    //     for unit in self.roster.iter_mut() {
    //         if unit.id == unit_id {
    //             unit.enabled = false;
    //             return;
    //         }
    //     }
    // }
    // pub fn enable_unit(&mut self, unit_id: u8) {
    //     assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
    //     for unit in self.roster.iter_mut() {
    //         if unit.id == unit_id {
    //             unit.enabled = true;
    //             return;
    //         }
    //     }
    // }

    pub fn create_season(&mut self, id: u32, name: String, roster: Vec<UnitDef>) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        assert!(!self.seasons.contains_key(&id), "Season already exists");
        self.seasons.insert(
            id,
            Season {
                id,
                name,
                roster,
                non_editable: false,
            },
        );
    }

    pub fn set_active_season(&mut self, season_id: u32) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        assert!(self.seasons.contains_key(&season_id), "Season not found");
        let season = self.seasons.get(&season_id)
            .unwrap_or_else(|| env::panic_str("Season not found"))
            .clone();
        assert_eq!(season.non_editable, true, "Season is still editable");
        self.active_season = season_id;
    }

    pub fn finish_editing_season(&mut self, season_id: u32) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        assert!(self.seasons.contains_key(&season_id), "Season not found");
        let mut season = self.seasons.get(&season_id)
            .unwrap_or_else(|| env::panic_str("Season not found"))
            .clone();
        assert_eq!(season.non_editable, false, "Season must be editable");
        season.non_editable = true;
    }


    pub fn add_unit_to_season(&mut self, season_id: u32, unit: UnitDef) {
        assert_eq!(env::predecessor_account_id(), self.admin, "Admin only");
        
        let mut season = self.seasons.get(&season_id)
            .unwrap_or_else(|| env::panic_str("Season not found"))
            .clone();
        assert_eq!(season.non_editable, false, "Season is not editable");
        season.roster.push(unit);
        self.seasons.insert(season_id, season);
    }

    // Other functions

    fn roll_upgrades(&self, seed: &Vec<u8>, board: &Vec<u8>) -> Vec<UnitUpgrade> {
        // One upgrade offer per unit on their board, pick 3
        let mut offers = Vec::new();
        for (i, &unit_id) in board.iter().enumerate() {
            let byte = seed[i % 32] % 3;
            let upgrade = match byte {
                0 => UpgradeType::BonusDamage { amount: 3 },
                1 => UpgradeType::BonusCooldown { reduction: 1 },
                _ => UpgradeType::ExtraAbility {
                    ability: Ability::Shield { amount: 5 },
                },
            };
            offers.push(UnitUpgrade { unit_id, upgrade });
        }
        offers
    }

    pub fn get_ready_players(&self) -> Vec<AccountId> {
        self.ready_players.to_vec()
    }

    pub fn get_roster(&self) -> Vec<UnitDef> {
        self.load_roster(None)
    }

    pub fn get_current_state(&self, player: AccountId) -> PlayerStatus {
        self.players
            .get(&player.to_string())
            .unwrap()
            .status
            .clone()
    }

    pub fn get_bazaar_offers(&self, player: AccountId) -> Vec<UnitUpgrade> {
        let state = self
            .players
            .get(&player.to_string())
            .unwrap_or_else(|| env::panic_str("Player not registered"));

        assert_eq!(
            state.status,
            PlayerStatus::AtBazaar,
            "Player is not at the bazaar"
        );

        state
            .bazaar_offers
            .clone()
            .unwrap_or_else(|| env::panic_str("No offers found"))
    }
}
