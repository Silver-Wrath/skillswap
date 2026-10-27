import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { SkillEditor, RatingStars } from '../components/SkillBits.jsx';

const clone = (list) => list.map((s) => ({ ...s }));

export default function MyProfile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    location: user?.location || '',
  });
  const [offered, setOffered] = useState(clone(user?.skillsOffered || []));
  const [wanted, setWanted] = useState(clone(user?.skillsWanted || []));
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({ name: user.name, bio: user.bio || '', location: user.location || '' });
    setOffered(clone(user.skillsOffered || []));
    setWanted(clone(user.skillsWanted || []));
  }, [user]);

  const clean = (list) => list.map((s) => ({ name: s.name.trim().toLowerCase(), level: s.level })).filter((s) => s.name);

  const save = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (form.name.trim().length < 2) {
      setMessage({ type: 'error', text: 'Name must be at least 2 characters.' });
      return;
    }

    setBusy(true);
    try {
      const res = await api('/users/me', {
        method: 'PUT',
        body: {
          name: form.name.trim(),
          bio: form.bio,
          location: form.location,
          skillsOffered: clean(offered),
          skillsWanted: clean(wanted),
        },
      });
      setUser(res.user);
      setMessage({ type: 'ok', text: 'Profile saved.' });
    } catch (err) {
      const detail = err instanceof ApiError && err.details?.length ? ` ${err.details[0]}` : '';
      setMessage({ type: 'error', text: `${err.message}${detail}` });
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Your profile</h1>
          <p className="muted">
            Your skills drive the matching engine — the more specific they are, the better the matches.
          </p>
        </div>
        <div className="rating-block">
          <RatingStars rating={user.rating} />
        </div>
      </header>

      <form onSubmit={save} className="stack">
        <section className="card">
          <h2>Basics</h2>
          <div className="form">
            <div className="field-row">
              <label className="field">
                <span>Name</span>
                <input
                  value={form.name}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Location</span>
                <input
                  value={form.location}
                  maxLength={80}
                  placeholder="City, campus…"
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>About you</span>
              <textarea
                value={form.bio}
                maxLength={500}
                rows={4}
                placeholder="What are you working on? What do you enjoy teaching?"
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
              <em className="muted small">{form.bio.length}/500</em>
            </label>
          </div>
        </section>

        <SkillEditor
          title="Skills you can teach"
          hint="Add up to 12. Set your level from 1 (beginner) to 5 (expert)."
          skills={offered}
          onChange={setOffered}
        />
        <SkillEditor
          title="Skills you want to learn"
          hint="Add up to 12. People who teach these will be matched with you."
          skills={wanted}
          onChange={setWanted}
        />

        {message.text && (
          <p className={message.type === 'error' ? 'form-error' : 'form-ok'} role="status">
            {message.text}
          </p>
        )}

        <div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
