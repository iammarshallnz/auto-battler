use near_sdk::json_types::{U64, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseResult, env,
    ext_contract, near, near_bindgen,
};

use board_setup::structs::*;

#[near(serializers = [json, borsh])]
#[derive(Debug, PartialEq, Clone)]
pub enum BattleStatus {
    InProgress,
    PlayerAWins,
    PlayerBWins,
}
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Battle {
    pub id: String,
    pub roster: Vec<UnitDef>,
    pub random_seed: Vec<u8>,
    pub a_units: Vec<Unit>,
    pub a_health: i32,
    pub a_shield: u32,
    pub a_fire: u32,

    pub b_units: Vec<Unit>,
    pub b_health: i32,
    pub b_shield: u32,
    pub b_fire: u32,
    pub status: BattleStatus,
    pub tick: u32,
}
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]

pub struct CommitEntry {
    pub commitment: Vec<u8>, // sha256(secret)
    pub revealed_seed: Option<u64>,
}

#[near(serializers = [json, borsh])]
pub struct AbilityEvent {
    pub tick: u32,
    pub attacker: u8, // def_id
    pub ability: Ability,
    pub target: Option<u8>, // def_id of target for stun
    pub side: bool,         // true = board_a fired, false = board_b fired
    pub value: u32,         // damage dealt, hp healed, etc.
}

#[near(serializers = [json, borsh])]
pub struct TickSummary {
    pub tick: u32,
    pub events: Vec<AbilityEvent>,
    // end state after this tick resolves
    pub a_health: i32,
    pub a_shield: u32,
    pub a_fire: u32,
    pub b_health: i32,
    pub b_shield: u32,
    pub b_fire: u32,
}

#[ext_contract(ext_registry)]
trait BoardRegistry {
    fn get_board(&self, player: AccountId) -> Vec<u8>;
    fn get_roster(&self) -> Vec<UnitDef>;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct GameContract {
    // Manages what units exist
    pub admin: AccountId,
    // Active and completed battles, keyed by battle_id (e.g. "alice.near:bob.near")
    pub battles: LookupMap<String, Battle>,

    // Players waiting for a match. Vec is fine here — small and infrequent writes.
    pub queue: Vec<AccountId>,

    pub registry_contract_id: AccountId,
}

#[near_bindgen]
impl GameContract {
    #[init]
    pub fn new(admin: Option<AccountId>, registry_contract_id: AccountId) -> Self {
        let admin = admin.unwrap_or_else(|| env::predecessor_account_id());
        Self {
            admin,
            battles: LookupMap::new(StorageKey::Battles),
            queue: Vec::new(),
            registry_contract_id,
        }
    }

    fn assert_admin(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.admin,
            "Unauthorized: admin only"
        );
    }

