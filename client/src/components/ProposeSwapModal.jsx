import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';

const DURATIONS = [30, 45, 60, 90, 120];

function defaultSlot() {
  // Round up to the next half hour so the default is always in the future.
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProposeSwapModal({ open, onClose, me, them, prefill = {} }) {
  const navigate = useNavigate();
  const [teach, setTeach] = useState(prefill.teach || '');
  const [learn, setLearn] = useState(prefill.learn || '');
  const [when, setWhen] = useState(defaultSlot());
  const [duration, setDuration] = useState(60);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const myOffers = me?.skillsOffered || [];
  const theirOffers = them?.skillsOffered || [];

  const teachValue = useMemo(
    () => (myOffers.some((s) => s.name === teach) ? teach : myOffers[0]?.name || ''),
    [teach, myOffers]
  );
  const learnValue = useMemo(
    () => (theirOffers.some((s) => s.name === learn) ? learn : theirOffers[0]?.name || ''),
    [learn, theirOffers]
  );

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!teachValue || !learnValue) {
      setError('Pick one skill to teach and one to learn.');
      return;
    }
    const start = new Date(when);
    if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
      setError('Pick a session time in the future.');
      return;
    }

    setBusy(true);
    try {
      const data = await api('/swaps', {
        method: 'POST',
        body: {
          recipientId: them.id,
          offeredSkillName: teachValue,
          requestedSkillName: learnValue,
          slotStart: start.toISOString(),
          durationMinutes: duration,
          note,
        },
      });
      onClose();
      navigate(`/swaps/${data.swap.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the proposal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Propose a swap with ${them.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>Propose a swap with {them.name.split(' ')[0]}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {myOffers.length === 0 || theirOffers.length === 0 ? (
          <p className="muted">
            {myOffers.length === 0
              ? 'Add at least one skill you teach on your profile before proposing a swap.'
              : `${them.name} has not listed any teachable skills yet.`}
          </p>
        ) : (
          <form onSubmit={submit} className="form">
            <label className="field">
              <span>You will teach</span>
              <select value={teachValue} onChange={(e) => setTeach(e.target.value)}>
                {myOffers.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} (your L{s.level})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>You want to learn</span>
              <select value={learnValue} onChange={(e) => setLearn(e.target.value)}>
                {theirOffers.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} (their L{s.level})
                  </option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field">
                <span>Session starts</span>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
              </label>
              <label className="field">
                <span>Duration</span>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>Message (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="What would you like to cover?"
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send proposal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
