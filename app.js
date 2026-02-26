/* ══════════════════════════════════════════════════
   EPISTEMIC ODDS — PHIL 4040 Prediction Market
   app.js  |  requires firebase-config.js to be
   loaded first (defines FIREBASE_CONFIG, CLASS_CODE,
   INSTRUCTOR_CODE)
══════════════════════════════════════════════════ */

'use strict';

// ── Global state ──────────────────────────────────
let db;
let currentUser = null;
let allBets = [];
let currentFilter = 'all';
let calibrationChart = null;

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  // Wire up login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Wire up navigation
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.page);
      closeMobileNav();
    });
  });

  // Mobile nav toggle
  const navToggle = document.getElementById('nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  navToggle.addEventListener('click', () => mobileNav.classList.toggle('hidden'));

  // Modal close
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('bet-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Bet filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderBets(allBets);
    });
  });

  // Propose form
  document.getElementById('propose-form').addEventListener('submit', handlePropose);
  document.getElementById('p-type').addEventListener('change', toggleProposalTypeFields);

  // Instructor forms
  document.getElementById('create-bet-form').addEventListener('submit', handleCreateBet);
  document.getElementById('cb-type').addEventListener('change', toggleCreateTypeFields);

  // Check for existing session
  const session = loadSession();
  if (session) {
    currentUser = session;
    showApp();
  }
});

// ══════════════════════════════════════════════════
// SESSION MANAGEMENT
// ══════════════════════════════════════════════════
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem('epistemic_odds_session'));
  } catch {
    return null;
  }
}

function saveSession(user) {
  localStorage.setItem('epistemic_odds_session', JSON.stringify(user));
}

async function handleLogin(e) {
  e.preventDefault();
  const name = document.getElementById('login-name').value.trim();
  const code = document.getElementById('login-code').value.trim();

  if (!name) { showToast('Please enter your name.', 'error'); return; }
  if (code !== CLASS_CODE && code !== INSTRUCTOR_CODE) {
    showToast('Invalid class code. Ask your instructor.', 'error');
    return;
  }

  const isInstructor = (code === INSTRUCTOR_CODE);

  // Generate a stable user ID: name slug + class code + a random suffix stored in localStorage
  let userId = localStorage.getItem('epistemic_odds_uid');
  if (!userId) {
    userId = 'u_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('epistemic_odds_uid', userId);
  }

  currentUser = { id: userId, displayName: name, isInstructor, classCode: CLASS_CODE };

  // Upsert user doc in Firestore (merge keeps totals intact across logins)
  await db.collection('users').doc(userId).set(
    { displayName: name, isInstructor, classCode: CLASS_CODE,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  saveSession(currentUser);
  showApp();
}

function logout() {
  localStorage.removeItem('epistemic_odds_session');
  currentUser = null;
  location.reload();
}

// ══════════════════════════════════════════════════
// SHOW / HIDE APP
// ══════════════════════════════════════════════════
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('header-username').textContent = currentUser.displayName;

  if (currentUser.isInstructor) {
    document.querySelectorAll('.instructor-only').forEach(el => el.classList.remove('hidden'));
  }

  // Show live credits badge
  watchUserCredits();

  navigate('home');
}

function watchUserCredits() {
  db.collection('users').doc(currentUser.id)
    .onSnapshot(snap => {
      if (snap.exists) {
        const pts = snap.data().totalPoints || 0;
        document.getElementById('user-credits-badge').textContent =
          pts.toFixed(1) + ' pts';
      }
    });
}

// ══════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════
const PAGES = ['home', 'bets', 'propose', 'my-bets', 'leaderboard', 'instructor'];

function navigate(page) {
  PAGES.forEach(p => {
    document.getElementById('page-' + p).classList.add('hidden');
  });
  document.getElementById('page-' + page).classList.remove('hidden');

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  switch (page) {
    case 'home':        loadHome(); break;
    case 'bets':        loadBetsPage(); break;
    case 'my-bets':     loadMyBets(); break;
    case 'leaderboard': loadLeaderboard(); break;
    case 'instructor':  if (currentUser.isInstructor) loadInstructor(); break;
  }
}

function closeMobileNav() {
  document.getElementById('mobile-nav').classList.add('hidden');
}

// ══════════════════════════════════════════════════
// HOME PAGE
// ══════════════════════════════════════════════════
async function loadHome() {
  try {
    // Recent open bets — no orderBy to avoid composite index requirement; sort client-side
    const betSnap = await db.collection('bets')
      .where('classCode', '==', CLASS_CODE)
      .where('status', '==', 'open')
      .get();

    const el = document.getElementById('home-bets-list');
    if (betSnap.empty) {
      el.innerHTML = '<div class="empty-state">No open bets yet.</div>';
    } else {
      const bets = betSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt))
        .slice(0, 5);
      el.innerHTML = bets.map(b => `<div class="mini-bet">
        <span class="mini-bet-title">${esc(b.title)}</span>
        <button class="btn btn-sm btn-outline" onclick="openBetModal('${b.id}')">Predict</button>
      </div>`).join('');
    }

    // Mini leaderboard
    const userSnap = await db.collection('users')
      .where('classCode', '==', CLASS_CODE)
      .get();

    const lb = document.getElementById('home-leaderboard');
    if (userSnap.empty) {
      lb.innerHTML = '<div class="empty-state">No predictions resolved yet.</div>';
    } else {
      const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
      const users = userSnap.docs
        .map(d => d.data())
        .filter(u => (u.totalPoints || 0) > 0)
        .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        .slice(0, 5);
      if (users.length === 0) {
        lb.innerHTML = '<div class="empty-state">No predictions resolved yet.</div>';
      } else {
        lb.innerHTML = users.map((u, i) => `<div class="mini-leaderboard-row">
          <span class="mini-rank">${medals[i]}</span>
          <span class="mini-name">${esc(u.displayName)}</span>
          <span class="mini-pts">${(u.totalPoints || 0).toFixed(1)} pts</span>
        </div>`).join('');
      }
    }
  } catch (err) {
    console.error('loadHome error:', err);
  }
}

