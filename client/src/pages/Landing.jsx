import { Link } from 'react-router-dom';

const STEPS = [
  { title: 'List your skills', text: 'Tell SkillSwap what you can teach and what you want to learn.' },
  { title: 'Get ranked matches', text: 'The matching engine finds people whose wants line up with yours.' },
  { title: 'Propose a swap', text: 'Pick a skill pair, propose a session time, and send it over.' },
  { title: 'Learn together', text: 'Chat, meet, mark the swap complete, and rate your partner.' },
];

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <p className="eyebrow">A community skill-exchange network</p>
        <h1>
          Teach what you know.
          <br />
          Learn what you don't.
        </h1>
        <p className="lede">
          SkillSwap matches people who want to trade skills directly — a guitarist who wants to learn
          Spanish, matched with a Spanish speaker who wants to learn guitar. No money, no classes, just
          a fair exchange.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary btn-lg">
            Create your profile
          </Link>
          <Link to="/login" className="btn btn-ghost btn-lg">
            I already have an account
          </Link>
        </div>
      </section>

      <section className="steps">
        {STEPS.map((s, i) => (
          <article key={s.title} className="step card">
            <span className="step-num">{i + 1}</span>
            <h3>{s.title}</h3>
            <p className="muted">{s.text}</p>
          </article>
        ))}
      </section>

      <section className="card why">
        <h2>Why it exists</h2>
        <p className="muted">
          People already trade skills informally — “I'll teach you guitar if you teach me to cook” —
          but there's no record, no scheduling, and no way to find the right counterpart. SkillSwap
          makes that exchange trackable: ranked matches based on reciprocity, session scheduling with
          double-booking protection, conversations per swap, and a rating system that rewards people
          who actually show up.
        </p>
      </section>
    </div>
  );
}
