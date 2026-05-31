# NEAR Auction Frontend — Skeleton for Tutorial 3

This is the starter project for **Tutorial 3: Building a Web Frontend**.

## What is pre-built

Everything except the NEAR-specific code:

- Vite + React + TypeScript project configuration
- Node.js polyfills for `near-api-js` (`vite.config.ts`)
- All CSS styling (`src/index.css`)
- `src/config.ts` — network and contract configuration
- `src/types.ts` — TypeScript types mirroring the contract structs
- `src/main.tsx` — app entry point
- All component files with their full JSX structure:
  - `src/components/AuctionInfo.tsx` — complete, no TODOs
  - `src/components/BidForm.tsx` — one TODO (the `changeCall`)
  - `src/components/WithdrawButton.tsx` — one TODO (view calls + `changeCall`)
- `src/App.tsx` — structure complete, two TODOs for wallet interactions

## What you need to implement

The main exercise is **`src/wallet.ts`**. Every exported function has a `// TODO` with step-by-step instructions. Work through them in order:

| Function | What it does |
|---|---|
| `initWallet()` | Set up Wallet Selector with Meteor + MyNEAR wallets |
| `getAccountId()` | Get the connected account ID |
| `isSignedIn()` | Check if a wallet is connected |
| `showModal()` | Open the wallet selection popup |
| `signOut()` | Disconnect the wallet |
| `viewCall<T>()` | Free read-only contract query via JSON-RPC |
| `changeCall()` | Signed transaction sent through the wallet |

The utility functions at the bottom of `wallet.ts` (`nearToYocto`, `yoctoToNear`, `nsToDateString`, `isAuctionEnded`) are already implemented — read them to understand the unit conversions.

After `wallet.ts` is done, complete the two TODOs in `App.tsx` and the TODOs in `BidForm.tsx` and `WithdrawButton.tsx`.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env and set VITE_CONTRACT_ID to your deployed contract account
# e.g. VITE_CONTRACT_ID=auction.your-account.testnet

# 3. Start the dev server
npm run dev
```

Open http://localhost:5173

## Key concepts

**View calls vs change calls**

| | View call | Change call |
|---|---|---|
| Cost | Free | Gas (paid in NEAR) |
| Wallet needed | No | Yes |
| Rust method | `&self` | `&mut self` |
| Used for | Reading state | Bidding, withdrawing |

**Unit conversions**

The contract works in raw units internally:
- Token amounts: **yoctoNEAR** (1 NEAR = 10²⁴ yoctoNEAR)
- Timestamps: **nanoseconds** since Unix epoch

Always convert to human-readable values before displaying to users.
The utility functions in `wallet.ts` handle this.

**The wallet never shares your private key**

When `changeCall()` hands a transaction to the Wallet Selector, the Wallet
Selector passes it to Meteor Wallet (or whichever wallet the user chose).
The wallet signs the transaction internally and broadcasts it to the network.
Your app never sees the private key — only the wallet does.
