use near_sdk::json_types::{U64, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, env, near, near_bindgen,
};

#[near_bindgen]
impl BoardRegistry {
    pub fn register_board(&mut self, chosen_ids: Vec<u8>) {
        let player = env::predecessor_account_id();
        // ...validate chosen_ids against roster...
        self.boards.insert(&player.to_string(), &chosen_ids);
        env::log_str(&format!("Board registered for {}", player));
    }

    pub fn get_board(&self, player: AccountId) -> Vec<u8> {
        self.boards.get(&player.to_string())
            .unwrap_or_else(|| env::panic_str("Player has no registered board"))
    }
}