import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "hunter-system-v10";

// ─── EXP & Leveling ───────────────────────────────────────────────────────────
const EXP_TABLE = { E: 80, D: 220, C: 600, B: 1800, A: 5000, S: 15000 };

function expForLevel(lvl) {
  if (lvl <= 9)  return Math.floor(80   * Math.pow(lvl, 2.0));
  if (lvl <= 19) return Math.floor(60   * Math.pow(lvl, 2.6));
  if (lvl <= 34) return Math.floor(25   * Math.pow(lvl, 3.2));
  if (lvl <= 54) return Math.floor(8    * Math.pow(lvl, 3.9));
  if (lvl <= 79) return Math.floor(1.5  * Math.pow(lvl, 4.6));
  return         Math.floor(0.2         * Math.pow(lvl, 5.5));
}

function rankFromLevel(lvl) {
  if (lvl >= 80) return "S";
  if (lvl >= 55) return "A";
  if (lvl >= 35) return "B";
  if (lvl >= 20) return "C";
  if (lvl >= 10) return "D";
  return "E";
}

function streakMultiplier(streak) {
  if (streak >= 30) return 2.0;
  if (streak >= 21) return 1.75;
  if (streak >= 14) return 1.5;
  if (streak >= 7)  return 1.25;
  if (streak >= 3)  return 1.1;
  return 1.0;
}

function daysBetween(a, b) {
  const d1 = new Date(a); const d2 = new Date(b);
  d1.setHours(0,0,0,0); d2.setHours(0,0,0,0);
  return Math.round((d2 - d1) / 86400000);
}

function getWeekStart() {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay());
  return d.toDateString();
}

// ─── Quest Rank Calculator ────────────────────────────────────────────────────
const CAT_WEIGHT = { Physical: 1.4, Mental: 1.2, Discipline: 1.3, Skill: 1.1, Health: 1.0, Social: 0.9 };
const EFFORT_SCORE = {
  "Trivial (< 5 min)": 1, "Easy (5–15 min)": 2, "Light (15–30 min)": 3,
  "Moderate (30–60 min)": 5, "Hard (1–2 hrs)": 7, "Intense (2–4 hrs)": 8, "Extreme (4+ hrs)": 10,
};
function calcRank(category, effort) {
  const score = (EFFORT_SCORE[effort] || 1) * (CAT_WEIGHT[category] || 1.0);
  if (score >= 12) return "S";
  if (score >= 9)  return "A";
  if (score >= 6)  return "B";
  if (score >= 3.5) return "C";
  if (score >= 2)  return "D";
  return "E";
}

// ─── Hunter Profiles ──────────────────────────────────────────────────────────
const PROFILES = {
  Athlete:      { label: "Athlete",      icon: "⚔️", color: "#ff2d55", glow: "rgba(255,45,85,0.3)",   desc: "Your body is your weapon.",         trackedCats: ["Physical"],   threshold: 10, expBonus: 0.25, bonusLabel: "+25% EXP on Physical quests" },
  Scholar:      { label: "Scholar",      icon: "🧠", color: "#64d2ff", glow: "rgba(100,210,255,0.3)", desc: "Knowledge is the sharpest blade.",   trackedCats: ["Mental"],     threshold: 10, expBonus: 0.25, bonusLabel: "+25% EXP on Mental quests" },
  Monk:         { label: "Monk",         icon: "🔥", color: "#ff9500", glow: "rgba(255,149,0,0.3)",   desc: "Discipline is your armor.",          trackedCats: ["Discipline"], threshold: 10, expBonus: 0.30, bonusLabel: "+30% EXP on Discipline quests" },
  Artist:       { label: "Artist",       icon: "✨", color: "#bf5af2", glow: "rgba(191,90,242,0.3)",  desc: "You shape reality through creation.", trackedCats: ["Skill"],      threshold: 10, expBonus: 0.20, bonusLabel: "+20% EXP on Skill quests" },
  Professional: { label: "Professional", icon: "💼", color: "#ffd60a", glow: "rgba(255,214,10,0.3)",  desc: "Efficiency and output define you.",  trackedCats: ["Social"],     threshold: 10, expBonus: 0.20, bonusLabel: "+20% EXP on Social quests" },
};
const CAT_TO_PROFILE = { Physical: "Athlete", Mental: "Scholar", Discipline: "Monk", Skill: "Artist", Social: "Professional" };
function detectProfile(counts) {
  if (!counts) return null;
  let best = null; let bestVal = 0;
  for (const [key, val] of Object.entries(counts)) {
    if (val > bestVal && val >= (PROFILES[key]?.threshold || 10)) { bestVal = val; best = key; }
  }
  return best;
}

