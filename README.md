# Epistemic Odds — PHIL 4040 Prediction Market

A lightweight, GitHub-Pages-hostable prediction market for philosophy and
political science courses. Students submit probability forecasts ("bets")
on real-world events; a **proper scoring rule** (Brier score) rewards honest
credence reports and produces a live calibration chart that illustrates
core themes from Expected Utility Theory and Prospect Theory.

---

## What students experience

| Feature | Details |
|---|---|
| **Browse bets** | See all open and resolved bets; click to predict |
| **Make predictions** | Binary: drag a probability slider; Numeric: enter a value; Categorical: distribute % across options |
| **Live score preview** | Binary slider shows the Brier score for YES/NO outcomes in real time |
| **Propose bets** | Students suggest new questions; instructor approves |
| **My predictions** | Personal history with scores after resolution |
| **Leaderboard** | Ranked by cumulative points; includes calibration chart |

## What the instructor gets

- Create official bets (any type) with resolution criteria and dates
- Approve/reject student proposals (accepted = +2 bonus pts to proposer)
- One-click resolution: select the outcome, scores and leaderboard update immediately

---

## Technology

- **Frontend**: plain HTML + CSS + JavaScript — no build step, no Node.js required
- **Backend**: [Firebase Firestore](https://firebase.google.com/docs/firestore) (free Spark plan is ample for a class)
- **Charts**: [Chart.js](https://www.chartjs.org/) via CDN
- **Hosting**: GitHub Pages (static file serving)

---

## Setup Guide

### Step 1 — Fork / create a GitHub repository

1. Go to [github.com](https://github.com) and create a new **public** repository
   (e.g. `phil4040-market`).
2. Upload the four files in this folder:
   - `index.html`
   - `style.css`
   - `app.js`
   - `firebase-config.js` *(after you fill it in — see Step 2)*

### Step 2 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Click **Add project** → give it a name (e.g. `phil4040-market`) → Continue.
3. Disable Google Analytics if you don't need it → **Create project**.
4. Once created, click the **`</>`** (Web) icon to add a web app.
5. Register the app (name it anything) — Firebase shows you a code block like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "phil4040-market.firebaseapp.com",
  projectId: "phil4040-market",
  storageBucket: "phil4040-market.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. Copy those values into `firebase-config.js` — replacing the placeholder strings.

### Step 3 — Enable Firestore

1. In the Firebase console sidebar, click **Firestore Database**.
2. Click **Create database** → choose **Start in test mode** (we'll tighten this below) → select a region close to you → **Enable**.

### Step 4 — Deploy security rules

**Option A (Firebase CLI — recommended):**
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # choose your project; keep the existing firestore.rules file
firebase deploy --only firestore:rules
```

**Option B (Console):**
1. In Firestore → **Rules** tab, paste the contents of `firestore.rules`.
2. Click **Publish**.

### Step 5 — Enable GitHub Pages

1. In your GitHub repo, go to **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch → main → / (root)**.
3. Save. After a minute your site is live at
   `https://YOUR_GITHUB_USERNAME.github.io/REPO_NAME/`.

### Step 6 — Share with students

Hand students two things:
- The URL (from Step 5)
- The **class code** (set in `firebase-config.js` — default: `PHIL4040`)

Keep the **instructor code** to yourself (default: `PHIL4040-INST26` — change it before deploying!).

---

## Customising the site

### Change class/instructor codes
Edit the bottom of `firebase-config.js`:
```js
const CLASS_CODE      = "PHIL4040";
const INSTRUCTOR_CODE = "MYPASSWORD";  // pick something memorable
```

### Add course-specific bets at launch
You don't need to wait for students — log in with the instructor code and use
the **⚙ Instructor** panel to create official bets before the first class.

### Suggested bets for a decision theory course

| Title | Type | Course connection |
|---|---|---|
| Will it snow in Moscow before spring break? | Binary | Brier scoring; calibration |
| What fraction of the class will choose the "risky" option in the Allais Paradox? | Numeric | Allais Paradox revisited |
| Which party wins Idaho's 2026 Senate race? | Categorical | Multi-class Brier; ambiguity |
| What will gas cost at the D St Chevron on [date]? | Numeric | Numerical scoring, anchoring |
| How many students will attend the Nov 17 class? | Numeric | Attendance bet (classic!) |
| Will the Vandals win their next home game? | Binary | Brier; overconfidence bias |

---

## Scoring reference

### Binary bets (Brier score)
```
Score = 1 − (p − o)²
```
- `p` = your predicted probability (0 → 1)
- `o` = outcome: 1 for YES, 0 for NO
- Range: [0, 1]; higher is better
- Perfect score: **1.0**; always-50%: **0.75**; maximally wrong: **0.0**

**Points** = Score × 10 (rounded to 2 decimal places)

### Numerical bets
```
Score = max(0, 1 − |forecast − true value| / tolerance)
```
Set `tolerance` when creating the bet (e.g. $2 for a gas-price bet).

### Categorical bets (multi-class Brier)
```
Score = 1 − (1/N) × Σ (p_i − o_i)²
```
where N = number of options, `o_i` = 1 for the true category, 0 otherwise.

---

## Pedagogical notes

### Why proper scoring rules matter
A scoring rule is **proper** if maximising your expected score (under EUT) requires
reporting your true credence. The Brier rule is proper: bluffing always hurts you in
expectation. This makes the market an *observable measure* of students' subjective
probabilities — exactly what Ramsey had in mind.

### Prospect Theory predictions
The probability weighting function π(p) predicts:
- **Overweighting** of small probabilities → students report *too high* for unlikely events
- **Underweighting** of near-certainties → students report *too low* for likely events
- This produces the characteristic **inverse-S calibration curve**

The class calibration chart (Leaderboard page) lets students see whether their
aggregate behavior matches the PT prediction.

### Loss aversion and hedging
Under PT, students may feel that a score of 0 (maximally wrong) is much worse than
0.75 (hedging at 50%). This loss aversion could push predictions toward 0.5 regardless
of true beliefs — a measurable deviation from EUT.

---

## File structure

```
prediction-market/
├── index.html          Single-page app (all sections/modals)
├── style.css           Academic navy/gold design, no external CSS framework
├── app.js              All JavaScript: Firebase, scoring, rendering, navigation
├── firebase-config.js  ← YOU FILL THIS IN before deploying
├── firestore.rules     Firestore security rules (deploy via CLI or console)
└── README.md           This file
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Invalid class code" on login | Check `CLASS_CODE` in `firebase-config.js` matches exactly |
| Bets don't load | Check browser console for Firebase errors; verify Firestore is enabled and rules are deployed |
| Leaderboard is empty | Only users with at least one resolved prediction appear |
| Calibration chart is empty | Requires at least one resolved *binary* bet with student predictions |
| Changes to `firebase-config.js` not reflected | Hard-refresh the page (Cmd/Ctrl + Shift + R) |

---

*Built for PHIL 4040 — Decision Theory & Strategic Interactions, University of Idaho, Spring 2026.*