    pub fn start_battle(&mut self, opponent: AccountId) {
        let player = env::predecessor_account_id();
        let battle_id = format!("{}:{}", player, opponent);

        // Fire both fetches in parallel as a promise join
        let fetch_a = ext_registry::ext(self.registry_contract_id.clone())
            .with_static_gas(Gas::from_tgas(10))
            .get_board(player.clone());

        let fetch_b = ext_registry::ext(self.registry_contract_id.clone())
            .with_static_gas(Gas::from_tgas(10))
            .get_board(opponent.clone());

        let roster = ext_registry::ext(self.registry_contract_id.clone())
            .with_static_gas(Gas::from_tgas(10))
            .get_roster();
        // Join waits for both to complete before firing the callback
        let _ = fetch_a.and(fetch_b).and(roster).then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(100))
                .on_boards_loaded(battle_id),
        );
    }

    // Validated callback — receives both board results
    #[private]
    pub fn on_boards_loaded(&mut self, battle_id: String) {
        // Validate both cross-contract calls succeeded
        let board_a_ids = match env::promise_result(0) {
            PromiseResult::Successful(value) => near_sdk::serde_json::from_slice::<Vec<u8>>(&value)
                .unwrap_or_else(|_| env::panic_str("Failed to deserialize board A")),
            PromiseResult::Failed => env::panic_str("Failed to fetch board A"),
        };

        let board_b_ids = match env::promise_result(1) {
            PromiseResult::Successful(value) => near_sdk::serde_json::from_slice::<Vec<u8>>(&value)
                .unwrap_or_else(|_| env::panic_str("Failed to deserialize board B")),
            PromiseResult::Failed => env::panic_str("Failed to fetch board B"),
        };

        let roster = match env::promise_result(2) {
            PromiseResult::Successful(value) => {
                near_sdk::serde_json::from_slice::<Vec<UnitDef>>(&value)
                    .unwrap_or_else(|_| env::panic_str("Failed to deserialize board B"))
            }
            PromiseResult::Failed => env::panic_str("Failed to fetch board B"),
        };

        // Build boards from the fetched unit IDs
        let a_units = self.build_board(board_a_ids, &roster);
        let b_units = self.build_board(board_b_ids, &roster);

        // Store the battle ready to be resolved
        let battle = Battle {
            id: battle_id.clone(),
            roster,
            a_units,
            b_units,
            status: BattleStatus::InProgress,
            tick: 0,
            random_seed: env::random_seed(),
            a_health: 100,
            a_shield: 0,
            a_fire: 0,
            b_health: 100,
            b_shield: 0,
            b_fire: 0,
        };

        self.battles.insert(battle_id.clone(), battle);
        env::log_str(&format!("Battle created: {}", battle_id));

        self.resolve_battle(battle_id);
    }


    // Runs battle in loop till winner 
    fn resolve_battle(&mut self, battle_id: String) -> String {
        let mut battle = self
            .battles
            .get(&battle_id)
            .unwrap_or_else(|| env::panic_str("Battle not found"))
            .clone();

        assert_eq!(
            battle.status,
            BattleStatus::InProgress,
            "Battle already resolved"
        );

        const MAX_TICKS: u32 = 200; // gas safety cap
        let mut log: Vec<TickSummary> = Vec::new();

        loop {
            // Snapshot state before this tick fires

            let events = self.execute_tick(&mut battle);

            log.push(TickSummary {
                tick: battle.tick,
                events,
                a_health: battle.a_health,
                a_shield: battle.a_shield,
                a_fire: battle.a_fire,
                b_health: battle.b_health,
                b_shield: battle.b_shield,
                b_fire: battle.b_fire,
            });

            battle.tick += 1;

            if battle.tick > MAX_TICKS {
                let val = battle.tick as i32 % 2_i32;
                // 2 damage per tick past the limit, alternating +1 between sides
                battle.a_health -= 2 + (val);
                battle.b_health -= 2 + (val ^ 1);
            }

            if battle.a_health <= 0 || battle.b_health <= 0 {
                if battle.a_health >= battle.b_health {
                    //  a wins ?? ?
                    battle.status = BattleStatus::PlayerBWins;
                } else {
                    battle.status = BattleStatus::PlayerAWins;

                }
                break;
            }
        }

        self.battles.insert(battle_id, battle.clone());

        // Emit the full battle log as a NEAR event so the JS frontend can read it
        let log_json = near_sdk::serde_json::to_string(&log).unwrap();
        env::log_str(&format!("BATTLE_LOG:{}", log_json));

        format!("{:?}", battle.status)
    }

    // -----------------------------------------------------------------------
    // Internal: one tick of combat

    fn execute_tick(&mut self, battle: &mut Battle) -> Vec<AbilityEvent> {
        let mut events: Vec<AbilityEvent> = Vec::new();

        // Apply damage 1 at a time, stun does not check at this point

        // Does side a then b, swapping attacker and defender
        for side in [true, false] {
            let (
                attacker_units,
                atk_health,
                atk_shield,
                atk_fire,
                def_health,
                def_shield,
                def_fire,
                def_units,
            ) = if side {
                (
                    &mut battle.a_units,
                    &mut battle.a_health,
                    &mut battle.a_shield,
                    &mut battle.a_fire,
                    &mut battle.b_health,
                    &mut battle.b_shield,
                    &mut battle.b_fire,
                    &mut battle.b_units,
                )
            } else {
                (
                    &mut battle.b_units,
                    &mut battle.b_health,
                    &mut battle.b_shield,
                    &mut battle.b_fire,
                    &mut battle.a_health,
                    &mut battle.a_shield,
                    &mut battle.a_fire,
                    &mut battle.a_units,
                )
            };

            for unit in attacker_units.iter_mut() {
                if unit.cooldown_remaining > 0 {
                    if unit.stunned > 0 {
                        unit.stunned -= 1;
                    } else {
                        unit.cooldown_remaining -= 1;
                    }
                } else {

                    for ability in &unit.abilitys {
                        match *ability {
                            Ability::Damage { amount, lifesteal } => {
                                let absorbed = (*def_shield).min(amount);
                                *def_shield -= absorbed;
                                let remaining = amount - absorbed;
                                *def_health -= remaining as i32;
                                if lifesteal {
                                    *atk_health += amount as i32;
                                }

                                // LOGGING
                                events.push(AbilityEvent {
                                    tick: battle.tick,
                                    attacker: unit.def_id,
                                    ability: Ability::Damage { amount, lifesteal },
                                    target: None,
                                    side,
                                    value: remaining, // actual damage after shield
                                });
                            }
                            Ability::Heal { amount } => {
                                *atk_health += amount as i32;

                                events.push(AbilityEvent {
                                    tick: battle.tick,
                                    attacker: unit.def_id,
                                    ability: Ability::Heal { amount },
                                    target: None,
                                    side,
                                    value: amount,
                                });
                            }
                            Ability::Shield { amount } => {
                                *atk_shield += amount;

                                events.push(AbilityEvent {
                                    tick: battle.tick,
                                    attacker: unit.def_id,
                                    ability: Ability::Shield { amount },
                                    target: None,
                                    side,
                                    value: amount,
                                });
                            }
                            Ability::FireDot { amount } => {
                                *def_fire += amount;
                                events.push(AbilityEvent {
                                    tick: battle.tick,
                                    attacker: unit.def_id,
                                    ability: Ability::FireDot { amount },
                                    target: None,
                                    side,
                                    value: amount,
                                });
                            }
                            Ability::Stun {
                                duration,
                                amount_of_targets,
                            } => {
                                for target in 0..amount_of_targets {
                                    let i = (battle.tick as usize + target as usize) % 32;
                                    let random_number = battle.random_seed[i] % 3;
                                    def_units[random_number as usize].stunned += duration;

                                    events.push(AbilityEvent {
                                        tick: battle.tick,
                                        attacker: unit.def_id,
                                        ability: Ability::Stun {
                                            duration,
                                            amount_of_targets,
                                        },
                                        target: Some(target),
                                        side,
                                        value: duration,
                                    });
                                }
                            }
                            Ability::Cleanse => {
                                *atk_fire = 0;
                                events.push(AbilityEvent {
                                    tick: battle.tick,
                                    attacker: unit.def_id,
                                    ability: Ability::Cleanse {},
                                    target: None,
                                    side,
                                    value: 0,
                                });
                            }
                            Ability::None => {}
                        }
                    }
                    unit.cooldown_remaining = unit.base_cooldown;
                }
            }
            // remove fire and deal damage
            if battle.tick % 2 == 0 {
                let absorbed = (*def_shield).min(*def_fire);
                *def_shield -= absorbed;
                let remaining = *def_fire - absorbed;
                *def_health -= remaining as i32;
                *def_fire = def_fire.saturating_sub(1);
            }
        }
        battle.random_seed = env::sha256(&battle.random_seed);
        events
    }

    
    // Helper function that builds units from defintions
    fn build_board(&self, unit_ids: Vec<u8>, roster: &Vec<UnitDef>) -> Vec<Unit> {
        unit_ids
            .iter()
            .filter_map(|id| roster.iter().find(|u| u.id == *id))
            .cloned().map(|def| Unit::from_def(&def))
            .collect()
    }
}
