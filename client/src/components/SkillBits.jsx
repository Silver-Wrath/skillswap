const LEVEL_LABELS = ['Beginner', 'Basic', 'Comfortable', 'Advanced', 'Expert'];

export function SkillTag({ name, level, variant = 'offer' }) {
  return (
    <span className={`tag tag-${variant}`} title={level ? LEVEL_LABELS[level - 1] : undefined}>
      {name}
      {level ? <em>L{level}</em> : null}
    </span>
  );
}

export function SkillList({ skills, variant, emptyText }) {
  if (!skills?.length) return <p className="muted small">{emptyText}</p>;
  return (
    <div className="tag-row">
      {skills.map((s) => (
        <SkillTag key={s.name} name={s.name} level={s.level} variant={variant} />
      ))}
    </div>
  );
}

export function RatingStars({ rating }) {
  if (!rating || !rating.count) return <span className="muted small">No reviews yet</span>;
  return (
    <span className="rating" title={`${rating.average} / 5 from ${rating.count} reviews`}>
      <span aria-hidden="true">{'★'.repeat(Math.round(rating.average))}{'☆'.repeat(5 - Math.round(rating.average))}</span>
      <span className="muted small">
        {' '}
        {rating.average.toFixed(1)} ({rating.count})
      </span>
    </span>
  );
}

// Editable list of { name, level } rows used on the profile page.
export function SkillEditor({ title, hint, skills, onChange, max = 12 }) {
  const add = () => {
    if (skills.length >= max) return;
    onChange([...skills, { name: '', level: 3 }]);
  };

  const update = (idx, patch) => {
    onChange(skills.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const remove = (idx) => onChange(skills.filter((_, i) => i !== idx));

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          <p className="muted small">{hint}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={add} disabled={skills.length >= max}>
          + Add
        </button>
      </header>

      {skills.length === 0 && <p className="muted small">Nothing added yet.</p>}

      <ul className="skill-rows">
        {skills.map((s, idx) => (
          <li key={idx} className="skill-row">
            <input
              type="text"
              placeholder="e.g. guitar"
              value={s.name}
              maxLength={40}
              onChange={(e) => update(idx, { name: e.target.value })}
              aria-label="Skill name"
            />
            <select
              value={s.level}
              onChange={(e) => update(idx, { level: Number(e.target.value) })}
              aria-label="Skill level"
            >
              {LEVEL_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  L{i + 1} · {label}
                </option>
              ))}
            </select>
            <button type="button" className="btn-icon" onClick={() => remove(idx)} aria-label="Remove skill">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