// ══════════════════════════════════════════════════
// BETS PAGE
// ══════════════════════════════════════════════════
async function loadBetsPage() {
  try {
    const snap = await db.collection('bets')
      .where('classCode', '==', CLASS_CODE)
      .where('status', 'in', ['open', 'resolved', 'closed'])
      .get();

    allBets = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
    renderBets(allBets);
  } catch (err) {
    console.error('loadBetsPage error:', err);
    document.getElementById('bets-list').innerHTML =
      `<div class="empty-state">Error loading bets: ${esc(err.message)}</div>`;
  }
}

function renderBets(bets) {
  const el = document.getElementById('bets-list');
  const filtered = currentFilter === 'all'
    ? bets
    : bets.filter(b => b.status === currentFilter);

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">No bets match this filter.</div>';
    return;
  }
  el.innerHTML = filtered.map(b => betCardHTML(b)).join('');
}

function betCardHTML(bet) {
  const statusBadge = `<span class="badge badge-${bet.status}">${capitalise(bet.status)}</span>`;
  const officialBadge = bet.isOfficial ? '<span class="badge badge-official">Official</span>' : '';
  const catBadge = `<span class="badge badge-category">${capitalise(bet.category || 'other')}</span>`;
  const typeBadge = `<span class="badge badge-type">${capitalise(bet.type)}</span>`;
  const date = bet.resolutionDate ? formatDate(bet.resolutionDate) : '—';
  const count = bet.predictionCount || 0;
  const desc = bet.description ? `<div class="bet-description">${esc(bet.description)}</div>` : '';
  const today = new Date().toISOString().slice(0, 10);
  const deadlinePassed = !!(bet.predictionDeadline && today > bet.predictionDeadline);
  const canPredict = bet.status === 'open' && !deadlinePassed;
  const deadlineStr = bet.predictionDeadline
    ? ` &nbsp;·&nbsp; ⏰ Predict by: ${formatDate(bet.predictionDeadline)}${deadlinePassed ? ' <span class="badge badge-deadline-passed">Closed</span>' : ''}`
    : '';

  return `<div class="bet-card ${bet.status}" data-id="${bet.id}">
    <div class="bet-card-header">
      <div class="bet-title">${esc(bet.title)}</div>
    </div>
    <div class="bet-meta">
      ${officialBadge} ${statusBadge} ${catBadge} ${typeBadge}
    </div>
    ${desc}
    <div class="bet-card-footer">
      <span>📅 Resolves: ${date}${deadlineStr} &nbsp;·&nbsp; 👥 ${count} prediction${count !== 1 ? 's' : ''}</span>
      <div class="bet-card-actions">
        <button class="btn btn-sm btn-outline" onclick="openBetModal('${bet.id}')">
          ${canPredict ? 'Predict →' : 'View'}
        </button>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════
// BET DETAIL MODAL
// ══════════════════════════════════════════════════
async function openBetModal(betId) {
  const betDoc = await db.collection('bets').doc(betId).get();
  if (!betDoc.exists) { showToast('Bet not found.', 'error'); return; }
  const bet = { id: betDoc.id, ...betDoc.data() };

  // Check if prediction deadline has passed
  const today = new Date().toISOString().slice(0, 10);
  bet.deadlinePassed = !!(bet.predictionDeadline && today > bet.predictionDeadline);

  // Check if user already has a prediction
  const predId = betId + '_' + currentUser.id;
  const predDoc = await db.collection('predictions').doc(predId).get();
  const existingPred = predDoc.exists ? predDoc.data() : null;

  document.getElementById('modal-body').innerHTML = betModalHTML(bet, existingPred);
  document.getElementById('bet-modal').classList.remove('hidden');

  // Wire up the prediction controls based on type
  if (bet.status === 'open' && !bet.deadlinePassed) {
    if (bet.type === 'binary') wireBinarySlider(bet, existingPred);
    else if (bet.type === 'categorical') wireCategoricalInputs(bet, existingPred);
    // Numeric uses a plain number input — just wire submit
    const form = document.getElementById('pred-form');
    if (form) form.addEventListener('submit', e => handlePredictionSubmit(e, bet, predId));
  }
}

function betModalHTML(bet, existing) {
  const date     = bet.resolutionDate ? formatDate(bet.resolutionDate) : '—';
  const deadline = bet.predictionDeadline ? formatDate(bet.predictionDeadline) : null;
  const count    = bet.predictionCount || 0;
  const badges = [
    bet.isOfficial ? '<span class="badge badge-official">Official</span>' : '',
    `<span class="badge badge-${bet.status}">${capitalise(bet.status)}</span>`,
    `<span class="badge badge-category">${capitalise(bet.category || 'other')}</span>`,
    `<span class="badge badge-type">${capitalise(bet.type)}</span>`,
  ].join(' ');

  let resolvedBanner = '';
  if (bet.status === 'resolved') {
    resolvedBanner = `<div class="outcome-banner">
      ✅ Resolved: <strong>${formatOutcome(bet.outcome, bet)}</strong>
    </div>`;
  }

  let predArea = '';
  if (bet.status === 'open' && !bet.deadlinePassed) {
    predArea = predictionAreaHTML(bet, existing);
  } else if (bet.status === 'open' && bet.deadlinePassed) {
    const closedNote = existing
      ? `You predicted: <strong>${formatPredValue(existing.value, bet)}</strong>. `
      : '';
    predArea = `<p class="text-muted text-sm" style="margin-top:.75rem">
      ⏰ Prediction deadline has passed (${deadline}).
      ${closedNote}Scores will be posted when the bet resolves.</p>`;
  } else if (existing) {
    const scoreStr = existing.score != null
      ? `Score: ${existing.score.toFixed(3)} → ${(existing.score * 10).toFixed(1)} pts`
      : 'Pending resolution';
    predArea = `<div class="prediction-area">
      <h4>Your Prediction</h4>
      <p><strong>${formatPredValue(existing.value, bet)}</strong></p>
      <p class="text-muted text-sm">${scoreStr}</p>
    </div>`;
  } else if (bet.status !== 'open') {
    predArea = `<p class="text-muted text-sm" style="margin-top:.75rem">Predictions closed.</p>`;
  }

  return `
    <div class="bet-meta" style="margin-bottom:.75rem">${badges}</div>
    <h2 style="margin-bottom:.5rem">${esc(bet.title)}</h2>
    ${bet.description ? `<p>${esc(bet.description)}</p>` : ''}
    <hr class="divider">
    <p><strong>Resolution criteria:</strong> ${esc(bet.resolutionCriteria || '—')}</p>
    <p class="text-muted text-sm">📅 Resolves: ${date}${deadline ? ` &nbsp;·&nbsp; ⏰ Predict by: ${deadline}` : ''} &nbsp;·&nbsp; 👥 ${count} prediction${count !== 1 ? 's' : ''} &nbsp;·&nbsp; By: ${esc(bet.createdByName || '—')}</p>
    ${resolvedBanner}
    ${predArea}
  `;
}

function predictionAreaHTML(bet, existing) {
  const prevNote = existing
    ? `<div class="prev-prediction-note">
        You already predicted: <strong>${formatPredValue(existing.value, bet)}</strong>.
        Submitting again will update your prediction.
      </div>`
    : '';

  let inputHTML = '';

  if (bet.type === 'binary') {
    const initP = existing ? existing.value : 0.5;
    const pct = Math.round(initP * 100);
    const scoreYes = (1 - Math.pow(initP - 1, 2)).toFixed(3);
    const scoreNo  = (1 - Math.pow(initP - 0, 2)).toFixed(3);
    inputHTML = `
      <div class="prob-display" id="prob-display">${pct}%</div>
      <div class="prob-slider-wrap">
        <label><span>0% (definitely NO)</span><span>100% (definitely YES)</span></label>
        <input type="range" id="prob-slider" min="0" max="100" value="${pct}" />
      </div>
      <div class="score-preview">
        <div class="score-preview-box">
          <div class="sp-label">Score if YES</div>
          <div class="sp-val good" id="score-yes">${scoreYes}</div>
        </div>
        <div class="score-preview-box">
          <div class="sp-label">Score if NO</div>
          <div class="sp-val bad" id="score-no">${scoreNo}</div>
        </div>
      </div>
      <p class="text-muted text-sm">
        Brier rule: Score = 1 − (p − o)². Honest reporting maximises your expected score
        (under EUT). Does loss aversion tempt you toward 50%?
      </p>
      <input type="hidden" id="pred-value" value="${initP}" />
    `;
  } else if (bet.type === 'numeric') {
    const initV = existing ? existing.value : '';
    const tol   = bet.numericTolerance || 1;
    inputHTML = `
      <div class="form-group mt-1">
        <label>Your prediction (numeric)</label>
        <input id="pred-numeric" type="number" step="any"
          min="${bet.numericMin ?? ''}" max="${bet.numericMax ?? ''}"
          value="${initV}" placeholder="Enter a number" required />
      </div>
      <p class="text-muted text-sm">
        Score = max(0, 1 − |your value − true value| / ${tol}).
        ${bet.numericMin != null ? `Plausible range: ${bet.numericMin} – ${bet.numericMax}.` : ''}
      </p>
    `;
  } else if (bet.type === 'categorical') {
    const options = bet.categories || [];
    const existing_vals = existing && typeof existing.value === 'object' ? existing.value : {};
    inputHTML = `
      <p class="text-muted text-sm">Assign probabilities to each option — they should sum to 100%.</p>
      <div id="cat-inputs">
        ${options.map(opt => {
          const v = existing_vals[opt] != null ? Math.round(existing_vals[opt] * 100) : Math.round(100 / options.length);
          return `<div class="form-group">
            <label>${esc(opt)}</label>
            <input type="number" class="cat-input" data-opt="${esc(opt)}"
              min="0" max="100" step="1" value="${v}" />
          </div>`;
        }).join('')}
      </div>
      <div id="cat-sum-warning" style="color:var(--bad);font-size:.85rem;margin-top:.25rem"></div>
    `;
  }

  return `<div class="prediction-area">
    <h4>Your Prediction</h4>
    ${prevNote}
    <form id="pred-form">
      ${inputHTML}
      <button type="submit" class="btn btn-primary mt-1">Submit Prediction</button>
    </form>
  </div>`;
}

function wireBinarySlider(bet, existing) {
  const slider    = document.getElementById('prob-slider');
  const display   = document.getElementById('prob-display');
  const scoreYes  = document.getElementById('score-yes');
  const scoreNo   = document.getElementById('score-no');
  const hiddenVal = document.getElementById('pred-value');

  slider.addEventListener('input', () => {
    const p = slider.value / 100;
    display.textContent = slider.value + '%';
    hiddenVal.value = p;
    scoreYes.textContent = (1 - Math.pow(p - 1, 2)).toFixed(3);
    scoreNo.textContent  = (1 - Math.pow(p - 0, 2)).toFixed(3);
  });
}

function wireCategoricalInputs(bet, existing) {
  const warning = document.getElementById('cat-sum-warning');
  document.getElementById('cat-inputs').addEventListener('input', () => {
    const inputs = [...document.querySelectorAll('.cat-input')];
    const sum = inputs.reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    warning.textContent = Math.abs(sum - 100) > 0.5 ? `Sum = ${sum.toFixed(0)}% (must equal 100%)` : '';
  });
}

async function handlePredictionSubmit(e, bet, predId) {
  e.preventDefault();
  let value;

  if (bet.type === 'binary') {
    value = parseFloat(document.getElementById('pred-value').value);
    if (isNaN(value) || value < 0 || value > 1) {
      showToast('Invalid probability.', 'error'); return;
    }
  } else if (bet.type === 'numeric') {
    value = parseFloat(document.getElementById('pred-numeric').value);
    if (isNaN(value)) { showToast('Enter a valid number.', 'error'); return; }
  } else if (bet.type === 'categorical') {
    const inputs = [...document.querySelectorAll('.cat-input')];
    const sum = inputs.reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    if (Math.abs(sum - 100) > 0.5) { showToast('Probabilities must sum to 100%.', 'error'); return; }
    value = {};
    inputs.forEach(i => { value[i.dataset.opt] = parseFloat(i.value) / 100; });
  }

  const isUpdate = (await db.collection('predictions').doc(predId).get()).exists;

  await db.collection('predictions').doc(predId).set({
    betId: bet.id,
    userId: currentUser.id,
    displayName: currentUser.displayName,
    classCode: CLASS_CODE,
    value,
    score: null,
    points: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (!isUpdate) {
    await db.collection('bets').doc(bet.id).update({
      predictionCount: firebase.firestore.FieldValue.increment(1),
    });
  }

  showToast(isUpdate ? 'Prediction updated!' : 'Prediction submitted!', 'success');
  closeModal();
  // Refresh page if on bets page
  if (!document.getElementById('page-bets').classList.contains('hidden')) loadBetsPage();
}

function closeModal() {
  document.getElementById('bet-modal').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

// ══════════════════════════════════════════════════
// PROPOSE A BET
// ══════════════════════════════════════════════════
function toggleProposalTypeFields() {
  const type = document.getElementById('p-type').value;
  document.getElementById('numeric-fields').classList.toggle('hidden', type !== 'numeric');
  document.getElementById('categorical-fields').classList.toggle('hidden', type !== 'categorical');
}

async function handlePropose(e) {
  e.preventDefault();
  const type = document.getElementById('p-type').value;

  const bet = {
    title:              document.getElementById('p-title').value.trim(),
    description:        document.getElementById('p-description').value.trim(),
    resolutionCriteria: document.getElementById('p-resolution').value.trim(),
    type,
    category:           document.getElementById('p-category').value,
    predictionDeadline: document.getElementById('p-deadline').value || null,
    resolutionDate:     document.getElementById('p-date').value,
    status:             'proposed',
    isOfficial:         false,
    classCode:          CLASS_CODE,
    createdBy:          currentUser.id,
    createdByName:      currentUser.displayName,
    predictionCount:    0,
    createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (type === 'numeric') {
    bet.numericMin       = parseFloat(document.getElementById('p-num-min').value) || null;
    bet.numericMax       = parseFloat(document.getElementById('p-num-max').value) || null;
    bet.numericTolerance = parseFloat(document.getElementById('p-num-tol').value) || null;
  }
  if (type === 'categorical') {
    const raw = document.getElementById('p-cat-options').value;
    bet.categories = raw.split('\n').map(s => s.trim()).filter(Boolean);
    if (bet.categories.length < 2) {
      showToast('Enter at least two options.', 'error'); return;
    }
  }

  try {
    await db.collection('bets').add(bet);
    showToast('Proposal submitted! The instructor will review it.', 'success');
    document.getElementById('propose-form').reset();
    document.getElementById('numeric-fields').classList.add('hidden');
    document.getElementById('categorical-fields').classList.add('hidden');
  } catch (err) {
    console.error('handlePropose error:', err);
    showToast('Error submitting proposal: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// MY PREDICTIONS
// ══════════════════════════════════════════════════
async function loadMyBets() {
  const snap = await db.collection('predictions')
    .where('userId', '==', currentUser.id)
    .get();

  if (snap.empty) {
    document.getElementById('my-stats').innerHTML = '';
    document.getElementById('my-bets-list').innerHTML =
      '<div class="empty-state">You have not made any predictions yet.<br>Head to "Browse Bets" to get started.</div>';
    return;
  }

  const preds = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));

  // Fetch bet details
  const betIds = [...new Set(preds.map(p => p.betId))];
  const betDocs = await Promise.all(betIds.map(id => db.collection('bets').doc(id).get()));
  const bets = {};
  betDocs.forEach(d => { if (d.exists) bets[d.id] = { id: d.id, ...d.data() }; });

  // Stats
  const resolved  = preds.filter(p => p.score != null);
  const totalPts  = resolved.reduce((s, p) => s + (p.points || 0), 0);
  const avgScore  = resolved.length
    ? resolved.reduce((s, p) => s + (p.score || 0), 0) / resolved.length
    : null;

  document.getElementById('my-stats').innerHTML = `
    <div class="stat-pill"><div class="sp-num">${preds.length}</div><div class="sp-lbl">Predictions made</div></div>
    <div class="stat-pill"><div class="sp-num">${resolved.length}</div><div class="sp-lbl">Resolved</div></div>
    <div class="stat-pill"><div class="sp-num">${totalPts.toFixed(1)}</div><div class="sp-lbl">Total points</div></div>
    ${avgScore != null
      ? `<div class="stat-pill"><div class="sp-num">${avgScore.toFixed(3)}</div><div class="sp-lbl">Avg Brier score</div></div>`
      : ''}
  `;

  document.getElementById('my-bets-list').innerHTML = preds.map(p => {
    const bet = bets[p.betId];
    const betTitle = bet ? bet.title : '(bet deleted)';
    const predStr  = bet ? formatPredValue(p.value, bet) : '—';
    const date     = p.createdAt ? formatDate(p.createdAt) : '—';

    let scoreHTML;
    if (p.score != null) {
      const cls = p.score >= 0.75 ? 'good' : p.score >= 0.5 ? '' : 'bad';
      scoreHTML = `<div class="my-bet-score">
        <div class="score-val ${cls}">${p.score.toFixed(3)}</div>
        <div class="text-muted text-sm">${(p.points || 0).toFixed(1)} pts</div>
      </div>`;
    } else {
      scoreHTML = `<div class="my-bet-score">
        <div class="score-val pending">Pending</div>
      </div>`;
    }

    return `<div class="my-bet-row">
      <div>
        <div class="my-bet-title">${esc(betTitle)}</div>
        <div class="my-bet-meta">Your prediction: <strong>${esc(predStr)}</strong> · ${date}</div>
      </div>
      ${scoreHTML}
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════════════
async function loadLeaderboard() {
  const snap = await db.collection('users')
    .where('classCode', '==', CLASS_CODE)
    .get();

  const users = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
    .slice(0, 50)
    .map((u, i) => ({ rank: i + 1, ...u }));
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const rows = users.map(u => {
    const pts   = (u.totalPoints || 0).toFixed(1);
    const n     = u.resolvedCount || 0;
    const avg   = n > 0 ? ((u.totalScore || 0) / n).toFixed(3) : '—';
    const isMe  = (u.id === currentUser.id);
    const medal = medals[u.rank] || u.rank + '.';
    return `<tr class="${isMe ? 'me' : ''}">
      <td><span class="rank-medal">${medal}</span></td>
      <td>${esc(u.displayName)}${isMe ? ' <em>(you)</em>' : ''}</td>
      <td class="pts-col">${pts}</td>
      <td>${avg}</td>
      <td>${n}</td>
    </tr>`;
  }).join('');

  document.getElementById('leaderboard-table-wrap').innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Total pts</th>
          <th>Avg Brier score</th>
          <th>Resolved bets</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No resolved predictions yet.</td></tr>'}</tbody>
    </table>`;

  await drawCalibrationChart();
}

async function drawCalibrationChart() {
  // Fetch all resolved binary predictions for this class
  const snap = await db.collection('predictions')
    .where('classCode', '==', CLASS_CODE)
    .get();

  // Match with resolved binary bets
  const betSnap = await db.collection('bets')
    .where('classCode', '==', CLASS_CODE)
    .where('type', '==', 'binary')
    .where('status', '==', 'resolved')
    .get();

  const resolvedBetOutcomes = {};
  betSnap.docs.forEach(d => { resolvedBetOutcomes[d.id] = d.data().outcome; });

  // Bin predictions into 10 buckets: [0,0.1), [0.1,0.2), …, [0.9,1.0]
  const buckets = Array.from({ length: 10 }, () => ({ sum: 0, count: 0 }));

  snap.docs.forEach(d => {
    const p = d.data();
    if (typeof p.value !== 'number') return;
    const outcome = resolvedBetOutcomes[p.betId];
    if (outcome == null) return;
    const bucketIdx = Math.min(9, Math.floor(p.value * 10));
    buckets[bucketIdx].sum += outcome;
    buckets[bucketIdx].count++;
  });

  const labels   = ['0–10%', '10–20%', '20–30%', '30–40%', '40–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%'];
  const midpoints = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const actuals  = buckets.map(b => b.count > 0 ? +(b.sum / b.count).toFixed(3) : null);

  if (calibrationChart) calibrationChart.destroy();

  const ctx = document.getElementById('calibration-chart').getContext('2d');
  calibrationChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Perfect calibration',
          data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          type: 'line',
          borderColor: '#aaa',
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
        },
        {
          label: 'Class predictions',
          data: midpoints.map((x, i) => actuals[i] != null ? { x, y: actuals[i], n: buckets[i].count } : null).filter(Boolean),
          backgroundColor: '#1b2a6b',
          borderColor: '#1b2a6b',
          pointRadius: 7,
          pointHoverRadius: 10,
        },
      ],
    },
    options: {
      scales: {
        x: {
          min: 0, max: 1,
          title: { display: true, text: 'Predicted probability' },
          ticks: { callback: v => (v * 100) + '%' },
        },
        y: {
          min: 0, max: 1,
          title: { display: true, text: 'Actual frequency' },
          ticks: { callback: v => (v * 100) + '%' },
        },
      },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              if (d.n != null) return `Actual: ${(d.y * 100).toFixed(1)}% (n=${d.n})`;
              return '';
            },
          },
        },
        title: { display: true, text: 'Class Calibration Chart' },
      },
    },
  });
}

// ══════════════════════════════════════════════════
// INSTRUCTOR PANEL
// ══════════════════════════════════════════════════
async function loadInstructor() {
  await Promise.all([
    loadPendingProposals(),
    loadInstructorOpenBets(),
    loadResolvedBets(),
  ]);
}

async function loadPendingProposals() {
  const el = document.getElementById('pending-proposals');
  try {
    const snap = await db.collection('bets')
      .where('classCode', '==', CLASS_CODE)
      .where('status', '==', 'proposed')
      .get();

    if (snap.empty) {
      el.innerHTML = '<p class="text-muted">No pending proposals.</p>';
      return;
    }

    const proposals = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));

    el.innerHTML = proposals.map(b => `<div class="proposal-card">
      <h4>${esc(b.title)}</h4>
      <p class="text-muted text-sm">By ${esc(b.createdByName || '—')} · ${capitalise(b.type)} · ${capitalise(b.category || '')}</p>
      ${b.description ? `<p class="text-sm">${esc(b.description)}</p>` : ''}
      <p class="text-sm"><strong>Resolution:</strong> ${esc(b.resolutionCriteria || '—')}</p>
      <div class="proposal-actions">
        <button class="btn btn-success btn-sm" onclick="approveProposal('${b.id}')">✓ Approve</button>
        <button class="btn btn-danger btn-sm"  onclick="rejectProposal('${b.id}')">✗ Reject</button>
      </div>
    </div>`).join('');
  } catch (err) {
    console.error('loadPendingProposals error:', err);
    el.innerHTML = `<p style="color:var(--bad)">Error loading proposals: ${esc(err.message)}</p>`;
  }
}

async function approveProposal(betId) {
  await db.collection('bets').doc(betId).update({ status: 'open', isOfficial: true });

  // Award bonus points to proposer
  const betDoc = await db.collection('bets').doc(betId).get();
  const proposerId = betDoc.data().createdBy;
  if (proposerId) {
    await db.collection('users').doc(proposerId).set(
      { totalPoints: firebase.firestore.FieldValue.increment(2) },
      { merge: true }
    );
  }

  showToast('Bet approved (+2 pts to proposer)!', 'success');
  loadInstructor();
}

async function rejectProposal(betId) {
  await db.collection('bets').doc(betId).update({ status: 'closed' });
  showToast('Proposal rejected.', 'success');
  loadInstructor();
}

async function loadInstructorOpenBets() {
  const el = document.getElementById('instructor-open-bets');
  try {
    const snap = await db.collection('bets')
      .where('classCode', '==', CLASS_CODE)
      .where('status', '==', 'open')
      .get();

    if (snap.empty) {
      el.innerHTML = '<p class="text-muted">No open bets to resolve.</p>';
      return;
    }

    const openBets = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));

    el.innerHTML = openBets.map(b => {
    let outcomeInput = '';
    if (b.type === 'binary') {
      outcomeInput = `<select class="resolve-outcome" data-id="${b.id}" data-type="binary">
        <option value="">— select —</option>
        <option value="yes">YES</option>
        <option value="no">NO</option>
      </select>`;
    } else if (b.type === 'numeric') {
      outcomeInput = `<input type="number" step="any" class="resolve-outcome" data-id="${b.id}" data-type="numeric" placeholder="True value" />`;
    } else if (b.type === 'categorical') {
      const opts = (b.categories || []).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      outcomeInput = `<select class="resolve-outcome" data-id="${b.id}" data-type="categorical">
        <option value="">— select —</option>${opts}
      </select>`;
    }

      return `<div class="resolve-row">
        <div>
          <span class="resolve-title">${esc(b.title)} <span class="text-muted text-sm">(${b.predictionCount || 0} preds)</span></span>
          <div class="deadline-edit">
            <label class="text-muted text-sm">⏰ Predict by:</label>
            <input type="date" class="deadline-input" data-id="${b.id}" value="${b.predictionDeadline || ''}" />
            <button class="btn btn-sm btn-outline" onclick="updateDeadline('${b.id}')">Save</button>
          </div>
        </div>
        <div class="resolve-controls">
          ${outcomeInput}
          <button class="btn btn-sm btn-primary" onclick="resolveBet('${b.id}')">Resolve</button>
          <button class="btn btn-sm btn-outline" onclick="archiveBet('${b.id}')" title="Remove from site without scoring">Archive</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('loadInstructorOpenBets error:', err);
    el.innerHTML = `<p style="color:var(--bad)">Error loading bets: ${esc(err.message)}</p>`;
  }
}