// ─── Profile Challenges ───────────────────────────────────────────────────────
const PROFILE_CHALLENGES = {
  Athlete: [
    { id: "a1", title: "Sprint Protocol", rank: "D", profile: "Athlete", desc: "A week-long physical conditioning test.", daysToComplete: 7, expReward: 3000, penalty: 2, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Run 5km three times this week", done: false }, { id: 2, title: "Complete 200 push-ups in a single day", done: false }, { id: 3, title: "Do 100 squats every day for 5 days", done: false }, { id: 4, title: "Hold a 2-minute plank", done: false }] },
    { id: "a2", title: "Iron Fortress",   rank: "C", profile: "Athlete", desc: "Two weeks of relentless physical training.", daysToComplete: 14, expReward: 12000, penalty: 3, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Run 10km without stopping", done: false }, { id: 2, title: "Complete 1000 push-ups this week", done: false }, { id: 3, title: "Complete 500 pull-ups this week", done: false }, { id: 4, title: "Train twice a day for 5 consecutive days", done: false }, { id: 5, title: "Light activity every single day", done: false }] },
    { id: "a3", title: "Warrior's Ordeal", rank: "B", profile: "Athlete", desc: "Three weeks separating hunters from prey.", daysToComplete: 21, expReward: 45000, penalty: 5, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Run a half marathon (21km)", done: false }, { id: 2, title: "Complete 3000 push-ups total", done: false }, { id: 3, title: "Cold shower every single day", done: false }, { id: 4, title: "Train 90+ min, 5 days/week", done: false }, { id: 5, title: "No alcohol, no junk food for 21 days", done: false }, { id: 6, title: "Sleep 7–8 hours every night", done: false }] },
  ],
  Scholar: [
    { id: "s1", title: "First Grimoire",     rank: "D", profile: "Scholar", desc: "Seven days of pure mental discipline.", daysToComplete: 7, expReward: 3000, penalty: 2, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Study for 10 hours total", done: false }, { id: 2, title: "Read 100 pages of non-fiction", done: false }, { id: 3, title: "No social media before studying each day", done: false }, { id: 4, title: "Write a daily learning summary", done: false }] },
    { id: "s2", title: "Mind Labyrinth",     rank: "C", profile: "Scholar", desc: "14 days of deep focus. Your mind becomes a weapon.", daysToComplete: 14, expReward: 12000, penalty: 3, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Study 25 hours total", done: false }, { id: 2, title: "Finish one full book", done: false }, { id: 3, title: "Meditate before every session for 10 days", done: false }, { id: 4, title: "No phone during study for 10 days", done: false }, { id: 5, title: "Handwritten notes every session", done: false }] },
    { id: "s3", title: "Scholar's Ascension", rank: "B", profile: "Scholar", desc: "21 days of relentless mental output.", daysToComplete: 21, expReward: 45000, penalty: 5, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Study 50 hours total", done: false }, { id: 2, title: "Read 3 books", done: false }, { id: 3, title: "Write a 1000-word summary each week", done: false }, { id: 4, title: "No entertainment before daily study goal", done: false }, { id: 5, title: "Sleep before midnight every day", done: false }, { id: 6, title: "Daily journaling for 21 days", done: false }] },
  ],
  Monk: [
    { id: "m1", title: "Stone Resolve",    rank: "D", profile: "Monk", desc: "Seven days of pure discipline.", daysToComplete: 7, expReward: 3000, penalty: 2, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Wake up before 6AM every day", done: false }, { id: 2, title: "Cold shower every day", done: false }, { id: 3, title: "No junk food for 7 days", done: false }, { id: 4, title: "Sleep before 11PM every night", done: false }] },
    { id: "m2", title: "Ascetic's Path",   rank: "C", profile: "Monk", desc: "14 days stripping away every bad habit.", daysToComplete: 14, expReward: 12000, penalty: 3, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Zero social media for 14 days", done: false }, { id: 2, title: "Cold shower every day for 14 days", done: false }, { id: 3, title: "No processed food for 14 days", done: false }, { id: 4, title: "Meditate 15 min every morning", done: false }, { id: 5, title: "Sleep 7+ hours every night", done: false }] },
    { id: "m3", title: "Shadow Monk Trial", rank: "B", profile: "Monk", desc: "21 days of absolute control over mind and body.", daysToComplete: 21, expReward: 45000, penalty: 5, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Wake up before 5:30AM every day", done: false }, { id: 2, title: "Cold showers every day", done: false }, { id: 3, title: "No alcohol, junk food, or sugar for 21 days", done: false }, { id: 4, title: "Meditate 20 min daily", done: false }, { id: 5, title: "No phone first hour after waking", done: false }, { id: 6, title: "Journal every night", done: false }] },
  ],
  Artist: [
    { id: "ar1", title: "First Canvas", rank: "D", profile: "Artist", desc: "Seven days proving you can show up every day.", daysToComplete: 7, expReward: 3000, penalty: 2, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Create something every day for 7 days", done: false }, { id: 2, title: "Spend 1+ hour on your craft daily", done: false }, { id: 3, title: "Share or record your work at least once", done: false }, { id: 4, title: "Study your craft for 3 hours this week", done: false }] },
    { id: "ar2", title: "The Forge",    rank: "C", profile: "Artist", desc: "14 days of deep creative work. No shortcuts.", daysToComplete: 14, expReward: 12000, penalty: 3, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Complete one significant creative project", done: false }, { id: 2, title: "Practice 2+ hours daily for 10 days", done: false }, { id: 3, title: "Study a master in your field — 5 hours total", done: false }, { id: 4, title: "Document 14 consecutive days of work", done: false }] },
  ],
  Professional: [
    { id: "p1", title: "Deep Work Sprint",   rank: "D", profile: "Professional", desc: "A week of focused professional output.", daysToComplete: 7, expReward: 3000, penalty: 2, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "3 hours of uninterrupted deep work daily", done: false }, { id: 2, title: "Zero social media during work for 7 days", done: false }, { id: 3, title: "Plan next day every evening", done: false }, { id: 4, title: "Complete your most important task first daily", done: false }] },
    { id: "p2", title: "Executive Protocol", rank: "C", profile: "Professional", desc: "14 days of elite professional discipline.", daysToComplete: 14, expReward: 12000, penalty: 3, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "4+ hours deep work daily for 10 days", done: false }, { id: 2, title: "Complete one major project or milestone", done: false }, { id: 3, title: "No news or social media during work", done: false }, { id: 4, title: "Weekly review every Sunday", done: false }, { id: 5, title: "Read one professional development book", done: false }] },
  ],
};

// ─── Generic Challenges ───────────────────────────────────────────────────────
const GENERIC_CHALLENGES = [
  { id: 1, title: "Iron Will",       rank: "D", desc: "A week of basic discipline.", daysToComplete: 7, expReward: 2000, penalty: 2, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Run 3km without stopping", done: false }, { id: 2, title: "Complete 150 push-ups in one day", done: false }, { id: 3, title: "Study for 2 hours straight", done: false }, { id: 4, title: "Cold showers for 3 consecutive days", done: false }, { id: 5, title: "Sleep before 11PM for 5 days", done: false }] },
  { id: 2, title: "Shadow's Path",   rank: "B", desc: "Three weeks of extreme discipline.", daysToComplete: 21, expReward: 30000, penalty: 5, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Run 10km in under 60 minutes", done: false }, { id: 2, title: "Fast for 24 hours (water only)", done: false }, { id: 3, title: "No screen time after 9PM for 14 days", done: false }, { id: 4, title: "Cold showers every day for 14 days", done: false }, { id: 5, title: "Sleep 7–8 hours for 14 consecutive days", done: false }] },
  { id: 3, title: "Monarch's Trial", rank: "A", desc: "The System itself watches. Only the worthy survive.", daysToComplete: 30, expReward: 120000, penalty: 8, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: [{ id: 1, title: "Run a half marathon (21km)", done: false }, { id: 2, title: "Study for 60 hours total", done: false }, { id: 3, title: "Zero junk food for 30 days", done: false }, { id: 4, title: "Cold showers every day for 30 days", done: false }, { id: 5, title: "Wake up before 6AM every day", done: false }, { id: 6, title: "Read 3 books", done: false }] },
];

// ─── Default State ────────────────────────────────────────────────────────────
const defaultState = {
  hunter: { name: "Hunter", class: "Fighter" },
  level: 1, exp: 0, totalExp: 0,
  stats: { strength: 10, agility: 10, intelligence: 10, vitality: 10, perception: 10 },
  statPoints: 0,
  skills: [
    { id: 1,  name: "First Steps",         category: "Body",  rank: "E", unlockLevel: 1,  desc: "You exercise at least once this week. The journey begins.", unlocked: true },
    { id: 2,  name: "Morning Ritual",       category: "Mind",  rank: "E", unlockLevel: 1,  desc: "You wake up at a consistent time every day for a week.", unlocked: true },
    { id: 3,  name: "Run 1km",              category: "Body",  rank: "E", unlockLevel: 3,  desc: "You can run 1km without stopping. Most people never start.", unlocked: false },
    { id: 4,  name: "Cold Exposure",        category: "Mind",  rank: "E", unlockLevel: 5,  desc: "30 consecutive days of cold showers. Your comfort zone is gone.", unlocked: false },
    { id: 5,  name: "Deep Work",            category: "Mind",  rank: "D", unlockLevel: 8,  desc: "You work 2 uninterrupted hours daily without your phone.", unlocked: false },
    { id: 6,  name: "Run 5km",              category: "Body",  rank: "D", unlockLevel: 10, desc: "You can run 5km. You are no longer a beginner.", unlocked: false },
    { id: 7,  name: "No Junk Month",        category: "Body",  rank: "D", unlockLevel: 12, desc: "30 days of clean eating. Your discipline is visible in the mirror.", unlocked: false },
    { id: 8,  name: "100 Books",            category: "Mind",  rank: "C", unlockLevel: 17, desc: "You have read 100 books. Most people read zero after school.", unlocked: false },
    { id: 9,  name: "Bodyweight Master",    category: "Body",  rank: "C", unlockLevel: 20, desc: "100 push-ups, 50 pull-ups in a single session. Pure strength.", unlocked: false },
    { id: 10, name: "Run 10km",             category: "Body",  rank: "C", unlockLevel: 20, desc: "10km. You are now in the top 10% of human physical fitness.", unlocked: false },
    { id: 11, name: "Financial Base",       category: "Life",  rank: "C", unlockLevel: 25, desc: "3 months of expenses saved. You have a buffer against the world.", unlocked: false },
    { id: 12, name: "Run Half Marathon",    category: "Body",  rank: "B", unlockLevel: 35, desc: "21.1km. The distance that separates the committed from the casual.", unlocked: false },
    { id: 13, name: "High-Value Skill",     category: "Life",  rank: "B", unlockLevel: 40, desc: "You have mastered a skill the market pays well for.", unlocked: false },
    { id: 14, name: "Teach Others",         category: "Mind",  rank: "B", unlockLevel: 45, desc: "You are good enough at something to teach it. That's mastery.", unlocked: false },
    { id: 15, name: "Run a Marathon",       category: "Body",  rank: "A", unlockLevel: 55, desc: "42.2km. Only 1% of humans have done this. You are one of them.", unlocked: false },
    { id: 16, name: "Build Something Real", category: "Life",  rank: "A", unlockLevel: 60, desc: "A business, project, or product that generates real income.", unlocked: false },
    { id: 17, name: "Physical Peak",        category: "Body",  rank: "A", unlockLevel: 70, desc: "Elite conditioning: sub-4hr marathon, 200+ push-ups, under 10% body fat.", unlocked: false },
    { id: 18, name: "Shadow Monarch",       category: "Mind",  rank: "S", unlockLevel: 80, desc: "You have built an extraordinary life through sheer daily discipline. You are the exception.", unlocked: false },
  ],
  quests: [
    { id: 1,  title: "Morning Run",       desc: "Run for 20 minutes without stopping",        category: "Daily",  difficulty: "E", activityCat: "Physical",   effort: "Light (15–30 min)",    done: false },
    { id: 2,  title: "100 Push-Ups",      desc: "Complete 100 push-ups in a single session",  category: "Daily",  difficulty: "D", activityCat: "Physical",   effort: "Moderate (30–60 min)", done: false },
    { id: 3,  title: "Study Session",     desc: "Study or read deeply for 1 full hour",       category: "Daily",  difficulty: "D", activityCat: "Mental",     effort: "Moderate (30–60 min)", done: false },
    { id: 4,  title: "Hydration",         desc: "Drink at least 2 litres of water today",     category: "Daily",  difficulty: "E", activityCat: "Health",     effort: "Easy (5–15 min)",      done: false },
    { id: 5,  title: "Cold Shower",       desc: "Take a full cold shower — no warm water",    category: "Daily",  difficulty: "D", activityCat: "Discipline", effort: "Light (15–30 min)",    done: false },
    { id: 6,  title: "No Junk Food",      desc: "Eat clean all day, zero processed food",     category: "Daily",  difficulty: "E", activityCat: "Discipline", effort: "Moderate (30–60 min)", done: false },
    { id: 7,  title: "7-Day Streak",      desc: "Complete every daily quest for 7 days",      category: "Weekly", difficulty: "C", activityCat: "Discipline", effort: "Hard (1–2 hrs)",        done: false },
    { id: 8,  title: "10km Run",          desc: "Complete a 10km run in one session",         category: "Weekly", difficulty: "C", activityCat: "Physical",   effort: "Hard (1–2 hrs)",        done: false },
    { id: 9,  title: "First Awakening",   desc: "Reach Level 5 — your power begins to surface", category: "Main", difficulty: "D", done: false },
    { id: 10, title: "E-Rank Graduation", desc: "Reach Level 10 and leave the weakest behind",  category: "Main", difficulty: "C", done: false },
  ],
  streak: 0, longestStreak: 0, lastActiveDate: null, lastReset: new Date().toDateString(),
  profileCounts: { Athlete: 0, Scholar: 0, Monk: 0, Artist: 0, Professional: 0 },
  detectedProfile: null,
  challenges: GENERIC_CHALLENGES,
  profileChallenges: [],
  xpLog: [],
  questsCompleted: 0,
  weeklyResetDate: null,
};

// ─── Colors ───────────────────────────────────────────────────────────────────
const RANK_COLOR = { S: "#ff2d55", A: "#ff9500", B: "#ffd60a", C: "#30d158", D: "#64d2ff", E: "#8e8e93" };
const RANK_GLOW  = { S: "rgba(255,45,85,0.4)", A: "rgba(255,149,0,0.4)", B: "rgba(255,214,10,0.35)", C: "rgba(48,209,88,0.35)", D: "rgba(100,210,255,0.35)", E: "rgba(142,142,147,0.2)" };

// ─── Shared Styles ────────────────────────────────────────────────────────────
const G = {
  app: { minHeight: "100vh", background: "#05050f", fontFamily: "'Rajdhani', sans-serif", color: "#cdd6f4", backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(30,20,80,0.4) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(15,10,50,0.6) 0%, transparent 50%)" },
  nav: { display: "flex", gap: 2, padding: "0 16px", background: "rgba(5,5,20,0.95)", borderBottom: "1px solid rgba(120,100,255,0.15)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100, overflowX: "auto" },
  navBtn: (active) => ({ padding: "16px 12px", background: "none", border: "none", color: active ? "#a78bfa" : "#5a6080", cursor: "pointer", fontFamily: "'Orbitron', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", borderBottom: active ? "2px solid #a78bfa" : "2px solid transparent", transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0 }),
  page: { maxWidth: 900, margin: "0 auto", padding: "32px 20px" },
  card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(120,100,255,0.12)", borderRadius: 12, padding: 24, marginBottom: 16 },
  cardDark: { background: "rgba(10,8,30,0.7)", border: "1px solid rgba(80,60,180,0.2)", borderRadius: 12, padding: 20, marginBottom: 12 },
  sectionTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#6060a0", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 },
  btn: { padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.1)", color: "#a78bfa", cursor: "pointer", fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 2, transition: "all 0.2s", textTransform: "uppercase" },
  btnSuccess: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(48,209,88,0.3)", background: "rgba(48,209,88,0.1)", color: "#30d158", cursor: "pointer", fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 1, transition: "all 0.2s" },
  btnDone: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(80,80,120,0.3)", background: "rgba(80,80,120,0.08)", color: "#4a5070", cursor: "default", fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 1 },
  input: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.2)", borderRadius: 8, padding: "10px 14px", color: "#cdd6f4", fontFamily: "'Rajdhani', sans-serif", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box" },
};

// ─── Small Components ─────────────────────────────────────────────────────────
function RankBadge({ rank, size = 14 }) {
  const rgb = { S: "255,45,85", A: "255,149,0", B: "255,214,10", C: "48,209,88", D: "100,210,255", E: "142,142,147" }[rank] || "142,142,147";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size * 2, height: size * 2, borderRadius: 4, background: `rgba(${rgb},0.15)`, border: `1px solid ${RANK_COLOR[rank]}`, color: RANK_COLOR[rank], fontFamily: "'Orbitron', sans-serif", fontSize: size - 2, fontWeight: 700, boxShadow: `0 0 8px ${RANK_GLOW[rank]}`, flexShrink: 0 }}>{rank}</span>
  );
}

function XPBar({ exp, level }) {
  const needed = expForLevel(level);
  const pct = Math.min(100, (exp / needed) * 100);
  return (
    <div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #5b21b6, #a78bfa, #c4b5fd)", borderRadius: 999, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)", boxShadow: "0 0 12px rgba(167,139,250,0.6)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#4a5070", fontFamily: "'Orbitron', sans-serif" }}>
        <span>{exp.toLocaleString()} XP</span>
        <span style={{ color: "#6a5a90" }}>{(needed - exp).toLocaleString()} to next level</span>
      </div>
    </div>
  );
}

function StatBar({ label, value, icon, color, onAdd, canAdd }) {
  const pct = Math.min(100, (value / 200) * 100);
  const rgb = { "#ff2d55": "255,45,85", "#ff9500": "255,149,0", "#64d2ff": "100,210,255", "#30d158": "48,209,88", "#a78bfa": "167,139,250" }[color] || "167,139,250";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: 2, color: "#6060a0", textTransform: "uppercase" }}>{label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color }}>{value}</span>
          {canAdd && <button onClick={onAdd} style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${color}`, background: `rgba(${rgb},0.15)`, color, cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>}
        </div>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 999, transition: "width 0.4s ease", boxShadow: `0 0 8px ${color}66` }} />
      </div>
    </div>
  );
}

// ─── Level-Up Overlay ─────────────────────────────────────────────────────────
function LevelUpOverlay({ level, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [level]);
  return (
    <div onClick={onDismiss} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,1,15,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: "overlayFadeIn 0.3s ease" }}>
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, letterSpacing: 6, color: "#3a2a5a", marginBottom: 20, animation: "slideDown 0.4s ease" }}>LEVEL UP</div>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 140, fontWeight: 900, color: "#a78bfa", lineHeight: 1, animation: "levelBurst 0.65s cubic-bezier(0.34,1.56,0.64,1)", textShadow: "0 0 80px rgba(167,139,250,0.9), 0 0 160px rgba(167,139,250,0.4)" }}>{level}</div>
      <div style={{ marginTop: 24, fontFamily: "'Cinzel', serif", fontSize: 18, color: "#c4b5fd", letterSpacing: 5, animation: "slideDown 0.5s ease 0.25s both" }}>+3 STAT POINTS</div>
      <div style={{ marginTop: 52, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#221a33", letterSpacing: 3 }}>TAP TO CONTINUE</div>
    </div>
  );
}

// ─── Rank-Up Overlay ──────────────────────────────────────────────────────────
function RankUpOverlay({ rank, onDismiss }) {
  const RANK_TITLE = { E: "Awakened", D: "Rookie Hunter", C: "Skilled Hunter", B: "Dangerous Hunter", A: "National Level Hunter", S: "Shadow Monarch" };
  useEffect(() => { const t = setTimeout(onDismiss, 5000); return () => clearTimeout(t); }, [rank]);
  const col = RANK_COLOR[rank];
  const glow = RANK_GLOW[rank];
  return (
    <div onClick={onDismiss} style={{ position: "fixed", inset: 0, zIndex: 1001, background: `radial-gradient(ellipse at center, ${glow.replace("0.4","0.28").replace("0.35","0.22")} 0%, rgba(2,1,15,0.97) 65%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: "overlayFadeIn 0.4s ease" }}>
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: 7, color: col + "66", marginBottom: 14, animation: "slideDown 0.4s ease" }}>RANK PROMOTION</div>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 160, fontWeight: 900, color: col, lineHeight: 1, animation: "rankPulse 0.75s cubic-bezier(0.34,1.56,0.64,1)", textShadow: `0 0 100px ${col}, 0 0 200px ${col}55` }}>{rank}</div>
      <div style={{ marginTop: 8, fontFamily: "'Cinzel', serif", fontSize: 26, color: col, letterSpacing: 7, animation: "slideDown 0.5s ease 0.35s both" }}>{RANK_TITLE[rank]}</div>
      <div style={{ marginTop: 32, width: 240, height: 1, background: `linear-gradient(90deg, transparent, ${col}, transparent)`, animation: "slideDown 0.5s ease 0.5s both" }} />
      <div style={{ marginTop: 40, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: col + "44", letterSpacing: 3 }}>TAP TO CONTINUE</div>
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────
function ProfileTab({ state, dispatch }) {
  const { hunter, level, exp, stats, statPoints } = state;
  const rank = rankFromLevel(level);
  const profile = state.detectedProfile ? PROFILES[state.detectedProfile] : null;
  const counts = state.profileCounts || {};
  const streak = state.streak || 0;
  const mult = streakMultiplier(streak);
  const dailyQuests = state.quests.filter(q => q.category === "Daily");
  const dailyDone = dailyQuests.filter(q => q.done).length;
  const allDone = dailyQuests.length > 0 && dailyDone === dailyQuests.length;
  const nextMilestone = streak >= 30 ? null : streak >= 21 ? 30 : streak >= 14 ? 21 : streak >= 7 ? 14 : streak >= 3 ? 7 : 3;

  return (
    <div style={G.page}>
      {/* Hunter Card */}
      <div style={{ ...G.card, background: "linear-gradient(135deg, rgba(20,10,50,0.9), rgba(10,5,30,0.95))", border: `1px solid ${RANK_COLOR[rank]}44`, boxShadow: `0 0 40px ${RANK_GLOW[rank]}, inset 0 0 60px rgba(0,0,0,0.5)`, marginBottom: 24, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 200, height: 200, background: `radial-gradient(circle at top right, ${RANK_GLOW[rank]}, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#5a5a80", letterSpacing: 3, marginBottom: 6 }}>HUNTER PROFILE</div>
            <input value={hunter.name} onChange={e => dispatch({ type: "SET_NAME", name: e.target.value })} style={{ ...G.input, fontSize: 26, fontWeight: 700, fontFamily: "'Cinzel', serif", background: "transparent", border: "none", padding: 0, width: "auto", color: "#e8d5ff" }} />
            <div style={{ marginTop: 4, fontSize: 13, color: "#6060a0", fontFamily: "'Orbitron', sans-serif", letterSpacing: 2 }}>{hunter.class}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <RankBadge rank={rank} size={20} />
            <div style={{ marginTop: 8, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 2 }}>RANK</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, color: "#5a5a80", letterSpacing: 3 }}>LEVEL</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 48, fontWeight: 700, color: "#a78bfa", lineHeight: 1, textShadow: "0 0 30px rgba(167,139,250,0.5)" }}>{level}</span>
        </div>
        <XPBar exp={exp} level={level} />
        <div style={{ marginTop: 10, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#3a3a5a", letterSpacing: 2 }}>
          TOTAL EXP: <span style={{ color: "#5a4a80" }}>{(state.totalExp || 0).toLocaleString()}</span>
        </div>
        {/* Rank Roadmap */}
        <div style={{ marginTop: 14, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[{ r: "E", lv: "Lv1" }, { r: "D", lv: "Lv10" }, { r: "C", lv: "Lv20" }, { r: "B", lv: "Lv35" }, { r: "A", lv: "Lv55" }, { r: "S", lv: "Lv80" }].map(m => {
            const RANKS = ["E","D","C","B","A","S"];
            const isCurrent = rankFromLevel(level) === m.r;
            const isPast = RANKS.indexOf(rankFromLevel(level)) > RANKS.indexOf(m.r);
            return (
              <div key={m.r} style={{ flex: 1, minWidth: 44, padding: "6px 4px", borderRadius: 6, textAlign: "center", background: isCurrent ? `${RANK_COLOR[m.r]}18` : isPast ? `${RANK_COLOR[m.r]}08` : "rgba(255,255,255,0.02)", border: `1px solid ${isCurrent ? RANK_COLOR[m.r] + "55" : isPast ? RANK_COLOR[m.r] + "20" : "rgba(40,40,60,0.4)"}` }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, color: isCurrent ? RANK_COLOR[m.r] : isPast ? RANK_COLOR[m.r] + "50" : "#252535" }}>{m.r}</div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 7, color: isCurrent ? "#5a5a80" : "#1e1e2e", marginTop: 2 }}>{m.lv}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div style={G.card}>
        <div style={G.sectionTitle}>
          <span>◈</span> Combat Statistics
          {statPoints > 0 && <span style={{ marginLeft: "auto", padding: "3px 12px", borderRadius: 20, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.35)", fontSize: 10, color: "#a78bfa", fontFamily: "'Orbitron', sans-serif", animation: "statPulse 1.5s ease infinite" }}>{statPoints} pts to allocate</span>}
        </div>
        <StatBar label="Strength"     value={stats.strength}     icon="⚔️" color="#ff2d55" onAdd={() => dispatch({ type: "ADD_STAT", stat: "strength" })}     canAdd={statPoints > 0} />
        <StatBar label="Agility"      value={stats.agility}      icon="💨" color="#ff9500" onAdd={() => dispatch({ type: "ADD_STAT", stat: "agility" })}      canAdd={statPoints > 0} />
        <StatBar label="Intelligence" value={stats.intelligence} icon="🧠" color="#64d2ff" onAdd={() => dispatch({ type: "ADD_STAT", stat: "intelligence" })} canAdd={statPoints > 0} />
        <StatBar label="Vitality"     value={stats.vitality}     icon="❤️" color="#30d158" onAdd={() => dispatch({ type: "ADD_STAT", stat: "vitality" })}     canAdd={statPoints > 0} />
        <StatBar label="Perception"   value={stats.perception}   icon="👁️" color="#a78bfa" onAdd={() => dispatch({ type: "ADD_STAT", stat: "perception" })}   canAdd={statPoints > 0} />
      </div>

      {/* Discipline / Streak */}
      <div style={{ ...G.card, background: streak >= 7 ? "linear-gradient(135deg, rgba(255,100,0,0.07), rgba(10,5,30,0.95))" : "rgba(255,255,255,0.03)", border: streak >= 7 ? "1px solid rgba(255,149,0,0.2)" : "1px solid rgba(120,100,255,0.12)" }}>
        <div style={G.sectionTitle}>
          <span>🔥</span> Discipline
          {mult > 1 && <span style={{ marginLeft: "auto", padding: "3px 12px", borderRadius: 20, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)", fontSize: 10, color: "#ff9500", fontFamily: "'Orbitron', sans-serif" }}>EXP ×{mult.toFixed(2)}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[{ label: "Current Streak", value: `${streak}d`, color: streak >= 7 ? "#ff9500" : "#cdd6f4" }, { label: "Longest Streak", value: `${state.longestStreak || 0}d`, color: "#a78bfa" }, { label: "Today's Dailies", value: `${dailyDone}/${dailyQuests.length}`, color: allDone ? "#30d158" : "#ff453a" }].map(({ label, value, color }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 8px", border: "1px solid rgba(80,60,180,0.15)", textAlign: "center" }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>
        {nextMilestone && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70" }}>
              <span>NEXT MILESTONE: {nextMilestone} DAYS</span>
              <span>EXP ×{streakMultiplier(nextMilestone).toFixed(2)}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 999, width: `${Math.min(100, (streak / nextMilestone) * 100)}%`, background: "linear-gradient(90deg, #ff6500, #ff9500)", boxShadow: "0 0 8px rgba(255,149,0,0.4)", transition: "width 0.4s" }} />
            </div>
          </div>
        )}
        {/* Streak Warning */}
        {!allDone && dailyQuests.length > 0 && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.35)", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#ff453a", letterSpacing: 1, lineHeight: 1.9 }}>
            ⚠ {dailyQuests.length - dailyDone} DAILY QUEST{dailyQuests.length - dailyDone > 1 ? "S" : ""} REMAINING<br/>
            <span style={{ color: "#7a2a2a", fontSize: 8 }}>Miss midnight → lose 1 level and your streak</span>
          </div>
        )}
        {allDone && dailyQuests.length > 0 && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(48,209,88,0.07)", border: "1px solid rgba(48,209,88,0.2)", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#30d158", letterSpacing: 1 }}>
            ✓ ALL DAILY QUESTS COMPLETE — Streak secured
          </div>
        )}
      </div>

      {/* Hunter Profile */}
      <div style={{ ...G.card, border: `1px solid ${profile ? profile.color + "30" : "rgba(120,100,255,0.12)"}` }}>
        <div style={G.sectionTitle}><span>◈</span> Hunter Profile</div>
        {!profile ? (
          <div>
            <div style={{ fontSize: 13, color: "#4a5070", marginBottom: 16 }}>The System is observing you. Complete quests to reveal your nature.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(PROFILES).map(([key, p]) => {
                const count = counts[key] || 0;
                const pct = Math.min(100, (count / p.threshold) * 100);
                return (
                  <div key={key} style={{ flex: "1 1 130px", background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(40,40,60,0.4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 1 }}>{p.icon} {key.toUpperCase()}</span>
                      <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: p.color }}>{count}/{p.threshold}</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: p.color, borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 36 }}>{profile.icon}</span>
              <div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 20, color: profile.color, marginBottom: 4 }}>{profile.label}</div>
                <div style={{ fontSize: 12, color: "#5a6080" }}>{profile.desc}</div>
              </div>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: `${profile.color}10`, border: `1px solid ${profile.color}22`, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: profile.color, letterSpacing: 1 }}>
              ◈ {profile.bonusLabel}  •  Profile dungeons available in Challenges
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quests Tab ───────────────────────────────────────────────────────────────
function QuestsTab({ state, dispatch, flashQuestId }) {
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newQuestCat, setNewQuestCat] = useState("Daily");
  const [newActivityCat, setNewActivityCat] = useState("Physical");
  const [newEffort, setNewEffort] = useState("Moderate (30–60 min)");

  const computedRank = calcRank(newActivityCat, newEffort);
  const catColors = { Daily: "#64d2ff", Weekly: "#a78bfa", Main: "#ffd60a", Side: "#30d158" };
  const filtered = filter === "All" ? state.quests : state.quests.filter(q => q.category === filter);

  function addQuest() {
    if (!newTitle.trim()) return;
    dispatch({ type: "ADD_QUEST", quest: { id: Date.now(), title: newTitle, desc: newDesc, category: newQuestCat, difficulty: computedRank, activityCat: newActivityCat, effort: newEffort, done: false } });
    setNewTitle(""); setNewDesc(""); setAdding(false);
  }

  return (
    <div style={G.page}>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        {["All", "Daily", "Weekly", "Main", "Side"].map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{ padding: "7px 16px", borderRadius: 20, border: "1px solid", borderColor: filter === c ? (catColors[c] || "#a78bfa") : "rgba(80,80,120,0.3)", background: filter === c ? `${catColors[c] || "#a78bfa"}18` : "transparent", color: filter === c ? (catColors[c] || "#a78bfa") : "#4a5070", cursor: "pointer", fontFamily: "'Orbitron', sans-serif", fontSize: 9, letterSpacing: 2, transition: "all 0.2s" }}>{c}</button>
        ))}
        <button onClick={() => setAdding(!adding)} style={{ ...G.btn, marginLeft: "auto", fontSize: 9, padding: "7px 14px" }}>{adding ? "✕ Cancel" : "+ New Quest"}</button>
      </div>

      {/* Add quest panel */}
      {adding && (
        <div style={{ ...G.cardDark, marginBottom: 20, animation: "slideDown 0.25s ease" }}>
          <div style={G.sectionTitle}>◈ Create Quest</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <input placeholder="Quest title" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={G.input} />
            <input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} style={G.input} />
          </div>
          <div style={{ marginBottom: 8, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 2 }}>SCHEDULE</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {["Daily", "Weekly", "Main", "Side"].map(c => (
              <button key={c} onClick={() => setNewQuestCat(c)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: newQuestCat === c ? (catColors[c] || "#a78bfa") : "rgba(60,60,90,0.4)", background: newQuestCat === c ? `${catColors[c] || "#a78bfa"}18` : "transparent", color: newQuestCat === c ? (catColors[c] || "#a78bfa") : "#3a3a5a", cursor: "pointer", fontFamily: "'Orbitron', sans-serif", fontSize: 9, transition: "all 0.15s" }}>{c}</button>
            ))}
          </div>
          <div style={{ marginBottom: 8, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 2 }}>ACTIVITY TYPE</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.keys(CAT_WEIGHT).map(c => (
              <button key={c} onClick={() => setNewActivityCat(c)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: newActivityCat === c ? "#a78bfa" : "rgba(60,60,90,0.4)", background: newActivityCat === c ? "rgba(167,139,250,0.15)" : "transparent", color: newActivityCat === c ? "#a78bfa" : "#3a3a5a", cursor: "pointer", fontFamily: "'Orbitron', sans-serif", fontSize: 9, transition: "all 0.15s" }}>{c}</button>
            ))}
          </div>
          <div style={{ marginBottom: 8, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 2 }}>EFFORT / DURATION</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {Object.keys(EFFORT_SCORE).map(e => (
              <button key={e} onClick={() => setNewEffort(e)} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid", borderColor: newEffort === e ? "#64d2ff" : "rgba(60,60,90,0.4)", background: newEffort === e ? "rgba(100,210,255,0.1)" : "transparent", color: newEffort === e ? "#64d2ff" : "#3a3a5a", cursor: "pointer", fontFamily: "'Rajdhani', sans-serif", fontSize: 12, transition: "all 0.15s" }}>{e}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, padding: "14px 18px", borderRadius: 10, background: `${RANK_COLOR[computedRank]}0d`, border: `1px solid ${RANK_COLOR[computedRank]}30` }}>
            <RankBadge rank={computedRank} size={18} />
            <div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#5a5a80", letterSpacing: 2, marginBottom: 2 }}>SYSTEM EVALUATION</div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: RANK_COLOR[computedRank] }}>Rank {computedRank} — {EXP_TABLE[computedRank]} XP Reward</div>
            </div>
          </div>
          <button onClick={addQuest} style={G.btnSuccess}>Register Quest</button>
        </div>
      )}

      {/* Quest list */}
      {filtered.map(q => (
        <div key={q.id} style={{ ...G.cardDark, opacity: q.done ? 0.45 : 1, borderColor: q.done ? "rgba(40,40,60,0.25)" : `${RANK_COLOR[q.difficulty]}22`, transition: "opacity 0.4s, border-color 0.3s", animation: flashQuestId === q.id ? "questFlash 0.65s ease" : "none" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <RankBadge rank={q.difficulty} size={13} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 600, color: q.done ? "#3a3a5a" : "#cdd6f4", textDecoration: q.done ? "line-through" : "none" }}>{q.title}</span>
                <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${catColors[q.category] || "#a78bfa"}15`, color: catColors[q.category] || "#a78bfa", fontFamily: "'Orbitron', sans-serif", letterSpacing: 1, border: `1px solid ${catColors[q.category] || "#a78bfa"}30` }}>{q.category}</span>
              </div>
              <div style={{ fontSize: 12, color: "#4a5070", marginBottom: 6 }}>{q.desc}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#a78bfa" }}>
                  +{Math.floor(EXP_TABLE[q.difficulty] * streakMultiplier(state.streak || 0))} XP
                  {streakMultiplier(state.streak || 0) > 1 && <span style={{ color: "#ff9500", marginLeft: 4 }}>×{streakMultiplier(state.streak || 0).toFixed(2)}</span>}
                </span>
                {q.activityCat && <span style={{ fontSize: 9, color: "#3a3a5a", fontFamily: "'Orbitron', sans-serif" }}>• {q.activityCat}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {!q.done
                ? <button onClick={() => dispatch({ type: "COMPLETE_QUEST", id: q.id })} style={G.btnSuccess}>Complete</button>
                : <span style={G.btnDone}>Done ✓</span>}
              <button onClick={() => dispatch({ type: "REMOVE_QUEST", id: q.id })} style={{ ...G.btn, padding: "8px 10px", color: "#ff453a", borderColor: "rgba(255,69,58,0.2)", background: "rgba(255,69,58,0.05)", fontSize: 12 }}>✕</button>
            </div>
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#2a2a40", fontFamily: "'Orbitron', sans-serif", fontSize: 11, letterSpacing: 3 }}>NO QUESTS FOUND</div>
      )}
    </div>
  );
}

