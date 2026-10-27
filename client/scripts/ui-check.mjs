#!/usr/bin/env node
// UI smoke check: drives the real app in headless Chrome over the DevTools
// protocol and walks the core journey — register → set up skills → match →
// propose → message → accept → complete → review — while capturing any
// JavaScript/console errors the page produces.
//
// Requires the dev servers to be running:
//   API   on http://localhost:5000
//   Vite  on http://localhost:5173
//
// Run: npm run check:ui   (node --experimental-websocket ...)

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const UI = process.env.UI_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:5000';
const CDP_PORT = 9333;
const CHROME_PROFILE = '/tmp/skillswap-ui-chrome';

let passed = 0;
let failed = 0;
const pageErrors = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

async function launchChrome() {
  // A fresh profile every run so a stale token cannot skip the register step.
  await rm(CHROME_PROFILE, { recursive: true, force: true });
  const child = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  child.kill();
  throw new Error('Chrome DevTools endpoint never came up');
}

async function getPageTarget() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (page) return page;
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  if (res.ok) return res.json();
  throw new Error('Could not create a page target');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;

    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = nextId;
          nextId += 1;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      resolve({ ws, send });
    };
    ws.onerror = () => reject(new Error('WebSocket connection to Chrome failed'));

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        pageErrors.push(`exception: ${d.exception?.description || d.text}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args
          .map((a) => a.value ?? a.description ?? '')
          .join(' ')
          .trim();
        if (text && !text.includes('favicon')) pageErrors.push(`console.error: ${text}`);
      }
    };
  });
}

async function apiRegister(name, email, password) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'seed register failed');
  return data;
}

async function apiPut(token, path, body) {
  const res = await fetch(`${API}/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'seed update failed');
  return data;
}