async function updateDeadline(betId) {
  const input = document.querySelector(`.deadline-input[data-id="${betId}"]`);
  const deadline = input.value || null;
  try {
    await db.collection('bets').doc(betId).update({ predictionDeadline: deadline });
    showToast(deadline ? `Deadline set to ${formatDate(deadline)}.` : 'Deadline cleared.', 'success');
  } catch (err) {
    showToast('Error saving deadline: ' + err.message, 'error');
  }
}

async function loadResolvedBets() {
  const el = document.getElementById('instructor-resolved-bets');
  try {
    const snap = await db.collection('bets')
      .where('classCode', '==', CLASS_CODE)
      .where('status', '==', 'resolved')
      .get();

    if (snap.empty) {
      el.innerHTML = '<p class="text-muted">No resolved bets.</p>';
      return;
    }

    const resolved = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));

    el.innerHTML = resolved.map(b => `<div class="resolve-row">
      <div>
        <span class="resolve-title">${esc(b.title)}</span>
        <div class="text-muted text-sm">
          Outcome: <strong>${formatOutcome(b.outcome, b)}</strong>
          &nbsp;·&nbsp; ${b.predictionCount || 0} prediction(s)
        </div>
      </div>
      <div class="resolve-controls">
        <button class="btn btn-sm btn-danger" onclick="archiveBet('${b.id}')">Archive &amp; reverse scores</button>
      </div>
    </div>`).join('');
  } catch (err) {
    console.error('loadResolvedBets error:', err);
    el.innerHTML = `<p style="color:var(--bad)">Error loading resolved bets: ${esc(err.message)}</p>`;
  }
}