// ─── Skills Tab ───────────────────────────────────────────────────────────────
function SkillsTab({ state }) {
  const unlocked = state.skills.filter(s => s.unlocked).length;
  const catColors = { Body: "#ff2d55", Mind: "#64d2ff", Life: "#ffd60a" };

  return (
    <div style={G.page}>
      <div style={{ ...G.card, background: "linear-gradient(135deg, rgba(20,10,50,0.8), rgba(10,5,30,0.9))", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#5a5a80", letterSpacing: 3, marginBottom: 4 }}>LIFE MILESTONES</div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, color: "#e8d5ff", marginBottom: 12 }}>{unlocked} / {state.skills.length} Milestones Reached</div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(unlocked / state.skills.length) * 100}%`, background: "linear-gradient(90deg, #a78bfa, #c4b5fd)", borderRadius: 999, boxShadow: "0 0 10px rgba(167,139,250,0.5)" }} />
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
          {Object.entries(catColors).map(([cat, col]) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70" }}>{cat}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {state.skills.map(s => {
          const col = catColors[s.category] || "#a78bfa";
          return (
            <div key={s.id} style={{ background: s.unlocked ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.3)", border: `1px solid ${s.unlocked ? RANK_COLOR[s.rank] + "33" : "rgba(30,30,50,0.5)"}`, borderRadius: 12, padding: 18, boxShadow: s.unlocked ? `0 0 20px ${RANK_GLOW[s.rank]}` : "none", position: "relative", overflow: "hidden", transition: "all 0.3s" }}>
              {s.unlocked && <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${RANK_GLOW[s.rank]}, transparent 70%)`, pointerEvents: "none" }} />}
              {!s.unlocked && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", borderRadius: 12, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 20, opacity: 0.25 }}>🔒</span></div>}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <RankBadge rank={s.rank} size={12} />
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 600, color: s.unlocked ? "#e8d5ff" : "#2a2a3a" }}>{s.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 8, padding: "2px 8px", borderRadius: 10, background: `${col}15`, color: s.unlocked ? col : col + "44", border: `1px solid ${col}30`, fontFamily: "'Orbitron', sans-serif" }}>{s.category.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 12, color: s.unlocked ? "#7a8aaa" : "#252535", lineHeight: 1.7 }}>{s.desc}</div>
              {!s.unlocked && <div style={{ marginTop: 8, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#2a2a40", letterSpacing: 1 }}>UNLOCKS AT LEVEL {s.unlockLevel}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
function StatsTab({ state }) {
  const xpLog = state.xpLog || [];
  const level = state.level;
  const totalExp = state.totalExp || 0;
  const questsCompleted = state.questsCompleted || 0;

  // Build last 14 days
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().split("T")[0];
    const entry = xpLog.find(e => e.date === key);
    return { label: d.toLocaleDateString("en", { weekday: "short" }), date: key, xp: entry ? entry.xp : 0, isToday: i === 13 };
  });
  const maxXP = Math.max(...last14.map(d => d.xp), 1);

  // Today's activity breakdown
  const today = new Date().toISOString().split("T")[0];
  const catColors2 = { Physical: "#ff2d55", Mental: "#64d2ff", Discipline: "#ff9500", Skill: "#bf5af2", Health: "#30d158", Social: "#ffd60a" };
  const todayDone = state.quests.filter(q => q.done && q.activityCat);
  const catCounts = {};
  todayDone.forEach(q => { catCounts[q.activityCat] = (catCounts[q.activityCat] || 0) + 1; });
  const catBreakdown = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  const RANKS = ["E","D","C","B","A","S"];

  return (
    <div style={G.page}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Quests", value: questsCompleted, color: "#a78bfa" },
          { label: "Total EXP", value: totalExp >= 1000000 ? (totalExp / 1000000).toFixed(1) + "M" : totalExp >= 1000 ? (totalExp / 1000).toFixed(1) + "K" : totalExp, color: "#64d2ff" },
          { label: "Level", value: level, color: RANK_COLOR[rankFromLevel(level)] },
          { label: "Best Streak", value: `${state.longestStreak || 0}d`, color: "#ff9500" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...G.card, padding: "18px 14px", textAlign: "center", marginBottom: 0 }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 24, fontWeight: 700, color, marginBottom: 6 }}>{value}</div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* XP Chart */}
      <div style={G.card}>
        <div style={G.sectionTitle}><span>◈</span> XP per Day — Last 14 Days</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 96, marginBottom: 6 }}>
          {last14.map((d, i) => (
            <div key={i} title={`${d.label}: ${d.xp.toLocaleString()} XP`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: d.xp > 0 ? (d.isToday ? "#a78bfa" : "rgba(167,139,250,0.38)") : "rgba(255,255,255,0.04)", height: `${Math.max(3, (d.xp / maxXP) * 90)}px`, transition: "height 0.4s ease", boxShadow: d.xp > 0 ? "0 0 6px rgba(167,139,250,0.25)" : "none" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {last14.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", fontFamily: "'Orbitron', sans-serif", fontSize: 7, color: d.isToday ? "#a78bfa" : "#2a2a40" }}>{d.label[0]}</div>
          ))}
        </div>
        {xpLog.length === 0 && (
          <div style={{ marginTop: 16, textAlign: "center", fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#2a2a40", letterSpacing: 2 }}>Complete quests to see XP history</div>
        )}
      </div>

      {/* Activity Breakdown */}
      <div style={G.card}>
        <div style={G.sectionTitle}><span>◈</span> Today's Activity</div>
        {catBreakdown.length === 0 ? (
          <div style={{ fontSize: 13, color: "#3a3a5a" }}>No quests completed today yet.</div>
        ) : catBreakdown.map(([cat, count]) => {
          const col = catColors2[cat] || "#a78bfa";
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: col }}>{cat}</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#5a5a80" }}>{count}</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(count / catBreakdown[0][1]) * 100}%`, background: col, borderRadius: 999, boxShadow: `0 0 6px ${col}66` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Rank Progress */}
      <div style={G.card}>
        <div style={G.sectionTitle}><span>◈</span> Rank Progression</div>
        {[{ rank: "E", from: 1, to: 9 }, { rank: "D", from: 10, to: 19 }, { rank: "C", from: 20, to: 34 }, { rank: "B", from: 35, to: 54 }, { rank: "A", from: 55, to: 79 }, { rank: "S", from: 80, to: 99 }].map(({ rank, from, to }) => {
          const isCurrent = rankFromLevel(level) === rank;
          const isPast = level > to;
          const progress = isCurrent ? ((level - from) / (to - from + 1)) * 100 : isPast ? 100 : 0;
          return (
            <div key={rank} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, opacity: !isCurrent && !isPast ? 0.3 : 1 }}>
              <RankBadge rank={rank} size={12} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: isPast ? `${RANK_COLOR[rank]}44` : `linear-gradient(90deg, ${RANK_COLOR[rank]}88, ${RANK_COLOR[rank]})`, borderRadius: 999, boxShadow: isCurrent ? `0 0 6px ${RANK_GLOW[rank]}` : "none", transition: "width 0.5s ease" }} />
                </div>
              </div>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: isCurrent ? RANK_COLOR[rank] : "#2a2a40", minWidth: 56, textAlign: "right" }}>
                {isPast ? "CLEARED" : isCurrent ? `LV ${level} / ${to}` : `LV ${from}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────
function ChallengesTab({ state, dispatch }) {
  const profile = state.detectedProfile ? PROFILES[state.detectedProfile] : null;

  const profilePool = profile ? (PROFILE_CHALLENGES[state.detectedProfile] || []).map(c => {
    const saved = (state.profileChallenges || []).find(s => s.id === c.id);
    return saved ? { ...c, ...saved } : c;
  }) : [];

  const allChallenges = [...(state.challenges || []), ...profilePool];
  const active    = allChallenges.filter(c => c.startedAt && !c.completed && !c.failed);
  const available = allChallenges.filter(c => !c.startedAt && !c.completed && !c.failed);
  const done      = allChallenges.filter(c => c.completed);
  const failed    = allChallenges.filter(c => c.failed);

  function daysLeft(d) { return Math.ceil((new Date(d) - new Date()) / 86400000); }

  function ChallengeCard({ c }) {
    const left = c.deadlineAt ? daysLeft(c.deadlineAt) : null;
    const isActive = c.startedAt && !c.completed && !c.failed;
    const urgent = left !== null && left <= 3 && isActive;
    const progress = Math.round((c.tasks.filter(t => t.done).length / c.tasks.length) * 100);

    return (
      <div style={{ background: c.failed ? "rgba(255,45,58,0.04)" : c.completed ? "rgba(48,209,88,0.04)" : "rgba(10,8,30,0.7)", border: `1px solid ${c.failed ? "rgba(255,69,58,0.25)" : c.completed ? "rgba(48,209,88,0.2)" : urgent ? "rgba(255,149,0,0.3)" : RANK_COLOR[c.rank] + "22"}`, borderRadius: 12, padding: 20, marginBottom: 14, position: "relative", overflow: "hidden" }}>
        {!c.failed && !c.completed && <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at top right, ${RANK_GLOW[c.rank]}, transparent 70%)`, pointerEvents: "none" }} />}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <RankBadge rank={c.rank} size={13} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 600, color: c.failed ? "#5a2a2a" : c.completed ? "#2a5a3a" : "#e8d5ff", textDecoration: c.failed ? "line-through" : "none" }}>{c.title}</span>
              {c.profile && profile && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${profile.color}15`, color: profile.color, border: `1px solid ${profile.color}30`, fontFamily: "'Orbitron', sans-serif" }}>{profile.icon} {profile.label}</span>}
              {c.completed && <span style={{ fontSize: 10, color: "#30d158", fontFamily: "'Orbitron', sans-serif" }}>CLEARED</span>}
              {c.failed && <span style={{ fontSize: 10, color: "#ff453a", fontFamily: "'Orbitron', sans-serif" }}>FAILED</span>}
              {urgent && <span style={{ fontSize: 9, color: "#ff9500", fontFamily: "'Orbitron', sans-serif" }}>⚠ {left}d LEFT</span>}
            </div>
            <div style={{ fontSize: 12, color: "#4a5070", marginBottom: 6 }}>{c.desc}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#a78bfa" }}>+{c.expReward.toLocaleString()} XP</span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#ff453a" }}>-{c.penalty} LVL if failed</span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a5070" }}>{c.daysToComplete}d limit</span>
              {isActive && left !== null && <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: left <= 3 ? "#ff9500" : "#30d158" }}>{left > 0 ? `${left}d remaining` : "DEADLINE PASSED"}</span>}
            </div>
          </div>
        </div>
        {(isActive || c.completed) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70" }}>
              <span>PROGRESS</span><span>{progress}% — {c.tasks.filter(t => t.done).length}/{c.tasks.length} tasks</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, borderRadius: 999, background: c.completed ? "#30d158" : `linear-gradient(90deg, ${RANK_COLOR[c.rank]}88, ${RANK_COLOR[c.rank]})`, transition: "width 0.4s" }} />
            </div>
          </div>
        )}
        {isActive && c.tasks.map(t => (
          <div key={t.id} onClick={() => dispatch({ type: "TOGGLE_TASK", challengeId: c.id, taskId: t.id, isProfile: !!c.profile })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(40,40,60,0.4)", cursor: "pointer", opacity: t.done ? 0.45 : 1, transition: "opacity 0.2s" }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1px solid ${t.done ? "#30d158" : "rgba(100,100,160,0.4)"}`, background: t.done ? "rgba(48,209,88,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#30d158" }}>{t.done ? "✓" : ""}</div>
            <span style={{ fontSize: 13, color: t.done ? "#3a5a3a" : "#cdd6f4", textDecoration: t.done ? "line-through" : "none", fontFamily: "'Rajdhani', sans-serif" }}>{t.title}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: isActive ? 12 : 0 }}>
          {!c.startedAt && !c.completed && !c.failed && (
            <button onClick={() => dispatch({ type: "START_CHALLENGE", id: c.id, daysToComplete: c.daysToComplete, isProfile: !!c.profile })} style={{ ...G.btn, borderColor: `${RANK_COLOR[c.rank]}44`, background: `${RANK_COLOR[c.rank]}10`, color: RANK_COLOR[c.rank] }}>⚔ Enter Dungeon</button>
          )}
          {(c.failed || c.completed) && (
            <button onClick={() => dispatch({ type: "RESTART_CHALLENGE", id: c.id, isProfile: !!c.profile })} style={{ ...G.btn, fontSize: 9 }}>↺ Retry</button>
          )}
        </div>
      </div>
    );
  }

  const SectionLabel = ({ children }) => <div style={{ ...G.sectionTitle, marginTop: 4, marginBottom: 12 }}><span>◈</span> {children}</div>;

  return (
    <div style={G.page}>
      <div style={{ ...G.card, background: "linear-gradient(135deg, rgba(30,10,10,0.9), rgba(10,5,30,0.95))", border: "1px solid rgba(255,45,85,0.14)", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#5a2a2a", letterSpacing: 3, marginBottom: 6 }}>DUNGEON SYSTEM</div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, color: "#e8d5ff", marginBottom: 8 }}>Challenge Gates</div>
        <div style={{ fontSize: 13, color: "#4a3a4a", lineHeight: 1.6, marginBottom: 12 }}>
          Timed dungeons with real objectives. Complete all tasks before the deadline or lose levels.
          {profile && <span style={{ color: profile.color }}> Your <strong>{profile.label}</strong> profile unlocks exclusive dungeons.</span>}
        </div>
        {!state.detectedProfile && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#5a5a80", letterSpacing: 1 }}>◈ Complete quests to reveal your Hunter Profile — exclusive dungeons will unlock</div>}
        <div style={{ marginTop: 14, display: "flex", gap: 20 }}>
          {[{ label: "Active", val: active.length, color: "#a78bfa" }, { label: "Cleared", val: done.length, color: "#30d158" }, { label: "Failed", val: failed.length, color: "#ff453a" }].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#3a3a5a", letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      {active.length > 0    && <><SectionLabel>Active Dungeons</SectionLabel>{active.map(c => <ChallengeCard key={c.id} c={c} />)}</>}
      {available.length > 0 && <><SectionLabel>Available Dungeons</SectionLabel>{available.map(c => <ChallengeCard key={c.id} c={c} />)}</>}
      {done.length > 0      && <><SectionLabel>Cleared</SectionLabel>{done.map(c => <ChallengeCard key={c.id} c={c} />)}</>}
      {failed.length > 0    && <><SectionLabel>Failed</SectionLabel>{failed.map(c => <ChallengeCard key={c.id} c={c} />)}</>}
    </div>
  );
}

// ─── Notification ─────────────────────────────────────────────────────────────
function Notification({ msg, onClose }) {
  useEffect(() => { if (msg) { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); } }, [msg]);
  if (!msg) return null;
  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, rgba(20,10,50,0.98), rgba(10,5,30,0.98))", border: "1px solid rgba(167,139,250,0.4)", boxShadow: "0 0 40px rgba(167,139,250,0.3), 0 20px 60px rgba(0,0,0,0.8)", borderRadius: 12, padding: "16px 28px", zIndex: 998, fontFamily: "'Orbitron', sans-serif", fontSize: 11, letterSpacing: 2, color: "#a78bfa", animation: "fadeUp 0.3s ease", maxWidth: 440, textAlign: "center", whiteSpace: "pre-line" }}>
      {msg}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applyExp(state, gained) {
  let newExp = state.exp + gained;
  let newLevel = state.level;
  let bonusPoints = state.statPoints;
  while (newExp >= expForLevel(newLevel)) { newExp -= expForLevel(newLevel); newLevel++; bonusPoints += 3; }
  const newSkills = state.skills.map(s => (!s.unlocked && s.unlockLevel <= newLevel) ? { ...s, unlocked: true } : s);
  return { newExp, newLevel, bonusPoints, newSkills };
}

function applyPenalty(state, levels) {
  const newLevel = Math.max(1, state.level - levels);
  const newSkills = state.skills.map(s => s.unlockLevel > newLevel ? { ...s, unlocked: false } : s);
  return { newLevel, newSkills };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case "SET_NAME":
      return { ...state, hunter: { ...state.hunter, name: action.name } };

    case "ADD_STAT":
      if (state.statPoints <= 0) return state;
      return { ...state, statPoints: state.statPoints - 1, stats: { ...state.stats, [action.stat]: state.stats[action.stat] + 1 } };

    case "COMPLETE_QUEST": {
      const quest = state.quests.find(q => q.id === action.id);
      if (!quest || quest.done) return state;
      const base = EXP_TABLE[quest.difficulty] || 80;
      const mult = streakMultiplier(state.streak || 0);
      const profile = state.detectedProfile ? PROFILES[state.detectedProfile] : null;
      const profileMatch = profile && quest.activityCat && profile.trackedCats.includes(quest.activityCat);
      const gained = Math.floor(base * mult * (1 + (profileMatch ? profile.expBonus : 0)));
      const newProfileCounts = { ...(state.profileCounts || {}) };
      if (quest.activityCat && CAT_TO_PROFILE[quest.activityCat]) {
        const pk = CAT_TO_PROFILE[quest.activityCat];
        newProfileCounts[pk] = (newProfileCounts[pk] || 0) + 1;
      }
      const newDetectedProfile = detectProfile(newProfileCounts);
      const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, gained);
      const newlyUnlocked = newSkills.filter((s, i) => s.unlocked && !state.skills[i].unlocked);
      const multLabel = mult > 1 ? ` ×${mult.toFixed(2)}` : "";
      const bonusLabel = profileMatch ? ` +${Math.round(profile.expBonus * 100)}% ${state.detectedProfile}` : "";
      let notification = newLevel > state.level
        ? `⬆ LEVEL UP!  Reached Level ${newLevel}  •  +3 Stat Points`
        : `+${gained} XP${multLabel}${bonusLabel}  —  Quest Complete`;
      if (newlyUnlocked.length > 0) notification += `\n✨ Milestone Unlocked: ${newlyUnlocked.map(s => s.name).join(", ")}`;
      if (newDetectedProfile && newDetectedProfile !== state.detectedProfile) notification = `🎭 PROFILE DETECTED: ${newDetectedProfile}\n${PROFILES[newDetectedProfile].bonusLabel}`;
      // XP log
      const today2 = new Date().toISOString().split("T")[0];
      const xpLog = [...(state.xpLog || [])];
      const ti = xpLog.findIndex(e => e.date === today2);
      if (ti >= 0) xpLog[ti] = { ...xpLog[ti], xp: xpLog[ti].xp + gained };
      else xpLog.push({ date: today2, xp: gained, level: newLevel });
      return { ...state, exp: newExp, totalExp: (state.totalExp || 0) + gained, level: newLevel, statPoints: bonusPoints, skills: newSkills, profileCounts: newProfileCounts, detectedProfile: newDetectedProfile, quests: state.quests.map(q => q.id === action.id ? { ...q, done: true } : q), xpLog: xpLog.slice(-30), questsCompleted: (state.questsCompleted || 0) + 1, _notification: notification };
    }

    case "ADD_QUEST":
      return { ...state, quests: [...state.quests, action.quest] };

    case "REMOVE_QUEST":
      return { ...state, quests: state.quests.filter(q => q.id !== action.id) };

    case "WEEKLY_RESET":
      return { ...state, quests: state.quests.map(q => q.category === "Weekly" ? { ...q, done: false } : q), weeklyResetDate: action.weekStart };

    case "DAILY_RESET": {
      const today = new Date().toDateString();
      const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : 0;
      const hasDailies = state.quests.some(q => q.category === "Daily");
      const allDone = state.quests.filter(q => q.category === "Daily").every(q => q.done);
      const resetDailies = q => q.category === "Daily" ? { ...q, done: false } : q;
      if (gap >= 2 && hasDailies) {
        const { newLevel, newSkills } = applyPenalty(state, 1);
        return { ...state, level: newLevel, exp: 0, streak: 0, skills: newSkills, quests: state.quests.map(resetDailies), lastActiveDate: today, lastReset: today, _notification: `⚠ YOU MISSED A DAY\n— Level decreased to ${newLevel} —\n— Streak lost —` };
      }
      if (gap === 1 && hasDailies && !allDone) {
        const { newLevel, newSkills } = applyPenalty(state, 1);
        return { ...state, level: newLevel, exp: 0, streak: 0, skills: newSkills, quests: state.quests.map(resetDailies), lastActiveDate: today, lastReset: today, _notification: `⚠ DAILY QUESTS INCOMPLETE\n— Level decreased to ${newLevel} —\n— Streak lost —` };
      }
      let newStreak = state.streak || 0;
      let notification = null;
      if (gap === 1 && allDone) {
        newStreak++;
        notification = `🔥 Streak: ${newStreak} day${newStreak > 1 ? "s" : ""}  •  EXP ×${streakMultiplier(newStreak).toFixed(2)}`;
      }
      return { ...state, streak: newStreak, longestStreak: Math.max(state.longestStreak || 0, newStreak), quests: gap >= 1 ? state.quests.map(resetDailies) : state.quests, lastActiveDate: today, lastReset: today, _notification: notification };
    }

    case "START_CHALLENGE": {
      const now = new Date();
      const deadline = new Date(now);
      deadline.setDate(deadline.getDate() + action.daysToComplete);
      const patch = { startedAt: now.toISOString(), deadlineAt: deadline.toISOString() };
      if (action.isProfile) {
        const existing = state.profileChallenges || [];
        const base = (PROFILE_CHALLENGES[state.detectedProfile] || []).find(c => c.id === action.id);
        const updated = existing.find(c => c.id === action.id) ? existing.map(c => c.id === action.id ? { ...c, ...patch } : c) : [...existing, { ...base, ...patch }];
        return { ...state, profileChallenges: updated, _notification: `⚔ Dungeon entered — ${action.daysToComplete} days. Do not fail.` };
      }
      return { ...state, challenges: state.challenges.map(c => c.id === action.id ? { ...c, ...patch } : c), _notification: `⚔ Dungeon entered — ${action.daysToComplete} days. Do not fail.` };
    }

    case "TOGGLE_TASK": {
      const toggleIn = (list, fallback) => {
        const base = list.find(c => c.id === action.challengeId) || fallback;
        if (!base) return { list, completed: false, reward: 0 };
        const tasks = base.tasks.map(t => t.id === action.taskId ? { ...t, done: !t.done } : t);
        const allDone = tasks.every(t => t.done) && !base.completed;
        const updated = list.find(c => c.id === action.challengeId)
          ? list.map(c => c.id === action.challengeId ? { ...c, tasks, completed: allDone || c.completed } : c)
          : [...list, { ...base, tasks, completed: allDone }];
        return { list: updated, completed: allDone, reward: allDone ? base.expReward : 0 };
      };
      if (action.isProfile) {
        const fallback = (PROFILE_CHALLENGES[state.detectedProfile] || []).find(c => c.id === action.challengeId);
        const { list, completed, reward } = toggleIn(state.profileChallenges || [], fallback);
        if (!completed) return { ...state, profileChallenges: list };
        const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, reward);
        return { ...state, exp: newExp, totalExp: (state.totalExp || 0) + reward, level: newLevel, statPoints: bonusPoints, skills: newSkills, profileChallenges: list, _notification: `🏆 CHALLENGE COMPLETE!  +${reward.toLocaleString()} XP` };
      }
      const { list, completed, reward } = toggleIn(state.challenges || [], null);
      if (!completed) return { ...state, challenges: list };
      const done = list.find(c => c.id === action.challengeId);
      const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, reward);
      return { ...state, exp: newExp, totalExp: (state.totalExp || 0) + reward, level: newLevel, statPoints: bonusPoints, skills: newSkills, challenges: list, _notification: `🏆 CHALLENGE COMPLETE: ${done?.title}  •  +${reward.toLocaleString()} XP` };
    }

    case "CHECK_DEADLINES": {
      const now = new Date();
      let penaltyLevels = 0;
      const check = list => list.map(c => {
        if (!c.startedAt || c.completed || c.failed) return c;
        if (now > new Date(c.deadlineAt)) { penaltyLevels += c.penalty; return { ...c, failed: true }; }
        return c;
      });
      const challenges = check(state.challenges || []);
      const profileChallenges = check(state.profileChallenges || []);
      if (penaltyLevels === 0) return { ...state, challenges, profileChallenges };
      const { newLevel, newSkills } = applyPenalty(state, penaltyLevels);
      return { ...state, level: newLevel, exp: 0, skills: newSkills, challenges, profileChallenges, _notification: `💀 CHALLENGE FAILED — Level decreased by ${penaltyLevels}. Now Level ${newLevel}.` };
    }

    case "RESTART_CHALLENGE": {
      const reset = c => c.id === action.id ? { ...c, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: c.tasks.map(t => ({ ...t, done: false })) } : c;
      if (action.isProfile) return { ...state, profileChallenges: (state.profileChallenges || []).map(reset) };
      return { ...state, challenges: state.challenges.map(reset) };
    }

    case "CLEAR_NOTIFICATION":
      return { ...state, _notification: null };

    default:
      return state;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Profile");
  const [levelUpOverlay, setLevelUpOverlay] = useState(null);
  const [rankUpOverlay, setRankUpOverlay] = useState(null);
  const [flashQuestId, setFlashQuestId] = useState(null);

  const [state, rawDispatch] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultState, ...JSON.parse(saved), _notification: null };
    } catch {}
    return defaultState;
  });

  const dispatch = useCallback((action) => {
    rawDispatch(prev => {
      const next = reducer(prev, action);
      try { const { _notification, ...toSave } = next; localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, []);

  // Quest dispatch — handles flash + overlays
  const dispatchQuest = useCallback((action) => {
    if (action.type !== "COMPLETE_QUEST") { dispatch(action); return; }
    setFlashQuestId(action.id);
    setTimeout(() => setFlashQuestId(null), 700);
    rawDispatch(prev => {
      const next = reducer(prev, action);
      const didRankUp = rankFromLevel(next.level) !== rankFromLevel(prev.level);
      const didLevelUp = next.level > prev.level;
      if (didRankUp)       setTimeout(() => setRankUpOverlay(rankFromLevel(next.level)), 350);
      else if (didLevelUp) setTimeout(() => setLevelUpOverlay(next.level), 350);
      try { const { _notification, ...toSave } = next; localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, [dispatch]);

  useEffect(() => {
    const today = new Date().toDateString();
    if (state.lastActiveDate !== today) dispatch({ type: "DAILY_RESET" });
    dispatch({ type: "CHECK_DEADLINES" });
    const weekStart = getWeekStart();
    if ((state.weeklyResetDate || "") !== weekStart) dispatch({ type: "WEEKLY_RESET", weekStart });
  }, []);

  return (
    <div style={G.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&family=Orbitron:wght@400;500;700;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #05050f; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(120,100,255,0.3); border-radius: 2px; }
        select option { background: #12122a; }
        @keyframes fadeUp     { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes levelBurst { 0% { transform:scale(0.25) rotate(-8deg); opacity:0; } 65% { transform:scale(1.1) rotate(1deg); opacity:1; } 100% { transform:scale(1) rotate(0); opacity:1; } }
        @keyframes rankPulse  { 0% { transform:scale(0.1); opacity:0; } 60% { transform:scale(1.15); opacity:1; } 100% { transform:scale(1); opacity:1; } }
        @keyframes overlayFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes questFlash { 0%,100% { box-shadow:none; } 45% { box-shadow:0 0 30px rgba(48,209,88,0.8), inset 0 0 10px rgba(48,209,88,0.1); } }
        @keyframes slideDown  { from { opacity:0; transform:translateY(-14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes statPulse  { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
      `}</style>

      {rankUpOverlay  && <RankUpOverlay  rank={rankUpOverlay}   onDismiss={() => setRankUpOverlay(null)} />}
      {!rankUpOverlay && levelUpOverlay && <LevelUpOverlay level={levelUpOverlay} onDismiss={() => setLevelUpOverlay(null)} />}

      <div style={{ padding: "14px 24px", background: "rgba(3,3,15,0.98)", borderBottom: "1px solid rgba(80,60,180,0.15)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#a78bfa" }}>HUNTER SYSTEM</div>
        <div style={{ width: 1, height: 16, background: "rgba(120,100,255,0.2)" }} />
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, color: "#3a3a5a", letterSpacing: 2 }}>「 I alone am the exception 」</div>
      </div>

      <nav style={G.nav}>
        {["Profile", "Quests", "Skills", "Stats", "Challenges"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={G.navBtn(tab === t)}>{t}</button>
        ))}
      </nav>

      {tab === "Profile"    && <ProfileTab    state={state} dispatch={dispatchQuest} />}
      {tab === "Quests"     && <QuestsTab     state={state} dispatch={dispatchQuest} flashQuestId={flashQuestId} />}
      {tab === "Skills"     && <SkillsTab     state={state} />}
      {tab === "Stats"      && <StatsTab      state={state} />}
      {tab === "Challenges" && <ChallengesTab state={state} dispatch={dispatch} />}

      <Notification msg={state._notification} onClose={() => dispatch({ type: "CLEAR_NOTIFICATION" })} />
    </div>
  );
}