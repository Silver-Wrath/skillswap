import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/States.jsx';

const TABS = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Sent' },
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
];

const STATUS_TEXT = {
  pending: 'Awaiting reply',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

const EMPTY = {
  incoming: ['No incoming requests', 'When someone proposes a swap with you, it lands here.'],
  outgoing: ['No sent proposals', 'Propose a swap from the Matches page.'],
  active: ['No scheduled sessions', 'Accepted proposals become scheduled swaps.'],
  past: ['No history yet', 'Completed, declined and cancelled swaps are kept here.'],
  all: ['No swaps yet', 'Find a match and send your first proposal.'],
};

export default function Swaps() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'incoming';

  const [swaps, setSwaps] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/swaps?filter=${tab}`);
      setSwaps(res.swaps);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, action) => {
    setBusyId(id);
    setError('');
    try {
      await api(`/swaps/${id}`, { method: 'PATCH', body: { action } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Your swaps</h1>
          <p className="muted">Proposals, scheduled sessions and history.</p>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setParams({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}
      {loading && <Spinner label="Loading swaps…" />}

      {!loading && !error && swaps.length === 0 && (
        <EmptyState
          title={EMPTY[tab][0]}
          hint={EMPTY[tab][1]}
          action={
            tab !== 'past' && tab !== 'active' ? (
              <Link to="/matches" className="btn btn-primary">
                Browse matches
              </Link>
            ) : null
          }
        />
      )}

      {!loading && !error && swaps.length > 0 && (
        <ul className="swap-list">
          {swaps.map((s) => {
            // Only the recipient may accept or decline a pending proposal.
            const canAct = s.status === 'pending' && s.recipient?.id === user.id;
            return (
              <li key={s.id} className="card swap-card">
                <div className="swap-top">
                  <div>
                    <Link to={`/swaps/${s.id}`} className="list-title">
                      {s.requester?.name} → {s.recipient?.name}
                    </Link>
                    <p className="muted small">
                      Session{' '}
                      {new Date(s.slot.start).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}{' '}
                      ({Math.round((new Date(s.slot.end) - new Date(s.slot.start)) / 60000)} min)
                    </p>
                  </div>
                  <span className={`badge badge-${s.status}`}>{STATUS_TEXT[s.status]}</span>
                </div>

                <p className="swap-skills">
                  <span className="tag tag-offer">{s.offeredSkill.name}</span>
                  <span className="muted">⇄</span>
                  <span className="tag tag-learn">{s.requestedSkill.name}</span>
                </p>

                {s.note && <p className="small note">“{s.note}”</p>}

                <div className="swap-actions">
                  <Link to={`/swaps/${s.id}`} className="btn btn-ghost">
                    Open
                  </Link>
                  {canAct && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === s.id}
                        onClick={() => act(s.id, 'accept')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busyId === s.id}
                        onClick={() => act(s.id, 'decline')}
                      >
                        Decline
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