async function archiveBet(betId) {
  if (!confirm('Archive this bet? If it was resolved, all points awarded will be reversed.')) return;

  try {
    const betDoc = await db.collection('bets').doc(betId).get();
    if (!betDoc.exists) { showToast('Bet not found.', 'error'); return; }
    const bet = betDoc.data();

    const predsSnap = await db.collection('predictions')
      .where('betId', '==', betId)
      .get();

    const batch = db.batch();

    // If the bet was resolved, reverse points from each predictor's totals
    if (bet.status === 'resolved') {
      predsSnap.docs.forEach(predDoc => {
        const pred = predDoc.data();
        if (pred.score != null) {
          const userRef = db.collection('users').doc(pred.userId);
          batch.set(userRef, {
            totalPoints:   firebase.firestore.FieldValue.increment(-(pred.points || 0)),
            totalScore:    firebase.firestore.FieldValue.increment(-(pred.score  || 0)),
            resolvedCount: firebase.firestore.FieldValue.increment(-1),
          }, { merge: true });
          // Clear the score so it doesn't confuse "My Predictions"
          batch.update(predDoc.ref, { score: null, points: null, archived: true });
        }
      });
    }

    batch.update(betDoc.ref, { status: 'archived' });
    await batch.commit();

    const msg = bet.status === 'resolved'
      ? `Bet archived and scores reversed for ${predsSnap.size} predictor(s).`
      : 'Bet archived.';
    showToast(msg, 'success');
    loadInstructor();
  } catch (err) {
    console.error('archiveBet error:', err);
    showToast('Error archiving bet: ' + err.message, 'error');
  }
}

