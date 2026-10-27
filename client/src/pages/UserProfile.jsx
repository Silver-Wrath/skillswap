import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, ErrorBox, EmptyState } from '../components/States.jsx';
import { SkillList, RatingStars } from '../components/SkillBits.jsx';
import ProposeSwapModal from '../components/ProposeSwapModal.jsx';

export default function UserProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [proposing, setProposing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/users/${id}`);
      setProfile(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <Spinner label="Loading profile…" />;
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!profile) return <EmptyState title="Profile not found" />;

  const isMe = profile.id === user.id;
  const canTeach = profile.skillsOffered?.length > 0;

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/discover">← Back to discover</Link>
      </div>

      <header className="card profile-head">
        <span className="avatar avatar-xl">{profile.name.charAt(0).toUpperCase()}</span>
        <div>
          <h1>{profile.name}</h1>
          <p className="muted">{profile.location || 'Location not set'}</p>
          <RatingStars rating={profile.rating} />
          {profile.bio && <p className="bio">{profile.bio}</p>}
        </div>
        {!isMe && (
          <div className="profile-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canTeach}
              title={canTeach ? undefined : 'This member has not listed teachable skills yet'}
              onClick={() => setProposing(true)}
            >
              Propose a swap
            </button>
            {!canTeach && <p className="muted small">No teachable skills listed yet.</p>}
          </div>
        )}
      </header>

      <div className="two-col">
        <section className="card">
          <h2>Teaches</h2>
          <SkillList skills={profile.skillsOffered} variant="offer" emptyText="Nothing listed yet" />
        </section>
        <section className="card">
          <h2>Wants to learn</h2>
          <SkillList skills={profile.skillsWanted} variant="learn" emptyText="Nothing listed yet" />
        </section>
      </div>

      {isMe && (
        <p className="muted">
          This is you. <Link to="/profile">Edit your profile</Link>.
        </p>
      )}

      {proposing && (
        <ProposeSwapModal
          open
          onClose={() => setProposing(false)}
          me={user}
          them={profile}
          prefill={{ learn: profile.skillsOffered[0]?.name }}
        />
      )}
    </div>
  );
}
