# Basic auto battler contract proof of concept 

4 Accounts are needed to test the contract, 2 for hosting the board and battle contract 
and 2 used to battle units  

---

## How to Build Locally?

Install [`cargo-near`](https://github.com/near/cargo-near) and run:

**Look at .env.example for how to setup .env**

```bash

// YOUR OWN TESTNET ACCOUNTS GO HERE 
export ACCOUNT_ID=autobattletest.testnet
export BOARD_ID=autobattleboard.testnet
export BATTLE_ID=autobattlebattle.testnet

cd contract/
cd board/
cargo near build reproducible-wasm
cd ..
cd battle/
cargo near build reproducible-wasm

cd ..

near deploy $BOARD_ID \
board/target/near/board_setup.wasm \
--initFunction new \
--initArgs '{"battle_contract": "'$BATTLE_ID'", "admin": "'$ACCOUNT_ID'"}' \


near deploy $BATTLE_ID \
battle/target/near/battle_contract.wasm  \
--initFunction new \
--initArgs '{"registry_contract_id": "'$BOARD_ID'", "admin": "'$ACCOUNT_ID'"}' \

```

Then run the user interface 

```bash
cd ..

cd frontend/
npm run dev
```
connect to *http://localhost:5173/*

## How to reset accounts for testing

```bash
near delete $BOARD_ID $ACCOUNT_ID 

near create-account $BOARD_ID --masterAccount $ACCOUNT_ID --initialBalance 10

near delete $BATTLE_ID $ACCOUNT_ID 

near create-account $BATTLE_ID --masterAccount $ACCOUNT_ID --initialBalance 10
```
