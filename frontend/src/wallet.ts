
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import { setupModal } from '@near-wallet-selector/modal-ui'
import { JsonRpcProvider } from "near-api-js"
import { BATTLE_CONTRACT_ID, BOARD_CONTRACT_ID, NETWORK_ID, RPC_URL } from './config'
import { PlayerState, UnitDef, UnitUpgrade } from './types'

let selector: any
let modal: any


export async function initWallet(): Promise<void> {


  selector = await setupWalletSelector({
    network: NETWORK_ID,
    modules: [
      setupMeteorWallet(),
      setupMyNearWallet(),
    ],
  })

  modal = setupModal(selector, {
    contractId: BOARD_CONTRACT_ID,
  })
}

export async function getAccountId(): Promise<string | null> {

  if (!selector) return null
  const state = selector.store.getState()
  return state.accounts[0]?.accountId ?? null
}

export function isSignedIn(): boolean {

  if (!selector) return false
  return selector.isSignedIn()
}

// ─── 5. showModal ────────────────────────────────────────────────────────────

export function showModal(): void {

  modal.show()
}


export async function signOut(): Promise<void> {

  const wallet = await selector.wallet()
  await wallet.signOut()
}



export async function viewCall<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  
  //
  const provider = new JsonRpcProvider({ url: RPC_URL })

  const result = await provider.query({
    request_type: 'call_function',
    account_id: contractId,
    method_name: methodName,
    args_base64: btoa(JSON.stringify(args)),
    finality: 'final',
  })

  if (!('result' in result)) {
    throw new Error('Unexpected RPC response shape')
  }

  const bytes = new Uint8Array((result as { result: number[] }).result)
  
  const decodedString = new TextDecoder().decode(bytes)
  
  return JSON.parse(decodedString) as T
}


export async function changeCall(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {},
  depositNear: string = '0',
  depositYocto: string | null = null,
): Promise<void> {


  const wallet = await selector.wallet()
  const deposit = depositYocto ?? nearToYocto(depositNear)

  const encodedArgs = new TextEncoder().encode(JSON.stringify(args))

  await wallet.signAndSendTransaction({
    receiverId: contractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName,
          args: encodedArgs,
          gas: '200000000000000', // 200 TGas
          deposit,
        },
      },
    ],
  })
}


export function nearToYocto(near: string): string {
  const [whole, fraction = ''] = near.split('.')
  const paddedFraction = fraction.padEnd(24, '0').slice(0, 24)
  const yocto =
    BigInt(whole) * BigInt('1000000000000000000000000') +
    BigInt(paddedFraction)
  return yocto.toString()
}
 
/**
 * Convert a raw FT amount (smallest unit) to a human-readable decimal string.
 * Uses the token's decimals field from ft_metadata.
 *
 * e.g. ftUnitsToDisplay('5000000', 6) → '5.0'
 */
export function ftUnitsToDisplay(amount: string, decimals: number): string {
  const padded   = amount.padStart(decimals + 1, '0')
  const whole    = padded.slice(0, -decimals) || '0'
  const fraction = padded.slice(-decimals).replace(/0+$/, '') || '0'
  return `${whole}.${fraction}`
}
 
/**
 * Convert a human-readable FT amount to the smallest unit string.
 *
 * e.g. displayToFtUnits('2.5', 6) → '2500000'
 */
export function displayToFtUnits(amount: string, decimals: number): string {
  const [whole, fraction = ''] = amount.split('.')
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
  return (BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFraction)).toString()
}
 
/**
 * Convert a NEAR nanosecond timestamp to a human-readable date string.
 */
export function nsToDateString(ns: string): string {
  const ms = Number(BigInt(ns) / 1_000_000n)
  return new Date(ms).toLocaleString()
}
 
/**
 * Returns true if the auction end time has passed.
 */
export function isAuctionEnded(endTimeNs: string): boolean {
  return Date.now() > Number(BigInt(endTimeNs) / 1_000_000n)
}

// ─── Contract-specific helpers ────────────────────────────────────────────
//
// These typed wrappers call viewCall/changeCall with the right contract ID,
// method name, and argument shape. Components import these directly rather
// than calling viewCall/changeCall themselves.
 

// AUto battler

// VEIWS #############
export async function getShop(accountId: string): Promise<UnitDef[]> {
  return viewCall<UnitDef[]>(BOARD_CONTRACT_ID, 'get_shop', {player: accountId})
}

export async function getBoard(accountId: string): Promise<PlayerState> {
  return viewCall<PlayerState>(BOARD_CONTRACT_ID, 'get_board', {player: accountId})
}

export async function getReadyPlayers(): Promise<string[]> {
  return viewCall<string[]>(BOARD_CONTRACT_ID, 'get_ready_players', {})
}

export async function getRoster(): Promise<UnitDef[]> {
  return viewCall<UnitDef[]>(BOARD_CONTRACT_ID, 'get_roster', {})
}

export async function getCurrentState(accountId: string): Promise<PlayerState> {
  return viewCall<PlayerState>(BOARD_CONTRACT_ID, 'get_current_state', {player: accountId})
}

export async function getBazaarOffers(accountId: string): Promise<UnitUpgrade[]> {
  return viewCall<UnitUpgrade[]>(BOARD_CONTRACT_ID, 'get_bazaar_offers', {player: accountId})
}


// change ###########

export async function rollSeed(season_id: number): Promise<void> {
  await changeCall(BOARD_CONTRACT_ID, 'roll_seed', {season_id: season_id})
}
export async function lockBoard(chosen_ids: number[]): Promise<void> {
  await changeCall(BOARD_CONTRACT_ID, 'lock_board', {chosen_ids: chosen_ids})
}
// index from 0-2 
export async function pickUpgrade(offer_index: number): Promise<void> {
  await changeCall(BOARD_CONTRACT_ID, 'pick_upgrade', {offer_index: offer_index})
}
export async function resetSelf(): Promise<void> {
  await changeCall(BOARD_CONTRACT_ID, 'reset_player', {})
}

export async function finalise(): Promise<void> {
  await changeCall(BOARD_CONTRACT_ID, 'finalise', {})
}

export async function withdraw(): Promise<void> {
  await changeCall(BOARD_CONTRACT_ID, 'withdraw', {})
}


