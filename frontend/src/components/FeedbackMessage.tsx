type FeedbackMessageProps = {
  message: string | null
  onClear: () => void
  successClassName?: string
}

const successPrefixes = ['تم', 'يمكن', 'أنت الآن']

function isErrorLikeMessage(message: string) {
  const normalizedMessage = message.trim()

  if (!normalizedMessage) {
    return false
  }

  return !successPrefixes.some((prefix) => normalizedMessage.startsWith(prefix))
}

export function FeedbackMessage({ message, onClear, successClassName }: FeedbackMessageProps) {
  if (!message) {
    return null
  }

  if (!isErrorLikeMessage(message)) {
    return (
      <div className={successClassName ?? 'mt-6 rounded-[24px] border border-teal-300/40 bg-teal-50 px-5 py-4 text-sm font-bold text-teal-800'}>
        {message}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4">
      <div className="w-full max-w-lg rounded-[28px] border border-amber-200 bg-white p-6 text-right shadow-[0_28px_100px_rgba(0,0,0,0.24)]">
        <p className="text-sm font-black tracking-[0.2em] text-amber-700">تنبيه</p>
        <h3 className="mt-3 font-display text-2xl font-black text-stone-950">يرجى مراجعة العملية</h3>
        <p className="mt-4 text-base leading-8 text-stone-700">{message}</p>
        <div className="mt-6 flex justify-start">
          <button
            className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-black text-white transition hover:bg-amber-500"
            onClick={onClear}
            type="button"
          >
            موافق
          </button>
        </div>
      </div>
    </div>
  )
}