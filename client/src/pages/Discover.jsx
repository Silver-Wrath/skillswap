import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, ErrorBox, EmptyState } from '../components/States.jsx';
import { SkillList, RatingStars } from '../components/SkillBits.jsx';

export default function Discover() {
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [kind, setKind] = useState('any');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], total: 0, pages: 1 });
  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (skill) params.set('skill', skill);
      params.set('kind', kind);
      params.set('page', String(page));
      const res = await api(`/discover?${params.toString()}`, { signal });
      setData(res);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [q, skill, kind, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 250); // debounce typing
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    api('/skills')
      .then((res) => setCatalog(res.skills))
      .catch(() => setCatalog([]));
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Discover members</h1>
          <p className="muted">Search by skill or name, then open a profile to propose a swap.</p>
        </div>
      </header>

      <form className="filters card" onSubmit={submitSearch}>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search skills or people…"
          aria-label="Search"
        />
        <select
          value={skill}
          onChange={(e) => {
            setSkill(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by skill"
        >
          <option value="">All skills</option>
          {catalog.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.count})
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
          aria-label="Skill direction"
        >
          <option value="any">Teaches or wants</option>
          <option value="offer">Teaches it</option>
          <option value="want">Wants to learn it</option>
        </select>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {loading && <Spinner label="Searching…" />}
      {!loading && error && <ErrorBox error={error} onRetry={() => load()} />}

      {!loading && !error && data.users.length === 0 && (
        <EmptyState
          title="No members found"
          hint="Try a broader search term or clear the skill filter."
        />
      )}

      {!loading && !error && data.users.length > 0 && (
        <>
          <p className="muted small">{data.total} member(s) found</p>
          <div className="people-grid">
            {data.users.map((u) => (
              <article key={u.id} className="card person-card">
                <header className="person-head">
                  <span className="avatar avatar-lg">{u.name.charAt(0).toUpperCase()}</span>
                  <div>
                    <Link to={`/u/${u.id}`} className="list-title">
                      {u.name}
                    </Link>
                    <p className="muted small">{u.location || 'Location not set'}</p>
                  </div>
                </header>
                {u.bio && <p className="small clamp">{u.bio}</p>}
                <p className="muted small label">Teaches</p>
                <SkillList skills={u.skillsOffered} variant="offer" emptyText="Nothing listed yet" />
                <p className="muted small label">Wants to learn</p>
                <SkillList skills={u.skillsWanted} variant="learn" emptyText="Nothing listed yet" />
                <footer className="person-foot">
                  <RatingStars rating={u.rating} />
                  <Link to={`/u/${u.id}`} className="btn btn-ghost">
                    View profile
                  </Link>
                </footer>
              </article>
            ))}
          </div>

          {data.pages > 1 && (
            <div className="pager">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </button>
              <span className="muted small">
                Page {page} of {data.pages}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