function toggleCreateTypeFields() {
  const type = document.getElementById('cb-type').value;
  document.getElementById('cb-numeric-fields').classList.toggle('hidden', type !== 'numeric');
  document.getElementById('cb-categorical-fields').classList.toggle('hidden', type !== 'categorical');
}

async function handleCreateBet(e) {
  e.preventDefault();
  const type = document.getElementById('cb-type').value;

  const bet = {
    title:              document.getElementById('cb-title').value.trim(),
    description:        document.getElementById('cb-description').value.trim(),
    resolutionCriteria: document.getElementById('cb-resolution').value.trim(),
    type,
    category:           document.getElementById('cb-category').value,
    predictionDeadline: document.getElementById('cb-deadline').value || null,
    resolutionDate:     document.getElementById('cb-date').value,
    status:             'open',
    isOfficial:         true,
    classCode:          CLASS_CODE,
    createdBy:          currentUser.id,
    createdByName:      currentUser.displayName,
    predictionCount:    0,
    createdAt:          firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (type === 'numeric') {
    bet.numericMin       = parseFloat(document.getElementById('cb-num-min').value) || null;
    bet.numericMax       = parseFloat(document.getElementById('cb-num-max').value) || null;
    bet.numericTolerance = parseFloat(document.getElementById('cb-num-tol').value) || null;
  }
  if (type === 'categorical') {
    const raw = document.getElementById('cb-cat-options').value;
    bet.categories = raw.split('\n').map(s => s.trim()).filter(Boolean);
    if (bet.categories.length < 2) {
      showToast('Enter at least two options.', 'error'); return;
    }
  }

  try {
    await db.collection('bets').add(bet);
    showToast('Bet created!', 'success');
    document.getElementById('create-bet-form').reset();
    document.getElementById('cb-numeric-fields').classList.add('hidden');
    document.getElementById('cb-categorical-fields').classList.add('hidden');
    loadInstructorOpenBets();
  } catch (err) {
    console.error('handleCreateBet error:', err);
    showToast('Error creating bet: ' + err.message, 'error');
  }
}

async function resolveBet(betId) {
  // Find the outcome input for this bet
  const input = document.querySelector(`.resolve-outcome[data-id="${betId}"]`);
  if (!input || !input.value) {
    showToast('Select or enter the outcome first.', 'error'); return;
  }

  const betType = input.dataset.type;
  let outcome;
  if (betType === 'binary') {
    outcome = input.value === 'yes' ? 1 : 0;
  } else if (betType === 'numeric') {
    outcome = parseFloat(input.value);
    if (isNaN(outcome)) { showToast('Enter a valid number.', 'error'); return; }
  } else {
    outcome = input.value;
  }

  // Fetch bet
  const betDoc = await db.collection('bets').doc(betId).get();
  const bet = { id: betId, ...betDoc.data() };

  // Fetch all predictions
  const predsSnap = await db.collection('predictions')
    .where('betId', '==', betId)
    .get();

  const batch = db.batch();

  predsSnap.docs.forEach(predDoc => {
    const pred = predDoc.data();
    const score  = calculateScore(bet, pred.value, outcome);
    const points = Math.round(score * 1000) / 100; // score × 10, 2dp
    batch.update(predDoc.ref, { score, points, outcome });

    // Update user stats (accumulate totalScore and resolvedCount;
    // avgScore is derived at display time as totalScore / resolvedCount)
    const userRef = db.collection('users').doc(pred.userId);
    batch.set(userRef, {
      totalPoints:   firebase.firestore.FieldValue.increment(points),
      totalScore:    firebase.firestore.FieldValue.increment(score),
      resolvedCount: firebase.firestore.FieldValue.increment(1),
    }, { merge: true });
  });

  batch.update(db.collection('bets').doc(betId), {
    status: 'resolved',
    outcome,
    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();
  showToast(`Bet resolved! ${predsSnap.size} prediction(s) scored.`, 'success');
  loadInstructor();
}

// ══════════════════════════════════════════════════
// SCORING
// ══════════════════════════════════════════════════
function calculateScore(bet, prediction, outcome) {
  if (bet.type === 'binary') {
    // Brier: 1 − (p − o)²
    // outcome is 0 or 1
    return Math.max(0, Math.min(1, 1 - Math.pow(prediction - outcome, 2)));
  }
  if (bet.type === 'numeric') {
    const tol = bet.numericTolerance || 1;
    return Math.max(0, 1 - Math.abs(prediction - outcome) / tol);
  }
  if (bet.type === 'categorical') {
    // Multi-class Brier
    const opts = bet.categories || [];
    if (!opts.length) return 0;
    const sq = opts.reduce((s, opt) => {
      const p = (prediction[opt] != null ? prediction[opt] : 0);
      const o = opt === outcome ? 1 : 0;
      return s + Math.pow(p - o, 2);
    }, 0);
    return Math.max(0, 1 - sq / opts.length);
  }
  return 0;
}

// ══════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════
// Convert a Firestore Timestamp, Date, or date string to milliseconds for sorting
function tsMillis(val) {
  if (!val) return 0;
  if (val.toMillis) return val.toMillis();      // Firestore Timestamp
  if (val.toDate)   return val.toDate().getTime();
  return new Date(val).getTime() || 0;
}

function formatDate(val) {
  if (!val) return '—';
  // Firestore Timestamp or plain string
  const d = val.toDate ? val.toDate() : new Date(val);
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatOutcome(outcome, bet) {
  if (bet.type === 'binary') return outcome === 1 ? 'YES' : 'NO';
  return String(outcome);
}

function formatPredValue(value, bet) {
  if (bet.type === 'binary' && typeof value === 'number') {
    return (value * 100).toFixed(0) + '% YES';
  }
  if (bet.type === 'numeric' && typeof value === 'number') {
    return String(value);
  }
  if (bet.type === 'categorical' && typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
      .join(', ');
  }
  return '—';
}

function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
