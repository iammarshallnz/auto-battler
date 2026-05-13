use near_sdk::json_types::{U64, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, env, near, near_bindgen,
};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Battles,
    Commits,
    Queued,
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
// Unit can be support type that does no damage
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]

pub struct UnitDef {
    pub id: u8,
    pub name: String,
    pub base_cooldown: u32, // ticks between attacks
    pub abilitys: Vec<Ability>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]

pub struct Unit {
    pub def_id: u8,
    pub cooldown_remaining: u32,
    pub stunned: u32,
}
impl Unit {
    pub fn from_def(def: &UnitDef) -> Self {
        Self {
            def_id: def.id,
            cooldown_remaining: def.base_cooldown,
            stunned: 0,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Board {
    pub player: AccountId,
    pub units: Vec<Unit>, // max 3 slots for now
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]

pub struct TickSnapshot {
    pub tick: u32,
    pub board_a: Vec<Unit>,
    pub a_health: i32,
    pub a_shield: u32,
    pub a_fire: u32,

    pub board_b: Vec<Unit>,
    pub b_health: i32,
    pub b_shield: u32,
    pub b_fire: u32,
}
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
    pub random_seed: Vec<u8>,
    pub board_a: Board,
    pub a_health: i32,
    pub a_shield: u32,
    pub a_fire: u32,

    pub board_b: Board,
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

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct GameContract {
    // Manages what units exist
    pub admin: AccountId,
    // Active and completed battles, keyed by battle_id (e.g. "alice.near:bob.near")
    pub battles: LookupMap<String, Battle>,

    // Commit-reveal state per player, keyed by account_id (basically current team)
    pub commits: LookupMap<AccountId, CommitEntry>,

    // Players waiting for a match. Vec is fine here — small and infrequent writes.
    // In production you'd use an UnorderedMap for safety.
    pub queue: Vec<(AccountId, Board)>,

    // Hardcoded roster: 6 unit types the shop samples from
    pub roster: Vec<UnitDef>,
}

#[near_bindgen]
impl GameContract {
    #[init]
    pub fn new(admin: Option<AccountId>) -> Self {
        let admin = admin.unwrap_or_else(|| env::predecessor_account_id());
        let roster = vec![
            UnitDef {
                id: 0,
                name: "Goblin".into(),
                base_cooldown: 2,
                abilitys: vec![Ability::Damage {
                    amount: 5,
                    lifesteal: true,
                }],
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
            },
            UnitDef {
                id: 3,
                name: "Mage".into(),
                base_cooldown: 5,
                abilitys: vec![Ability::Damage {
                    amount: 10,
                    lifesteal: false,
                }],
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
            },
            UnitDef {
                id: 6,
                name: "Pyro".into(),
                base_cooldown: 4,
                abilitys: vec![Ability::FireDot { amount: 3 }],
            },
        ];

        Self {
            admin,
            battles: LookupMap::new(StorageKey::Battles),
            commits: LookupMap::new(StorageKey::Commits),
            queue: Vec::new(),
            roster,
        }
    }

    fn assert_admin(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.admin,
            "Unauthorized: admin only"
        );
    }

    // TODO: add functionality for adding / removing / disabling units
    pub fn get_current_units(&self) -> &Vec<UnitDef> {
        self.assert_admin();
        self.roster.as_ref()
    }
    pub fn get_battle(&self, battle_id: String) -> Option<&Battle> {
        self.battles.get(&battle_id)
    }

    pub fn get_roster(&self) -> Vec<UnitDef> {
        self.roster.clone()
    }

    pub fn get_queue_length(&self) -> usize {
        self.queue.len()
    }

    // Phase 1 — Commit-reveal randomness
    //
    pub fn commit_seed(&mut self, commitment: Vec<u8>) {
        let player = env::predecessor_account_id();
        assert_eq!(commitment.len(), 32, "Commitment must be 32 bytes (sha256)");
        self.commits.insert(
            player.clone(),
            CommitEntry {
                commitment,
                revealed_seed: None,
            },
        );
        env::log_str(&format!("Committed seed for {}", player));
    }

    pub fn reveal_seed(&mut self, secret: Vec<u8>) {
        let player = env::predecessor_account_id();

        let mut entry = self
            .commits
            .get(&player)
            .unwrap_or_else(|| env::panic_str("No commitment found — call commit_seed first"))
            .clone();

        // Verify the hash matches what was committed
        let hash = env::sha256(&secret);
        assert_eq!(hash, entry.commitment, "Secret does not match commitment");

        // Derive a u64 seed from the first 8 bytes of the secret hash
        // XOR with block_timestamp for extra unpredictability
        let seed = u64::from_le_bytes(hash[0..8].try_into().unwrap()) ^ env::block_timestamp();

        entry.revealed_seed = Some(seed);
        self.commits.insert(player.clone(), entry);

        env::log_str(&format!("Seed revealed for {}", player));
    }

    // Phase 2 — Shop & draft
    //
    pub fn get_shop(&self) -> Vec<UnitDef> {
        let player = env::predecessor_account_id();
        let entry = self
            .commits
            .get(&player)
            .unwrap_or_else(|| env::panic_str("Reveal your seed first"));
        let seed = entry
            .revealed_seed
            .unwrap_or_else(|| env::panic_str("Reveal your seed first"));

        self.roll_shop(seed)
    }

    // Internal: deterministically sample 3 units from the roster given a seed
    fn roll_shop(&self, seed: u64) -> Vec<UnitDef> {
        let len = self.roster.len() as u64;
        let mut results = Vec::with_capacity(3);
        let mut used = [false; 6];

        for i in 0u64..6 {
            //TODO: ??????????
            // Simple LCG to step through the seed without repeating
            let idx = ((seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(i * 1442695040888963407))
                % len) as usize;
            if !used[idx] {
                used[idx] = true;
                results.push(self.roster[idx].clone());
                if results.len() == 3 {
                    break;
                }
            }
        }

        // Fallback if LCG happened to collide on all attempts (extremely rare)
        if results.len() < 3 {
            for (i, def) in self.roster.iter().enumerate() {
                if !used[i] {
                    results.push(def.clone());
                    if results.len() == 3 {
                        break;
                    }
                }
            }
        }

        results
    }

    // Phase 3 — Lock board and join queue
    //
    pub fn lock_board(&mut self, chosen_ids: Vec<u8>) {
        assert!(chosen_ids.len() <= 3, "Max 3 units on your board");
        let player = env::predecessor_account_id();

        // Build the board from chosen unit IDs
        let units: Vec<Unit> = chosen_ids
            .iter()
            .map(|&id| {
                let def = self
                    .roster
                    .iter()
                    .find(|d| d.id == id)
                    .unwrap_or_else(|| env::panic_str("Unknown unit id"));
                Unit::from_def(def)
            })
            .collect();

        let board = Board {
            player: player.clone(),
            units,
        };

        // Check queue — if someone is waiting, start the battle immediately
        if !self.queue.is_empty() {
            let (opponent, board_b) = self.queue.remove(0);
            let battle_id = format!("{}:{}", player, opponent);

            let battle = Battle {
                id: battle_id.clone(),
                random_seed: env::random_seed(),

                board_a: board,
                board_b,
                status: BattleStatus::InProgress,
                tick: 0,
                a_health: 100,
                a_shield: 0,
                a_fire: 0,
                b_health: 100,
                b_shield: 0,
                b_fire: 0,
            };

            self.battles.insert(battle_id.clone(), battle);
            env::log_str(&format!("Battle started: {}", battle_id));
        } else {
            self.queue.push((player, board));
            env::log_str("Joined queue — waiting for opponent");
        }
    }

    // -----------------------------------------------------------------------
    // Phase 4 — Resolve battle
    //
    // Runs all ticks in a single transaction.
    // Emits a BattleLog JSON event with every tick snapshot so the
    // frontend can animate the fight step by step.
    // -----------------------------------------------------------------------

    pub fn resolve_battle(&mut self, battle_id: String) -> String {
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
        let mut log: Vec<TickSnapshot> = Vec::new();

        loop {
            // Snapshot state before this tick fires
            log.push(TickSnapshot {
                tick: battle.tick,
                board_a: battle.board_a.units.clone(),
                a_health: battle.a_health,
                a_shield: battle.a_shield,
                a_fire: battle.a_fire,

                b_health: battle.b_health,
                b_shield: battle.b_shield,
                b_fire: battle.b_fire,

                board_b: battle.board_b.units.clone(),
            });

            self.execute_tick(&mut battle);
            battle.tick += 1;

            if battle.tick > MAX_TICKS {
                let val = battle.tick as i32 % 2_i32;
                // alternate end damage
                battle.a_health -= 2_i32.pow(battle.tick - MAX_TICKS) + (val);
                battle.b_health -= 2_i32.pow(battle.tick - MAX_TICKS) + (val ^ 1);
            }

            if battle.a_health <= 0 || battle.b_health <= 0 {
                if battle.a_health >= battle.b_health {
                    //  a wins ?? ?
                    battle.status = BattleStatus::PlayerAWins;
                } else {
                    battle.status = BattleStatus::PlayerBWins;
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
    //
    // Each alive unit counts down its cooldown.
    // When it hits 0 it attacks the lowest-HP living enemy and resets.
    // Both sides are processed simultaneously (snapshot approach avoids
    // order-of-attack bias — units that die this tick can't counter-attack).
    // -----------------------------------------------------------------------

    fn execute_tick(&mut self, battle: &mut Battle) {
        // Collect attacks before applying damage (simultaneous resolution)

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
                    &mut battle.board_a.units,
                    &mut battle.a_health,
                    &mut battle.a_shield,
                    &mut battle.a_fire,
                    &mut battle.b_health,
                    &mut battle.b_shield,
                    &mut battle.b_fire,
                    &mut battle.board_b.units,
                )
            } else {
                (
                    &mut battle.board_b.units,
                    &mut battle.b_health,
                    &mut battle.b_shield,
                    &mut battle.b_fire,
                    &mut battle.a_health,
                    &mut battle.a_shield,
                    &mut battle.a_fire,
                    &mut battle.board_a.units,
                )
            };

            for unit in attacker_units.iter_mut() {
                if unit.cooldown_remaining > 0 {
                    unit.cooldown_remaining -= 1;
                } else {
                    let abilities = self.get_unit_abilities(unit.def_id);
                    for ability in abilities {
                        match ability {
                            Ability::Damage { amount, lifesteal } => {
                                let absorbed = (*def_shield).min(amount);
                                *def_shield -= absorbed;
                                let remaining = amount - absorbed;
                                *def_health -= remaining as i32;
                                if lifesteal {
                                    *atk_health += amount as i32;
                                }
                            }
                            Ability::Heal { amount } => *atk_health += amount as i32,
                            Ability::Shield { amount } => *atk_shield += amount,
                            Ability::FireDot { amount } => *def_fire += amount,
                            Ability::Stun {
                                duration,
                                amount_of_targets,
                            } => {
                                for target in 0..amount_of_targets {
                                    let i = (battle.tick as usize + target as usize) % 32;
                                    let random_number = battle.random_seed[i] % 3;
                                    def_units[random_number as usize].stunned += duration;
                                }
                            }
                            Ability::Cleanse => *atk_fire = 0,
                            Ability::None => {}
                        }
                    }
                    unit.cooldown_remaining = self.get_unit_cooldown(unit.def_id);
                }
            }
            // remove fire and deal damage
            if battle.tick / 2 == 0 {
                let absorbed = (*def_shield).min(*def_fire);
                *def_shield -= absorbed;
                let remaining = *def_fire - absorbed;
                *def_health -= remaining as i32;
                *def_fire = def_fire.saturating_sub(1);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Stat lookups — pull from roster in production; hardcoded here to keep
    // execute_tick free of a &self borrow (borrow-checker ergonomics).
    // -----------------------------------------------------------------------

    fn get_unit_abilities(&self, def_id: u8) -> Vec<Ability> {
        self.roster
            .iter()
            .find(|x| x.id == def_id)
            .unwrap()
            .abilitys
            .clone()
    }

    fn get_unit_cooldown(&self, def_id: u8) -> u32 {
        self.roster
            .iter()
            .find(|x| x.id == def_id)
            .unwrap()
            .base_cooldown
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_new() {
        let context = get_context(accounts(0));
        testing_env!(context.build());

        let contract = GameContract::new(None);
        assert_eq!(contract.get_roster().len(), 7);
    }

    #[test]
    fn test_lock_board_joins_queue() {
        let context = get_context(accounts(0));
        testing_env!(context.build());

        let mut contract = GameContract::new(None);
        contract.lock_board(vec![0, 1, 2]);
        assert_eq!(contract.get_queue_length(), 1);
    }

    #[test]
    fn test_battle_resolves() {
        let mut contract = GameContract::new(None);

        // Player A locks board
        testing_env!(get_context(accounts(0)).build());
        contract.lock_board(vec![0, 1, 2]);

        // Player B locks board — triggers battle creation
        testing_env!(get_context(accounts(1)).build());
        contract.lock_board(vec![3, 4, 5]);

        let battle_id = format!("{}:{}", accounts(1), accounts(0));
        let result = contract.resolve_battle(battle_id);
        assert!(result.contains("Wins"));
    }
}
