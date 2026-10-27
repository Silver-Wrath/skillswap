import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/States.jsx';

const STATUS_TEXT = {
  pending: 'Awaiting reply',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function MessageThread({ swapId, canPost }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api(`/swaps/${swapId}/messages`);
      setMessages(res.messages);
    } catch (err) {
      setError(err.message);
    }
  }, [swapId]);

  useEffect(() => {
    load();
    // Poll while the conversation can still change.
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSending(true);
    setError('');
    try {
      await api(`/swaps/${swapId}/messages`, { method: 'POST', body: { text: value } });
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Message failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card thread">
      <header className="card-head">
        <h2>Conversation</h2>
        <span className="muted small">updates automatically</span>
      </header>

      <div className="messages">
        {messages.length === 0 && <p className="muted small">No messages yet. Say hello!</p>}
        {messages.map((m) => (
          <div
            key={m._id}
            className={`bubble ${String(m.sender) === String(user.id) ? 'bubble-mine' : ''}`}
          >
            <p>{m.text}</p>
            <time className="muted small">
              {new Date(m.createdAt).toLocaleString(undefined, {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </time>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {canPost ? (
        <form className="msg-form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Write a message…"
            aria-label="Message"
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>
            {sending ? '…' : 'Send'}
          </button>
        </form>
      ) : (
        <p className="muted small">Messaging is closed for this swap.</p>
      )}
    </section>
  );
}

function ReviewForm({ swapId, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api(`/swaps/${swapId}/reviews`, {
        method: 'POST',
        body: { rating, comment },
      });
      onDone(res.rating);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card review-form" onSubmit={submit}>
      <h2>Rate your partner</h2>
      <div className="star-input" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            className={`star ${n <= rating ? 'star-on' : ''}`}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="How did the swap go? (optional)"
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Submit review'}
      </button>
    </form>
  );
}

export default function SwapDetail() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [swap, setSwap] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [myRating, setMyRating] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [swapRes, reviewRes] = await Promise.all([
        api(`/swaps/${id}`),
        api(`/swaps/${id}/reviews`),
      ]);
      setSwap(swapRes.swap);
      setReviews(reviewRes.reviews);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action, extra = {}) => {
    if (action === 'cancel' && !window.confirm('Cancel this swap?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api(`/swaps/${id}`, { method: 'PATCH', body: { action, ...extra } });
      setSwap(res.swap);
      await refresh(); // rating may have changed after reviews
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner label="Loading swap…" />;
  if (error && !swap) return <ErrorBox error={error} onRetry={load} />;
  if (!swap) return <EmptyState title="Swap not found" hint="It may have been removed." />;

  const isRequester = swap.requester?.id === user.id;
  const isRecipient = swap.recipient?.id === user.id;
  const other = isRequester ? swap.recipient : swap.requester;
  const canPost = ['pending', 'scheduled'].includes(swap.status);
  const alreadyReviewed = swap.reviewers?.some((r) => String(r) === String(user.id));
  const durationMin = Math.round((new Date(swap.slot.end) - new Date(swap.slot.start)) / 60000);

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/swaps">← All swaps</Link>
      </div>

      <header className="card swap-detail-head">
        <div>
          <h1>
            {isRequester ? 'You → ' : ''}
            {other?.name}
            {!isRequester && !isRecipient ? '' : ''}
          </h1>
          <p className="muted">
            {isRequester ? 'You proposed this swap' : `${other?.name} proposed this swap`} ·{' '}
            {new Date(swap.slot.start).toLocaleString(undefined, {
              dateStyle: 'full',
              timeStyle: 'short',
            })}{' '}
            ({durationMin} min)
          </p>
        </div>
        <span className={`badge badge-${swap.status}`}>{STATUS_TEXT[swap.status]}</span>
      </header>

      {error && <ErrorBox error={error} />}

      <div className="two-col">
        <div className="col-main">
          <section className="card">
            <h2>The exchange</h2>
            <div className="exchange">
              <div>
                <p className="muted small">They teach you</p>
                <span className="tag tag-learn">
                  {swap.requestedSkill.name} · L{swap.requestedSkill.level}
                </span>
              </div>
              <span className="exchange-arrow" aria-hidden="true">
                ⇄
              </span>
              <div>
                <p className="muted small">You teach them</p>
                <span className="tag tag-offer">
                  {swap.offeredSkill.name} · L{swap.offeredSkill.level}
                </span>
              </div>
            </div>
            {swap.note && <p className="note">“{swap.note}”</p>}
            {swap.closeReason && (
              <p className="small muted">
                Closed by {swap.closedBy === user.id ? 'you' : 'the other member'}: “{swap.closeReason}”
              </p>
              )}
          </section>

          <MessageThread swapId={swap.id} canPost={canPost} />
        </div>

        <aside className="col-side">
          <section className="card">
            <h2>Actions</h2>
            <div className="action-stack">
              {isRecipient && swap.status === 'pending' && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={busy}
                    onClick={() => act('accept')}
                  >
                    Accept proposal
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    disabled={busy}
                    onClick={() => act('decline')}
                  >
                    Decline
                  </button>
                </>
              )}

              {swap.status === 'pending' && isRequester && (
                <button
                  type="button"
                  className="btn btn-danger btn-block"
                  disabled={busy}
                  onClick={() => act('cancel')}
                >
                  Cancel proposal
                </button>
              )}

              {swap.status === 'scheduled' && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={busy}
                    onClick={() => act('complete')}
                  >
                    Mark as completed
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    disabled={busy}
                    onClick={() => act('cancel')}
                  >
                    Cancel session
                  </button>
                </>
              )}

              {['declined', 'cancelled'].includes(swap.status) && (
                <p className="muted small">This swap is closed. No further actions are possible.</p>
              )}

              {swap.status === 'completed' && alreadyReviewed && (
                <p className="muted small">Thanks for reviewing this swap.</p>
              )}
            </div>
          </section>

          {swap.status === 'completed' && !alreadyReviewed && (
            <ReviewForm
              swapId={swap.id}
              onDone={(rating) => {
                setMyRating(rating);
                load();
              }}
            />
          )}
          {myRating && <p className="muted small">Your rating was saved. Thanks!</p>}

          <section className="card">
            <h2>Reviews</h2>
            {reviews.length === 0 ? (
              <p className="muted small">No reviews for this swap yet.</p>
            ) : (
              <ul className="review-list">
                {reviews.map((r) => (
                  <li key={r._id}>
                    <strong>{r.reviewer?.name || 'Member'}</strong>{' '}
                    <span className="rating-on">{'★'.repeat(r.rating)}</span>
                    {r.comment && <p className="small">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/swaps?tab=past')}>
              See history
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
