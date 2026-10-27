import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.name.trim().length < 2) return setError('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Please enter a valid email.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');

    setBusy(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate('/profile');
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card">
      <h1>Create your account</h1>
      <p className="muted">Then add the skills you can teach and want to learn.</p>

      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={update('name')} autoComplete="name" placeholder="Your name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={form.confirm}
            onChange={update('confirm')}
            autoComplete="new-password"
            placeholder="Repeat password"
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="muted small center">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
