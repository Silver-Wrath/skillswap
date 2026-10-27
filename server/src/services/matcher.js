// Matching engine.
//
// Scores how compatible two members are for a skill swap:
//   1. Reciprocity   - do we each have something the other wants?
//   2. Level fit     - does their proficiency match the level I asked for?
//   3. Depth         - how many distinct skill pairs line up?
//   4. Reputation    - completed-swap rating of the candidate.
//   5. Scarcity      - how rare my skills are in the community (fewer
//                      people teaching them = more valuable to them).
//
// Everything is deterministic and computed server-side so the ranking shown
// in the UI is explainable: we return the score breakdown with each match.

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function toMap(list) {
  const map = new Map();
  for (const s of list || []) if (!map.has(s.name)) map.set(s.name, s);
  return map;
}

export function scoreMatch(target, candidate, scarcity = new Map()) {
  const targetWants = toMap(target.skillsWanted);
  const targetOffers = toMap(target.skillsOffered);
  const candidateWants = toMap(candidate.skillsWanted);
  const candidateOffers = toMap(candidate.skillsOffered);

  // Skills the candidate can teach the target.
  const fromThem = [];
  for (const [name, offer] of candidateOffers) {
    const want = targetWants.get(name);
    if (want) {
      fromThem.push({
        skill: name,
        theirLevel: offer.level,
        myDesiredLevel: want.level,
        levelFit: 5 - Math.abs(offer.level - want.level),
      });
    }
  }

  // Skills the target can teach the candidate.
  const fromMe = [];
  for (const [name, offer] of targetOffers) {
    const want = candidateWants.get(name);
    if (want) {
      fromMe.push({
        skill: name,
        myLevel: offer.level,
        theirDesiredLevel: want.level,
        levelFit: 5 - Math.abs(offer.level - want.level),
        scarcity: scarcity.get(name) || 0,
      });
    }
  }

  if (fromThem.length === 0 && fromMe.length === 0) return null;

  const mutual = fromThem.length > 0 && fromMe.length > 0;

  const fitScores = [...fromThem, ...fromMe].map((m) => m.levelFit);
  const avgFit = fitScores.reduce((a, b) => a + b, 0) / fitScores.length; // 1..5

  const levelFitScore = ((avgFit - 1) / 4) * 20; // up to 20
  const reciprocityScore = mutual ? 40 : 15;
  const depthScore = clamp(Math.min(fromThem.length, fromMe.length) * 7.5, 0, 15);
  const reputationScore = candidate.rating?.count > 0 ? clamp(candidate.rating.average, 0, 5) * 2 : 0; // up to 10

  const scarcityBonus = fromMe.reduce(
    (acc, m) => acc + clamp((3 - Math.min(m.scarcity, 3)) * 1.67, 0, 5),
    0
  ); // up to 5 per rare skill, capped later

  const score =
    reciprocityScore +
    levelFitScore +
    depthScore +
    reputationScore +
    clamp(scarcityBonus, 0, 10);

  return {
    user: candidate,
    score: Math.round(score * 10) / 10,
    mutual,
    fromThem,
    fromMe,
    breakdown: {
      reciprocity: reciprocityScore,
      levelFit: Math.round(levelFitScore * 10) / 10,
      depth: depthScore,
      reputation: Math.round(reputationScore * 10) / 10,
      scarcity: Math.round(clamp(scarcityBonus, 0, 10) * 10) / 10,
    },
  };
}

// Counts how many members teach each skill - used for the scarcity bonus.
export function buildScarcity(aggregation) {
  const map = new Map();
  for (const row of aggregation) map.set(row._id, row.count);
  return map;
}
