import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getReviewToken, submitReview, ReviewTokenData } from '../services/reviewService';

const CORAL = '#e8463a';

interface Props {
  token: string;
}

export const HostReview: React.FC<Props> = ({ token }) => {
  const [tokenData, setTokenData] = useState<ReviewTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [quote, setQuote] = useState('');
  const [wouldInviteBack, setWouldInviteBack] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getReviewToken(token);
        if (!data) { setInvalid(true); return; }
        if (data.used) { setInvalid(true); return; }
        setTokenData(data);
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleSubmit = async () => {
    if (!tokenData || rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      await submitReview(tokenData, { rating, quote, wouldInviteBack });
      setSubmitted(true);
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={36} className="animate-spin" style={{ color: CORAL }} />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">This link is no longer valid</h1>
          <p className="text-gray-400 text-sm">It may have already been used or has expired.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-6">🙏</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Thank you!</h1>
          <p className="text-gray-500 text-base leading-relaxed">
            Your feedback means a lot — it helps us keep the quality of guests high and the experience great for everyone.
          </p>
        </div>
      </div>
    );
  }

  const clientFirstName = tokenData!.clientName.split(' ')[0] || tokenData!.clientName;
  const displayRating = hoveredRating || rating;

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Top bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: CORAL }} />

      <div className="flex-1 max-w-xl mx-auto w-full px-6 py-12">

        {/* Logo */}
        <div className="mb-10">
          <img src="/logo.webp" alt="Badassery" className="h-7 opacity-80" />
        </div>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-3">
            How was <span style={{ color: CORAL }}>{clientFirstName}</span> as a guest?
          </h1>
          {tokenData!.podcastName && (
            <p className="text-gray-400 text-base">on <span className="text-gray-600 font-medium">{tokenData!.podcastName}</span></p>
          )}
        </div>

        {/* Rating */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-700 mb-3">Rate the experience <span className="text-rose-400">*</span></p>
          <div className="flex gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoveredRating(n)}
                onMouseLeave={() => setHoveredRating(0)}
                className="w-9 h-9 rounded-lg text-sm font-bold transition-all"
                style={{
                  backgroundColor: n <= displayRating ? CORAL : '#f3f4f6',
                  color: n <= displayRating ? 'white' : '#9ca3af',
                  transform: n <= displayRating ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {rating <= 3 ? 'Below expectations' : rating <= 5 ? 'Average' : rating <= 7 ? 'Good' : rating <= 9 ? 'Great' : 'Outstanding! 🌟'}
            </p>
          )}
        </div>

        {/* Quote */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Leave a comment <span className="font-normal text-gray-400">(optional)</span>
          </p>
          <textarea
            value={quote}
            onChange={e => setQuote(e.target.value)}
            rows={4}
            placeholder={`What did you think of ${clientFirstName}? Would you recommend them to other hosts?`}
            className="w-full border-2 border-gray-200 focus:border-rose-300 rounded-xl p-4 text-gray-800 text-sm resize-none outline-none transition-colors placeholder-gray-300"
          />
        </div>

        {/* Would invite back */}
        <div className="mb-10">
          <p className="text-sm font-semibold text-gray-700 mb-3">Would you invite them back?</p>
          <div className="flex gap-3">
            {[{ label: 'Yes 👍', val: true }, { label: 'No 👎', val: false }].map(opt => (
              <button
                key={String(opt.val)}
                onClick={() => setWouldInviteBack(wouldInviteBack === opt.val ? null : opt.val)}
                className="px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-all"
                style={{
                  borderColor: wouldInviteBack === opt.val ? CORAL : '#e5e7eb',
                  backgroundColor: wouldInviteBack === opt.val ? '#fef2f2' : 'white',
                  color: wouldInviteBack === opt.val ? CORAL : '#6b7280',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full py-4 rounded-xl text-white font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: CORAL }}
        >
          {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Submitting…</span> : 'Submit Review'}
        </button>

        {rating === 0 && (
          <p className="text-xs text-gray-400 text-center mt-3">Please select a rating to submit</p>
        )}
      </div>

      {/* Footer bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: CORAL }} />
    </div>
  );
};
