import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import { gbp, shortDate } from '../lib/utils'

const stripePromise = loadStripe('pk_live_51...') // replace with your publishable key

interface Props {
  tenancyId: string
  amount: number
  dueDate: Date
  onClose: () => void
}

export default function PayRentModal({ tenancyId, amount, dueDate, onClose }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function prepare() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        const { data, error: fnErr } = await supabase.functions.invoke('create-rent-payment', {
          body: { tenancy_id: tenancyId },
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (fnErr || !data?.client_secret) {
          const msg = data?.error ?? (fnErr as Error)?.message ?? 'Failed to prepare payment'
          throw new Error(msg)
        }
        setClientSecret(data.client_secret)
      } catch (err) {
        setError((err as Error).message ?? 'Failed to prepare payment')
      } finally {
        setIsLoading(false)
      }
    }
    prepare()
  }, [tenancyId])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[#FAFAF9] rounded-t-3xl max-h-[90dvh] overflow-y-auto">
        <div className="p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-[17px] font-bold text-[#1C1917]">Pay Rent</span>
            <button type="button" onClick={onClose} className="text-[13px] text-[#57534E]">Cancel</button>
          </div>

          {/* Amount */}
          <div className="bg-[#F5F5F4] rounded-2xl p-5 text-center">
            <p className="text-[13px] font-medium text-[#78716C]">Amount Due</p>
            <p className="text-[36px] font-bold text-[#1C1917]">{gbp(amount)}</p>
            <p className="text-[13px] text-[#A8A29E]">Due {shortDate(dueDate)}</p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2">
              <span className="animate-spin text-xl">⟳</span>
              <span className="text-[14px] text-[#78716C]">Preparing payment…</span>
            </div>
          )}

          {error && (
            <div className="text-[13px] text-[#DC2626] text-center py-4">{error}</div>
          )}

          {clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#1C1917' } } }}
            >
              <CheckoutForm amount={amount} onSuccess={onClose} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckoutForm({ amount, onSuccess }: { amount: number; onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setIsSubmitting(true)
    setError(null)

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setIsSubmitting(false)
    } else {
      setSucceeded(true)
    }
  }

  if (succeeded) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <span className="text-5xl text-[#065F46]">✓</span>
        <p className="text-[17px] font-semibold text-[#1C1917]">Payment Successful</p>
        <p className="text-[13px] text-[#78716C] text-center">Your rent has been paid. The landlord will receive funds automatically.</p>
        <button type="button" onClick={onSuccess}
          className="w-full py-4 bg-[#065F46] text-white rounded-2xl text-[15px] font-semibold mt-2">
          Done
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && <p className="text-[12px] text-[#DC2626] text-center">{error}</p>}
      <button type="submit" disabled={!stripe || isSubmitting}
        className="w-full py-4 bg-[#1C1917] text-white rounded-2xl text-[15px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
        {isSubmitting ? <span className="animate-spin">⟳</span> : null}
        Pay {gbp(amount)}
      </button>
    </form>
  )
}
