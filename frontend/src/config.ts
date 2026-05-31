// ─── Network and contract configuration ──────────────────────────────────────
//
// Values are read from the .env file at build time.
// Copy .env.example to .env and fill in your contract ID before running.

export const BOARD_CONTRACT_ID = import.meta.env.VITE_BOARD_CONTRACT_ID as string
export const BATTLE_CONTRACT_ID = import.meta.env.VITE_BATTLE_CONTRACT_ID as string
export const NETWORK_ID = import.meta.env.VITE_NETWORK_ID as 'testnet' | 'mainnet'

export const RPC_URL =
  NETWORK_ID === 'mainnet'
    ? 'https://rpc.mainnet.near.org'
    : 'https://rpc.testnet.near.org'



