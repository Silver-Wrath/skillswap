#!/usr/bin/env node
// End-to-end smoke test for the SkillSwap API.
// Exercises the real user workflows: register -> profile -> match -> propose
// -> accept -> schedule conflict -> message -> complete -> review -> stats.
//
// Usage: node scripts/smoke-test.mjs [baseUrl]   (default http://localhost:5000)

const BASE = process.argv[2] || 'http://localhost:5000';
let passed = 0;
let failed = 0;

async function req(method, path, { token, body, expect = 200 } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, data };
}

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

function futureDate(daysAhead = 3, hour = 15) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  console.log(`Smoke testing SkillSwap API at ${BASE}\n`);

  // 1. Health
  const health = await req('GET', '/api/health');
  check('health endpoint is up', health.status === 200 && health.data.ok === true);

  // 2. Registration + validation
  const stamp = Date.now();
  const alice = await req('POST', '/api/auth/register', {
    body: { name: 'Alice Kumar', email: `alice${stamp}@test.dev`, password: 'password123' },
  });
  check('register Alice', alice.status === 201 && !!alice.data.token);
  const aliceToken = alice.data?.token;

  const dup = await req('POST', '/api/auth/register', {
    body: { name: 'Alice Again', email: `alice${stamp}@test.dev`, password: 'password123' },
  });
  check('duplicate email rejected with 409', dup.status === 409);

  const shortPw = await req('POST', '/api/auth/register', {
    body: { name: 'Bob', email: `bob${stamp}@test.dev`, password: 'short' },
  });
  check('weak password rejected with 400', shortPw.status === 400);

  const bob = await req('POST', '/api/auth/register', {
    body: { name: 'Bob Verma', email: `bob${stamp}@test.dev`, password: 'password123' },
  });
  check('register Bob', bob.status === 201 && !!bob.data.token);
  const bobToken = bob.data?.token;

  // 3. Login
  const badLogin = await req('POST', '/api/auth/login', {
    body: { email: `alice${stamp}@test.dev`, password: 'wrongpass1' },
  });
  check('bad login rejected with 401', badLogin.status === 401);

  const login = await req('POST', '/api/auth/login', {
    body: { email: `alice${stamp}@test.dev`, password: 'password123' },
  });
  check('correct login succeeds', login.status === 200 && !!login.data.token);

  const unauth = await req('GET', '/api/users/me');
  check('protected route rejects missing token with 401', unauth.status === 401);

  // 4. Profiles & skills
  const aliceId = alice.data.user.id;
  const bobId = bob.data.user.id;

  const badSkills = await req('PUT', '/api/users/me', {
    token: aliceToken,
    body: { skillsOffered: [{ name: 'Guitar', level: 99 }] },
  });
  check('invalid skill level rejected with 400', badSkills.status === 400);

  const aliceProfile = await req('PUT', '/api/users/me', {
    token: aliceToken,
    body: {
      bio: 'CS student who loves teaching.',
      location: 'Delhi',
      skillsOffered: [{ name: 'Guitar', level: 4 }, { name: 'Python', level: 5 }],
      skillsWanted: [{ name: 'Spanish', level: 3 }],
    },
  });
  check('Alice updates profile', aliceProfile.status === 200 && aliceProfile.data.user.skillsOffered.length === 2);

  const bobProfile = await req('PUT', '/api/users/me', {
    token: bobToken,
    body: {
      bio: 'Language enthusiast.',
      location: 'Mumbai',
      skillsOffered: [{ name: 'Spanish', level: 4 }],
      skillsWanted: [{ name: 'Guitar', level: 3 }, { name: 'Python', level: 4 }],
    },
  });
  check('Bob updates profile', bobProfile.status === 200 && bobProfile.data.user.skillsWanted.length === 2);

  // 5. Matching engine - Alice should rank Bob as a mutual match
  const matches = await req('GET', '/api/matches', { token: aliceToken });
  const bobMatch = matches.data?.matches?.find((m) => m.user.id === bobId);
  check('matches return ranked results', matches.status === 200 && Array.isArray(matches.data.matches));
  check('Bob is a mutual match for Alice', !!bobMatch && bobMatch.mutual === true,
    bobMatch ? `score=${bobMatch.score}` : 'no bob match');
  if (bobMatch) {
    check('match explains skill pairs (Spanish to Alice)', bobMatch.fromThem.some((s) => s.skill === 'spanish'));
    check('match explains skill pairs (Guitar to Bob)', bobMatch.fromMe.some((s) => s.skill === 'guitar'));
  }

  // 6. Discovery
  const discover = await req('GET', '/api/discover?skill=spanish&kind=offer', { token: aliceToken });
  check('discover filters by skill', discover.status === 200 && discover.data.users.some((u) => u.id === bobId));

  const catalog = await req('GET', '/api/skills', { token: aliceToken });
  check('skill catalogue returns counts', catalog.status === 200 && catalog.data.skills.length > 0);

  // 7. Swap proposal
  const badSwap = await req('POST', '/api/swaps', {
    token: aliceToken,
    body: {
      recipientId: bobId,
      offeredSkillName: 'Unicycle',
      requestedSkillName: 'Spanish',
      slotStart: futureDate(2),
    },
  });
  check('proposing a skill you do not teach is rejected', badSwap.status === 400);

  const swapRes = await req('POST', '/api/swaps', {
    token: aliceToken,
    body: {
      recipientId: bobId,
      offeredSkillName: 'Guitar',
      requestedSkillName: 'Spanish',
      slotStart: futureDate(3, 15),
      durationMinutes: 60,
      note: 'Happy to start from the basics.',
    },
  });
  check('Alice proposes a swap', swapRes.status === 201 && swapRes.data.swap.status === 'pending');
  const swapId = swapRes.data?.swap?.id;
  const created = swapRes.data?.swap;
  check(
    'swap payload exposes participant ids (used by the UI for authz checks)',
    !!created?.requester?.id && !!created?.recipient?.id &&
      created.requester.id === aliceId && created.recipient.id === bobId
  );

  const dupSwap = await req('POST', '/api/swaps', {
    token: aliceToken,
    body: {
      recipientId: bobId,
      offeredSkillName: 'Guitar',
      requestedSkillName: 'Spanish',
      slotStart: futureDate(4, 15),
    },
  });
  check('duplicate pending proposal rejected with 409', dupSwap.status === 409);

  // 8. Authorization on transitions
  const wrongAccept = await req('PATCH', `/api/swaps/${swapId}`, { token: aliceToken, body: { action: 'accept' } });
  check('requester cannot accept their own proposal', wrongAccept.status === 403);

  const accept = await req('PATCH', `/api/swaps/${swapId}`, { token: bobToken, body: { action: 'accept' } });
  check('recipient accepts -> scheduled', accept.status === 200 && accept.data.swap.status === 'scheduled');

  const acceptAgain = await req('PATCH', `/api/swaps/${swapId}`, { token: bobToken, body: { action: 'accept' } });
  check('invalid transition rejected', acceptAgain.status === 403 || acceptAgain.status === 400);

  // 9. Scheduling conflict: a second swap over the same slot must be blocked
  const clashRes = await req('POST', '/api/swaps', {
    token: aliceToken,
    body: {
      recipientId: bobId,
      offeredSkillName: 'Python',
      requestedSkillName: 'Spanish',
      slotStart: futureDate(3, 15),
      durationMinutes: 60,
    },
  });
  check('overlapping booking rejected with 409', clashRes.status === 409,
    `got ${clashRes.status} ${JSON.stringify(clashRes.data)}`);

  // 10. Messaging
  const noText = await req('POST', `/api/swaps/${swapId}/messages`, { token: aliceToken, body: { text: '   ' } });
  check('empty message rejected with 400', noText.status === 400);

  const msg1 = await req('POST', `/api/swaps/${swapId}/messages`, {
    token: aliceToken,
    body: { text: 'Hi Bob, looking forward to our session!' },
  });
  const msg2 = await req('POST', `/api/swaps/${swapId}/messages`, {
    token: bobToken,
    body: { text: 'Great, I will bring the workbook.' },
  });
  check('both participants can message', msg1.status === 201 && msg2.status === 201);

  const thread = await req('GET', `/api/swaps/${swapId}/messages`, { token: aliceToken });
  check('thread returns messages in order', thread.status === 200 && thread.data.messages.length === 2);

  const stranger = await req('POST', '/api/auth/register', {
    body: { name: 'Mallory', email: `mallory${stamp}@test.dev`, password: 'password123' },
  });
  const outsider = await req('GET', `/api/swaps/${swapId}`, { token: stranger.data.token });
  check('non-participant is refused access with 403', outsider.status === 403);

  // 11. Review before completion is refused
  const earlyReview = await req('POST', `/api/swaps/${swapId}/reviews`, {
    token: aliceToken,
    body: { rating: 5 },
  });
  check('review before completion rejected with 409', earlyReview.status === 409);

  // 12. Completion + review
  const complete = await req('PATCH', `/api/swaps/${swapId}`, { token: aliceToken, body: { action: 'complete' } });
  check('either participant can complete', complete.status === 200 && complete.data.swap.status === 'completed');

  const closedMsg = await req('POST', `/api/swaps/${swapId}/messages`, {
    token: aliceToken,
    body: { text: 'one more thing' },
  });
  check('messaging closed after completion with 409', closedMsg.status === 409);

  const review = await req('POST', `/api/swaps/${swapId}/reviews`, {
    token: aliceToken,
    body: { rating: 5, comment: 'Fantastic teacher!' },
  });
  check('review accepted', review.status === 201);

  const doubleReview = await req('POST', `/api/swaps/${swapId}/reviews`, {
    token: aliceToken,
    body: { rating: 1 },
  });
  check('second review rejected with 409', doubleReview.status === 409);

  const bobAfter = await req('GET', '/api/users/' + bobId, { token: aliceToken });
  check("Bob's rating aggregate updated", bobAfter.data?.user?.rating?.count === 1 && bobAfter.data.user.rating.average === 5);

  // 13. Lists and stats
  const past = await req('GET', '/api/swaps?filter=past', { token: aliceToken });
  check('past filter shows the completed swap', past.status === 200 && past.data.swaps.some((s) => s.id === swapId));

  const incoming = await req('GET', '/api/swaps?filter=incoming', { token: bobToken });
  check('incoming list no longer shows accepted swap', incoming.status === 200 && incoming.data.swaps.length === 0);

  const stats = await req('GET', '/api/stats/me', { token: aliceToken });
  check('stats dashboard returns numbers', stats.status === 200 && stats.data.stats.completed === 1);
  check('skill demand analysis present', Array.isArray(stats.data.skillDemand));

  // 14. Cancellation workflow on a fresh swap
  const swap2 = await req('POST', '/api/swaps', {
    token: bobToken,
    body: {
      recipientId: aliceId,
      offeredSkillName: 'Spanish',
      requestedSkillName: 'Python',
      slotStart: futureDate(7, 17),
      durationMinutes: 45,
    },
  });
  check('second swap proposed by Bob', swap2.status === 201);
  const cancel = await req('PATCH', `/api/swaps/${swap2.data.swap.id}`, {
    token: aliceToken,
    body: { action: 'decline', reason: 'Already at that level.' },
  });
  check('recipient can decline with a reason', cancel.status === 200 && cancel.data.swap.status === 'declined');

  // 15. Error handling sanity
  const notFound = await req('GET', '/api/nope');
  check('unknown route returns 404 JSON', notFound.status === 404);
  const badId = await req('GET', '/api/swaps/not-an-id', { token: aliceToken });
  check('malformed id returns 400', badId.status === 400);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
