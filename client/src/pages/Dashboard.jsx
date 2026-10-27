import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/States.jsx';
import { RatingStars } from '../components/SkillBits.jsx';

const STATUS_LABEL = {
  pending: 'Awaiting reply',
  scheduled: 'Scheduled',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

function SwapRow({ swap, action }) {
  const other = action === 'incoming' ? swap.requester : swap.recipient;
  return (
    <li className="list-row">
      <div className="list-main">
        <Link to={`/swaps/${swap.id}`} className="list-title">
          {other?.name}
        </Link>
        <span className="muted small">
          {swap.offeredSkill.name} ⇄ {swap.requestedSkill.name} ·{' '}
          {new Date(swap.slot.start).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      </div>
      <span className={`badge badge-${swap.status}`}>{STATUS_LABEL[swap.status]}</span>
    </li>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [active, setActive] = useState([]);
  const [matches, setMatches] = useState([]);
  const [matchHint, setMatchHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!user.skillsOffered.length || !user.skillsWanted.length) await refresh();
      const [statsRes, incomingRes, activeRes, matchRes] = await Promise.all([
        api('/stats/me'),
        api('/swaps?filter=incoming'),
        api('/swaps?filter=active'),
        api('/matches?limit=3'),
      ]);
      setData(statsRes);
      setIncoming(incomingRes.swaps);
      setActive(activeRes.swaps);
      setMatches(matchRes.matches);
      setMatchHint(matchRes.hint || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, refresh]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner label="Loading your dashboard…" />;
  if (error) return <ErrorBox error={error} onRetry={load} />;

  const s = data?.stats;
  const emptyProfile = user.skillsOffered.length === 0 && user.skillsWanted.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Hi, {user.name.split(' ')[0]} 👋</h1>
          <p className="muted">Here is where your skill swaps stand today.</p>
        </div>
        <Link to="/profile" className="btn btn-ghost">
          Edit profile
        </Link>
      </header>

      {emptyProfile && (
        <div className="banner">
          <strong>Your profile has no skills yet.</strong>
          <span className="muted"> Add what you can teach and what you want to learn to unlock matches.</span>{' '}
          <Link to="/profile">Set up now →</Link>
        </div>
      )}

      <section className="stat-grid">
        <div className="card stat">
          <span className="stat-value">{s?.offers ?? 0}</span>
          <span className="stat-label">Skills you teach</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{s?.wants ?? 0}</span>
          <span className="stat-label">Skills you want</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{s?.pendingIncoming ?? 0}</span>
          <span className="stat-label">Requests waiting on you</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{s?.active ?? 0}</span>
          <span className="stat-label">Scheduled swaps</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{s?.completed ?? 0}</span>
          <span className="stat-label">Completed swaps</span>
        </div>
        <div className="card stat">
          <span className="stat-value">
            {s?.rating?.count ? s.rating.average.toFixed(1) : '—'}
          </span>
          <span className="stat-label">
            <RatingStars rating={s?.rating} />
          </span>
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <header className="card-head">
            <h2>Incoming requests</h2>
            <Link to="/swaps?tab=incoming" className="small">
              View all
            </Link>
          </header>
          {incoming.length === 0 ? (
            <EmptyState title="Nothing waiting" hint="Proposals from other members will appear here." />
          ) : (
            <ul className="list">
              {incoming.slice(0, 4).map((swap) => (
                <SwapRow key={swap.id} swap={swap} action="incoming" />
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <header className="card-head">
            <h2>Active swaps</h2>
            <Link to="/swaps?tab=active" className="small">
              View all
            </Link>
          </header>
          {active.length === 0 ? (
            <EmptyState
              title="No scheduled sessions"
              hint="Accept a proposal and your booked sessions show up here."
            />
          ) : (
            <ul className="list">
              {active.slice(0, 4).map((swap) => (
                <SwapRow key={swap.id} swap={swap} action="active" />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <header className="card-head">
          <h2>Top matches for you</h2>
          <Link to="/matches" className="small">
            See ranking
          </Link>
        </header>
        {matchHint ? (
          <EmptyState title="No matches yet" hint={matchHint} action={<Link to="/profile" className="btn btn-primary">Add skills</Link>} />
        ) : matches.length === 0 ? (
          <EmptyState title="No matches yet" hint="Add more skills to widen your match pool." />
        ) : (
          <ul className="list">
            {matches.map((m) => (
              <li key={m.user.id} className="list-row">
                <div className="list-main">
                  <Link to={`/u/${m.user.id}`} className="list-title">
                    {m.user.name}
                  </Link>
                  <span className="muted small">
                    {m.mutual ? 'Mutual fit' : 'One-way fit'} ·{' '}
                    {m.fromThem.map((x) => x.skill).join(', ') || '—'}
                    {m.fromMe.length ? ` ⇄ ${m.fromMe.map((x) => x.skill).join(', ')}` : ''}
                  </span>
                </div>
                <span className="score">{m.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data?.skillDemand?.length > 0 && (
        <section className="card">
          <header className="card-head">
            <h2>Demand for your skills</h2>
          </header>
          <ul className="demand">
            {data.skillDemand.slice(0, 6).map((d) => (
              <li key={d.skill} className="demand-row">
                <span className="demand-name">{d.skill}</span>
                <span className="demand-bar">
                  <span
                    style={{
                      width: `${Math.min(100, (d.learners / data.skillDemand[0].learners) * 100)}%`,
                    }}
                  />
                </span>
                <span className="muted small">{d.learners} learner{d.learners === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
