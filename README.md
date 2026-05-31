# Basic  Contract 


---

## How to Build Locally?

Install [`cargo-near`](https://github.com/near/cargo-near) and run:

```bash
cargo near build
```

Do this within wls 
## How to Test Locally?

```bash
cargo test
```

deployment
```bash

export ACCOUNT_ID=autobattletest.testnet
export BOARD_ID=autobattleboard.testnet
export BATTLE_ID=autobattlebattle.testnet

// BOTH 
cargo near build reproducible-wasm

near deploy $BOARD_ID battle/target/near/battle_contract.wasm 
near deploy $BATTLE_ID \
  battle/target/wasm32-unknown-unknown/release/battle_contract.wasm \

near call $BOARD_ID new \
  '{"battle_contract": "'$BATTLE_ID'"}' \
  --accountId $ACCOUNT_ID

near call $BATTLE_ID new \
  '{"registry_contract_id": "'$BOARD_ID'", "admin": "'$ACCOUNT_ID'"}' \
  --accountId $ACCOUNT_ID


near view $BOARD_ID get_roster '{}'

near call $BOARD_ID roll_seed '{"season_id": 1}' --accountId $ACCOUNT_ID

near call $BOARD_ID get_shop '{"player": "'$ACCOUNT_ID'"}' --accountId $ACCOUNT_ID


```
