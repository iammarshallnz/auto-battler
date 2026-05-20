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


