import { useState } from 'react'
import { finalise, withdraw } from '../wallet'
 
interface Props {
  auctionEnded: boolean
  onAction:     () => void
}
 
export default function AdminPanel({ auctionEnded, onAction }: Props) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
 
  async function handleFinalise() {
    setMessage(null)
    setLoading(true)
    try {
      // TODO:
      // Call finalise()
      // This triggers a cross-contract NFT transfer to the winner.
      // The transaction may take a few seconds to complete.
      // After success:
      //   setMessage('Auction finalised — NFT transferred to winner.')
      //   onAction()
      await finalise()
      setMessage('Auction finalised — NFT transferred to winner.')
      onAction()
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Finalise failed')
    } finally {
      setLoading(false)
    }
  }
 
  async function handleWithdrawProceeds() {
    setMessage(null)
    setLoading(true)
    try {
      // TODO:
      // Call withdraw() — the contract detects the caller is admin and
      // sends the winning bid amount via a cross-contract FT transfer.
      // After success:
      //   setMessage('Proceeds withdrawn successfully.')
      //   onAction()
      await withdraw()
      setMessage('Proceeds withdrawn successfully.')
      onAction()
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Withdrawal failed')
    } finally {
      setLoading(false)
    }
  }
 
  return (
    <div className="card admin-panel">
      <h2 className="card-title">⚙️ Admin</h2>
 
      {!auctionEnded ? (
        <p className="muted">
          Admin actions are available after the auction ends.
        </p>
      ) : (
        <div className="admin-actions">
          <div className="admin-action">
            <div>
              <strong>Finalise auction</strong>
              <p className="hint">
                Transfers the prize NFT to the winner via a cross-contract call.
                Do this before withdrawing proceeds.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleFinalise}
              disabled={loading}
            >
              {loading ? 'Processing…' : 'Finalise'}
            </button>
          </div>
 
          <div className="admin-action">
            <div>
              <strong>Withdraw proceeds</strong>
              <p className="hint">
                Transfers the winning bid amount to your account via the FT contract.
                Only available after finalising.
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleWithdrawProceeds}
              disabled={loading}
            >
              {loading ? 'Processing…' : 'Withdraw proceeds'}
            </button>
          </div>
        </div>
      )}
 
      {message && <p className="result">{message}</p>}
    </div>
  )
}