import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/States.jsx';
import { RatingStars } from '../components/SkillBits.jsx';
import ProposeSwapModal from '../components/ProposeSwapModal.jsx';

function MatchCard({ match, onPropose }) {
  const { user } = match;
  return (
    <article className="card match-card">
      <header className="match-head">
        <div>
          <Link to={`/u/${user.id}`} className="match-name">
            {user.name}
          </Link>
          <p className="muted small">
            {user.location || 'Location not set'} ·{' '}
            <RatingStars rating={user.rating} />
          </p>
        </div>
        <div className="match-score" title="Compatibility score">
          <strong>{match.score}</strong>
          <span className="muted small">{match.mutual ? 'mutual' : 'one-way'}</span>
        </div>
      </header>

      <div className="match-pairs">
        {match.fromThem.length > 0 && (
          <div>
            <h4>They can teach you</h4>
            <ul className="pair-list">
              {match.fromThem.map((p) => (
                <li key={p.skill}>
                  <span className="tag tag-learn">{p.skill}</span>
                  <span className="muted small">
                    their L{p.theirLevel} vs your target L{p.myDesiredLevel}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {match.fromMe.length > 0 && (
          <div>
            <h4>You can teach them</h4>
            <ul className="pair-list">
              {match.fromMe.map((p) => (
                <li key={p.skill}>
                  <span className="tag tag-offer">{p.skill}</span>
                  <span className="muted small">
                    your L{p.myLevel} vs their target L{p.theirDesiredLevel}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="match-foot">
        <details className="breakdown">
          <summary>Score breakdown</summary>
          <ul>
            <li>Reciprocity: {match.breakdown.reciprocity}</li>
            <li>Level fit: {match.breakdown.levelFit}</li>
            <li>Skill depth: {match.breakdown.depth}</li>
            <li>Reputation: {match.breakdown.reputation}</li>
            <li>Skill scarcity: {match.breakdown.scarcity}</li>
          </ul>
        </details>
        {match.hasOpenSwap ? (
          <Link to="/swaps" className="btn btn-ghost">
            Open swap in progress
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onPropose({
                them: user,
                prefill: {
                  teach: match.fromMe[0]?.skill,
                  learn: match.fromThem[0]?.skill,
                },
              })
            }
          >
            Propose swap
          </button>
        )}
      </footer>
    </article>
  );
}

export default function Matches() {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [proposing, setProposing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/matches');
      setMatches(data.matches);
      setHint(data.hint || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Your matches</h1>
          <p className="muted">
            Ranked by reciprocity, level fit, depth, reputation and how rare your skills are.
          </p>
        </div>
      </header>

      {loading && <Spinner label="Scanning the community…" />}
      {!loading && error && <ErrorBox error={error} onRetry={load} />}
      {!loading && !error && hint && (
        <EmptyState
          title="No matches yet"
          hint={hint}
          action={
            <Link to="/profile" className="btn btn-primary">
              Set up your skills
            </Link>
          }
        />
      )}
      {!loading && !error && !hint && matches.length === 0 && (
        <EmptyState
          title="Nobody matches right now"
          hint="Try adding more skills you can teach, or broaden the ones you want to learn."
          action={
            <Link to="/profile" className="btn btn-primary">
              Edit skills
            </Link>
          }
        />
      )}

      {!loading && !error && matches.length > 0 && (
        <div className="match-grid">
          {matches.map((m) => (
            <MatchCard key={m.user.id} match={m} onPropose={setProposing} />
          ))}
        </div>
      )}

      {proposing && (
        <ProposeSwapModal
          open
          onClose={() => setProposing(null)}
          me={user}
          them={proposing.them}
          prefill={proposing.prefill}
        />
      )}
    </div>
  );
}