async function main() {
  console.log(`UI check against ${UI}\n`);

  const chrome = await launchChrome();
  const target = await getPageTarget();
  const { ws, send } = await connect(target.webSocketDebuggerUrl);

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  };

  const waitFor = async (expression, label, timeout = 12000) => {
    const start = Date.now();
    for (;;) {
      let ok = false;
      try {
        ok = await evaluate(`Boolean(${expression})`);
      } catch {
        ok = false;
      }
      if (ok) return;
      if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label} (${expression})`);
      await sleep(200);
    }
  };

  const goto = async (path) => {
    await send('Page.navigate', { url: path.startsWith('http') ? path : `${UI}${path}` });
    await sleep(500);
  };

  const setReactValue = (selector, value) => {
    const js = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return 'missing';
        const proto =
          el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement :
          el.tagName === 'SELECT' ? window.HTMLSelectElement :
          window.HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
      })()`;
    return evaluate(js);
  };

  // Type into a row of a specific skill card ("Skills you can teach" etc.).
  const setSkillRow = async (cardTitle, rowIndex, field, value) =>
    evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.card')].find((c) =>
          c.querySelector('h3')?.textContent.includes(${JSON.stringify(cardTitle)})
        );
        if (!card) return 'missing-card';
        const row = card.querySelectorAll('.skill-row')[${rowIndex}];
        if (!row) return 'missing-row';
        const el = row.querySelector(${JSON.stringify(field)});
        if (!el) return 'missing-field';
        const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement : window.HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(String(value))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
      })()`);

  const clickInCard = (cardTitle, buttonText) =>
    evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.card')].find((c) =>
          c.querySelector('h3')?.textContent.includes(${JSON.stringify(cardTitle)})
        );
        if (!card) return false;
        const btn = [...card.querySelectorAll('button')].find((b) =>
          b.textContent.includes(${JSON.stringify(buttonText)})
        );
        if (!btn) return false;
        btn.click();
        return true;
      })()`);

  const clickByText = (text) =>
    evaluate(`
      (() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          b.textContent.includes(${JSON.stringify(text)})
        );
        if (!btn) return false;
        btn.click();
        return true;
      })()`);

  await send('Page.enable');
  await send('Runtime.enable');

  // ---- 1. Public pages render -------------------------------------------
  await goto('/');
  await waitFor(`document.body.innerText.includes('Teach what you know.')`, 'landing hero');
  check('landing page renders', true);
  await goto('/login');
  await waitFor(`document.body.innerText.includes('Welcome back')`, 'login page');
  check('login page renders', true);

  // ---- 2. Register through the real form --------------------------------
  const stamp = Date.now();
  const uiEmail = `ui${stamp}@test.dev`;

  // Seed a counterpart with complementary skills via the API first. The name is
  // unique per run so the UI can always identify this exact person even if the
  // dev database contains data from earlier runs.
  const ninaName = `Nina Sharma ${stamp}`;
  const nina = await apiRegister(ninaName, `nina${stamp}@test.dev`, 'password123');
  await apiPut(nina.token, '/users/me', {
    bio: 'Native Spanish speaker learning guitar.',
    location: 'Pune',
    skillsOffered: [{ name: 'spanish', level: 4 }],
    skillsWanted: [{ name: 'guitar', level: 3 }],
  });

  await goto('/register');
  await waitFor(`document.querySelector('input[autocomplete="name"]')`, 'register form');
  await setReactValue('input[autocomplete="name"]', 'UI Tester');
  await setReactValue('input[autocomplete="email"]', uiEmail);
  await setReactValue('input[autocomplete="new-password"]', 'password123');
  const pwdFields = await evaluate(
    `[...document.querySelectorAll('input[autocomplete="new-password"]')].length`
  );
  if (pwdFields >= 2) {
    await evaluate(`
      (() => {
        const inputs = [...document.querySelectorAll('input[autocomplete="new-password"]')];
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inputs[1], 'password123');
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
  }
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`location.pathname === '/profile'`, 'post-register profile page');
  check('registering through the form works', true);

  // ---- 3. Add skills through the profile editor --------------------------
  const addSkill = async (cardTitle, name, level) => {
    const clicked = await clickInCard(cardTitle, 'Add');
    if (!clicked) throw new Error(`Could not find the Add button in "${cardTitle}"`);
    await sleep(200);
    const idx = await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.card')].find((c) =>
          c.querySelector('h3')?.textContent.includes(${JSON.stringify(cardTitle)})
        );
        return card.querySelectorAll('.skill-row').length - 1;
      })()`);
    const typed = await setSkillRow(cardTitle, idx, 'input', name);
    if (typed === 'missing-field' || typed === 'missing-row' || typed === 'missing-card') {
      throw new Error(`Could not type into "${cardTitle}" row (${typed})`);
    }
    const setLevel = await setSkillRow(cardTitle, idx, 'select', level);
    if (setLevel === 'missing-field') throw new Error(`Could not set level in "${cardTitle}"`);
    await sleep(150);
  };

  await waitFor(`document.body.innerText.includes('Skills you can teach')`, 'skill editor');
  await addSkill('Skills you can teach', 'guitar', 5);
  await addSkill('Skills you want to learn', 'spanish', 3);
  await sleep(200);
  await evaluate(`document.querySelector('form button[type="submit"]').click()`);
  await waitFor(`document.body.innerText.includes('Profile saved.')`, 'save confirmation');
  check('adding skills and saving the profile works', true);

  // ---- 4. Matches + propose a swap --------------------------------------
  await goto('/matches');
  await waitFor(`document.querySelector('.match-card')`, 'match cards');
  const ninaIdx = await evaluate(
    `[...document.querySelectorAll('.match-card')].findIndex((c) => c.innerText.includes(${JSON.stringify(ninaName)}))`
  );
  check('seeded counterpart appears in the ranked matches', ninaIdx >= 0, `index=${ninaIdx}`);
  const matchText = await evaluate(
    `document.querySelectorAll('.match-card')[${Math.max(ninaIdx, 0)}].innerText`
  );
  check('match card shows a complementary skill pair', /spanish/i.test(matchText), matchText.slice(0, 80));
  await evaluate(
    `document.querySelectorAll('.match-card')[${Math.max(ninaIdx, 0)}].querySelector('button.btn-primary').click()`
  );
  await waitFor(`document.querySelector('.modal')`, 'propose modal');
  await sleep(250); // let the datetime default settle and buttons enable
  await evaluate(`document.querySelector('.modal form button[type="submit"]').click()`);
  await waitFor(`location.pathname.startsWith('/swaps/')`, 'swap detail page after proposing');
  const swapUrl = await evaluate(`location.pathname`);
  check('proposing a swap lands on the swap detail page', swapUrl.startsWith('/swaps/'));
  const swapId = swapUrl.split('/').pop();
  if (process.env.DEBUG_UI) {
    const uiToken = await evaluate(`localStorage.getItem('skillswap_token')`);
    const dbg = await (await fetch(`${API}/api/swaps/${swapId}`, { headers: { Authorization: `Bearer ${uiToken}` } })).json();
    console.log('DEBUG ninaIdx:', ninaIdx, 'nina:', nina.user?.id, 'name:', ninaName);
    console.log('DEBUG swap:', JSON.stringify({
      req: dbg.swap?.requester?.name, reqId: dbg.swap?.requester?.id,
      rec: dbg.swap?.recipient?.name, recId: dbg.swap?.recipient?.id,
      offered: dbg.swap?.offeredSkill, requested: dbg.swap?.requestedSkill,
    }));
    console.log('DEBUG card text:', matchText.replace(/\n/g, ' | ').slice(0, 300));
  }

  // ---- 5. Messaging ------------------------------------------------------
  await waitFor(`document.querySelector('.msg-form input')`, 'message box');
  await setReactValue('.msg-form input', 'Hi Nina, excited for our first session!');
  await sleep(250); // let React enable the send button
  const clickedSend = await evaluate(`
    (() => {
      const btn = document.querySelector('.msg-form button');
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`);
  check('send button becomes enabled once a message is typed', clickedSend);
  await waitFor(
    `document.querySelector('.bubble-mine') && document.querySelector('.bubble-mine').innerText.includes('first session')`,
    'sent message bubble'
  );
  check('sending a message in the thread works', true);

  // ---- 6. Counterpart accepts, then we complete + review ----------------
  const acceptRes = await fetch(`${API}/api/swaps/${swapId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nina.token}` },
    body: JSON.stringify({ action: 'accept' }),
  });
  const acceptBody = await acceptRes.text();
  check('counterpart can accept the proposal', acceptRes.ok, `status=${acceptRes.status} body=${acceptBody.slice(0, 200)}`);

  await goto(`/swaps/${swapId}`);
  await waitFor(`document.querySelector('.badge-scheduled')`, 'scheduled badge');
  check('swap detail shows the scheduled state', true);

  await evaluate(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Mark as completed')).click()`
  );
  await waitFor(`document.querySelector('.badge-completed')`, 'completed badge');
  check('marking the swap completed works from the UI', true);

  await waitFor(`document.querySelector('.review-form')`, 'review form');
  await sleep(250);
  await evaluate(`document.querySelector('.review-form button[type="submit"]').click()`);
  await waitFor(
    `document.body.innerText.includes('Thanks for reviewing this swap.')`,
    'review confirmation'
  );
  check('submitting a review works', true);

  // ---- 7. Dashboard, swaps list, discover -------------------------------
  await goto('/dashboard');
  await waitFor(`document.body.innerText.includes('Hi, UI')`, 'dashboard greeting');
  const dashText = await evaluate(`document.body.innerText`);
  check('dashboard shows the completed swap stat', dashText.includes('Completed swaps'));
  check('dashboard renders the demand analysis', dashText.includes('Demand for your skills'));

  await goto('/swaps?tab=past');
  await waitFor(`document.querySelector('.swap-card')`, 'past swaps list');
  check('past swaps list renders history', true);

  await goto('/discover');
  await waitFor(
    `document.querySelector('.person-card') || document.body.innerText.includes('No members found')`,
    'discover results'
  );
  check('discover page returns results', await evaluate(`Boolean(document.querySelector('.person-card'))`));

  await goto('/profile');
  await waitFor(`document.querySelectorAll('.skill-row').length >= 2`, 'persisted skill rows');
  const savedSkills = await evaluate(
    `[...document.querySelectorAll('.skill-row input')].map((i) => i.value).join(',')`
  );
  check('skills persist after reload', savedSkills.includes('guitar') && savedSkills.includes('spanish'), savedSkills);

  // ---- 8. Page errors ----------------------------------------------------
  const uniqueErrors = [...new Set(pageErrors)];
  check('no JavaScript or console errors on any page', uniqueErrors.length === 0, uniqueErrors.join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);

  ws.close();
  chrome.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('UI check crashed:', err.message);
  process.exit(1);
});
