import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "hunter-system-v11";
const LEGACY_KEYS = ["hunter-system-v10", "hunter-system-v9", "hunter-system-v8"];

function loadSavedState() {
  // Try current key first
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...defaultState, ...JSON.parse(saved), _notification: null };
  } catch {}
  // Migrate from any legacy key
  for (const key of LEGACY_KEYS) {
    try {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        const migrated = { ...defaultState, ...parsed, activeTrees: parsed.activeTrees || [], treeProgress: parsed.treeProgress || {}, treeChallenges: parsed.treeChallenges || [], xpLog: parsed.xpLog || [], questsCompleted: parsed.questsCompleted || 0, weeklyResetDate: parsed.weeklyResetDate || null, _notification: null };
        // Save under new key immediately
        try { const { _notification, ...toSave } = migrated; localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
        return migrated;
      }
    } catch {}
  }
  return defaultState;
}

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


// ─── Tree Challenges ──────────────────────────────────────────────────────────
// Unlocked based on tree progress: D=0%, C=33%, B=66%, A=100%
const TREE_CHALLENGES = {
  Body: [
    { id: "body_ch_d", rank: "D", title: "First Blood", daysToComplete: 7, expReward: 2500, penalty: 2,
      desc: "Prove your body is waking up. One week of physical commitment.",
      tasks: [
        { id: 1, title: "Run 3km without stopping", done: false },
        { id: 2, title: "Complete 100 push-ups in a single day", done: false },
        { id: 3, title: "Exercise every day for 7 consecutive days", done: false },
        { id: 4, title: "Hold a 1-minute plank", done: false },
        { id: 5, title: "Stretch or cool down after every session this week", done: false },
      ]},
    { id: "body_ch_c", rank: "C", title: "Iron Week", daysToComplete: 14, expReward: 10000, penalty: 3,
      desc: "Two weeks that separates those who train from those who talk about it.",
      tasks: [
        { id: 1, title: "Run 5km three times this week", done: false },
        { id: 2, title: "Complete 500 push-ups total this week", done: false },
        { id: 3, title: "Train every single day for 14 days", done: false },
        { id: 4, title: "Cold shower every morning for 14 days", done: false },
        { id: 5, title: "Zero junk food for 14 days", done: false },
        { id: 6, title: "Sleep 7+ hours every night for 14 days", done: false },
      ]},
    { id: "body_ch_b", rank: "B", title: "The Long Run", daysToComplete: 21, expReward: 35000, penalty: 5,
      desc: "21 days. Your body will never be the same.",
      tasks: [
        { id: 1, title: "Run a half marathon (21.1km)", done: false },
        { id: 2, title: "Complete 2000 push-ups total", done: false },
        { id: 3, title: "Train twice a day for 5 consecutive days", done: false },
        { id: 4, title: "Run 80km total across the 21 days", done: false },
        { id: 5, title: "No rest days — active every single day", done: false },
        { id: 6, title: "Perfect nutrition — zero processed food for 21 days", done: false },
        { id: 7, title: "Document every single session", done: false },
      ]},
    { id: "body_ch_a", rank: "A", title: "Shadow Runner", daysToComplete: 30, expReward: 100000, penalty: 8,
      desc: "A full month at elite level. Most will never attempt this.",
      tasks: [
        { id: 1, title: "Complete a full marathon (42.2km)", done: false },
        { id: 2, title: "Run 150km total this month", done: false },
        { id: 3, title: "Complete 5000 push-ups total this month", done: false },
        { id: 4, title: "Train every single day for 30 days", done: false },
        { id: 5, title: "Sub-25 min 5km run", done: false },
        { id: 6, title: "Zero alcohol, zero junk food for 30 days", done: false },
        { id: 7, title: "Sleep 7–8 hours every night for 30 days", done: false },
        { id: 8, title: "Cold shower every morning for 30 days", done: false },
      ]},
  ],
  Mind: [
    { id: "mind_ch_d", rank: "D", title: "The First Page", daysToComplete: 7, expReward: 2500, penalty: 2,
      desc: "Seven days of deliberate mental engagement.",
      tasks: [
        { id: 1, title: "Read for 30 minutes every day for 7 days", done: false },
        { id: 2, title: "No phone for first hour of every morning", done: false },
        { id: 3, title: "Write a journal entry every night", done: false },
        { id: 4, title: "Finish 50 pages of a non-fiction book", done: false },
        { id: 5, title: "Study one new topic for 2+ hours total", done: false },
      ]},
    { id: "mind_ch_c", rank: "C", title: "Deep Focus Fortnight", daysToComplete: 14, expReward: 10000, penalty: 3,
      desc: "14 days of building a mind that can do real work.",
      tasks: [
        { id: 1, title: "2 hours of uninterrupted study every day for 14 days", done: false },
        { id: 2, title: "Finish one complete book", done: false },
        { id: 3, title: "Zero social media for 14 days", done: false },
        { id: 4, title: "Meditate every morning for 14 days", done: false },
        { id: 5, title: "Write a 500-word essay on something you learned", done: false },
        { id: 6, title: "Teach someone one thing you learned this week", done: false },
      ]},
    { id: "mind_ch_b", rank: "B", title: "Scholar's Month", daysToComplete: 21, expReward: 35000, penalty: 5,
      desc: "Three weeks of sustained mental output.",
      tasks: [
        { id: 1, title: "Study 4 hours every day for 21 days", done: false },
        { id: 2, title: "Read 3 full books", done: false },
        { id: 3, title: "Write a 2000-word analysis or essay", done: false },
        { id: 4, title: "Zero entertainment — no TV, games, or social media for 21 days", done: false },
        { id: 5, title: "Daily journaling for 21 consecutive days", done: false },
        { id: 6, title: "Complete one structured course or certification module", done: false },
        { id: 7, title: "Sleep before midnight every night", done: false },
      ]},
    { id: "mind_ch_a", rank: "A", title: "Philosopher's Trial", daysToComplete: 30, expReward: 100000, penalty: 8,
      desc: "30 days of elite mental discipline. Your mind becomes your greatest weapon.",
      tasks: [
        { id: 1, title: "Study 5+ hours every day for 30 days", done: false },
        { id: 2, title: "Read 5 books total", done: false },
        { id: 3, title: "Write and publish or share a long-form piece of work", done: false },
        { id: 4, title: "Zero social media for 30 days", done: false },
        { id: 5, title: "Mentor or teach someone over multiple sessions", done: false },
        { id: 6, title: "Build a personal knowledge system with 50+ notes", done: false },
        { id: 7, title: "Complete a major project using only your knowledge", done: false },
        { id: 8, title: "Meditate every single morning for 30 days", done: false },
      ]},
  ],
  Discipline: [
    { id: "disc_ch_d", rank: "D", title: "The Baseline", daysToComplete: 7, expReward: 2500, penalty: 2,
      desc: "Seven days of showing up no matter what.",
      tasks: [
        { id: 1, title: "Wake up at the same time every day for 7 days", done: false },
        { id: 2, title: "Cold shower every morning for 7 days", done: false },
        { id: 3, title: "No junk food for 7 days", done: false },
        { id: 4, title: "Complete your planned tasks every day", done: false },
        { id: 5, title: "In bed before 11PM every night", done: false },
      ]},
    { id: "disc_ch_c", rank: "C", title: "Iron Habits", daysToComplete: 14, expReward: 10000, penalty: 3,
      desc: "14 days stripping comfort and replacing it with standards.",
      tasks: [
        { id: 1, title: "Cold shower every day for 14 days", done: false },
        { id: 2, title: "Zero social media for 14 days", done: false },
        { id: 3, title: "Wake up before 6AM every day for 14 days", done: false },
        { id: 4, title: "No alcohol for 14 days", done: false },
        { id: 5, title: "Write tomorrow's plan every night for 14 days", done: false },
        { id: 6, title: "Meditate every morning for 14 days", done: false },
      ]},
    { id: "disc_ch_b", rank: "B", title: "Ascetic Protocol", daysToComplete: 21, expReward: 35000, penalty: 5,
      desc: "21 days of absolute self-control. No excuses. No exceptions.",
      tasks: [
        { id: 1, title: "Wake up before 5:30AM every single day", done: false },
        { id: 2, title: "Cold shower every morning for 21 days", done: false },
        { id: 3, title: "Zero entertainment — no TV, games, or social for 21 days", done: false },
        { id: 4, title: "No sugar, no alcohol, no junk food for 21 days", done: false },
        { id: 5, title: "Complete every planned task every day for 21 days", done: false },
        { id: 6, title: "Meditate 20 minutes every morning", done: false },
        { id: 7, title: "Journal every single night for 21 days", done: false },
      ]},
    { id: "disc_ch_a", rank: "A", title: "Shadow Monk", daysToComplete: 30, expReward: 100000, penalty: 8,
      desc: "30 days of living like a monk. Your willpower becomes unbreakable.",
      tasks: [
        { id: 1, title: "Wake up before 5AM every single day for 30 days", done: false },
        { id: 2, title: "Cold shower every morning for 30 days", done: false },
        { id: 3, title: "Zero social media for 30 days", done: false },
        { id: 4, title: "Perfect diet — zero processed food for 30 days", done: false },
        { id: 5, title: "No phone for first 2 hours of every day", done: false },
        { id: 6, title: "Never miss a single planned habit for 30 days", done: false },
        { id: 7, title: "Meditate 30 minutes every morning", done: false },
        { id: 8, title: "Journal every single night", done: false },
      ]},
  ],
  Craft: [
    { id: "craft_ch_d", rank: "D", title: "Show Up", daysToComplete: 7, expReward: 2500, penalty: 2,
      desc: "Seven days proving consistency is more powerful than talent.",
      tasks: [
        { id: 1, title: "Practice your craft every day for 7 days", done: false },
        { id: 2, title: "Spend at least 1 hour on your craft daily", done: false },
        { id: 3, title: "Complete one small finished piece", done: false },
        { id: 4, title: "Study one master in your field for 1 hour", done: false },
        { id: 5, title: "Share your work with one person and get feedback", done: false },
      ]},
    { id: "craft_ch_c", rank: "C", title: "The Grind", daysToComplete: 14, expReward: 10000, penalty: 3,
      desc: "14 days of deliberate, focused practice.",
      tasks: [
        { id: 1, title: "Practice 2 hours every day for 14 days", done: false },
        { id: 2, title: "Complete one intermediate-level project", done: false },
        { id: 3, title: "Identify your weakest area and work on it specifically for 5 hours", done: false },
        { id: 4, title: "Study and analyze 3 works by masters in your field", done: false },
        { id: 5, title: "Reach 100 total hours of deliberate practice", done: false },
        { id: 6, title: "Teach a beginner concept in your field", done: false },
      ]},
    { id: "craft_ch_b", rank: "B", title: "Master's Forge", daysToComplete: 21, expReward: 35000, penalty: 5,
      desc: "21 days of serious creative output. Build your body of work.",
      tasks: [
        { id: 1, title: "Practice 3 hours every day for 21 days", done: false },
        { id: 2, title: "Complete a complex multi-part project", done: false },
        { id: 3, title: "Produce work and get feedback from someone skilled", done: false },
        { id: 4, title: "Reach 500 total hours of deliberate practice", done: false },
        { id: 5, title: "Finish 3 complete pieces this month", done: false },
        { id: 6, title: "Document your process — notes, sketches, drafts", done: false },
        { id: 7, title: "Zero passive entertainment — only active creation", done: false },
      ]},
    { id: "craft_ch_a", rank: "A", title: "The Masterwork", daysToComplete: 30, expReward: 100000, penalty: 8,
      desc: "30 days. Create something you're genuinely proud of.",
      tasks: [
        { id: 1, title: "Complete your best work to date — a true masterpiece", done: false },
        { id: 2, title: "Practice 4 hours every day for 30 days", done: false },
        { id: 3, title: "Reach 1000 total hours of deliberate practice", done: false },
        { id: 4, title: "Share your masterwork publicly", done: false },
        { id: 5, title: "Build a body of 10+ finished pieces", done: false },
        { id: 6, title: "Receive recognition from a skilled audience", done: false },
        { id: 7, title: "Mentor one person in your craft", done: false },
        { id: 8, title: "Zero days missed — practice every single day", done: false },
      ]},
  ],
  Finance: [
    { id: "fin_ch_d", rank: "D", title: "Budget Week", daysToComplete: 7, expReward: 2500, penalty: 2,
      desc: "Seven days of financial awareness.",
      tasks: [
        { id: 1, title: "Track every single expense for 7 days", done: false },
        { id: 2, title: "Cut one unnecessary subscription or expense", done: false },
        { id: 3, title: "Zero impulse purchases for 7 days", done: false },
        { id: 4, title: "Calculate your exact net worth", done: false },
        { id: 5, title: "Read one chapter of a personal finance book", done: false },
      ]},
    { id: "fin_ch_c", rank: "C", title: "The Foundation", daysToComplete: 14, expReward: 10000, penalty: 3,
      desc: "14 days of building real financial discipline.",
      tasks: [
        { id: 1, title: "Track every expense for 14 days", done: false },
        { id: 2, title: "Save a meaningful amount this month", done: false },
        { id: 3, title: "Zero unnecessary spending for 14 days", done: false },
        { id: 4, title: "Read one personal finance book completely", done: false },
        { id: 5, title: "Create a 6-month financial plan", done: false },
        { id: 6, title: "Research and open an investment account", done: false },
      ]},
    { id: "fin_ch_b", rank: "B", title: "Wealth Builder Sprint", daysToComplete: 21, expReward: 35000, penalty: 5,
      desc: "21 days of aggressive financial moves.",
      tasks: [
        { id: 1, title: "Generate income outside your main job", done: false },
        { id: 2, title: "Invest consistently — put money to work this week", done: false },
        { id: 3, title: "Eliminate one category of debt", done: false },
        { id: 4, title: "Read 2 books on wealth building", done: false },
        { id: 5, title: "Build or expand a side income stream", done: false },
        { id: 6, title: "Zero lifestyle inflation — live below your means", done: false },
        { id: 7, title: "Write a 1-year financial roadmap with specific targets", done: false },
      ]},
    { id: "fin_ch_a", rank: "A", title: "The Architect", daysToComplete: 30, expReward: 100000, penalty: 8,
      desc: "30 days of building real, lasting financial power.",
      tasks: [
        { id: 1, title: "Build or significantly grow a passive income source", done: false },
        { id: 2, title: "Invest every single week for 30 days", done: false },
        { id: 3, title: "Reach a significant net worth milestone", done: false },
        { id: 4, title: "Create a system that generates income without daily labor", done: false },
        { id: 5, title: "Read 3 books on investing or wealth creation", done: false },
        { id: 6, title: "Zero impulse purchases for 30 days", done: false },
        { id: 7, title: "Diversify into a new asset class", done: false },
        { id: 8, title: "Document your complete financial system", done: false },
      ]},
  ],
  Social: [
    { id: "soc_ch_d", rank: "D", title: "Open Up", daysToComplete: 7, expReward: 2500, penalty: 2,
      desc: "Seven days of intentional connection.",
      tasks: [
        { id: 1, title: "Start a conversation with one stranger", done: false },
        { id: 2, title: "Reach out to 3 people you haven't talked to in months", done: false },
        { id: 3, title: "Attend one social event outside your comfort zone", done: false },
        { id: 4, title: "Have one deep 1-hour conversation with no phones", done: false },
        { id: 5, title: "Give genuine, specific compliments to 5 different people", done: false },
      ]},
    { id: "soc_ch_c", rank: "C", title: "Network Effect", daysToComplete: 14, expReward: 10000, penalty: 3,
      desc: "14 days of deliberate relationship building.",
      tasks: [
        { id: 1, title: "Have a difficult conversation you've been avoiding", done: false },
        { id: 2, title: "Meet 5 new people and follow up with all of them", done: false },
        { id: 3, title: "Give a short speech or presentation to any group", done: false },
        { id: 4, title: "Help someone with something meaningful — no expectation", done: false },
        { id: 5, title: "Resolve one ongoing conflict or tension", done: false },
        { id: 6, title: "Spend quality time with 10 different people this week", done: false },
      ]},
    { id: "soc_ch_b", rank: "B", title: "The Influencer", daysToComplete: 21, expReward: 35000, penalty: 5,
      desc: "21 days of building real influence and impact.",
      tasks: [
        { id: 1, title: "Lead a team or group to complete a real goal", done: false },
        { id: 2, title: "Build or grow an audience — online or offline", done: false },
        { id: 3, title: "Mentor someone through a real challenge over 3+ sessions", done: false },
        { id: 4, title: "Speak publicly to a group of 20+ people", done: false },
        { id: 5, title: "Create content or a message that reaches 100+ people", done: false },
        { id: 6, title: "Build a reputation in one specific community", done: false },
        { id: 7, title: "Make 10 warm introductions that add value to both parties", done: false },
      ]},
    { id: "soc_ch_a", rank: "A", title: "The Leader", daysToComplete: 30, expReward: 100000, penalty: 8,
      desc: "30 days of leading, building, and creating lasting impact.",
      tasks: [
        { id: 1, title: "Build and lead a team to a major achievement", done: false },
        { id: 2, title: "Speak to an audience of 100+ people", done: false },
        { id: 3, title: "Build a community or organization from scratch", done: false },
        { id: 4, title: "Create something that impacts 1000+ people", done: false },
        { id: 5, title: "Develop someone who surpasses where you started", done: false },
        { id: 6, title: "Make a decision that positively affects 50+ people", done: false },
        { id: 7, title: "Build an audience or following of 500+ engaged people", done: false },
        { id: 8, title: "Sustain daily relationship-building habits for 30 days", done: false },
      ]},
  ],
};

// ─── Roadmaps ─────────────────────────────────────────────────────────────────
const ROADMAPS = {
  python: {
    id: "python",
    title: "Python Mastery",
    icon: "🐍",
    color: "#3776ab",
    description: "30 days from zero to building real shit with Python",
    days: [
      { day: 1, tasks: ["Install Python and VS Code, run 'Hello World'", "Learn variables and data types - write 10 examples", "Solve 3 basic math problems using Python"] },
      { day: 2, tasks: ["Master if/else statements - write 5 different conditions", "Build a basic calculator (+, -, *, /)", "Learn input() and print() - build a conversation bot"] },
      { day: 3, tasks: ["Learn for loops - iterate through 5 different ranges", "Build FizzBuzz (print 1-100, 'Fizz' for 3s, 'Buzz' for 5s)", "Create a multiplication table generator"] },
      { day: 4, tasks: ["Learn while loops - build a guessing game", "Understand break and continue with examples", "Build a menu-driven program with loops"] },
      { day: 5, tasks: ["Master Python lists - create, append, remove, slice", "Build a shopping list program", "Sort and filter a list of numbers"] },
      { day: 6, tasks: ["Learn dictionaries - create 3 different dict examples", "Build a phonebook app (add, search, delete contacts)", "Understand dict methods - keys(), values(), items()"] },
      { day: 7, tasks: ["Learn tuples and sets - understand when to use each", "Build a program that removes duplicates from a list", "Practice nested data structures (list of dicts)"] },
      { day: 8, tasks: ["Write your first function with parameters and return", "Build 5 reusable functions (calculator operations)", "Understand function scope - global vs local"] },
      { day: 9, tasks: ["Learn *args and **kwargs", "Build a function that takes unlimited arguments", "Write a decorator function (learn what they do)"] },
      { day: 10, tasks: ["Master list comprehensions - rewrite 3 for loops", "Learn dictionary comprehensions", "Build a data transformer using comprehensions"] },
      { day: 11, tasks: ["Read and write files - save data to .txt", "Build a note-taking app that persists data", "Parse a text file and extract specific data"] },
      { day: 12, tasks: ["Learn try/except for error handling", "Build a program that handles user input errors gracefully", "Understand different exception types"] },
      { day: 13, tasks: ["Install and use pip - install your first package", "Work with the 'requests' library - fetch data from an API", "Parse JSON data and display it nicely"] },
      { day: 14, tasks: ["Learn string methods - split, join, replace, strip", "Build a text analyzer (word count, char count)", "Create a simple cipher to encode/decode messages"] },
      { day: 15, tasks: ["Introduction to NumPy - install and import", "Create arrays and understand array operations", "Perform math operations on arrays (faster than lists)"] },
      { day: 16, tasks: ["Learn Pandas basics - create a DataFrame", "Read a CSV file and display first 10 rows", "Filter and sort data in Pandas"] },
      { day: 17, tasks: ["Pandas operations - groupby, merge, pivot", "Clean messy data (handle missing values)", "Calculate statistics on real dataset"] },
      { day: 18, tasks: ["Learn classes and objects - create your first class", "Build a Person class with attributes and methods", "Understand __init__ and self"] },
      { day: 19, tasks: ["Inheritance - create parent and child classes", "Override methods in child class", "Build a simple game character system with classes"] },
      { day: 20, tasks: ["Build a complete project: Task Manager CLI", "Use classes, file I/O, and error handling", "Add features: add task, complete task, list tasks"] },
      { day: 21, tasks: ["Introduction to web scraping with BeautifulSoup", "Scrape a simple website and extract text", "Parse HTML and find specific elements"] },
      { day: 22, tasks: ["Build a web scraper that collects real data", "Save scraped data to CSV file", "Handle scraping errors and edge cases"] },
      { day: 23, tasks: ["Learn Matplotlib for data visualization", "Create line plot, bar chart, and scatter plot", "Customize colors, labels, and titles"] },
      { day: 24, tasks: ["Visualize real data from CSV", "Create subplots with multiple charts", "Save plots as image files"] },
      { day: 25, tasks: ["Work with APIs - understand GET requests", "Build a weather app using a public API", "Parse and display API response data"] },
      { day: 26, tasks: ["Learn regular expressions (regex) basics", "Extract patterns from text (emails, phone numbers)", "Build a data validator using regex"] },
      { day: 27, tasks: ["Plan your final project - pick something you want", "Set up project structure and files", "Write pseudocode for main features"] },
      { day: 28, tasks: ["Build core functionality of your project", "Implement at least 2 major features", "Test and fix bugs as you go"] },
      { day: 29, tasks: ["Add final features and polish your project", "Write comments and documentation", "Handle edge cases and errors"] },
      { day: 30, tasks: ["Finish and test your complete project", "Push to GitHub (learn git basics if needed)", "Share your project and celebrate"] }
    ]
  },
  ai: {
    id: "ai",
    title: "AI Engineering",
    icon: "🤖",
    color: "#ff6b6b",
    description: "30 days to understand and build with AI models",
    days: [
      { day: 1, tasks: ["Watch 3Blue1Brown 'What is a neural network?'", "Install Python, PyTorch, and Jupyter", "Run your first neural network (any tutorial)"] },
      { day: 2, tasks: ["Understand tensors and basic operations", "Create and manipulate tensors in PyTorch", "Learn matrix multiplication for neural networks"] },
      { day: 3, tasks: ["Learn what backpropagation actually does", "Implement gradient descent by hand (simple function)", "Understand loss functions conceptually"] },
      { day: 4, tasks: ["Build a neural network from scratch (no libraries)", "Train it on XOR problem", "Understand forward and backward pass"] },
      { day: 5, tasks: ["Load MNIST dataset", "Build your first CNN in PyTorch", "Train it and get >90% accuracy"] },
      { day: 6, tasks: ["Learn about overfitting and underfitting", "Implement dropout and regularization", "Plot training vs validation loss"] },
      { day: 7, tasks: ["Understand convolutional layers deeply", "Visualize what conv layers learn", "Experiment with different kernel sizes"] },
      { day: 8, tasks: ["Learn data augmentation techniques", "Apply augmentation to image dataset", "See how it improves model performance"] },
      { day: 9, tasks: ["Build an image classifier for custom dataset", "Collect your own images (10 classes minimum)", "Train and evaluate the model"] },
      { day: 10, tasks: ["Learn transfer learning concept", "Use pre-trained ResNet or VGG", "Fine-tune it on your custom dataset"] },
      { day: 11, tasks: ["Read 'Attention Is All You Need' paper (at least intro)", "Understand self-attention mechanism", "Draw out attention calculations by hand"] },
      { day: 12, tasks: ["Learn about transformer architecture", "Understand encoder and decoder", "Code a simple attention layer from scratch"] },
      { day: 13, tasks: ["Install Hugging Face transformers library", "Load a pre-trained BERT model", "Run inference on sample text"] },
      { day: 14, tasks: ["Fine-tune a text classifier using BERT", "Use your own dataset (reviews, tweets, etc)", "Evaluate performance on test set"] },
      { day: 15, tasks: ["Learn about embeddings and vector spaces", "Visualize word embeddings (Word2Vec or GloVe)", "Find similar words using cosine similarity"] },
      { day: 16, tasks: ["Build a simple sentiment analyzer", "Use pre-trained model from Hugging Face", "Test it on real-world text"] },
      { day: 17, tasks: ["Understand tokenization deeply", "Compare different tokenizers (BPE, WordPiece)", "Build your own simple tokenizer"] },
      { day: 18, tasks: ["Learn what RAG (Retrieval Augmented Generation) is", "Understand vector databases concept", "Install and test ChromaDB or FAISS"] },
      { day: 19, tasks: ["Build a simple RAG pipeline", "Embed documents and store in vector DB", "Query and retrieve relevant chunks"] },
      { day: 20, tasks: ["Integrate RAG with LLM (OpenAI API or local model)", "Build Q&A system over your documents", "Test with real questions"] },
      { day: 21, tasks: ["Learn about prompt engineering", "Test different prompting strategies", "Build a prompt template system"] },
      { day: 22, tasks: ["Understand few-shot learning", "Create examples for in-context learning", "Compare zero-shot vs few-shot performance"] },
      { day: 23, tasks: ["Learn model evaluation metrics", "Calculate precision, recall, F1 score", "Understand when to use each metric"] },
      { day: 24, tasks: ["Deploy a model as REST API using FastAPI", "Create endpoints for inference", "Test with POST requests"] },
      { day: 25, tasks: ["Learn about model optimization", "Quantize a model to reduce size", "Compare speed and accuracy tradeoffs"] },
      { day: 26, tasks: ["Understand LLM limitations and hallucinations", "Build validation layer for outputs", "Implement fact-checking mechanism"] },
      { day: 27, tasks: ["Plan your final AI project", "Choose: chatbot, image gen, RAG app, or classifier", "Set up project structure"] },
      { day: 28, tasks: ["Build core AI functionality", "Integrate model with application logic", "Handle errors and edge cases"] },
      { day: 29, tasks: ["Add UI or API layer", "Test with real users or data", "Optimize performance"] },
      { day: 30, tasks: ["Deploy your AI application", "Write documentation", "Share on GitHub or Twitter"] }
    ]
  },
  fitness: {
    id: "fitness",
    title: "Beast Mode",
    icon: "💪",
    color: "#ff2d55",
    description: "30 days to transform your body and mind",
    days: [
      { day: 1, tasks: ["20 min walk or jog", "50 push-ups (break into sets)", "100 bodyweight squats"] },
      { day: 2, tasks: ["30 min cardio (run, bike, or swim)", "3 sets of 20 push-ups", "Plank hold: 3x1 min"] },
      { day: 3, tasks: ["Rest day - 20 min stretching or yoga", "Foam rolling", "Plan next week's workouts"] },
      { day: 4, tasks: ["40 min run or cardio", "100 push-ups total", "50 lunges each leg"] },
      { day: 5, tasks: ["Upper body: 5 sets max push-ups", "Pull-ups or rows: 5 sets to failure", "Dips: 3 sets max reps"] },
      { day: 6, tasks: ["Core day: 5 min plank total", "100 crunches", "50 leg raises"] },
      { day: 7, tasks: ["Active recovery - light jog 30 min", "Full body stretch 20 min", "Take progress photos"] },
      { day: 8, tasks: ["Run 5km (or 30 min cardio)", "150 push-ups", "150 squats"] },
      { day: 9, tasks: ["HIIT: 10 rounds (30s work, 30s rest)", "Burpees, mountain climbers, jump squats", "Core finisher: 200 crunches"] },
      { day: 10, tasks: ["Upper body strength: push-ups to failure x5", "Pull-ups: 50 total (any sets)", "Pike push-ups: 3x15"] },
      { day: 11, tasks: ["Lower body: 200 squats", "100 lunges total", "Wall sit: 3x2 min"] },
      { day: 12, tasks: ["Cardio: 45 min run or bike", "Core: 6 min plank total", "Stretching 15 min"] },
      { day: 13, tasks: ["Full body circuit: 5 rounds", "20 push-ups, 30 squats, 15 burpees, 1 min plank", "No rest between exercises"] },
      { day: 14, tasks: ["Rest day - yoga or walking only", "Meal prep for next week", "Review progress and adjust plan"] },
      { day: 15, tasks: ["Run 7km (or 45 min cardio)", "200 push-ups total", "100 dips"] },
      { day: 16, tasks: ["Strength: max push-ups in one set", "Then 10 sets of half your max", "Pull-ups: pyramid up and down (1,2,3...3,2,1)"] },
      { day: 17, tasks: ["Lower body blast: 300 squats", "150 lunges", "100 calf raises"] },
      { day: 18, tasks: ["HIIT sprints: 15 rounds", "30s all-out sprint, 90s walk", "Core burnout: planks until failure"] },
      { day: 19, tasks: ["Upper body: bench dips 5x20", "Diamond push-ups: 5x15", "Wide push-ups: 5x15"] },
      { day: 20, tasks: ["Long cardio: 60 min steady pace", "Light core work", "Full body stretch"] },
      { day: 21, tasks: ["Active rest - 30 min walk", "Mobility work", "Plan final week push"] },
      { day: 22, tasks: ["Test day: max push-ups in 2 min", "Max pull-ups", "Plank hold for max time"] },
      { day: 23, tasks: ["Full body: 500 reps total", "Mix of push-ups, squats, lunges, dips", "Track your time"] },
      { day: 24, tasks: ["Run 10km (or 60 min cardio)", "Core: 300 total reps (mix exercises)", "Stretch thoroughly"] },
      { day: 25, tasks: ["Strength endurance: 10 rounds", "15 push-ups, 20 squats, 10 burpees", "Rest only when needed"] },
      { day: 26, tasks: ["Upper body max effort", "Push-ups: 250 total", "Pull-ups: 100 total"] },
      { day: 27, tasks: ["Lower body max effort", "400 squats", "200 lunges"] },
      { day: 28, tasks: ["Final cardio push: run until exhausted", "Then walk for recovery", "Core work: 10 min plank total"] },
      { day: 29, tasks: ["Full body circuit: go until failure", "Track all your maxes", "Push beyond your limits"] },
      { day: 30, tasks: ["Final test: beat all your day 1 numbers", "Take final progress photos", "Celebrate your transformation"] }
    ]
  },
  entrepreneur: {
    id: "entrepreneur",
    title: "Build & Ship",
    icon: "🚀",
    color: "#ffd60a",
    description: "30 days to launch something real",
    days: [
      { day: 1, tasks: ["Write down 20 problems you've personally experienced", "Circle the 3 that frustrate you most", "Research: who else has this problem?"] },
      { day: 2, tasks: ["Pick ONE problem to solve", "Talk to 5 people who have this problem", "Validate it's actually painful enough"] },
      { day: 3, tasks: ["Research existing solutions", "Identify what they're missing", "Find your unique angle"] },
      { day: 4, tasks: ["Define your MVP - absolute minimum to test idea", "Write down 3 core features (max)", "Sketch rough wireframes"] },
      { day: 5, tasks: ["Choose your tech stack", "Set up development environment", "Build 'hello world' version"] },
      { day: 6, tasks: ["Build first core feature", "Make it barely functional", "Show it to 1 person and get feedback"] },
      { day: 7, tasks: ["Implement feedback from yesterday", "Build second core feature", "Test both features together"] },
      { day: 8, tasks: ["Polish the UI just enough to not be embarrassing", "Fix critical bugs", "Get 3 people to test it"] },
      { day: 9, tasks: ["Build third core feature", "Connect all features into flow", "Test end-to-end user journey"] },
      { day: 10, tasks: ["Set up basic landing page", "Write clear value proposition", "Add waitlist or sign-up form"] },
      { day: 11, tasks: ["Create social media accounts", "Post about what you're building", "Join 3 relevant online communities"] },
      { day: 12, tasks: ["Get 10 people to test your MVP", "Watch them use it (don't help)", "Note every point of confusion"] },
      { day: 13, tasks: ["Fix the 3 biggest issues from testing", "Improve onboarding flow", "Add basic error handling"] },
      { day: 14, tasks: ["Build in public - share progress update", "Post screenshots or demo video", "Ask for honest feedback"] },
      { day: 15, tasks: ["Add one feature users asked for most", "Test it thoroughly", "Prepare for wider launch"] },
      { day: 16, tasks: ["Write launch post for Product Hunt/Twitter", "Create demo video or screenshots", "Prepare FAQ for common questions"] },
      { day: 17, tasks: ["Soft launch to friends and small communities", "Get 20 people using it", "Monitor for bugs and feedback"] },
      { day: 18, tasks: ["Fix critical bugs found in soft launch", "Improve performance issues", "Polish rough edges"] },
      { day: 19, tasks: ["Launch publicly on Product Hunt or Reddit", "Share on all social platforms", "Respond to every comment"] },
      { day: 20, tasks: ["Push updates based on launch feedback", "Reach out to power users personally", "Thank everyone who supported"] },
      { day: 21, tasks: ["Analyze what worked in launch", "Double down on best acquisition channel", "Post daily updates for visibility"] },
      { day: 22, tasks: ["Add analytics to track user behavior", "Identify drop-off points", "Plan improvements based on data"] },
      { day: 23, tasks: ["Build most-requested feature", "Test with existing users first", "Ship it publicly"] },
      { day: 24, tasks: ["Start thinking about monetization", "Survey users: would they pay?", "Research pricing models"] },
      { day: 25, tasks: ["If free: add premium tier or donations", "If paid: set up payment processing", "Test checkout flow thoroughly"] },
      { day: 26, tasks: ["Content marketing: write blog post or tutorial", "Share on relevant platforms", "Build SEO for long-term growth"] },
      { day: 27, tasks: ["Reach out to 10 potential users directly", "Get on calls if possible", "Convert them to users"] },
      { day: 28, tasks: ["Automate what you can (emails, onboarding)", "Set up basic customer support", "Create help docs or FAQ"] },
      { day: 29, tasks: ["Reflect: what worked, what didn't?", "Plan next 30 days of growth", "Set measurable goals"] },
      { day: 30, tasks: ["Celebrate shipping something real", "Share your full journey publicly", "Start planning v2 or new project"] }
    ]
  },
  music: {
    id: "music",
    title: "Producer Mode",
    icon: "🎵",
    color: "#bf5af2",
    description: "30 days to make music that doesn't suck",
    days: [
      { day: 1, tasks: ["Download and install a DAW (FL Studio, Ableton, or Logic)", "Learn the interface - where everything is", "Create your first 4-bar drum pattern"] },
      { day: 2, tasks: ["Learn basic music theory: major and minor scales", "Create a simple 4-bar melody in C major", "Layer it over your drums from yesterday"] },
      { day: 3, tasks: ["Understand chord progressions (I-V-vi-IV)", "Create a 4-chord progression", "Add bass notes that follow the chords"] },
      { day: 4, tasks: ["Explore 5 different synth presets", "Create a melody with your favorite preset", "Learn what ADSR envelope does"] },
      { day: 5, tasks: ["Recreate the drum pattern from a song you love", "Match the tempo and groove", "Understand what makes it work"] },
      { day: 6, tasks: ["Learn basic mixing: volume levels", "Balance drums, bass, and melody", "Make sure nothing is too loud or quiet"] },
      { day: 7, tasks: ["Create a full 8-bar loop (drums + bass + melody)", "Export it and listen outside your DAW", "Note what needs improvement"] },
      { day: 8, tasks: ["Learn about EQ (equalization)", "Cut muddy frequencies from bass", "Brighten up your melody with high-end boost"] },
      { day: 9, tasks: ["Add effects: reverb and delay", "Apply reverb to melody for space", "Use delay creatively on a sound"] },
      { day: 10, tasks: ["Learn song structure: intro, verse, chorus, bridge", "Plan out a 2-minute song structure", "Create variations for each section"] },
      { day: 11, tasks: ["Build your intro (8 bars)", "Build your verse (16 bars)", "Make them flow together"] },
      { day: 12, tasks: ["Create a chorus that hits harder than verse", "Add more energy: extra layers or louder drums", "Build tension before chorus drops"] },
      { day: 13, tasks: ["Learn sidechain compression", "Apply it to bass when kick hits", "Feel the pumping effect"] },
      { day: 14, tasks: ["Create a breakdown or bridge section", "Strip elements out then build back up", "Add a unique sound for this section"] },
      { day: 15, tasks: ["Learn panning for stereo width", "Pan hi-hats and percussion left/right", "Keep bass and kick centered"] },
      { day: 16, tasks: ["Study a reference track in your genre", "Analyze the arrangement and mix", "Note the frequency balance"] },
      { day: 17, tasks: ["Create a full song arrangement (intro to outro)", "Include all sections: verse, chorus, bridge", "Make it at least 2 minutes"] },
      { day: 18, tasks: ["Learn automation: volume, filters, effects", "Automate a filter sweep for buildup", "Automate volume for dynamic changes"] },
      { day: 19, tasks: ["Add vocal samples or vocal chops", "Process them with effects", "Make them fit the vibe"] },
      { day: 20, tasks: ["Learn about compression", "Compress your drums to punch harder", "Compress melody to sit in the mix"] },
      { day: 21, tasks: ["Focus on your low-end: kick and bass", "Make sure they don't clash", "Clean up with EQ if needed"] },
      { day: 22, tasks: ["Add transitions between sections", "Use risers, impacts, sweeps", "Make section changes feel intentional"] },
      { day: 23, tasks: ["Create an outro that resolves the song", "Fade elements out gradually", "End on a satisfying note"] },
      { day: 24, tasks: ["Mix your full track", "Balance all levels relative to each other", "Use reference track for comparison"] },
      { day: 25, tasks: ["Learn basic mastering concepts", "Apply limiter to increase loudness", "Don't destroy your dynamics"] },
      { day: 26, tasks: ["Export your track in high quality (WAV)", "Listen on different devices (headphones, phone, car)", "Note what needs fixing"] },
      { day: 27, tasks: ["Make final adjustments based on listening test", "Fix harsh frequencies or weak sections", "Polish until you're satisfied"] },
      { day: 28, tasks: ["Create basic album art or cover", "Write a track description", "Prepare for upload"] },
      { day: 29, tasks: ["Upload to SoundCloud or YouTube", "Share with at least 5 people", "Ask for honest feedback"] },
      { day: 30, tasks: ["Start your next track using what you learned", "Experiment with a different genre or style", "Celebrate finishing your first complete song"] }
    ]
  },
  chess: {
    id: "chess",
    title: "Chess Mastery",
    icon: "♟️",
    color: "#d4a574",
    description: "30 days from beginner to competitive chess player",
    days: [
      { day: 1, tasks: ["Learn how all pieces move (pawn, knight, bishop, rook, queen, king)", "Play 5 games against computer on easiest level", "Focus on not hanging pieces (leaving them undefended)"] },
      { day: 2, tasks: ["Learn castling, en passant, and pawn promotion rules", "Practice Scholar's Mate and how to defend against it", "Play 5 games - try to castle every game"] },
      { day: 3, tasks: ["Learn basic checkmate patterns: back rank mate, 2 rooks mate", "Practice checkmating lone king with queen + king", "Solve 10 checkmate-in-one puzzles"] },
      { day: 4, tasks: ["Study the 4 opening principles: control center, develop pieces, king safety, connect rooks", "Play 5 games focusing only on these principles", "Review games - did you follow the principles?"] },
      { day: 5, tasks: ["Learn one opening as white (e4 → Italian Game)", "Learn response as black (e4 e5 defense)", "Play 10 games using only these openings"] },
      { day: 6, tasks: ["Learn piece values (pawn=1, knight=3, bishop=3, rook=5, queen=9)", "Practice tactical vision: always check if you can win material", "Solve 15 'win material' puzzles"] },
      { day: 7, tasks: ["Study basic tactics: forks, pins, skewers", "Solve 20 tactical puzzles on chess.com or lichess", "Play 5 games looking for tactical opportunities"] },
      { day: 8, tasks: ["Learn discovered attacks and double attacks", "Find examples in your previous games", "Solve 20 puzzles focused on these tactics"] },
      { day: 9, tasks: ["Study removal of defender tactic", "Learn how to create threats that force your opponent to react", "Play 5 games trying to use this tactic"] },
      { day: 10, tasks: ["Review all tactics learned so far", "Solve 30 mixed tactical puzzles", "Analyze 2 of your losses - where did you miss tactics?"] },
      { day: 11, tasks: ["Learn basic endgame: king + pawn vs king", "Practice the square rule and opposition", "Play 10 king+pawn endgames against computer"] },
      { day: 12, tasks: ["Learn rook endgames: Lucena and Philidor positions", "Understand why rook behind passed pawn is strong", "Practice 5 rook endgame positions"] },
      { day: 13, tasks: ["Study middlegame planning: identify weaknesses", "Learn about pawn structure (isolated, doubled, passed pawns)", "Analyze 3 master games focusing on plans"] },
      { day: 14, tasks: ["Review week 1+2: play 10 games", "Focus on opening principles AND tactics", "Note your most common mistakes"] },
      { day: 15, tasks: ["Learn the Sicilian Defense as black", "Understand the key ideas and pawn breaks", "Play 10 games as black using Sicilian"] },
      { day: 16, tasks: ["Study weak squares and outposts", "Learn how knights dominate on strong squares", "Play 5 games trying to create outposts"] },
      { day: 17, tasks: ["Learn about piece activity vs material", "Sometimes sacrificing material for active pieces wins", "Solve 15 positional sacrifice puzzles"] },
      { day: 18, tasks: ["Study attacking the king: identifying weaknesses", "Learn the classic h-pawn storm attack", "Play 5 games going for kingside attacks"] },
      { day: 19, tasks: ["Learn defensive techniques: prophylaxis", "Understand how to stop your opponent's plans", "Play 5 games focusing on defense"] },
      { day: 20, tasks: ["Study time management in chess", "Play 10 rapid games (10 min) - practice making good moves quickly", "Review time usage in your games"] },
      { day: 21, tasks: ["Learn about space advantage", "Study how to play when you have more space", "Play 5 games trying to gain space"] },
      { day: 22, tasks: ["Study zugzwang and tempo in endgames", "Learn triangulation technique", "Practice complex endgame positions"] },
      { day: 23, tasks: ["Analyze a full game by a grandmaster (with commentary)", "Note the key moments and plans", "Try to predict moves before seeing them"] },
      { day: 24, tasks: ["Review all openings learned", "Play 15 games using your opening repertoire", "Note which positions you're comfortable with"] },
      { day: 25, tasks: ["Study typical middlegame sacrifices", "Learn Greek gift sacrifice (Bxh7+)", "Solve 20 sacrifice puzzles"] },
      { day: 26, tasks: ["Learn about initiative and maintaining pressure", "Study games where one side keeps attacking", "Play 5 games trying to maintain initiative"] },
      { day: 27, tasks: ["Practice calculation: calculate 3 moves deep", "Do exercises calculating forced sequences", "Solve 30 puzzles without moving pieces"] },
      { day: 28, tasks: ["Study your own games: analyze 10 recent games", "Use engine to find your mistakes", "Write down patterns you need to fix"] },
      { day: 29, tasks: ["Play a long tournament (20+ games in one day)", "Track your rating progress", "Note your mental stamina"] },
      { day: 30, tasks: ["Final test: play against 1600-rated bots", "Review everything you've learned", "Set goals for next 30 days of improvement"] }
    ]
  },
  quran: {
    id: "quran",
    title: "Quran Memorization",
    icon: "📿",
    color: "#00b894",
    description: "1 year to complete Hifz - 1 page per day with strong revision",
    days: [
      // MONTH 1: JUZ 30 - Days 1-30
      { day: 1, tasks: ["Memorize Al-Fatiha (7 ayat) after Fajr - repeat 50x", "Understand meaning of each ayah", "Recite in all 5 salah today"] },
      { day: 2, tasks: ["Memorize An-Nas (6 ayat) + Al-Falaq (5 ayat)", "Review Al-Fatiha 20x", "Link all three surahs smoothly"] },
      { day: 3, tasks: ["Memorize Al-Ikhlas (4 ayat) + Al-Masad (5 ayat)", "Review yesterday's surahs 15x", "Recite to someone for correction"] },
      { day: 4, tasks: ["Memorize An-Nasr (3 ayat) + Al-Kafirun (6 ayat)", "Review last 2 days", "Perfect tajweed on all surahs so far"] },
      { day: 5, tasks: ["Memorize Al-Kawthar (3 ayat) + Al-Ma'un (7 ayat)", "Review all 9 surahs from start", "Write first word of each ayah from memory"] },
      { day: 6, tasks: ["Memorize Quraysh (4 ayat) + Al-Fil (5 ayat)", "Review last 3 days", "Recite in salah"] },
      { day: 7, tasks: ["WEEKLY REVIEW - No new memorization", "Recite Al-Fatiha through Al-Fil completely", "Fix all mistakes with teacher"] },
      { day: 8, tasks: ["Memorize Al-Humazah (9 ayat)", "Review week 1 surahs", "Focus on connecting ayat smoothly"] },
      { day: 9, tasks: ["Memorize Al-'Asr (3 ayat) + At-Takathur (8 ayat)", "Review Al-Humazah 15x", "Understand deep meaning of Al-'Asr"] },
      { day: 10, tasks: ["Memorize Al-Qari'ah (11 ayat) - first day", "Repeat each ayah 20x", "Review last 3 surahs"] },
      { day: 11, tasks: ["Complete Al-Qari'ah review + Memorize Al-'Adiyat ayat 1-6", "Connect smoothly", "Review all week 2"] },
      { day: 12, tasks: ["Complete Al-'Adiyat (ayat 7-11)", "Recite full surah 15x", "Review Az-Zalzalah preparation"] },
      { day: 13, tasks: ["Memorize Az-Zalzalah (8 ayat)", "Review Al-'Adiyat + Al-Qari'ah", "Link last 5 surahs"] },
      { day: 14, tasks: ["WEEKLY REVIEW", "Recite all memorized (18 surahs) 2x", "Record yourself, fix mistakes"] },
      { day: 15, tasks: ["Memorize Al-Bayyinah ayat 1-4", "Review last week's surahs", "Maintain same mushaf"] },
      { day: 16, tasks: ["Complete Al-Bayyinah (ayat 5-8)", "Recite full surah 12x", "Review Az-Zalzalah"] },
      { day: 17, tasks: ["Memorize Al-Qadr (5 ayat) - Laylatul Qadr surah", "Repeat 40x due to importance", "Reflect on its meaning"] },
      { day: 18, tasks: ["Memorize Al-'Alaq ayat 1-10 (first revelation)", "These are first ayat revealed", "Repeat 20x"] },
      { day: 19, tasks: ["Complete Al-'Alaq (ayat 11-19)", "Connect both halves", "Review last 3 surahs"] },
      { day: 20, tasks: ["Memorize At-Tin (8 ayat)", "Review Al-'Alaq completely", "Recite in salah"] },
      { day: 21, tasks: ["WEEKLY REVIEW", "Recite Juz 30 progress completely", "Strengthen weakest 3 surahs"] },
      { day: 22, tasks: ["Memorize Ash-Sharh (8 ayat)", "Review At-Tin 15x", "Understand relief after hardship message"] },
      { day: 23, tasks: ["Memorize Ad-Duha (11 ayat)", "Review Ash-Sharh", "Feel the compassion in this surah"] },
      { day: 24, tasks: ["Memorize Al-Layl ayat 1-11", "Repeat 18x", "Review last 3 surahs"] },
      { day: 25, tasks: ["Complete Al-Layl (ayat 12-21)", "Connect full surah", "Review week 4 progress"] },
      { day: 26, tasks: ["Memorize Ash-Shams ayat 1-8", "Perfect pronunciation", "Review Al-Layl"] },
      { day: 27, tasks: ["Complete Ash-Shams (ayat 9-15)", "Recite complete 15x", "Review all week 4"] },
      { day: 28, tasks: ["WEEKLY REVIEW", "Recite all Juz 30 memorized", "Note problem areas"] },
      { day: 29, tasks: ["Memorize Al-Balad ayat 1-10", "Review last 5 surahs", "Maintain consistency"] },
      { day: 30, tasks: ["MONTHLY REVIEW", "Complete Al-Balad (11-20) + review entire month", "Recite full Juz 30 from memory"] },
      
      // MONTH 2: Complete Juz 30 + Start Juz 29 - Days 31-60
      { day: 31, tasks: ["Memorize Al-Fajr ayat 1-15", "Review Al-Balad", "New month, renewed commitment"] },
      { day: 32, tasks: ["Continue Al-Fajr ayat 16-30", "Connect both parts", "Review yesterday"] },
      { day: 33, tasks: ["Memorize Al-Ghashiyah ayat 1-13", "Review Al-Fajr", "Visualize Day of Judgment"] },
      { day: 34, tasks: ["Complete Al-Ghashiyah (ayat 14-26)", "Recite complete 12x", "Review both new surahs"] },
      { day: 35, tasks: ["WEEKLY REVIEW", "Recite from Al-Fajr to An-Nas", "Fix all mistakes"] },
      { day: 36, tasks: ["Memorize Al-A'la ayat 1-10", "Review Al-Ghashiyah", "Perfect makharij"] },
      { day: 37, tasks: ["Complete Al-A'la (ayat 11-19)", "Recite complete 15x", "Review last 3 surahs"] },
      { day: 38, tasks: ["Memorize At-Tariq (17 ayat)", "Review Al-A'la", "Understand the night star message"] },
      { day: 39, tasks: ["Memorize Al-Buruj ayat 1-12", "Review At-Tariq", "Reflect on faith stories"] },
      { day: 40, tasks: ["Complete Al-Buruj (ayat 13-22)", "Connect full surah", "Review week"] },
      { day: 41, tasks: ["Memorize Al-Inshiqaq ayat 1-13", "Review Al-Buruj", "Day of splitting sky"] },
      { day: 42, tasks: ["WEEKLY REVIEW", "Complete Juz 30 recitation 2x", "Juz 30 COMPLETE!" ] },
      { day: 43, tasks: ["Complete Al-Inshiqaq (ayat 14-25)", "Recite full surah", "Begin Juz 29 mindset"] },
      { day: 44, tasks: ["Memorize Al-Mutaffifin ayat 1-18 (page 1)", "Longer surah - take time", "Repeat 15x"] },
      { day: 45, tasks: ["Continue Al-Mutaffifin ayat 19-36 (page 2)", "Review first half", "Connect portions"] },
      { day: 46, tasks: ["Review Al-Mutaffifin + Memorize Al-Infitar ayat 1-10", "Maintain pace", "Don't rush"] },
      { day: 47, tasks: ["Complete Al-Infitar (ayat 11-19)", "Recite complete", "Review week"] },
      { day: 48, tasks: ["Memorize At-Takwir ayat 1-15", "Review Al-Infitar", "The folding of the sun"] },
      { day: 49, tasks: ["WEEKLY REVIEW", "Recite Juz 30 + new Juz 29 portions", "Strengthen weak areas"] },
      { day: 50, tasks: ["Complete At-Takwir (ayat 16-29)", "Connect full surah", "Review all Juz 29"] },
      { day: 51, tasks: ["Memorize 'Abasa ayat 1-21 (page 1)", "Prophet's lesson", "Repeat 15x"] },
      { day: 52, tasks: ["Continue 'Abasa ayat 22-42 (page 2)", "Complete surah", "Review both parts"] },
      { day: 53, tasks: ["Memorize An-Nazi'at ayat 1-23 (page 1)", "Angels pulling souls", "Take your time"] },
      { day: 54, tasks: ["Continue An-Nazi'at ayat 24-46 (page 2)", "Moses and Pharaoh story", "Connect smoothly"] },
      { day: 55, tasks: ["Memorize An-Naba' ayat 1-20 (page 1)", "The Great News", "Repeat 18x"] },
      { day: 56, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks completely", "Fix pronunciation"] },
      { day: 57, tasks: ["Continue An-Naba' ayat 21-40 (page 2)", "Complete surah", "Review An-Nazi'at"] },
      { day: 58, tasks: ["Memorize Al-Mursalat ayat 1-25 (page 1)", "Winds sent forth", "Repeat carefully"] },
      { day: 59, tasks: ["Continue Al-Mursalat ayat 26-50 (page 2)", "Complete surah", "Review 'Abasa"] },
      { day: 60, tasks: ["MONTHLY REVIEW", "Recite Juz 30 + Juz 29 portions", "Month 2 complete!"] },
      
      // MONTH 3: Juz 29 complete + Start Juz 28 - Days 61-90
      { day: 61, tasks: ["Memorize Al-Insan ayat 1-15 (page 1)", "Perfect man surah", "New month energy"] },
      { day: 62, tasks: ["Continue Al-Insan ayat 16-31 (page 2)", "Gardens of paradise", "Connect portions"] },
      { day: 63, tasks: ["WEEKLY REVIEW", "Recite Al-Mursalat through Al-Insan", "Strengthen new surahs"] },
      { day: 64, tasks: ["Memorize Al-Qiyamah ayat 1-20 (page 1)", "Resurrection Day", "Reflect deeply"] },
      { day: 65, tasks: ["Continue Al-Qiyamah ayat 21-40 (page 2)", "Complete surah", "Review Al-Insan"] },
      { day: 66, tasks: ["Memorize Al-Muddaththir ayat 1-28 (pages 1)", "O you wrapped", "Repeat 15x"] },
      { day: 67, tasks: ["Continue Al-Muddaththir ayat 29-56 (page 2)", "Complete long surah", "Review yesterday"] },
      { day: 68, tasks: ["Memorize Al-Muzzammil ayat 1-10 (page 1)", "Night prayer command", "Deep connection"] },
      { day: 69, tasks: ["Continue Al-Muzzammil ayat 11-20 (page 2)", "Complete surah", "Practice night recitation"] },
      { day: 70, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks Juz 29 portions", "Almost done Juz 29!"] },
      { day: 71, tasks: ["Memorize Al-Jinn ayat 1-14 (page 1)", "Jinn listening to Quran", "Unique surah"] },
      { day: 72, tasks: ["Continue Al-Jinn ayat 15-28 (page 2)", "Complete surah", "Review Al-Muzzammil"] },
      { day: 73, tasks: ["Memorize Nuh ayat 1-14 (page 1)", "Prophet Noah's story", "Repeat 18x"] },
      { day: 74, tasks: ["Continue Nuh ayat 15-28 (page 2)", "Complete surah", "Review Al-Jinn"] },
      { day: 75, tasks: ["Memorize Al-Ma'arij ayat 1-22 (page 1)", "Ways of ascent", "Take time"] },
      { day: 76, tasks: ["Continue Al-Ma'arij ayat 23-44 (page 2)", "Complete surah", "Review Nuh"] },
      { day: 77, tasks: ["WEEKLY REVIEW", "JUZ 29 COMPLETE!", "Recite entire Juz 29 from memory"] },
      { day: 78, tasks: ["Memorize Al-Haqqah ayat 1-26 (page 1)", "The Reality", "Begin with strength"] },
      { day: 79, tasks: ["Continue Al-Haqqah ayat 27-52 (page 2)", "Complete surah", "Review Ma'arij"] },
      { day: 80, tasks: ["Memorize Al-Qalam ayat 1-26 (page 1)", "The Pen", "Noon. By the pen."] },
      { day: 81, tasks: ["Continue Al-Qalam ayat 27-52 (page 2)", "Garden story complete", "Connect portions"] },
      { day: 82, tasks: ["Memorize Al-Mulk ayat 1-15 (page 1)", "The Sovereignty", "Blessed is He"] },
      { day: 83, tasks: ["Continue Al-Mulk ayat 16-30 (page 2)", "Complete powerful surah", "Review Al-Qalam"] },
      { day: 84, tasks: ["WEEKLY REVIEW + START JUZ 28", "Recite Juz 29 + begin Juz 28 portions", "2 Juz complete!"] },
      { day: 85, tasks: ["Memorize At-Tahrim ayat 1-6 (half page)", "O Prophet, why forbid", "Short but powerful"] },
      { day: 86, tasks: ["Complete At-Tahrim ayat 7-12", "Examples given", "Review yesterday"] },
      { day: 87, tasks: ["Memorize At-Talaq ayat 1-6 (page 1)", "Divorce laws", "Understand deeply"] },
      { day: 88, tasks: ["Complete At-Talaq ayat 7-12", "Recite complete", "Review At-Tahrim"] },
      { day: 89, tasks: ["Memorize At-Taghabun (18 ayat - page 1)", "Mutual loss and gain", "Repeat carefully"] },
      { day: 90, tasks: ["MONTHLY REVIEW", "Recite Juz 30 + 29 + new 28 portions", "3 months complete!"] },
      
      // MONTH 4-12: Days 91-365 - Continue systematic 1 page per day through remaining Juz
      { day: 91, tasks: ["Memorize Al-Munafiqun (11 ayat)", "The hypocrites", "Understand their traits"] },
      { day: 92, tasks: ["Memorize Al-Jumu'ah ayat 1-6", "Friday congregation", "Special importance"] },
      { day: 93, tasks: ["Complete Al-Jumu'ah ayat 7-11", "Friday prayer complete", "Review yesterday"] },
      { day: 94, tasks: ["Memorize As-Saff (14 ayat)", "The ranks", "Stand firm together"] },
      { day: 95, tasks: ["Memorize Al-Mumtahanah ayat 1-7 (page 1)", "She who is tested", "Complex surah"] },
      { day: 96, tasks: ["Continue Al-Mumtahanah ayat 8-13", "Complete", "Review As-Saff"] },
      { day: 97, tasks: ["Memorize Al-Hashr ayat 1-12 (page 1)", "The exile", "Banu Nadir story"] },
      { day: 98, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks portions", "Stay consistent"] },
      { day: 99, tasks: ["Continue Al-Hashr ayat 13-24 (page 2)", "Beautiful names", "Last 3 ayat profound"] },
      { day: 100, tasks: ["Memorize Al-Mujadilah ayat 1-11 (page 1)", "She who disputes", "Allah hears all"] },
      { day: 101, tasks: ["Continue Al-Mujadilah ayat 12-22 (page 2)", "Complete Juz 28!", "Major milestone"] },
      
      // Days 102-365: Continue pattern - 1 page per day through Juz 27 → Juz 1
      // Each Juz is ~20 pages, so roughly 20 days per Juz with reviews
      // Juz 27: Days 102-122 | Juz 26: Days 123-143 | Juz 25: Days 144-164
      // Juz 24: Days 165-185 | Juz 23: Days 186-206 | Juz 22: Days 207-227
      // Juz 21: Days 228-248 | Juz 20: Days 249-269 | Juz 19: Days 270-290
      // Juz 18-1: Days 291-365
      
      { day: 102, tasks: ["Begin Juz 27: Memorize Adh-Dhariyat p1", "Winds that scatter", "Fresh start"] },
      { day: 103, tasks: ["Continue Adh-Dhariyat p2", "Complete surah", "Review yesterday"] },
      { day: 104, tasks: ["Memorize At-Tur p1 (ayat 1-24)", "The Mount", "Powerful imagery"] },
      { day: 105, tasks: ["WEEKLY REVIEW", "Recite Juz 28 + new portions", "Stay strong"] },
      { day: 106, tasks: ["Continue At-Tur p2 (ayat 25-49)", "Complete", "Review Adh-Dhariyat"] },
      { day: 107, tasks: ["Memorize An-Najm p1 (ayat 1-31)", "The Star", "Prophet's night journey"] },
      { day: 108, tasks: ["Continue An-Najm p2 (ayat 32-62)", "Complete", "Powerful ending"] },
      { day: 109, tasks: ["Memorize Al-Qamar p1 (ayat 1-28)", "The Moon", "Moon split"] },
      { day: 110, tasks: ["Continue Al-Qamar p2 (ayat 29-55)", "Complete", "Nations destroyed"] },
      { day: 111, tasks: ["Memorize Ar-Rahman p1 (ayat 1-39)", "The Beneficent", "Most beautiful surah"] },
      { day: 112, tasks: ["WEEKLY REVIEW", "Recite Juz 27 progress", "Perfect new portions"] },
      { day: 113, tasks: ["Continue Ar-Rahman p2 (ayat 40-78)", "Complete", "Which favors deny?"] },
      { day: 114, tasks: ["Memorize Al-Waqi'ah p1 (ayat 1-50)", "The Event", "Day of Judgment"] },
      { day: 115, tasks: ["Continue Al-Waqi'ah p2 (ayat 51-96)", "Complete", "Three groups"] },
      { day: 116, tasks: ["Memorize Al-Hadid p1 (ayat 1-15)", "The Iron", "Allah's power"] },
      { day: 117, tasks: ["Continue Al-Hadid p2 (ayat 16-29)", "Complete Juz 27!", "Review week"] },
      { day: 118, tasks: ["Begin Juz 26: Memorize Al-Mujadilah remaining portions", "Continue forward", "Never stop"] },
      { day: 119, tasks: ["WEEKLY REVIEW", "Recite Juz 27 complete", "Strengthen all"] },
      { day: 120, tasks: ["MONTHLY REVIEW - 4 months!", "Recite 4 complete Juz", "Alhamdulillah"] },
      
      // Days 121-150: Continue through Juz 26-25
      { day: 121, tasks: ["Memorize Al-Ahqaf p1 (page 503)", "Winding sand tracts", "1 page focus"] },
      { day: 122, tasks: ["Memorize Al-Ahqaf p2 (page 504)", "Continue", "Review yesterday"] },
      { day: 123, tasks: ["Memorize Al-Ahqaf p3 (page 505)", "Complete surah", "Connect portions"] },
      { day: 124, tasks: ["Memorize Muhammad p1 (page 506)", "Prophet's surah", "Battle guidance"] },
      { day: 125, tasks: ["Memorize Muhammad p2 (page 507)", "Continue", "Paradise description"] },
      { day: 126, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks", "Fix mistakes"] },
      { day: 127, tasks: ["Memorize Al-Fath p1 (page 511)", "The Victory", "Hudaybiyyah"] },
      { day: 128, tasks: ["Memorize Al-Fath p2 (page 512)", "Continue", "Great victory"] },
      { day: 129, tasks: ["Memorize Al-Fath p3 (page 513)", "Complete", "Review full surah"] },
      { day: 130, tasks: ["Memorize Al-Hujurat p1 (page 515)", "The rooms", "Manners taught"] },
      { day: 131, tasks: ["Memorize Al-Hujurat p2 (page 516)", "Complete", "Brotherhood ayah"] },
      { day: 132, tasks: ["Memorize Qaf p1 (page 518)", "Letter Qaf", "Creation signs"] },
      { day: 133, tasks: ["WEEKLY REVIEW", "Recite Juz 26 portions", "Almost done"] },
      { day: 134, tasks: ["Memorize Qaf p2 (page 519)", "Continue", "Recording angels"] },
      { day: 135, tasks: ["Memorize Qaf p3 (page 520)", "Complete Juz 26!", "6 Juz done"] },
      { day: 136, tasks: ["Begin Juz 25: Memorize Fussilat p1 (page 477)", "Explained in detail", "New Juz"] },
      { day: 137, tasks: ["Memorize Fussilat p2 (page 478)", "Continue", "Ad and Thamud"] },
      { day: 138, tasks: ["Memorize Fussilat p3 (page 479)", "Continue", "6 days creation"] },
      { day: 139, tasks: ["Memorize Fussilat p4 (page 480)", "Complete", "Angels descend"] },
      { day: 140, tasks: ["WEEKLY REVIEW", "Recite Juz 25 start", "Maintain pace"] },
      { day: 141, tasks: ["Memorize Ash-Shura p1 (page 483)", "Consultation", "Revelation described"] },
      { day: 142, tasks: ["Memorize Ash-Shura p2 (page 484)", "Continue", "Unity message"] },
      { day: 143, tasks: ["Memorize Ash-Shura p3 (page 485)", "Complete", "Review full"] },
      { day: 144, tasks: ["Memorize Az-Zukhruf p1 (page 489)", "Gold ornaments", "Worldly life"] },
      { day: 145, tasks: ["Memorize Az-Zukhruf p2 (page 490)", "Continue", "Ibrahim's story"] },
      { day: 146, tasks: ["Memorize Az-Zukhruf p3 (page 491)", "Complete", "Pharaoh's fate"] },
      { day: 147, tasks: ["WEEKLY REVIEW", "Recite week progress", "Stay consistent"] },
      { day: 148, tasks: ["Memorize Ad-Dukhan p1 (page 496)", "The smoke", "Night of decree"] },
      { day: 149, tasks: ["Memorize Ad-Dukhan p2 (page 497)", "Complete", "Pharaoh punished"] },
      { day: 150, tasks: ["MONTHLY REVIEW - 5 months!", "Recite 5 Juz complete", "Halfway energy"] },
      
      // Days 151-180: Juz 24-23
      { day: 151, tasks: ["Memorize Al-Jathiyah p1 (page 499)", "Crouching", "Signs in creation"] },
      { day: 152, tasks: ["Memorize Al-Jathiyah p2 (page 500)", "Complete Juz 25", "Review yesterday"] },
      { day: 153, tasks: ["Begin Juz 24: Memorize Az-Zumar p1 (page 458)", "The groups", "Sincere worship"] },
      { day: 154, tasks: ["Memorize Az-Zumar p2 (page 459)", "Continue", "Ibrahim's creed"] },
      { day: 155, tasks: ["Memorize Az-Zumar p3 (page 460)", "Continue", "Take your time"] },
      { day: 156, tasks: ["WEEKLY REVIEW", "Recite Juz 24 start", "Perfect new"] },
      { day: 157, tasks: ["Memorize Az-Zumar p4 (page 461)", "Continue", "Shaytan's warning"] },
      { day: 158, tasks: ["Memorize Az-Zumar p5 (page 462)", "Complete long surah", "Review full"] },
      { day: 159, tasks: ["Memorize Ghafir p1 (page 467)", "The Forgiver", "Believer's plea"] },
      { day: 160, tasks: ["Memorize Ghafir p2 (page 468)", "Continue", "Pharaoh's magician"] },
      { day: 161, tasks: ["Memorize Ghafir p3 (page 469)", "Continue", "Strong message"] },
      { day: 162, tasks: ["Memorize Ghafir p4 (page 470)", "Complete", "Review portions"] },
      { day: 163, tasks: ["WEEKLY REVIEW", "Recite Juz 24 progress", "Nearly done"] },
      { day: 164, tasks: ["Review Ghafir + remaining Juz 24", "Complete Juz 24!", "7 Juz complete"] },
      { day: 165, tasks: ["Begin Juz 23: Memorize Ya-Sin p1 (page 440)", "Heart of Quran", "Special day"] },
      { day: 166, tasks: ["Memorize Ya-Sin p2 (page 441)", "Continue", "Town's story"] },
      { day: 167, tasks: ["Memorize Ya-Sin p3 (page 442)", "Continue", "Creation signs"] },
      { day: 168, tasks: ["Memorize Ya-Sin p4 (page 443)", "Complete", "Review beautiful surah"] },
      { day: 169, tasks: ["Memorize As-Saffat p1 (page 446)", "Those ranged in ranks", "Angels lined"] },
      { day: 170, tasks: ["WEEKLY REVIEW", "Recite Juz 23 start", "Ya-Sin perfect"] },
      { day: 171, tasks: ["Memorize As-Saffat p2 (page 447)", "Continue", "Ibrahim's sacrifice"] },
      { day: 172, tasks: ["Memorize As-Saffat p3 (page 448)", "Continue", "Stories"] },
      { day: 173, tasks: ["Memorize As-Saffat p4 (page 449)", "Complete", "Review all"] },
      { day: 174, tasks: ["Memorize Sad p1 (page 453)", "Letter Sad", "Dawud's trial"] },
      { day: 175, tasks: ["Memorize Sad p2 (page 454)", "Continue", "Sulayman's story"] },
      { day: 176, tasks: ["Memorize Sad p3 (page 455)", "Complete", "Iblis's oath"] },
      { day: 177, tasks: ["WEEKLY REVIEW", "Recite Juz 23 complete", "8 Juz done!"] },
      { day: 178, tasks: ["Review entire Juz 23", "Strengthen all portions", "Perfect Ya-Sin"] },
      { day: 179, tasks: ["Begin Juz 22: Memorize Al-Ahzab p1 (page 418)", "The confederates", "Major surah"] },
      { day: 180, tasks: ["MONTHLY REVIEW - 6 months!", "Recite 6 complete Juz", "Halfway there!"] },
      
      // Days 181-210: Juz 22-21
      { day: 181, tasks: ["Memorize Al-Ahzab p2 (page 419)", "Continue", "Adoption rules"] },
      { day: 182, tasks: ["Memorize Al-Ahzab p3 (page 420)", "Continue", "Hijab commandment"] },
      { day: 183, tasks: ["Memorize Al-Ahzab p4 (page 421)", "Continue", "Trench battle"] },
      { day: 184, tasks: ["WEEKLY REVIEW", "Recite Juz 22 start", "Al-Ahzab progress"] },
      { day: 185, tasks: ["Memorize Al-Ahzab p5 (page 422)", "Continue", "Complex surah"] },
      { day: 186, tasks: ["Memorize Al-Ahzab p6 (page 423)", "Complete", "Major completion"] },
      { day: 187, tasks: ["Memorize Saba p1 (page 428)", "Sheba", "Dawud's gratitude"] },
      { day: 188, tasks: ["Memorize Saba p2 (page 429)", "Continue", "Queen's kingdom"] },
      { day: 189, tasks: ["Memorize Saba p3 (page 430)", "Complete", "Review yesterday"] },
      { day: 190, tasks: ["Memorize Fatir p1 (page 434)", "The Originator", "Angels' wings"] },
      { day: 191, tasks: ["WEEKLY REVIEW", "Recite Juz 22 progress", "Stay strong"] },
      { day: 192, tasks: ["Memorize Fatir p2 (page 435)", "Continue", "Creation described"] },
      { day: 193, tasks: ["Memorize Fatir p3 (page 436)", "Complete Juz 22!", "9 Juz complete"] },
      { day: 194, tasks: ["Begin Juz 21: Memorize Al-Ankabut p1 (page 396)", "The spider", "Tests described"] },
      { day: 195, tasks: ["Memorize Al-Ankabut p2 (page 397)", "Continue", "Nuh's story"] },
      { day: 196, tasks: ["Memorize Al-Ankabut p3 (page 398)", "Continue", "Lot's story"] },
      { day: 197, tasks: ["Memorize Al-Ankabut p4 (page 399)", "Complete", "Review all"] },
      { day: 198, tasks: ["WEEKLY REVIEW", "Recite Juz 21 start", "Perfect new"] },
      { day: 199, tasks: ["Memorize Ar-Rum p1 (page 404)", "The Romans", "Byzantines' victory"] },
      { day: 200, tasks: ["Memorize Ar-Rum p2 (page 405)", "Continue", "Creation signs"] },
      { day: 201, tasks: ["Memorize Ar-Rum p3 (page 406)", "Complete", "Review yesterday"] },
      { day: 202, tasks: ["Memorize Luqman p1 (page 411)", "Luqman", "Wise advice"] },
      { day: 203, tasks: ["Memorize Luqman p2 (page 412)", "Complete", "Father's counsel"] },
      { day: 204, tasks: ["Memorize As-Sajdah p1 (page 415)", "Prostration", "32 ayat"] },
      { day: 205, tasks: ["WEEKLY REVIEW", "Recite Juz 21 progress", "Almost done"] },
      { day: 206, tasks: ["Complete As-Sajdah + review Juz 21", "Juz 21 complete!", "10 Juz done"] },
      { day: 207, tasks: ["Begin Juz 20: Memorize An-Naml p1 (page 377)", "The ants", "Sulayman"] },
      { day: 208, tasks: ["Memorize An-Naml p2 (page 378)", "Continue", "Hoopoe story"] },
      { day: 209, tasks: ["Memorize An-Naml p3 (page 379)", "Continue", "Queen of Sheba"] },
      { day: 210, tasks: ["MONTHLY REVIEW - 7 months!", "Recite 7 Juz complete", "Strong finish"] },
      
      // Days 211-240: Juz 20-19
      { day: 211, tasks: ["Memorize An-Naml p4 (page 380)", "Complete", "Powerful ending"] },
      { day: 212, tasks: ["WEEKLY REVIEW", "Recite Juz 20 start", "Perfect portions"] },
      { day: 213, tasks: ["Memorize Al-Qasas p1 (page 385)", "The stories", "Musa's birth"] },
      { day: 214, tasks: ["Memorize Al-Qasas p2 (page 386)", "Continue", "Burning bush"] },
      { day: 215, tasks: ["Memorize Al-Qasas p3 (page 387)", "Continue", "Qarun's story"] },
      { day: 216, tasks: ["Memorize Al-Qasas p4 (page 388)", "Continue", "Long surah"] },
      { day: 217, tasks: ["Memorize Al-Qasas p5 (page 389)", "Complete", "Major milestone"] },
      { day: 218, tasks: ["Review entire Juz 20", "Juz 20 complete!", "11 Juz done"] },
      { day: 219, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks", "Strengthen weak"] },
      { day: 220, tasks: ["Begin Juz 19: Memorize Maryam p1 (page 305)", "Mary", "Beautiful surah"] },
      { day: 221, tasks: ["Memorize Maryam p2 (page 306)", "Continue", "Isa's birth"] },
      { day: 222, tasks: ["Memorize Maryam p3 (page 307)", "Continue", "Ibrahim mention"] },
      { day: 223, tasks: ["Memorize Maryam p4 (page 308)", "Complete", "Review beautiful"] },
      { day: 224, tasks: ["Memorize Ta-Ha p1 (page 312)", "Ta-Ha", "Musa's calling"] },
      { day: 225, tasks: ["Memorize Ta-Ha p2 (page 313)", "Continue", "Magicians believe"] },
      { day: 226, tasks: ["WEEKLY REVIEW", "Recite Juz 19 start", "Stay consistent"] },
      { day: 227, tasks: ["Memorize Ta-Ha p3 (page 314)", "Continue", "Golden calf"] },
      { day: 228, tasks: ["Memorize Ta-Ha p4 (page 315)", "Continue", "Adam's story"] },
      { day: 229, tasks: ["Memorize Ta-Ha p5 (page 316)", "Complete", "Long surah done"] },
      { day: 230, tasks: ["Memorize Al-Anbiya p1 (page 322)", "The prophets", "Judgment near"] },
      { day: 231, tasks: ["Memorize Al-Anbiya p2 (page 323)", "Continue", "Many prophets"] },
      { day: 232, tasks: ["Memorize Al-Anbiya p3 (page 324)", "Continue", "Ibrahim's story"] },
      { day: 233, tasks: ["WEEKLY REVIEW", "Recite Juz 19 progress", "Perfect new"] },
      { day: 234, tasks: ["Memorize Al-Anbiya p4 (page 325)", "Continue", "Lot, Nuh"] },
      { day: 235, tasks: ["Memorize Al-Anbiya p5 (page 326)", "Continue", "Dawud, Sulayman"] },
      { day: 236, tasks: ["Memorize Al-Anbiya p6 (page 327)", "Continue", "Ayyub, Yunus"] },
      { day: 237, tasks: ["Memorize Al-Anbiya p7 (page 328)", "Complete", "Many prophets covered"] },
      { day: 238, tasks: ["Memorize Al-Hajj p1 (page 332)", "The pilgrimage", "Earthquake"] },
      { day: 239, tasks: ["Memorize Al-Hajj p2 (page 333)", "Continue", "Hajj rites"] },
      { day: 240, tasks: ["MONTHLY REVIEW - 8 months!", "Recite 8 Juz", "Two-thirds done!"] },
      
      // Days 241-270: Juz 18-17
      { day: 241, tasks: ["Memorize Al-Hajj p3 (page 334)", "Continue", "Permission to fight"] },
      { day: 242, tasks: ["Memorize Al-Hajj p4 (page 335)", "Complete Juz 19!", "12 Juz complete"] },
      { day: 243, tasks: ["Begin Juz 18: Memorize Al-Mu'minun p1 (page 342)", "The believers", "Successful believers"] },
      { day: 244, tasks: ["Memorize Al-Mu'minun p2 (page 343)", "Continue", "Creation stages"] },
      { day: 245, tasks: ["Memorize Al-Mu'minun p3 (page 344)", "Continue", "Prophets' stories"] },
      { day: 246, tasks: ["Memorize Al-Mu'minun p4 (page 345)", "Complete", "Review all"] },
      { day: 247, tasks: ["WEEKLY REVIEW", "Recite Juz 18 start", "Perfect new portions"] },
      { day: 248, tasks: ["Memorize An-Nur p1 (page 350)", "The light", "Modesty commands"] },
      { day: 249, tasks: ["Memorize An-Nur p2 (page 351)", "Continue", "Slander punishment"] },
      { day: 250, tasks: ["Memorize An-Nur p3 (page 352)", "Continue", "Light verse"] },
      { day: 251, tasks: ["Memorize An-Nur p4 (page 353)", "Complete", "Beautiful surah"] },
      { day: 252, tasks: ["Memorize Al-Furqan p1 (page 359)", "The criterion", "Musa mentioned"] },
      { day: 253, tasks: ["Memorize Al-Furqan p2 (page 360)", "Continue", "Idols powerless"] },
      { day: 254, tasks: ["WEEKLY REVIEW", "Recite Juz 18 progress", "Stay focused"] },
      { day: 255, tasks: ["Memorize Al-Furqan p3 (page 361)", "Complete Juz 18!", "13 Juz done"] },
      { day: 256, tasks: ["Begin Juz 17: Memorize Al-Anbiya remaining + Ash-Shu'ara p1", "The poets", "New Juz"] },
      { day: 257, tasks: ["Memorize Ash-Shu'ara p2 (page 367)", "Continue", "Musa's story long"] },
      { day: 258, tasks: ["Memorize Ash-Shu'ara p3 (page 368)", "Continue", "Magicians submit"] },
      { day: 259, tasks: ["Memorize Ash-Shu'ara p4 (page 369)", "Continue", "Ibrahim's story"] },
      { day: 260, tasks: ["Memorize Ash-Shu'ara p5 (page 370)", "Continue", "Nuh's story"] },
      { day: 261, tasks: ["WEEKLY REVIEW", "Recite Juz 17 start", "Long surah pace"] },
      { day: 262, tasks: ["Memorize Ash-Shu'ara p6 (page 371)", "Continue", "Hud, Salih"] },
      { day: 263, tasks: ["Memorize Ash-Shu'ara p7 (page 372)", "Continue", "Lot, Shu'ayb"] },
      { day: 264, tasks: ["Memorize Ash-Shu'ara p8 (page 373)", "Complete", "Long surah complete"] },
      { day: 265, tasks: ["Review entire Juz 17", "Complete Juz 17!", "14 Juz done"] },
      { day: 266, tasks: ["Begin Juz 16: Memorize Al-Kahf p1 (page 293)", "The cave", "Friday surah"] },
      { day: 267, tasks: ["Memorize Al-Kahf p2 (page 294)", "Continue", "Cave people"] },
      { day: 268, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks", "Strengthen all"] },
      { day: 269, tasks: ["Memorize Al-Kahf p3 (page 295)", "Continue", "Gardens owner"] },
      { day: 270, tasks: ["MONTHLY REVIEW - 9 months!", "Recite 9 Juz complete", "Final push begins!"] },
      
      // Days 271-300: Juz 16-15-14
      { day: 271, tasks: ["Memorize Al-Kahf p4 (page 296)", "Continue", "Dhul-Qarnayn"] },
      { day: 272, tasks: ["Memorize Al-Kahf p5 (page 297)", "Continue", "Musa & Khidr"] },
      { day: 273, tasks: ["Memorize Al-Kahf p6 (page 298)", "Complete", "Beloved surah done"] },
      { day: 274, tasks: ["Memorize Bani Isra'il p1 (page 282)", "Night journey", "Isra miracle"] },
      { day: 275, tasks: ["WEEKLY REVIEW", "Recite Juz 16 progress", "Almost done"] },
      { day: 276, tasks: ["Memorize Bani Isra'il p2 (page 283)", "Continue", "Parents' rights"] },
      { day: 277, tasks: ["Memorize Bani Isra'il p3 (page 284)", "Continue", "Do not kill"] },
      { day: 278, tasks: ["Memorize Bani Isra'il p4 (page 285)", "Continue", "Travel commands"] },
      { day: 279, tasks: ["Memorize Bani Isra'il p5 (page 286)", "Complete Juz 16!", "15 Juz complete"] },
      { day: 280, tasks: ["Begin Juz 15: Memorize An-Nahl p1 (page 267)", "The bee", "Blessings"] },
      { day: 281, tasks: ["Memorize An-Nahl p2 (page 268)", "Continue", "Honey verse"] },
      { day: 282, tasks: ["WEEKLY REVIEW", "Recite Juz 15 start", "Perfect new"] },
      { day: 283, tasks: ["Memorize An-Nahl p3 (page 269)", "Continue", "Gratitude call"] },
      { day: 284, tasks: ["Memorize An-Nahl p4 (page 270)", "Continue", "Ibrahim's creed"] },
      { day: 285, tasks: ["Memorize An-Nahl p5 (page 271)", "Complete", "Blessing surah done"] },
      { day: 286, tasks: ["Review Juz 15 + prep Juz 14", "Strong review", "Moving fast now"] },
      { day: 287, tasks: ["Begin Juz 14: Memorize Al-Hijr p1 (page 262)", "Rocky tract", "Protection promise"] },
      { day: 288, tasks: ["Memorize Al-Hijr p2 (page 263)", "Complete Juz 15!", "16 Juz done"] },
      { day: 289, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks", "Strong finish coming"] },
      { day: 290, tasks: ["Memorize Ibrahim p1 (page 255)", "Abraham", "Prophets' prayers"] },
      { day: 291, tasks: ["Memorize Ibrahim p2 (page 256)", "Complete", "Beautiful duas"] },
      { day: 292, tasks: ["Memorize Ar-Ra'd p1 (page 249)", "The thunder", "Believers described"] },
      { day: 293, tasks: ["Memorize Ar-Ra'd p2 (page 250)", "Complete Juz 14!", "17 Juz complete"] },
      { day: 294, tasks: ["Begin Juz 13: Memorize Yusuf p1 (page 235)", "Joseph", "Best story"] },
      { day: 295, tasks: ["Memorize Yusuf p2 (page 236)", "Continue", "Dream interpretation"] },
      { day: 296, tasks: ["WEEKLY REVIEW", "Recite Juz 13 start", "Beautiful Yusuf"] },
      { day: 297, tasks: ["Memorize Yusuf p3 (page 237)", "Continue", "Aziz's wife"] },
      { day: 298, tasks: ["Memorize Yusuf p4 (page 238)", "Continue", "Prison years"] },
      { day: 299, tasks: ["Memorize Yusuf p5 (page 239)", "Continue", "King's dream"] },
      { day: 300, tasks: ["MONTHLY REVIEW - 10 months!", "Recite 10 Juz", "Almost there!"] },
      
      // Days 301-330: Juz 13-12-11
      { day: 301, tasks: ["Memorize Yusuf p6 (page 240)", "Continue", "Brothers return"] },
      { day: 302, tasks: ["Memorize Yusuf p7 (page 241)", "Continue", "Binyamin taken"] },
      { day: 303, tasks: ["WEEKLY REVIEW", "Recite Yusuf portions", "Beautiful story"] },
      { day: 304, tasks: ["Memorize Yusuf p8 (page 242)", "Complete", "Reunion beautiful"] },
      { day: 305, tasks: ["Memorize Hud p1 (page 221)", "Hud", "Many prophets"] },
      { day: 306, tasks: ["Memorize Hud p2 (page 222)", "Continue", "Nuh's ark"] },
      { day: 307, tasks: ["Memorize Hud p3 (page 223)", "Continue", "Hud's people"] },
      { day: 308, tasks: ["Memorize Hud p4 (page 224)", "Continue", "Salih's camel"] },
      { day: 309, tasks: ["Memorize Hud p5 (page 225)", "Continue", "Ibrahim's guests"] },
      { day: 310, tasks: ["WEEKLY REVIEW", "Recite Juz 12-13 portions", "Stay strong"] },
      { day: 311, tasks: ["Memorize Hud p6 (page 226)", "Continue", "Lot's story"] },
      { day: 312, tasks: ["Memorize Hud p7 (page 227)", "Continue", "Shu'ayb's people"] },
      { day: 313, tasks: ["Memorize Hud p8 (page 228)", "Complete Juz 13!", "18 Juz done"] },
      { day: 314, tasks: ["Begin Juz 12: Memorize Yunus p1 (page 208)", "Jonah", "Prophet Yunus"] },
      { day: 315, tasks: ["Memorize Yunus p2 (page 209)", "Continue", "His people believe"] },
      { day: 316, tasks: ["Memorize Yunus p3 (page 210)", "Continue", "Signs everywhere"] },
      { day: 317, tasks: ["WEEKLY REVIEW", "Recite Juz 12 start", "Perfect new"] },
      { day: 318, tasks: ["Memorize Yunus p4 (page 211)", "Continue", "Musa & Pharaoh"] },
      { day: 319, tasks: ["Memorize Yunus p5 (page 212)", "Complete", "Review all"] },
      { day: 320, tasks: ["Memorize At-Tawbah ending portions p1", "Repentance", "Final Juz 11"] },
      { day: 321, tasks: ["Memorize At-Tawbah p2", "Continue", "Tabuk expedition"] },
      { day: 322, tasks: ["Memorize At-Tawbah p3", "Complete Juz 12!", "19 Juz complete"] },
      { day: 323, tasks: ["Begin Juz 11: Memorize At-Tawbah remaining p1", "Continue Tawbah", "No Bismillah"] },
      { day: 324, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks", "Energy rising"] },
      { day: 325, tasks: ["Memorize At-Tawbah p2", "Continue", "Hypocrites exposed"] },
      { day: 326, tasks: ["Memorize At-Tawbah p3", "Continue", "Believers praised"] },
      { day: 327, tasks: ["Memorize At-Tawbah p4", "Continue", "Masjid al-Dirar"] },
      { day: 328, tasks: ["Memorize At-Tawbah p5", "Complete", "Long surah done"] },
      { day: 329, tasks: ["Review entire Juz 11", "Juz 11 complete!", "20 Juz done"] },
      { day: 330, tasks: ["MONTHLY REVIEW - 11 months!", "Recite 11 Juz", "Final month ahead!"] },
      
      // Days 331-365: Final Juz 10-1 (FINAL PUSH!)
      { day: 331, tasks: ["WEEKLY REVIEW", "Recite last month portions", "Final month begins!"] },
      { day: 332, tasks: ["Begin Juz 10: Memorize Al-Anfal p1 (page 177)", "Spoils of war", "Badr battle"] },
      { day: 333, tasks: ["Memorize Al-Anfal p2 (page 178)", "Continue", "Victory guidance"] },
      { day: 334, tasks: ["Memorize Al-Anfal p3 (page 179)", "Complete", "Review yesterday"] },
      { day: 335, tasks: ["Memorize Al-A'raf p1 (page 151)", "Heights", "Long surah begins"] },
      { day: 336, tasks: ["Memorize Al-A'raf p2 (page 152)", "Continue", "Adam's story"] },
      { day: 337, tasks: ["Memorize Al-A'raf p3 (page 153)", "Continue", "Nuh mentioned"] },
      { day: 338, tasks: ["WEEKLY REVIEW", "Recite Juz 10 progress", "Almost there!"] },
      { day: 339, tasks: ["Memorize Al-A'raf p4 (page 154)", "Continue", "Hud mentioned"] },
      { day: 340, tasks: ["Memorize Al-A'raf p5 (page 155)", "Continue", "Many prophets"] },
      { day: 341, tasks: ["Memorize Al-A'raf p6 (page 156)", "Continue", "Musa's story long"] },
      { day: 342, tasks: ["Memorize Al-A'raf p7 (page 157)", "Complete Juz 10!", "21 Juz complete"] },
      { day: 343, tasks: ["Begin Juz 9-8-7-6: Rapid completion mode", "An'am p1 (page 128)", "Sprint to finish!"] },
      { day: 344, tasks: ["Memorize An'am p2", "Continue", "Cattle surah"] },
      { day: 345, tasks: ["WEEKLY REVIEW", "Recite all recent", "Final push!"] },
      { day: 346, tasks: ["Memorize An'am p3", "Complete", "Review"] },
      { day: 347, tasks: ["Memorize Al-Ma'idah p1 (page 106)", "The table", "Final commandments"] },
      { day: 348, tasks: ["Memorize Al-Ma'idah p2", "Continue", "Covenants"] },
      { day: 349, tasks: ["Memorize Al-Ma'idah p3", "Complete Juz 7-6!", "Multiple Juz"] },
      { day: 350, tasks: ["Memorize An-Nisa p1 (page 77)", "Women", "Rights detailed"] },
      { day: 351, tasks: ["Memorize An-Nisa p2", "Continue", "Orphans' rights"] },
      { day: 352, tasks: ["WEEKLY REVIEW", "Recite last 2 weeks", "SO CLOSE!"] },
      { day: 353, tasks: ["Memorize An-Nisa p3", "Continue", "Inheritance laws"] },
      { day: 354, tasks: ["Memorize An-Nisa p4", "Complete Juz 5-4!", "Almost done!"] },
      { day: 355, tasks: ["Memorize Al Imran p1 (page 50)", "Family of Imran", "Second longest"] },
      { day: 356, tasks: ["Memorize Al Imran p2", "Continue", "Uhud battle"] },
      { day: 357, tasks: ["Memorize Al Imran p3", "Continue", "Unity call"] },
      { day: 358, tasks: ["Memorize Al Imran p4", "Complete Juz 3!", "24 Juz done!"] },
      { day: 359, tasks: ["WEEKLY REVIEW", "Recite all recent Juz", "FINAL WEEK!"] },
      { day: 360, tasks: ["MONTHLY REVIEW", "Recite 12 complete Juz", "FINAL DAYS!"] },
      { day: 361, tasks: ["Begin Juz 2-1: Al-Baqarah p1 (page 2)", "The longest surah", "Al-Baqarah begins"] },
      { day: 362, tasks: ["Memorize Al-Baqarah p2", "Continue", "Faith vs disbelief"] },
      { day: 363, tasks: ["Memorize Al-Baqarah p3", "Continue", "Bani Israel's tests"] },
      { day: 364, tasks: ["Memorize Al-Baqarah p4", "Continue", "Qibla change"] },
      { day: 365, tasks: ["COMPLETE AL-BAQARAH!", "QURAN MEMORIZATION COMPLETE!", "Alhamdulillah - Hafiz achieved!"] }
    ]
  }
};

function getTreeProgress(treeKey, treeProgress) {
  const tree = SKILL_TREES[treeKey];
  const prog = (treeProgress || {})[treeKey] || {};
  const totalSteps = tree.skills.reduce((a, s) => a + s.steps.length, 0);
  const doneSteps = tree.skills.reduce((a, s) => a + s.steps.filter((_, i) => prog[s.id + "_" + i]).length, 0);
  return totalSteps > 0 ? doneSteps / totalSteps : 0;
}

function getAvailableTreeChallenges(treeKey, treeProgress, savedChallenges) {
  const pct = getTreeProgress(treeKey, treeProgress);
  const pool = TREE_CHALLENGES[treeKey] || [];
  const RANK_UNLOCK = { D: 0, C: 0.33, B: 0.66, A: 1.0 };
  return pool
    .filter(c => pct >= RANK_UNLOCK[c.rank])
    .map(c => {
      const saved = (savedChallenges || []).find(s => s.id === c.id);
      return saved ? { ...c, ...saved, treeKey } : { ...c, treeKey, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: c.tasks.map(t => ({ ...t, done: false })) };
    });
}

// ─── Default State ────────────────────────────────────────────────────────────
const defaultState = {
  hunter: { name: "Hunter", class: "Fighter" },
  level: 1, exp: 0, totalExp: 0,
  stats: { strength: 10, agility: 10, intelligence: 10, vitality: 10, perception: 10 },
  statPoints: 0,
  roadmapProgress: {}, // Format: { roadmapId: { day: { taskIndex: true/false } } }
  customRoadmaps: [], // User-created roadmaps
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
  activeTrees: [],
  treeProgress: {},
  treeChallenges: [],
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
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [onDismiss]);
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
  useEffect(() => { const t = setTimeout(onDismiss, 5000); return () => clearTimeout(t); }, [onDismiss]);
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

      {/* Roadmap Achievements */}
      <div style={G.card}>
        <div style={G.sectionTitle}><span>🏆</span> Roadmap Achievements</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {Object.values(ROADMAPS).map(roadmap => {
            const progress = state.roadmapProgress?.[roadmap.id] || {};
            const totalTasks = roadmap.days.reduce((sum, day) => sum + day.tasks.length, 0);
            const completedTasks = Object.values(progress).reduce((sum, day) => sum + Object.values(day).filter(Boolean).length, 0);
            const completionPct = Math.round((completedTasks / totalTasks) * 100);
            const isComplete = completionPct === 100;
            
            return (
              <div key={roadmap.id} style={{ 
                padding: 14, 
                borderRadius: 10, 
                background: isComplete ? `linear-gradient(135deg, ${roadmap.color}15, rgba(10,5,30,0.8))` : "rgba(255,255,255,0.02)", 
                border: `1px solid ${isComplete ? roadmap.color + "55" : "rgba(60,60,90,0.3)"}`,
                textAlign: "center",
                position: "relative",
                overflow: "hidden"
              }}>
                {isComplete && (
                  <div style={{ 
                    position: "absolute", 
                    top: 6, 
                    right: 6, 
                    fontSize: 16, 
                    filter: "drop-shadow(0 0 8px " + roadmap.color + ")"
                  }}>✓</div>
                )}
                <div style={{ fontSize: 32, marginBottom: 6 }}>{roadmap.icon}</div>
                <div style={{ 
                  fontFamily: "'Orbitron', sans-serif", 
                  fontSize: 10, 
                  color: isComplete ? roadmap.color : "#4a4a70", 
                  fontWeight: 600,
                  marginBottom: 4,
                  letterSpacing: 1
                }}>{roadmap.title}</div>
                <div style={{ 
                  fontFamily: "'Orbitron', sans-serif", 
                  fontSize: 11, 
                  color: completionPct > 0 ? "#a78bfa" : "#3a3a5a",
                  fontWeight: 700
                }}>{completionPct}%</div>
                {completionPct > 0 && completionPct < 100 && (
                  <div style={{ 
                    marginTop: 6,
                    height: 3,
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 999,
                    overflow: "hidden"
                  }}>
                    <div style={{ 
                      height: "100%",
                      width: completionPct + "%",
                      background: `linear-gradient(90deg, ${roadmap.color}, ${roadmap.color}88)`,
                      borderRadius: 999
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
        <div key={q.id} style={{ 
          ...G.cardDark, 
          opacity: q.done ? 0.35 : 1, 
          borderColor: q.done ? "rgba(40,40,60,0.2)" : `${RANK_COLOR[q.difficulty]}44`, 
          background: q.done ? "rgba(10,8,20,0.5)" : "rgba(15,12,30,0.85)",
          transition: "opacity 0.4s, border-color 0.3s, background 0.3s", 
          animation: flashQuestId === q.id ? "questFlash 0.65s ease" : "none",
          boxShadow: q.done ? "none" : `0 0 15px ${RANK_COLOR[q.difficulty]}10`
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <RankBadge rank={q.difficulty} size={13} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: q.done ? 400 : 600, color: q.done ? "#3a3a5a" : "#e8e8f0", textDecoration: q.done ? "line-through" : "none" }}>{q.title}</span>
                <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${catColors[q.category] || "#a78bfa"}15`, color: catColors[q.category] || "#a78bfa", fontFamily: "'Orbitron', sans-serif", letterSpacing: 1, border: `1px solid ${catColors[q.category] || "#a78bfa"}30` }}>{q.category}</span>
              </div>
              <div style={{ fontSize: 12, color: q.done ? "#2a2a3a" : "#6a7090", marginBottom: 6 }}>{q.desc}</div>
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

// ─── Skill Tree Data ──────────────────────────────────────────────────────────
const SKILL_TREES = {
  Body: {
    color: "#ff2d55", icon: "⚔️", desc: "Physical conditioning and athletic performance.",
    skills: [
      { id: "body_1", name: "Awakened Body", rank: "E", steps: [
        "Walk 30 minutes 3 days in a row",
        "Do 10 push-ups without stopping",
        "Run 1km without walking",
        "Hold a plank for 30 seconds",
        "Complete 7 consecutive days of any exercise",
        "Do 20 push-ups in one set",
        "Run 2km without stopping",
        "Touch your toes (or get within 10cm)",
        "Do 10 bodyweight squats with good form",
        "Complete a full week of morning movement",
      ]},
      { id: "body_2", name: "Runner", rank: "D", steps: [
        "Run 3km without stopping",
        "Run 3 times in one week",
        "Complete a 5km run",
        "Run 5km under 35 minutes",
        "Run on 4 different days in one week",
        "Complete a 7km run",
        "Run 20km total in one month",
        "Do a long run of 8km",
        "Run 5km under 30 minutes",
        "Complete a 10km run",
      ]},
      { id: "body_3", name: "Athlete", rank: "C", steps: [
        "Do 50 consecutive push-ups",
        "Run 10km under 60 minutes",
        "Complete 100 push-ups in a single day",
        "Do 20 pull-ups in one session",
        "Run 15km without stopping",
        "Hold a 3-minute plank",
        "Do 200 push-ups in a single day",
        "Complete a half marathon (21.1km)",
        "Run 100km total in one month",
        "Train 5 days per week for 4 consecutive weeks",
      ]},
      { id: "body_4", name: "Elite", rank: "B", steps: [
        "Run a half marathon under 1h45m",
        "Do 100 pull-ups in a single session",
        "Complete a full marathon (42.2km)",
        "Hold a 5-minute plank",
        "Train twice a day for 2 consecutive weeks",
        "Run 200km total in one month",
        "Do 500 push-ups in a single day",
        "Complete a marathon under 4 hours",
        "Maintain elite training for 3 consecutive months",
        "Complete an ultra-distance event (50km+)",
      ]},
    ],
  },
  Mind: {
    color: "#64d2ff", icon: "🧠", desc: "Intellectual capacity, deep focus, and knowledge.",
    skills: [
      { id: "mind_1", name: "Awakened Mind", rank: "E", steps: [
        "Read for 20 minutes every day for a week",
        "Finish one full book",
        "Meditate for 10 minutes for 5 consecutive days",
        "Write a journal entry every day for 7 days",
        "Study a new topic for 1 hour",
        "Put your phone away for 2 hours and read",
        "Summarize a book in your own words",
        "Finish 3 books in one month",
        "Meditate for 20 minutes daily for 2 weeks",
        "Learn one concrete new skill or concept",
      ]},
      { id: "mind_2", name: "Deep Thinker", rank: "D", steps: [
        "Do 2 hours of uninterrupted study daily for 5 days",
        "Finish 5 books in one month",
        "Write a 500-word essay on something you learned",
        "Zero phone usage for first hour of every day for 2 weeks",
        "Study the same subject for 20 consecutive days",
        "Take structured notes for every book you read this month",
        "Memorize something meaningful (poem, speech, facts)",
        "Teach someone else something you learned recently",
        "Complete an online course or structured curriculum",
        "Maintain a daily reading habit for 30 consecutive days",
      ]},
      { id: "mind_3", name: "Scholar", rank: "C", steps: [
        "Read 25 books total",
        "Do 4 hours of deep work daily for 2 weeks",
        "Write a 2000-word analysis or essay",
        "Study a second language for 30 consecutive days",
        "Read 3 books in different fields this month",
        "Complete a challenging course or certification",
        "Build a personal knowledge system (notes, connections)",
        "Spend 100 hours studying one subject",
        "Debate or discuss a complex topic with someone smarter",
        "Read 50 books total",
      ]},
      { id: "mind_4", name: "Philosopher", rank: "B", steps: [
        "Read 100 books total",
        "Maintain 4+ hours of deep work daily for 1 month",
        "Write and publish or share a long-form piece of work",
        "Master a second language to conversational level",
        "Spend 500 hours studying one domain",
        "Mentor or teach someone over multiple sessions",
        "Build something (project, business, system) from knowledge alone",
        "Read and understand a dense academic text or classic work",
        "Develop a personal philosophy — written and tested",
        "Maintain elite mental output for 6 consecutive months",
      ]},
    ],
  },
  Discipline: {
    color: "#ff9500", icon: "🔥", desc: "Control over your habits, comfort, and environment.",
    skills: [
      { id: "disc_1", name: "Awakened Will", rank: "E", steps: [
        "Wake up at the same time 5 days in a row",
        "Take a cold shower for 3 consecutive days",
        "No junk food for 7 consecutive days",
        "Make your bed every morning for 2 weeks",
        "Sleep before midnight 7 nights in a row",
        "No social media for 3 consecutive days",
        "Complete your to-do list every day for a week",
        "Cold shower every day for 2 weeks",
        "Wake up before 7AM for 14 consecutive days",
        "Complete all daily habits for 21 consecutive days",
      ]},
      { id: "disc_2", name: "Iron Monk", rank: "D", steps: [
        "Cold shower every day for 30 consecutive days",
        "No junk food for 30 consecutive days",
        "Wake up before 6AM every day for 3 weeks",
        "No alcohol for 30 consecutive days",
        "Zero social media for 2 weeks",
        "Sleep 7–8 hours every night for 30 days",
        "Complete a written plan every night for 30 days",
        "No phone for first 2 hours of every day for 3 weeks",
        "Meditate every morning for 30 consecutive days",
        "Maintain all core habits for 60 consecutive days",
      ]},
      { id: "disc_3", name: "Ascetic", rank: "C", steps: [
        "Fast for 24 hours (water only)",
        "No sugar for 30 consecutive days",
        "Cold shower every day for 90 consecutive days",
        "Wake up before 5:30AM for 30 consecutive days",
        "Zero entertainment (TV/games/social) for 2 weeks",
        "Complete your top priority task first, every day, for 2 months",
        "No complaints for 21 consecutive days",
        "Maintain a flawless diet for 60 consecutive days",
        "Fast 24 hours once per week for 4 weeks",
        "Maintain elite discipline habits for 90 consecutive days",
      ]},
      { id: "disc_4", name: "Shadow", rank: "B", steps: [
        "Cold shower every day for 1 full year",
        "Wake up before 5AM for 60 consecutive days",
        "Complete a 7-day water fast or extended fast",
        "Zero social media for 90 consecutive days",
        "Maintain perfect sleep schedule for 6 months",
        "Never miss a single planned habit for 60 days straight",
        "Live on a stripped-down schedule for 30 days (no entertainment)",
        "Sustain elite discipline through a major life disruption",
        "Help someone else build discipline habits that stick",
        "Maintain shadow-level habits for 6 consecutive months",
      ]},
    ],
  },
  Craft: {
    color: "#bf5af2", icon: "✨", desc: "Mastery of a creative or technical skill.",
    skills: [
      { id: "craft_1", name: "Dabbler", rank: "E", steps: [
        "Spend 5 hours total practicing your craft",
        "Complete one beginner tutorial or lesson",
        "Create your first finished piece (however rough)",
        "Practice for 30 minutes every day for a week",
        "Study one master in your field",
        "Share your work with one other person",
        "Spend 20 hours total on your craft",
        "Complete a structured beginner course",
        "Finish 3 small projects",
        "Practice consistently for 30 consecutive days",
      ]},
      { id: "craft_2", name: "Practitioner", rank: "D", steps: [
        "Reach 50 total hours of deliberate practice",
        "Complete an intermediate-level project",
        "Receive and act on feedback from someone skilled",
        "Practice 1 hour every day for 30 days",
        "Study and analyze the work of 3 masters in your field",
        "Identify and work specifically on your weakest area",
        "Finish a project you're genuinely proud of",
        "Reach 100 total hours of deliberate practice",
        "Teach a beginner concept in your field",
        "Maintain consistent daily practice for 60 days",
      ]},
      { id: "craft_3", name: "Expert", rank: "C", steps: [
        "Reach 500 total hours of deliberate practice",
        "Complete a complex, multi-week project",
        "Get recognition or positive response from a skilled audience",
        "Develop your own personal style or approach",
        "Practice 2 hours daily for 60 consecutive days",
        "Solve a problem in your craft others couldn't",
        "Produce work at a level most people never reach",
        "Complete and publish or submit a major work",
        "Mentor someone and see them improve measurably",
        "Reach 1000 total hours of deliberate practice",
      ]},
      { id: "craft_4", name: "Master", rank: "B", steps: [
        "Reach 2000 total hours of deliberate practice",
        "Be paid or compensated for your work",
        "Complete a masterwork — your best piece to date",
        "Build a body of work (10+ finished pieces)",
        "Be sought out for your skill by others",
        "Develop a methodology you can articulate and teach",
        "Produce work that rivals professionals in your field",
        "Sustain daily practice for 6 consecutive months",
        "Complete a project that changes how others see your work",
        "Reach 5000 total hours of deliberate practice",
      ]},
    ],
  },
  Finance: {
    color: "#ffd60a", icon: "💰", desc: "Financial intelligence, savings, and wealth building.",
    skills: [
      { id: "fin_1", name: "Financially Awake", rank: "E", steps: [
        "Track every expense for 30 consecutive days",
        "Write down your exact net worth (assets minus debts)",
        "Create a monthly budget and stick to it for one month",
        "Cut one unnecessary recurring expense",
        "Save your first $100 / equivalent intentionally",
        "Read one book on personal finance",
        "Build a 2-week emergency fund",
        "Automate at least one savings transfer",
        "Go 30 days without an impulse purchase",
        "Build a 1-month emergency fund",
      ]},
      { id: "fin_2", name: "Stable", rank: "D", steps: [
        "Build a 3-month emergency fund",
        "Eliminate one category of debt entirely",
        "Live below your means for 3 consecutive months",
        "Increase your income by any amount intentionally",
        "Invest your first amount (any amount) in a real asset",
        "Read 3 books on finance, investing, or wealth",
        "Have zero credit card debt for 3 months",
        "Save 20% of income for 3 consecutive months",
        "Build a 6-month emergency fund",
        "Create a written 1-year financial plan",
      ]},
      { id: "fin_3", name: "Builder", rank: "C", steps: [
        "Generate your first income outside your main job",
        "Invest consistently every month for 6 months",
        "Pay off all high-interest debt",
        "Increase income by 20% or more in one year",
        "Build a side income that covers one bill",
        "Reach a net worth milestone meaningful to you",
        "Have 1 year of expenses saved or invested",
        "Understand and invest in at least 2 asset classes",
        "Create a 5-year written financial roadmap",
        "Build a side income that covers your rent/mortgage",
      ]},
      { id: "fin_4", name: "Wealth Architect", rank: "B", steps: [
        "Achieve financial independence from primary employment",
        "Build passive income covering all basic expenses",
        "Reach a net worth of 10× your annual expenses",
        "Own an asset that generates income without your labor",
        "Invest in real estate, equity, or business ownership",
        "Build a business or system that runs without you daily",
        "Help someone else achieve financial stability",
        "Diversify income across 3+ independent sources",
        "Achieve location and time freedom through finances",
        "Sustain wealth-building habits for 5 consecutive years",
      ]},
    ],
  },
  Social: {
    color: "#30d158", icon: "🌐", desc: "Communication, influence, and real-world connections.",
    skills: [
      { id: "soc_1", name: "Connected", rank: "E", steps: [
        "Start a conversation with one stranger this week",
        "Reach out to someone you haven't spoken to in 6+ months",
        "Attend one social event outside your comfort zone",
        "Introduce yourself to one new person at work or online",
        "Have a 30-minute deep conversation (no phones)",
        "Give a genuine compliment to 3 different people",
        "Follow up with someone you recently met",
        "Join one new community, club, or group",
        "Spend quality time with 5 different people in one month",
        "Proactively help someone without being asked",
      ]},
      { id: "soc_2", name: "Communicator", rank: "D", steps: [
        "Give a short speech or presentation to any audience",
        "Have a difficult conversation you've been avoiding",
        "Listen actively for an entire conversation — zero talking about yourself",
        "Negotiate something (price, raise, terms) successfully",
        "Build a genuine friendship with someone new this year",
        "Write a message that genuinely helped someone",
        "Resolve a conflict constructively",
        "Present your ideas clearly in a group setting",
        "Network intentionally — follow up after every meeting",
        "Maintain meaningful contact with 10 people regularly",
      ]},
      { id: "soc_3", name: "Influential", rank: "C", steps: [
        "Lead a team, group, or project to a successful outcome",
        "Speak publicly to an audience of 20+ people",
        "Build a reputation in one specific field or community",
        "Have someone else change their behavior because of your influence",
        "Build an audience (online or offline) of 100+ engaged people",
        "Mentor someone through a meaningful challenge",
        "Be introduced as an expert or go-to person in any domain",
        "Successfully persuade a skeptic using logic and empathy",
        "Build a network of genuinely mutual relationships",
        "Create something that positively impacts 100+ people",
      ]},
      { id: "soc_4", name: "Leader", rank: "B", steps: [
        "Build and lead a team that achieves a major goal",
        "Speak to an audience of 100+ people",
        "Build an audience or following of 1000+ people",
        "Create a community or organization from scratch",
        "Be the person others come to when they need direction",
        "Develop and promote someone who surpasses your own early level",
        "Make a decision that impacts 50+ people positively",
        "Build a reputation that precedes you in your field",
        "Write, record, or create content that reaches thousands",
        "Sustain leadership impact for 2+ consecutive years",
      ]},
    ],
  },
};

const TREE_KEYS = Object.keys(SKILL_TREES);
const MAX_ACTIVE_TREES = 3;

// ─── Skills Tab ───────────────────────────────────────────────────────────────
function SkillsTab({ state, dispatch }) {
  const activeTrees = state.activeTrees || [];
  const treeProgress = state.treeProgress || {};
  const [view, setView] = useState(activeTrees.length > 0 ? "trees" : "select");
  const [selectedTree, setSelectedTree] = useState(null);

  // Selection screen
  if (view === "select") {
    return (
      <div style={G.page}>
        <div style={{ ...G.card, background: "linear-gradient(135deg, rgba(20,10,50,0.85), rgba(10,5,30,0.95))", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#5a5a80", letterSpacing: 3, marginBottom: 6 }}>SKILL TREE SYSTEM</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, color: "#e8d5ff", marginBottom: 8 }}>Choose Your Path</div>
          <div style={{ fontSize: 13, color: "#4a5070", lineHeight: 1.7 }}>
            Select up to <span style={{ color: "#a78bfa" }}>3 trees</span> to pursue. Each tree is a real-life mastery path with 10 concrete steps per skill. Complete all 10 steps to unlock the next skill in the chain.
          </div>
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.2)", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#ff9500", letterSpacing: 1 }}>
            ⚠ Swapping a tree resets all progress in that tree
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {TREE_KEYS.map(key => {
            const tree = SKILL_TREES[key];
            const isActive = activeTrees.includes(key);
            const prog = treeProgress[key] || {};
            const totalSteps = tree.skills.reduce((a, s) => a + s.steps.length, 0);
            const doneSteps = tree.skills.reduce((a, s) => a + s.steps.filter((_, i) => prog[`${s.id}_${i}`]).length, 0);
            const canAdd = !isActive && activeTrees.length < MAX_ACTIVE_TREES;
            return (
              <div key={key} style={{ background: isActive ? `${tree.color}0d` : "rgba(10,8,30,0.7)", border: `1px solid ${isActive ? tree.color + "44" : "rgba(60,50,100,0.3)"}`, borderRadius: 14, padding: 20, position: "relative", overflow: "hidden", transition: "all 0.2s" }}>
                {isActive && <div style={{ position: "absolute", top: 0, right: 0, width: 100, height: 100, background: `radial-gradient(circle at top right, ${tree.color}20, transparent 70%)`, pointerEvents: "none" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>{tree.icon}</span>
                  <div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: isActive ? tree.color : "#cdd6f4", fontWeight: 600 }}>{key}</div>
                    <div style={{ fontSize: 11, color: "#4a5070", marginTop: 2 }}>{tree.skills.length} skills · {totalSteps} steps</div>
                  </div>
                  {isActive && <span style={{ marginLeft: "auto", fontSize: 9, padding: "3px 10px", borderRadius: 20, background: `${tree.color}20`, color: tree.color, border: `1px solid ${tree.color}44`, fontFamily: "'Orbitron', sans-serif" }}>ACTIVE</span>}
                </div>
                <div style={{ fontSize: 12, color: "#4a5070", marginBottom: 14, lineHeight: 1.6 }}>{tree.desc}</div>
                {isActive && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70" }}>
                      <span>PROGRESS</span><span>{doneSteps}/{totalSteps} steps</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(doneSteps / totalSteps) * 100}%`, background: tree.color, borderRadius: 999, boxShadow: `0 0 6px ${tree.color}66`, transition: "width 0.4s" }} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {isActive ? (
                    <>
                      <button onClick={() => { setSelectedTree(key); setView("detail"); }} style={{ ...G.btnSuccess, borderColor: `${tree.color}44`, color: tree.color, background: `${tree.color}12`, flex: 1 }}>Open Tree</button>
                      {(() => {
                        const treeProg2 = treeProgress[key] || {};
                        const ts = tree.skills.reduce((a,s) => a + s.steps.length, 0);
                        const ds = tree.skills.reduce((a,s) => a + s.steps.filter((_,i) => treeProg2[s.id+"_"+i]).length, 0);
                        const pct2 = ts > 0 ? ds / ts : 0;
                        const safe = pct2 >= 0.66;
                        return (
                          <button onClick={() => dispatch({ type: "DEACTIVATE_TREE", key })} style={{ ...G.btn, padding: "8px 12px", color: safe ? "#ff9500" : "#ff453a", borderColor: safe ? "rgba(255,149,0,0.25)" : "rgba(255,69,58,0.2)", background: safe ? "rgba(255,149,0,0.06)" : "rgba(255,69,58,0.05)", fontSize: 9 }} title={safe ? "Progress will be saved" : "Progress will be lost"}>
                            {safe ? "Swap ✓" : "Swap"}
                          </button>
                        );
                      })()}
                    </>
                  ) : (
                    <button onClick={() => { if (canAdd) dispatch({ type: "ACTIVATE_TREE", key }); }} style={{ ...G.btn, flex: 1, borderColor: canAdd ? `${tree.color}44` : "rgba(60,60,80,0.3)", color: canAdd ? tree.color : "#3a3a5a", background: canAdd ? `${tree.color}0d` : "transparent", cursor: canAdd ? "pointer" : "default", fontSize: 9 }}>
                      {activeTrees.length >= MAX_ACTIVE_TREES ? "Max 3 Active" : "Activate"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {activeTrees.length > 0 && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button onClick={() => setView("trees")} style={G.btn}>View Active Trees →</button>
          </div>
        )}
      </div>
    );
  }

  // Detail view for one tree
  if (view === "detail" && selectedTree) {
    const tree = SKILL_TREES[selectedTree];
    const prog = treeProgress[selectedTree] || {};
    // Find current skill = first incomplete
    const currentSkillIdx = tree.skills.findIndex(s => {
      const done = s.steps.filter((_, i) => prog[`${s.id}_${i}`]).length;
      return done < s.steps.length;
    });
    return (
      <div style={G.page}>
        <button onClick={() => setView("trees")} style={{ ...G.btn, marginBottom: 20, fontSize: 9 }}>← Back</button>
        <div style={{ ...G.card, background: `linear-gradient(135deg, ${tree.color}0d, rgba(10,5,30,0.95))`, border: `1px solid ${tree.color}33`, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 36 }}>{tree.icon}</span>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 24, color: tree.color, fontWeight: 700 }}>{selectedTree}</div>
              <div style={{ fontSize: 12, color: "#4a5070", marginTop: 4 }}>{tree.desc}</div>
            </div>
          </div>
        </div>
        {tree.skills.map((skill, skillIdx) => {
          const doneCount = skill.steps.filter((_, i) => prog[`${skill.id}_${i}`]).length;
          const isComplete = doneCount === skill.steps.length;
          const isLocked = skillIdx > 0 && !tree.skills[skillIdx - 1].steps.every((_, i) => prog[`${tree.skills[skillIdx-1].id}_${i}`]);
          const isCurrent = skillIdx === currentSkillIdx;
          const pct = (doneCount / skill.steps.length) * 100;
          return (
            <div key={skill.id} style={{ marginBottom: 16 }}>
              {/* Connector line */}
              {skillIdx > 0 && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                  <div style={{ width: 2, height: 20, background: isLocked ? "rgba(60,60,80,0.4)" : `${tree.color}55` }} />
                </div>
              )}
              <div style={{ background: isComplete ? `${tree.color}10` : isLocked ? "rgba(0,0,0,0.35)" : "rgba(10,8,30,0.7)", border: `1px solid ${isComplete ? tree.color + "55" : isLocked ? "rgba(40,40,60,0.4)" : isCurrent ? tree.color + "33" : "rgba(60,50,100,0.25)"}`, borderRadius: 12, padding: 20, opacity: isLocked ? 0.45 : 1, position: "relative", overflow: "hidden" }}>
                {isComplete && <div style={{ position: "absolute", top: 0, right: 0, width: 100, height: 100, background: `radial-gradient(circle at top right, ${tree.color}20, transparent 70%)`, pointerEvents: "none" }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <RankBadge rank={skill.rank} size={13} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: isComplete ? tree.color : isLocked ? "#2a2a3a" : "#e8d5ff", fontWeight: 600 }}>{skill.name}</div>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", marginTop: 3, letterSpacing: 1 }}>{doneCount}/{skill.steps.length} STEPS</div>
                  </div>
                  {isComplete && <span style={{ fontSize: 10, color: tree.color, fontFamily: "'Orbitron', sans-serif", letterSpacing: 1 }}>✓ MASTERED</span>}
                  {isLocked && <span style={{ fontSize: 10, color: "#3a3a5a", fontFamily: "'Orbitron', sans-serif" }}>🔒 LOCKED</span>}
                </div>
                {/* Progress bar */}
                <div style={{ marginBottom: isLocked ? 0 : 14 }}>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: isComplete ? tree.color : `linear-gradient(90deg, ${tree.color}88, ${tree.color})`, borderRadius: 999, transition: "width 0.4s", boxShadow: pct > 0 ? `0 0 6px ${tree.color}55` : "none" }} />
                  </div>
                </div>
                {/* Steps */}
                {!isLocked && skill.steps.map((step, stepIdx) => {
                  const stepKey = `${skill.id}_${stepIdx}`;
                  const isDone = !!prog[stepKey];
                  const prevDone = stepIdx === 0 || !!prog[`${skill.id}_${stepIdx - 1}`];
                  const canCheck = prevDone && !isDone;
                  return (
                    <div key={stepIdx} onClick={() => { if (!isDone && canCheck) dispatch({ type: "TOGGLE_SKILL_STEP", tree: selectedTree, stepKey }); }} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 0", borderBottom: stepIdx < skill.steps.length - 1 ? "1px solid rgba(40,40,60,0.3)" : "none", cursor: canCheck ? "pointer" : "default", opacity: isDone ? 0.5 : !prevDone ? 0.25 : 1, transition: "opacity 0.2s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `1px solid ${isDone ? tree.color : canCheck ? tree.color + "66" : "rgba(80,80,120,0.3)"}`, background: isDone ? `${tree.color}25` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: tree.color, transition: "all 0.2s" }}>{isDone ? "✓" : stepIdx + 1}</div>
                      <span style={{ fontSize: 13, color: isDone ? "#3a5a4a" : !prevDone ? "#252535" : "#cdd6f4", textDecoration: isDone ? "line-through" : "none", fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.5, flex: 1 }}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Trees overview
  return (
    <div style={G.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, color: "#5a5a80", letterSpacing: 3 }}>ACTIVE TREES ({activeTrees.length}/{MAX_ACTIVE_TREES})</div>
        <button onClick={() => setView("select")} style={{ ...G.btn, fontSize: 9, padding: "7px 14px" }}>Manage Trees</button>
      </div>
      {activeTrees.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌱</div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, color: "#2a2a40", letterSpacing: 3, marginBottom: 12 }}>NO ACTIVE TREES</div>
          <button onClick={() => setView("select")} style={G.btn}>Choose Your Path</button>
        </div>
      )}
      {activeTrees.map(key => {
        const tree = SKILL_TREES[key];
        const prog = treeProgress[key] || {};
        const currentSkillIdx = tree.skills.findIndex(s => s.steps.filter((_, i) => prog[`${s.id}_${i}`]).length < s.steps.length);
        const currentSkill = currentSkillIdx >= 0 ? tree.skills[currentSkillIdx] : null;
        const totalSteps = tree.skills.reduce((a, s) => a + s.steps.length, 0);
        const doneSteps = tree.skills.reduce((a, s) => a + s.steps.filter((_, i) => prog[`${s.id}_${i}`]).length, 0);
        const currentDone = currentSkill ? currentSkill.steps.filter((_, i) => prog[`${currentSkill.id}_${i}`]).length : 0;
        return (
          <div key={key} style={{ ...G.card, background: `${tree.color}07`, border: `1px solid ${tree.color}30`, marginBottom: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle at top right, ${tree.color}15, transparent 70%)`, pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>{tree.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 18, color: tree.color, fontWeight: 700 }}>{key}</div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", marginTop: 3, letterSpacing: 1 }}>{doneSteps}/{totalSteps} TOTAL STEPS</div>
              </div>
              <button onClick={() => { setSelectedTree(key); setView("detail"); }} style={{ ...G.btn, fontSize: 9, padding: "7px 14px", borderColor: `${tree.color}44`, color: tree.color, background: `${tree.color}0d` }}>Open →</button>
            </div>
            {/* Overall progress */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(doneSteps / totalSteps) * 100}%`, background: `linear-gradient(90deg, ${tree.color}88, ${tree.color})`, borderRadius: 999, transition: "width 0.4s", boxShadow: `0 0 8px ${tree.color}44` }} />
              </div>
            </div>
            {/* Skill chain overview */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tree.skills.map((skill, idx) => {
                const done = skill.steps.filter((_, i) => prog[`${skill.id}_${i}`]).length;
                const complete = done === skill.steps.length;
                const isCurr = idx === currentSkillIdx;
                return (
                  <div key={skill.id} style={{ flex: "1 1 120px", padding: "10px 12px", borderRadius: 8, background: complete ? `${tree.color}15` : isCurr ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.2)", border: `1px solid ${complete ? tree.color + "44" : isCurr ? tree.color + "22" : "rgba(40,40,60,0.3)"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <RankBadge rank={skill.rank} size={10} />
                      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: complete ? tree.color : isCurr ? "#e8d5ff" : "#3a3a5a" }}>{skill.name}</span>
                    </div>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 7, color: complete ? tree.color + "88" : "#3a3a5a" }}>{done}/{skill.steps.length} {complete ? "✓" : ""}</div>
                    <div style={{ marginTop: 5, height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(done / skill.steps.length) * 100}%`, background: tree.color, borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Current active step hint */}
            {currentSkill && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${tree.color}20` }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", letterSpacing: 1, marginBottom: 5 }}>CURRENT STEP — {currentSkill.name}</div>
                <div style={{ fontSize: 12, color: "#8090b0", fontFamily: "'Rajdhani', sans-serif" }}>
                  {currentSkill.steps[currentDone] || "All steps complete"}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
function StatsTab({ state }) {
  const xpLog = state.xpLog || [];
  const level = state.level;
  const totalExp = state.totalExp || 0;
  const questsCompleted = state.questsCompleted || 0;
  const activeTrees = state.activeTrees || [];
  const treeProgress = state.treeProgress || {};

  // Skill tree stats
  const totalStepsAll = activeTrees.reduce((a, key) => {
    const tree = SKILL_TREES[key];
    return a + tree.skills.reduce((b, s) => b + s.steps.length, 0);
  }, 0);
  const doneStepsAll = activeTrees.reduce((a, key) => {
    const tree = SKILL_TREES[key];
    const prog = treeProgress[key] || {};
    return a + tree.skills.reduce((b, s) => b + s.steps.filter((_, i) => prog[s.id + "_" + i]).length, 0);
  }, 0);
  const masteredSkillsAll = activeTrees.reduce((a, key) => {
    const tree = SKILL_TREES[key];
    const prog = treeProgress[key] || {};
    return a + tree.skills.filter(s => s.steps.every((_, i) => prog[s.id + "_" + i])).length;
  }, 0);
  const totalSkillsAll = activeTrees.reduce((a, key) => a + SKILL_TREES[key].skills.length, 0);

  // Build last 14 days
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().split("T")[0];
    const entry = xpLog.find(e => e.date === key);
    return { label: d.toLocaleDateString("en", { weekday: "short" }), date: key, xp: entry ? entry.xp : 0, isToday: i === 13 };
  });
  const maxXP = Math.max(...last14.map(d => d.xp), 1);

  // Today's activity breakdown
  const catColors2 = { Physical: "#ff2d55", Mental: "#64d2ff", Discipline: "#ff9500", Skill: "#bf5af2", Health: "#30d158", Social: "#ffd60a" };
  const todayDone = state.quests.filter(q => q.done && q.activityCat);
  const catCounts = {};
  todayDone.forEach(q => { catCounts[q.activityCat] = (catCounts[q.activityCat] || 0) + 1; });
  const catBreakdown = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div style={G.page}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Quests", value: questsCompleted, color: "#a78bfa" },
          { label: "Total EXP", value: totalExp >= 1000000 ? (totalExp / 1000000).toFixed(1) + "M" : totalExp >= 1000 ? (totalExp / 1000).toFixed(1) + "K" : totalExp, color: "#64d2ff" },
          { label: "Level", value: level, color: RANK_COLOR[rankFromLevel(level)] },
          { label: "Best Streak", value: `${state.longestStreak || 0}d`, color: "#ff9500" },
          { label: "Skills Mastered", value: `${masteredSkillsAll}/${totalSkillsAll || "—"}`, color: "#bf5af2" },
          { label: "Steps Done", value: `${doneStepsAll}/${totalStepsAll || "—"}`, color: "#30d158" },
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

      {/* Skill Trees Summary Card */}
      {activeTrees.length > 0 && (
        <div style={G.card}>
          <div style={G.sectionTitle}><span>◈</span> Skill Tree Overview</div>
          {activeTrees.map(key => {
            const tree = SKILL_TREES[key];
            const prog = treeProgress[key] || {};
            const totalSteps = tree.skills.reduce((a, s) => a + s.steps.length, 0);
            const doneSteps = tree.skills.reduce((a, s) => a + s.steps.filter((_, i) => prog[s.id + "_" + i]).length, 0);
            const mastered = tree.skills.filter(s => s.steps.every((_, i) => prog[s.id + "_" + i])).length;
            const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
            const currentSkill = tree.skills.find(s => !s.steps.every((_, i) => prog[s.id + "_" + i]));
            const currentDone = currentSkill ? currentSkill.steps.filter((_, i) => prog[currentSkill.id + "_" + i]).length : 0;
            return (
              <div key={key} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid rgba(60,50,100,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{tree.icon}</span>
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: tree.color, fontWeight: 600 }}>{key}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: tree.color }}>{pct}%</span>
                </div>
                {/* Steps bar */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70" }}>
                    <span>{doneSteps} / {totalSteps} STEPS</span>
                    <span>{mastered} / {tree.skills.length} SKILLS MASTERED</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct + "%", background: "linear-gradient(90deg, " + tree.color + "88, " + tree.color + ")", borderRadius: 999, boxShadow: "0 0 8px " + tree.color + "44", transition: "width 0.4s" }} />
                  </div>
                </div>
                {/* Skill chain dots */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: currentSkill ? 8 : 0 }}>
                  {tree.skills.map((skill, idx) => {
                    const done = skill.steps.filter((_, i) => prog[skill.id + "_" + i]).length;
                    const complete = done === skill.steps.length;
                    const isCurr = skill === currentSkill;
                    const locked = idx > 0 && !tree.skills[idx-1].steps.every((_, i) => prog[tree.skills[idx-1].id + "_" + i]);
                    return (
                      <div key={skill.id} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid " + (complete ? tree.color : isCurr ? tree.color + "77" : "rgba(60,60,80,0.4)"), background: complete ? tree.color + "25" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: complete ? 12 : 9, color: complete ? tree.color : isCurr ? tree.color + "aa" : "#3a3a5a" }}>
                            {complete ? "✓" : locked ? "🔒" : <span style={{ fontFamily: "'Orbitron', sans-serif" }}>{done}</span>}
                          </div>
                          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 8, color: complete ? tree.color : isCurr ? "#cdd6f4" : "#2a2a3a", textAlign: "center", lineHeight: 1.3 }}>{skill.name}</div>
                        </div>
                        {idx < tree.skills.length - 1 && <div style={{ width: 16, height: 1, background: complete ? tree.color + "66" : "rgba(60,60,80,0.3)", flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>
                {/* Current active step */}
                {currentSkill && (
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid " + tree.color + "18" }}>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", letterSpacing: 1, marginBottom: 3 }}>CURRENT — {currentSkill.name} step {currentDone + 1}/10</div>
                    <div style={{ fontSize: 12, color: "#7a8aaa", fontFamily: "'Rajdhani', sans-serif" }}>{currentSkill.steps[currentDone]}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Skill Trees Stats */}
      <div style={G.card}>
        <div style={G.sectionTitle}><span>◈</span> Skill Trees</div>
        {(state.activeTrees || []).length === 0 ? (
          <div style={{ fontSize: 13, color: "#3a3a5a" }}>No active skill trees. Go to Skills to choose your path.</div>
        ) : (state.activeTrees || []).map(key => {
          const tree = SKILL_TREES[key];
          const prog = (state.treeProgress || {})[key] || {};
          const totalSteps = tree.skills.reduce((a, s) => a + s.steps.length, 0);
          const doneSteps = tree.skills.reduce((a, s) => a + s.steps.filter((_, i) => prog[s.id + "_" + i]).length, 0);
          const masteredSkills = tree.skills.filter(s => s.steps.every((_, i) => prog[s.id + "_" + i])).length;
          const currentSkill = tree.skills.find(s => !s.steps.every((_, i) => prog[s.id + "_" + i]));
          const currentDone = currentSkill ? currentSkill.steps.filter((_, i) => prog[currentSkill.id + "_" + i]).length : 0;
          return (
            <div key={key} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid rgba(60,50,100,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{tree.icon}</span>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: tree.color, fontWeight: 600 }}>{key}</span>
                <span style={{ marginLeft: "auto", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70" }}>{masteredSkills}/{tree.skills.length} skills mastered</span>
              </div>
              {/* Overall progress bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70" }}>
                  <span>OVERALL PROGRESS</span><span>{doneSteps}/{totalSteps} steps</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: doneSteps + "%" + " / " + totalSteps, background: tree.color, borderRadius: 999, boxShadow: "0 0 8px " + tree.color + "55", transition: "width 0.4s", width: ((doneSteps / totalSteps) * 100) + "%" }} />
                </div>
              </div>
              {/* Per-skill breakdown */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {tree.skills.map((skill, idx) => {
                  const done = skill.steps.filter((_, i) => prog[skill.id + "_" + i]).length;
                  const complete = done === skill.steps.length;
                  const isNext = !complete && (idx === 0 || tree.skills[idx-1].steps.every((_, i) => prog[tree.skills[idx-1].id + "_" + i]));
                  return (
                    <div key={skill.id} style={{ flex: "1 1 100px", padding: "8px 10px", borderRadius: 8, background: complete ? tree.color + "15" : isNext ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.2)", border: "1px solid " + (complete ? tree.color + "44" : isNext ? tree.color + "22" : "rgba(40,40,60,0.3)") }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                        <RankBadge rank={skill.rank} size={9} />
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: complete ? tree.color : isNext ? "#cdd6f4" : "#3a3a5a" }}>{skill.name}</span>
                      </div>
                      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 7, color: complete ? tree.color + "88" : "#3a3a5a", marginBottom: 4 }}>{done}/{skill.steps.length} {complete ? "✓" : ""}</div>
                      <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: ((done / skill.steps.length) * 100) + "%", background: tree.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Current step hint */}
              {currentSkill && (
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid " + tree.color + "18" }}>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", letterSpacing: 1, marginBottom: 4 }}>NEXT STEP — {currentSkill.name} ({currentDone + 1}/10)</div>
                  <div style={{ fontSize: 12, color: "#7a8aaa", fontFamily: "'Rajdhani', sans-serif" }}>{currentSkill.steps[currentDone]}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────
function ChallengesTab({ state, dispatch }) {
  const [confirmChallenge, setConfirmChallenge] = useState(null);
  const activeTrees = state.activeTrees || [];
  const treeProgress = state.treeProgress || {};
  const savedTreeChallenges = state.treeChallenges || [];
  const profile = state.detectedProfile ? PROFILES[state.detectedProfile] : null;
  const profileChallenges = profile ? (PROFILE_CHALLENGES[state.detectedProfile] || []).map(c => {
    const saved = (state.profileChallenges || []).find(s => s.id === c.id);
    return saved ? { ...c, ...saved } : { ...c };
  }) : [];

  function daysLeft(d) { return Math.ceil((new Date(d) - new Date()) / 86400000); }
  function timePct(c) {
    if (!c.startedAt || !c.deadlineAt) return 0;
    const total = new Date(c.deadlineAt) - new Date(c.startedAt);
    const elapsed = new Date() - new Date(c.startedAt);
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }
  function taskPct(c) { return Math.round((c.tasks.filter(t => t.done).length / c.tasks.length) * 100); }
  function isPaceBehind(c) { return timePct(c) > taskPct(c) + 20; }

  // Confirm entry modal
  if (confirmChallenge) {
    const c = confirmChallenge;
    const col = RANK_COLOR[c.rank];
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(2,1,15,0.96)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%", background: "linear-gradient(135deg, rgba(20,10,50,0.98), rgba(8,4,24,0.99))", border: `1px solid ${col}44`, borderRadius: 16, padding: 32, boxShadow: `0 0 60px ${RANK_GLOW[c.rank]}` }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, letterSpacing: 4, color: col + "88", marginBottom: 8 }}>DUNGEON CONTRACT</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <RankBadge rank={c.rank} size={18} />
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, color: "#e8d5ff", fontWeight: 700 }}>{c.title}</div>
          </div>
          <div style={{ fontSize: 13, color: "#5a6080", lineHeight: 1.7, marginBottom: 24 }}>{c.desc}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
            {[
              { label: "REWARD", value: `+${c.expReward.toLocaleString()} XP`, color: "#a78bfa" },
              { label: "PENALTY", value: `-${c.penalty} LEVELS`, color: "#ff453a" },
              { label: "TIME LIMIT", value: `${c.daysToComplete} DAYS`, color: col },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 10px", textAlign: "center", border: `1px solid ${color}22` }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 7, color: "#3a3a5a", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 8, background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.2)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#ff453a", letterSpacing: 2, marginBottom: 8 }}>TASKS REQUIRED</div>
            {c.tasks.map((t, i) => (
              <div key={t.id} style={{ fontSize: 12, color: "#7a8aaa", fontFamily: "'Rajdhani', sans-serif", padding: "3px 0", borderBottom: i < c.tasks.length - 1 ? "1px solid rgba(255,69,58,0.1)" : "none" }}>
                {i + 1}. {t.title}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirmChallenge(null)} style={{ ...G.btn, flex: 1, color: "#4a5070", borderColor: "rgba(80,80,120,0.3)", background: "transparent" }}>Back Out</button>
            <button onClick={() => { dispatch({ type: "START_CHALLENGE", id: c.id, daysToComplete: c.daysToComplete, isProfile: !!c.profile, isTree: !!c.treeKey, treeKey: c.treeKey }); setConfirmChallenge(null); }} style={{ ...G.btn, flex: 2, borderColor: `${col}55`, background: `${col}15`, color: col, fontWeight: 700 }}>
              ⚔ Enter the Dungeon
            </button>
          </div>
        </div>
      </div>
    );
  }

  function ChallengeCard({ c }) {
    const left = c.deadlineAt ? daysLeft(c.deadlineAt) : null;
    const isActive = c.startedAt && !c.completed && !c.failed;
    const urgent = left !== null && left <= 3 && isActive;
    const danger = isActive && isPaceBehind(c);
    const tPct = taskPct(c);
    const timP = isActive ? timePct(c) : 0;
    const col = RANK_COLOR[c.rank];
    const treeInfo = c.treeKey ? SKILL_TREES[c.treeKey] : null;

    return (
      <div style={{ background: c.failed ? "rgba(40,8,8,0.7)" : c.completed ? "rgba(8,30,16,0.7)" : danger ? "rgba(40,15,8,0.8)" : "rgba(10,8,30,0.75)", border: `1px solid ${c.failed ? "rgba(255,69,58,0.3)" : c.completed ? "rgba(48,209,88,0.25)" : danger ? "rgba(255,149,0,0.4)" : col + "28"}`, borderRadius: 12, padding: 20, marginBottom: 12, position: "relative", overflow: "hidden", animation: danger && isActive ? "dangerPulse 2s ease infinite" : "none" }}>
        {!c.failed && !c.completed && <div style={{ position: "absolute", top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at top right, ${RANK_GLOW[c.rank]}, transparent 70%)`, pointerEvents: "none" }} />}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          <RankBadge rank={c.rank} size={13} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 600, color: c.failed ? "#5a2020" : c.completed ? "#205a30" : "#e8d5ff", textDecoration: c.failed ? "line-through" : "none" }}>{c.title}</span>
              {treeInfo && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${treeInfo.color}15`, color: treeInfo.color, border: `1px solid ${treeInfo.color}30`, fontFamily: "'Orbitron', sans-serif" }}>{treeInfo.icon} {c.treeKey}</span>}
              {c.profile && profile && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${profile.color}15`, color: profile.color, border: `1px solid ${profile.color}30`, fontFamily: "'Orbitron', sans-serif" }}>{profile.icon} {profile.label}</span>}
              {c.completed && <span style={{ fontSize: 9, color: "#30d158", fontFamily: "'Orbitron', sans-serif", letterSpacing: 1 }}>✓ CLEARED</span>}
              {c.failed && <span style={{ fontSize: 9, color: "#ff453a", fontFamily: "'Orbitron', sans-serif", letterSpacing: 1 }}>✗ FAILED</span>}
            </div>
            <div style={{ fontSize: 12, color: "#4a5070", marginBottom: 6 }}>{c.desc}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#a78bfa" }}>+{c.expReward.toLocaleString()} XP</span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#ff453a" }}>-{c.penalty} lvl fail</span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a5070" }}>{c.daysToComplete}d</span>
              {isActive && left !== null && (
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: urgent ? "#ff453a" : danger ? "#ff9500" : "#30d158" }}>
                  {urgent ? `⚠ ${left}d LEFT` : `${left}d remaining`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Timeline bar — shows time elapsed vs task progress */}
        {isActive && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70" }}>
              <span>TASKS {tPct}%</span>
              <span style={{ color: danger ? "#ff9500" : "#4a4a70" }}>TIME {Math.round(timP)}%{danger ? " ⚠ BEHIND PACE" : ""}</span>
            </div>
            {/* Task progress */}
            <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "visible", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${tPct}%`, background: `linear-gradient(90deg, ${col}88, ${col})`, borderRadius: 999, boxShadow: `0 0 6px ${col}55`, transition: "width 0.4s" }} />
              {/* Time marker */}
              <div style={{ position: "absolute", top: -3, left: `${timP}%`, width: 2, height: 12, background: danger ? "#ff9500" : "rgba(255,255,255,0.3)", borderRadius: 1, transform: "translateX(-1px)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Orbitron', sans-serif", fontSize: 7, color: "#3a3a5a" }}>
              <span>START</span><span>TODAY ↑</span><span>DEADLINE</span>
            </div>
          </div>
        )}

        {/* Failed autopsy */}
        {c.failed && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,69,58,0.07)", border: "1px solid rgba(255,69,58,0.2)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#ff453a", letterSpacing: 2, marginBottom: 6 }}>POST-MORTEM</div>
            <div style={{ fontSize: 12, color: "#7a4040", fontFamily: "'Rajdhani', sans-serif", marginBottom: 4 }}>
              Reached {taskPct(c)}% — {c.tasks.filter(t => t.done).length}/{c.tasks.length} tasks completed
            </div>
            <div style={{ fontSize: 11, color: "#5a3030", fontFamily: "'Rajdhani', sans-serif" }}>
              Incomplete: {c.tasks.filter(t => !t.done).map(t => t.title).join(" · ")}
            </div>
          </div>
        )}

        {/* Completed summary */}
        {c.completed && (
          <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(48,209,88,0.07)", border: "1px solid rgba(48,209,88,0.15)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#30d158", letterSpacing: 2, marginBottom: 4 }}>DUNGEON CLEARED</div>
            <div style={{ fontSize: 12, color: "#3a7a4a", fontFamily: "'Rajdhani', sans-serif" }}>All {c.tasks.length} tasks completed · +{c.expReward.toLocaleString()} XP earned</div>
          </div>
        )}

        {/* Task checklist */}
        {isActive && (
          <div style={{ marginBottom: 12 }}>
            {c.tasks.map((t, i) => (
              <div key={t.id} onClick={() => dispatch({ type: "TOGGLE_TASK", challengeId: c.id, taskId: t.id, isProfile: !!c.profile, isTree: !!c.treeKey, treeKey: c.treeKey })} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < c.tasks.length - 1 ? "1px solid rgba(40,40,60,0.35)" : "none", cursor: "pointer", opacity: t.done ? 0.4 : 1, transition: "opacity 0.2s" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2, border: `1px solid ${t.done ? col : "rgba(100,100,160,0.4)"}`, background: t.done ? col + "30" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: col }}>{t.done ? "✓" : ""}</div>
                <span style={{ fontSize: 13, color: t.done ? "#3a4a5a" : "#cdd6f4", textDecoration: t.done ? "line-through" : "none", fontFamily: "'Rajdhani', sans-serif", lineHeight: 1.4 }}>{t.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          {!c.startedAt && !c.completed && !c.failed && (
            <button onClick={() => setConfirmChallenge(c)} style={{ ...G.btn, borderColor: `${col}44`, background: `${col}10`, color: col }}>⚔ Enter Dungeon</button>
          )}
          {(c.failed || c.completed) && (
            <button onClick={() => dispatch({ type: "RESTART_CHALLENGE", id: c.id, isProfile: !!c.profile, isTree: !!c.treeKey, treeKey: c.treeKey })} style={{ ...G.btn, fontSize: 9 }}>↺ Retry</button>
          )}
        </div>
      </div>
    );
  }

  const noTrees = activeTrees.length === 0 && !profile;

  // Count all active/done/failed across everything
  const allActive = [], allDone = [], allFailed = [];
  activeTrees.forEach(key => {
    getAvailableTreeChallenges(key, treeProgress, savedTreeChallenges).forEach(c => {
      if (c.startedAt && !c.completed && !c.failed) allActive.push(c);
      else if (c.completed) allDone.push(c);
      else if (c.failed) allFailed.push(c);
    });
  });
  profileChallenges.forEach(c => {
    if (c.startedAt && !c.completed && !c.failed) allActive.push(c);
    else if (c.completed) allDone.push(c);
    else if (c.failed) allFailed.push(c);
  });

  return (
    <div style={G.page}>
      {/* Header */}
      <div style={{ ...G.card, background: "linear-gradient(135deg, rgba(30,10,10,0.9), rgba(10,5,30,0.95))", border: "1px solid rgba(255,45,85,0.14)", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: "#5a2a2a", letterSpacing: 3, marginBottom: 6 }}>DUNGEON SYSTEM</div>
        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, color: "#e8d5ff", marginBottom: 8 }}>Challenge Gates</div>
        <div style={{ fontSize: 13, color: "#4a3a4a", lineHeight: 1.6, marginBottom: 12 }}>
          Timed dungeons built around your active paths. Complete all tasks before the deadline or lose levels.
        </div>
        {noTrees && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#5a5a80", letterSpacing: 1 }}>
            ◈ Activate skill trees in the Skills tab to unlock your personal challenges
          </div>
        )}
        <div style={{ marginTop: 14, display: "flex", gap: 20 }}>
          {[{ label: "Active", val: allActive.length, color: "#a78bfa" }, { label: "Cleared", val: allDone.length, color: "#30d158" }, { label: "Failed", val: allFailed.length, color: "#ff453a" }].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#3a3a5a", letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tree sections */}
      {activeTrees.map(key => {
        const tree = SKILL_TREES[key];
        const pct = getTreeProgress(key, treeProgress);
        const challenges = getAvailableTreeChallenges(key, treeProgress, savedTreeChallenges);
        const active = challenges.filter(c => c.startedAt && !c.completed && !c.failed);
        const available = challenges.filter(c => !c.startedAt && !c.completed && !c.failed);
        const done = challenges.filter(c => c.completed);
        const failed = challenges.filter(c => c.failed);
        const RANK_UNLOCK = { D: 0, C: 0.33, B: 0.66, A: 1.0 };
        const allRanks = ["D","C","B","A"];
        return (
          <div key={key} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${tree.color}22` }}>
              <span style={{ fontSize: 22 }}>{tree.icon}</span>
              <div>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: tree.color, fontWeight: 700 }}>{key} Dungeons</div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 8, color: "#4a4a70", marginTop: 2 }}>
                  {allRanks.map(r => {
                    const unlocked = pct >= RANK_UNLOCK[r];
                    return <span key={r} style={{ marginRight: 8, color: unlocked ? RANK_COLOR[r] : "#2a2a3a" }}>{r} {unlocked ? "✓" : `(${Math.round(RANK_UNLOCK[r]*100)}%)`}</span>;
                  })}
                </div>
              </div>
            </div>
            {active.length > 0 && active.map(c => <ChallengeCard key={c.id} c={c} />)}
            {available.map(c => <ChallengeCard key={c.id} c={c} />)}
            {done.length > 0 && done.map(c => <ChallengeCard key={c.id} c={c} />)}
            {failed.length > 0 && failed.map(c => <ChallengeCard key={c.id} c={c} />)}
          </div>
        );
      })}

      {/* Profile challenges */}
      {profile && profileChallenges.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${profile.color}22` }}>
            <span style={{ fontSize: 22 }}>{profile.icon}</span>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: profile.color, fontWeight: 700 }}>{profile.label} Dungeons</div>
          </div>
          {profileChallenges.map(c => <ChallengeCard key={c.id} c={c} />)}
        </div>
      )}

      {noTrees && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚔️</div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, color: "#2a2a40", letterSpacing: 3, marginBottom: 12 }}>NO DUNGEONS AVAILABLE</div>
          <div style={{ fontSize: 13, color: "#3a3a5a", marginBottom: 20 }}>Activate skill trees in the Skills tab to generate your personal challenges.</div>
        </div>
      )}
    </div>
  );
}

// ─── Notification ─────────────────────────────────────────────────────────────
function Notification({ msg, onClose }) {
  useEffect(() => { if (msg) { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); } }, [msg, onClose]);
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

    case "TOGGLE_ROADMAP_TASK": {
      const { roadmapId, day, taskIndex } = action;
      const roadmapProg = { ...(state.roadmapProgress || {}) };
      if (!roadmapProg[roadmapId]) roadmapProg[roadmapId] = {};
      if (!roadmapProg[roadmapId][day]) roadmapProg[roadmapId][day] = {};
      
      const wasChecked = roadmapProg[roadmapId][day][taskIndex];
      roadmapProg[roadmapId][day][taskIndex] = !wasChecked;
      
      // Give XP when checking (not unchecking)
      if (!wasChecked) {
        const xpGain = 50; // 50 XP per roadmap task
        const newExp = state.exp + xpGain;
        const newLevel = state.level + Math.floor(newExp / 1000);
        const finalExp = newExp % 1000;
        
        return {
          ...state,
          roadmapProgress: roadmapProg,
          exp: finalExp,
          level: newLevel,
          _notification: `📚 Roadmap Task Complete: +${xpGain} EXP`
        };
      }
      
      return { ...state, roadmapProgress: roadmapProg };
    }

    case "ADD_CUSTOM_ROADMAP": {
      const customRoadmaps = [...(state.customRoadmaps || []), action.roadmap];
      return { ...state, customRoadmaps };
    }

    case "DELETE_CUSTOM_ROADMAP": {
      const customRoadmaps = (state.customRoadmaps || []).filter(r => r.id !== action.id);
      const roadmapProgress = { ...state.roadmapProgress };
      delete roadmapProgress[action.id];
      return { ...state, customRoadmaps, roadmapProgress };
    }

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
      const msg = `⚔ Dungeon entered — ${action.daysToComplete} days. Do not fail.`;
      if (action.isProfile) {
        const existing = state.profileChallenges || [];
        const base = (PROFILE_CHALLENGES[state.detectedProfile] || []).find(c => c.id === action.id);
        const updated = existing.find(c => c.id === action.id) ? existing.map(c => c.id === action.id ? { ...c, ...patch } : c) : [...existing, { ...base, ...patch }];
        return { ...state, profileChallenges: updated, _notification: msg };
      }
      if (action.isTree) {
        const existing = state.treeChallenges || [];
        const base = (TREE_CHALLENGES[action.treeKey] || []).find(c => c.id === action.id);
        if (!base) return state;
        const fullBase = { ...base, treeKey: action.treeKey, tasks: base.tasks.map(t => ({ ...t, done: false })), failed: false, completed: false };
        const updated = existing.find(c => c.id === action.id) ? existing.map(c => c.id === action.id ? { ...c, ...patch } : c) : [...existing, { ...fullBase, ...patch }];
        return { ...state, treeChallenges: updated, _notification: msg };
      }
      return { ...state, challenges: (state.challenges || []).map(c => c.id === action.id ? { ...c, ...patch } : c), _notification: msg };
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
        return { ...state, exp: newExp, totalExp: (state.totalExp || 0) + reward, level: newLevel, statPoints: bonusPoints, skills: newSkills, profileChallenges: list, _notification: `🏆 DUNGEON CLEARED!  +${reward.toLocaleString()} XP` };
      }
      if (action.isTree) {
        const baseC = (TREE_CHALLENGES[action.treeKey] || []).find(c => c.id === action.challengeId);
        const { list, completed, reward } = toggleIn(state.treeChallenges || [], baseC ? { ...baseC, treeKey: action.treeKey } : null);
        if (!completed) return { ...state, treeChallenges: list };
        const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, reward);
        return { ...state, exp: newExp, totalExp: (state.totalExp || 0) + reward, level: newLevel, statPoints: bonusPoints, skills: newSkills, treeChallenges: list, _notification: `🏆 DUNGEON CLEARED!  +${reward.toLocaleString()} XP` };
      }
      const { list, completed, reward } = toggleIn(state.challenges || [], null);
      if (!completed) return { ...state, challenges: list };
      const doneC = list.find(c => c.id === action.challengeId);
      const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, reward);
      return { ...state, exp: newExp, totalExp: (state.totalExp || 0) + reward, level: newLevel, statPoints: bonusPoints, skills: newSkills, challenges: list, _notification: `🏆 DUNGEON CLEARED: ${doneC?.title}  •  +${reward.toLocaleString()} XP` };
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
      const treeChallenges = check(state.treeChallenges || []);
      if (penaltyLevels === 0) return { ...state, challenges, profileChallenges, treeChallenges };
      const { newLevel, newSkills } = applyPenalty(state, penaltyLevels);
      return { ...state, level: newLevel, exp: 0, skills: newSkills, challenges, profileChallenges, treeChallenges, _notification: `💀 CHALLENGE FAILED — Level decreased by ${penaltyLevels}. Now Level ${newLevel}.` };
    }

    case "RESTART_CHALLENGE": {
      const reset = c => c.id === action.id ? { ...c, startedAt: null, deadlineAt: null, failed: false, completed: false, tasks: c.tasks.map(t => ({ ...t, done: false })) } : c;
      if (action.isProfile) return { ...state, profileChallenges: (state.profileChallenges || []).map(reset) };
      if (action.isTree) return { ...state, treeChallenges: (state.treeChallenges || []).map(reset) };
      return { ...state, challenges: (state.challenges || []).map(reset) };
    }

    case "ACTIVATE_TREE": {
      const active = state.activeTrees || [];
      if (active.includes(action.key) || active.length >= MAX_ACTIVE_TREES) return state;
      return { ...state, activeTrees: [...active, action.key], _notification: `🌱 ${action.key} tree activated — your path begins` };
    }

    case "DEACTIVATE_TREE": {
      const active = (state.activeTrees || []).filter(k => k !== action.key);
      const prog = { ...(state.treeProgress || {}) };
      const tree = SKILL_TREES[action.key];
      const treeProg = prog[action.key] || {};
      const totalSteps = tree.skills.reduce((a, s) => a + s.steps.length, 0);
      const doneSteps = tree.skills.reduce((a, s) => a + s.steps.filter((_, i) => treeProg[s.id + "_" + i]).length, 0);
      const pct = totalSteps > 0 ? doneSteps / totalSteps : 0;
      const keepProgress = pct >= 0.66;
      if (!keepProgress) delete prog[action.key];
      const msg = keepProgress
        ? `✓ ${action.key} tree deactivated — progress saved (>​66% reached)`
        : `⚠ ${action.key} tree removed — progress cleared`;
      return { ...state, activeTrees: active, treeProgress: prog, _notification: msg };
    }

    case "TOGGLE_SKILL_STEP": {
      const prog = { ...(state.treeProgress || {}) };
      const treeProg = { ...(prog[action.tree] || {}) };
      const wasChecked = !!treeProg[action.stepKey];
      treeProg[action.stepKey] = !wasChecked;
      prog[action.tree] = treeProg;

      // Unchecking — no XP change
      if (wasChecked) return { ...state, treeProgress: prog };

      // Step XP by skill rank
      const tree = SKILL_TREES[action.tree];
      const STEP_XP  = { E: 30,  D: 100,  C: 300,  B: 900,  A: 2500,  S: 8000 };
      const SKILL_XP = { E: 200, D: 800,  C: 3500, B: 12000, A: 50000, S: 150000 };

      for (const skill of tree.skills) {
        if (!action.stepKey.startsWith(skill.id)) continue;
        const stepXP = STEP_XP[skill.rank] || 30;
        const allDone = skill.steps.every((_, i) => treeProg[`${skill.id}_${i}`]);

        if (allDone) {
          // Skill mastered — give step XP + bonus skill completion XP
          const totalXP = stepXP + SKILL_XP[skill.rank];
          const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, totalXP);
          return { ...state, treeProgress: prog, exp: newExp, totalExp: (state.totalExp || 0) + totalXP, level: newLevel, statPoints: bonusPoints, skills: newSkills, _notification: `✨ SKILL MASTERED: ${skill.name}\n+${stepXP} step XP  +${SKILL_XP[skill.rank].toLocaleString()} mastery bonus` };
        }

        // Just a step — give step XP
        const { newExp, newLevel, bonusPoints, newSkills } = applyExp(state, stepXP);
        const notification = newLevel > state.level
          ? `⬆ LEVEL UP! Reached Level ${newLevel}  •  +3 Stat Points`
          : `+${stepXP} XP — ${tree.icon} ${action.tree} step complete`;
        return { ...state, treeProgress: prog, exp: newExp, totalExp: (state.totalExp || 0) + stepXP, level: newLevel, statPoints: bonusPoints, skills: newSkills, _notification: notification };
      }
      return { ...state, treeProgress: prog };
    }

    case "CLEAR_NOTIFICATION":
      return { ...state, _notification: null };

    default:
      return state;
  }
}

// ─── Roadmaps Tab ─────────────────────────────────────────────────────────────
function RoadmapsTab({ state, dispatch }) {
  const [selectedRoadmap, setSelectedRoadmap] = useState(null);
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [customForm, setCustomForm] = useState({
    title: "",
    icon: "🎯",
    color: "#a78bfa",
    description: "",
    numDays: 30,
    tasksPerDay: 3
  });
  const [dayTasks, setDayTasks] = useState({});

  const roadmapProgress = state.roadmapProgress || {};
  const customRoadmaps = state.customRoadmaps || [];
  const allRoadmaps = { ...ROADMAPS, ...Object.fromEntries(customRoadmaps.map(r => [r.id, r])) };

  // Scroll listener for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete confirmation modal
  if (deleteConfirm) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(2,1,15,0.96)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 400, width: "100%", background: "linear-gradient(135deg, rgba(20,10,50,0.98), rgba(8,4,24,0.99))", border: "1px solid rgba(255,69,58,0.4)", borderRadius: 16, padding: 32, boxShadow: "0 0 60px rgba(255,69,58,0.15)" }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, letterSpacing: 2, color: "#ff453a", marginBottom: 12 }}>⚠ CONFIRM DELETE</div>
          <div style={{ fontSize: 15, color: "#e8d5ff", marginBottom: 24, lineHeight: 1.6 }}>
            Delete this custom roadmap? All progress will be permanently lost.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setDeleteConfirm(null)} style={{ ...G.btn, flex: 1, color: "#cdd6f4", borderColor: "rgba(80,80,120,0.3)" }}>Cancel</button>
            <button onClick={() => { dispatch({ type: "DELETE_CUSTOM_ROADMAP", id: deleteConfirm }); setDeleteConfirm(null); setSelectedRoadmap(null); }} style={{ ...G.btn, flex: 1, color: "#ff453a", borderColor: "rgba(255,69,58,0.4)", background: "rgba(255,69,58,0.1)", fontWeight: 700 }}>
              Delete Forever
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Custom roadmap creator
  if (isCreatingCustom) {
    const handleCreate = () => {
      if (!customForm.title.trim()) {
        alert("Enter a title for your roadmap");
        return;
      }
      
      const days = Array.from({ length: customForm.numDays }, (_, i) => {
        const day = i + 1;
        const tasks = dayTasks[day] || Array(customForm.tasksPerDay).fill("").map((_, idx) => `Task ${idx + 1} for day ${day}`);
        return { day, tasks };
      });

      const newRoadmap = {
        id: `custom_${Date.now()}`,
        title: customForm.title,
        icon: customForm.icon,
        color: customForm.color,
        description: customForm.description,
        days,
        isCustom: true
      };

      dispatch({ type: "ADD_CUSTOM_ROADMAP", roadmap: newRoadmap });
      setIsCreatingCustom(false);
      setCustomForm({ title: "", icon: "🎯", color: "#a78bfa", description: "", numDays: 30, tasksPerDay: 3 });
      setDayTasks({});
    };

    return (
      <>
        {/* Scroll to top button */}
        {showScrollTop && (
          <button 
            onClick={scrollToTop}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 100,
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #a78bfa, #7864fa)",
              border: "1px solid rgba(167,139,250,0.4)",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(167,139,250,0.4)",
              transition: "all 0.3s"
            }}>
            ↑
          </button>
        )}

        <div style={G.page}>
        <button onClick={() => setIsCreatingCustom(false)} style={{ ...G.btn, marginBottom: 20, fontSize: 9 }}>← Back</button>
        
        <div style={G.card}>
          <div style={G.sectionTitle}><span>✨</span> Create Custom Roadmap</div>
          
          <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#7a8aaa", marginBottom: 6, fontFamily: "'Orbitron', sans-serif" }}>TITLE</label>
              <input type="text" value={customForm.title} onChange={e => setCustomForm({ ...customForm, title: e.target.value })} placeholder="My Custom Roadmap" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.3)", borderRadius: 8, color: "#e8d5ff", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#7a8aaa", marginBottom: 6, fontFamily: "'Orbitron', sans-serif" }}>ICON (emoji)</label>
                <input type="text" value={customForm.icon} onChange={e => setCustomForm({ ...customForm, icon: e.target.value })} maxLength={2} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.3)", borderRadius: 8, color: "#e8d5ff", fontSize: 14, textAlign: "center" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#7a8aaa", marginBottom: 6, fontFamily: "'Orbitron', sans-serif" }}>COLOR</label>
                <input type="color" value={customForm.color} onChange={e => setCustomForm({ ...customForm, color: e.target.value })} style={{ width: "100%", height: 42, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.3)", borderRadius: 8, cursor: "pointer" }} />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, color: "#7a8aaa", marginBottom: 6, fontFamily: "'Orbitron', sans-serif" }}>DESCRIPTION</label>
              <input type="text" value={customForm.description} onChange={e => setCustomForm({ ...customForm, description: e.target.value })} placeholder="What will you achieve in this roadmap?" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.3)", borderRadius: 8, color: "#e8d5ff", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#7a8aaa", marginBottom: 6, fontFamily: "'Orbitron', sans-serif" }}>DAYS</label>
                <input type="number" value={customForm.numDays} onChange={e => setCustomForm({ ...customForm, numDays: Math.max(1, Math.min(365, parseInt(e.target.value) || 30)) })} min="1" max="365" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.3)", borderRadius: 8, color: "#e8d5ff", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#7a8aaa", marginBottom: 6, fontFamily: "'Orbitron', sans-serif" }}>TASKS PER DAY</label>
                <input type="number" value={customForm.tasksPerDay} onChange={e => setCustomForm({ ...customForm, tasksPerDay: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)) })} min="1" max="10" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(120,100,255,0.3)", borderRadius: 8, color: "#e8d5ff", fontSize: 14, fontFamily: "'Rajdhani', sans-serif" }} />
              </div>
            </div>

            <div style={{ padding: "12px 16px", background: "rgba(120,100,255,0.08)", border: "1px solid rgba(120,100,255,0.2)", borderRadius: 8, fontSize: 12, color: "#7a8aaa", lineHeight: 1.6 }}>
              💡 After creating, you can customize individual day tasks by editing them directly. For now, we'll generate placeholder tasks that you can modify.
            </div>

            <button onClick={handleCreate} style={{ ...G.btnSuccess, padding: "14px 24px", fontSize: 14, fontWeight: 700 }}>
              Create Roadmap
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  if (selectedRoadmap) {
    const roadmap = allRoadmaps[selectedRoadmap];
    if (!roadmap) {
      setSelectedRoadmap(null);
      return null;
    }
    
    const progress = roadmapProgress[selectedRoadmap] || {};
    const totalTasks = roadmap.days.length * (roadmap.days[0]?.tasks.length || 3);
    const completedTasks = Object.values(progress).reduce((sum, day) => sum + Object.values(day).filter(Boolean).length, 0);
    const completionPct = Math.round((completedTasks / totalTasks) * 100);

    return (
      <>
        {/* Scroll to top button */}
        {showScrollTop && (
          <button 
            onClick={scrollToTop}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 100,
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #a78bfa, #7864fa)",
              border: "1px solid rgba(167,139,250,0.4)",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(167,139,250,0.4)",
              transition: "all 0.3s"
            }}>
            ↑
          </button>
        )}

        <div style={G.page}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <button onClick={() => setSelectedRoadmap(null)} style={{ ...G.btn, fontSize: 9 }}>← Back to Roadmaps</button>
          <button 
            onClick={() => {
              // Find last checked task
              let lastDay = null;
              roadmap.days.forEach(day => {
                const dayProgress = progress[day.day] || {};
                day.tasks.forEach((_, taskIdx) => {
                  if (dayProgress[taskIdx]) {
                    lastDay = day.day;
                  }
                });
              });
              if (lastDay !== null) {
                const element = document.querySelector(`[data-day="${lastDay}"]`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Add flash effect
                  element.style.boxShadow = `0 0 30px ${roadmap.color}`;
                  setTimeout(() => { element.style.boxShadow = ''; }, 1500);
                }
              }
            }}
            style={{ ...G.btn, fontSize: 9, color: roadmap.color, borderColor: `${roadmap.color}66` }}
          >
            ⚡ Jump to Last Checked
          </button>
          {roadmap.isCustom && (
            <button onClick={() => setDeleteConfirm(selectedRoadmap)} style={{ ...G.btn, fontSize: 9, color: "#ff453a", borderColor: "rgba(255,69,58,0.3)" }}>
              Delete Roadmap
            </button>
          )}
        </div>
        
        <div style={{ ...G.card, background: `linear-gradient(135deg, ${roadmap.color}0d, rgba(10,5,30,0.95))`, border: `1px solid ${roadmap.color}33`, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <span style={{ fontSize: 42 }}>{roadmap.icon}</span>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 24, color: roadmap.color, fontWeight: 700 }}>{roadmap.title}</div>
              <div style={{ fontSize: 13, color: "#7a8aaa", marginTop: 4 }}>{roadmap.description}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
            <div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 1 }}>PROGRESS</div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, color: roadmap.color, fontWeight: 700 }}>{completionPct}%</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 1 }}>COMPLETED</div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, color: "#cdd6f4", fontWeight: 700 }}>{completedTasks}/{totalTasks}</div>
            </div>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden", marginTop: 16 }}>
            <div style={{ height: "100%", width: completionPct + "%", background: `linear-gradient(90deg, ${roadmap.color}, ${roadmap.color}88)`, borderRadius: 999, boxShadow: `0 0 12px ${roadmap.color}66`, transition: "width 0.4s" }} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {roadmap.days.map((day, dayIdx) => {
            const dayProgress = progress[day.day] || {};
            const dayComplete = day.tasks.every((_, taskIdx) => dayProgress[taskIdx]);
            const tasksCompleted = day.tasks.filter((_, taskIdx) => dayProgress[taskIdx]).length;
            
            return (
              <div key={day.day} data-day={day.day} style={{ background: dayComplete ? "rgba(48,209,88,0.08)" : "rgba(10,8,30,0.75)", border: `1px solid ${dayComplete ? "rgba(48,209,88,0.25)" : roadmap.color}28`, borderRadius: 12, padding: 20, position: "relative", overflow: "hidden", transition: "box-shadow 0.3s" }}>
                {dayComplete && <div style={{ position: "absolute", top: 12, right: 12, fontSize: 24, opacity: 0.3 }}>✓</div>}
                
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: dayComplete ? "rgba(48,209,88,0.2)" : `${roadmap.color}15`, border: `2px solid ${dayComplete ? "#30d158" : roadmap.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Orbitron', sans-serif", fontSize: 12, color: dayComplete ? "#30d158" : roadmap.color, fontWeight: 700 }}>
                    {day.day}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: dayComplete ? "#30d158" : "#e8d5ff", fontWeight: 600 }}>Day {day.day}</div>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70", letterSpacing: 1 }}>{tasksCompleted}/{day.tasks.length} TASKS COMPLETE</div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {day.tasks.map((task, taskIdx) => {
                    const isDone = dayProgress[taskIdx];
                    return (
                      <div key={taskIdx} style={{ 
                        display: "flex", 
                        alignItems: "flex-start", 
                        gap: 12, 
                        padding: "12px 14px", 
                        borderRadius: 8, 
                        background: isDone ? "rgba(48,209,88,0.03)" : "rgba(255,255,255,0.05)", 
                        border: `1px solid ${isDone ? "rgba(48,209,88,0.12)" : roadmap.color + "55"}`, 
                        cursor: "pointer", 
                        transition: "all 0.3s",
                        opacity: isDone ? 0.35 : 1,
                        boxShadow: isDone ? "none" : `0 0 20px ${roadmap.color}15`
                      }} onClick={() => dispatch({ type: "TOGGLE_ROADMAP_TASK", roadmapId: selectedRoadmap, day: day.day, taskIndex: taskIdx })}>
                        <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isDone ? "#30d158" : roadmap.color}`, background: isDone ? "#30d158" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          {isDone && <span style={{ fontSize: 13, color: "#05050f", fontWeight: 700 }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 14, color: isDone ? "#3a3a5a" : "#e8e8f0", lineHeight: 1.6, textDecoration: isDone ? "line-through" : "none", flex: 1, fontWeight: isDone ? 400 : 500 }}>{task}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </>
    );
  }

  // Main roadmaps selection view
  return (
    <div style={G.page}>
      <div style={G.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={G.sectionTitle}><span>🗺</span> Choose Your Path</div>
          <button onClick={() => setIsCreatingCustom(true)} style={{ ...G.btnSuccess, padding: "8px 16px", fontSize: 10 }}>
            + Create Custom
          </button>
        </div>
        <div style={{ fontSize: 13, color: "#7a8aaa", marginBottom: 24, lineHeight: 1.6 }}>
          Each roadmap is a structured path with daily tasks. Pick one and commit, or create your own custom roadmap.
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {Object.values(allRoadmaps).map(roadmap => {
            const progress = roadmapProgress[roadmap.id] || {};
            const totalTasks = roadmap.days.length * (roadmap.days[0]?.tasks.length || 3);
            const completedTasks = Object.values(progress).reduce((sum, day) => sum + Object.values(day).filter(Boolean).length, 0);
            const completionPct = Math.round((completedTasks / totalTasks) * 100);
            
            return (
              <div key={roadmap.id} onClick={() => setSelectedRoadmap(roadmap.id)} style={{ background: `linear-gradient(135deg, ${roadmap.color}08, rgba(10,5,30,0.75))`, border: `1px solid ${roadmap.color}33`, borderRadius: 12, padding: 24, cursor: "pointer", transition: "all 0.3s", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 100, height: 100, background: `radial-gradient(circle at top right, ${roadmap.color}15, transparent 70%)`, pointerEvents: "none" }} />
                
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                  <span style={{ fontSize: 48 }}>{roadmap.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 20, color: roadmap.color, fontWeight: 700 }}>{roadmap.title}</div>
                      {roadmap.isCustom && <span style={{ fontSize: 9, padding: "2px 8px", background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 10, fontFamily: "'Orbitron', sans-serif" }}>CUSTOM</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "#7a8aaa", marginTop: 4 }}>{roadmap.description}</div>
                    <div style={{ fontSize: 10, color: "#4a4a70", marginTop: 4, fontFamily: "'Orbitron', sans-serif" }}>{roadmap.days.length} DAYS</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontFamily: "'Orbitron', sans-serif", fontSize: 9, color: "#4a4a70" }}>
                      <span>PROGRESS</span>
                      <span>{completedTasks}/{totalTasks} tasks</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: completionPct + "%", background: roadmap.color, borderRadius: 999, boxShadow: `0 0 8px ${roadmap.color}44`, transition: "width 0.4s" }} />
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, color: roadmap.color, fontWeight: 700 }}>{completionPct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Profile");
  const [levelUpOverlay, setLevelUpOverlay] = useState(null);
  const [rankUpOverlay, setRankUpOverlay] = useState(null);
  const [flashQuestId, setFlashQuestId] = useState(null);

  const [state, rawDispatch] = useState(() => loadSavedState());

  const dispatch = useCallback((action) => {
    rawDispatch(prev => {
      const next = reducer(prev, action);
      try { const { _notification, ...toSave } = next; localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
      return next;
    });
  }, []);

  // Dispatch with overlay support (for skill steps and challenges)
  const dispatchWithOverlay = useCallback((action) => {
    rawDispatch(prev => {
      const next = reducer(prev, action);
      const didRankUp = rankFromLevel(next.level) !== rankFromLevel(prev.level);
      const didLevelUp = next.level > prev.level;
      if (didRankUp)       setTimeout(() => setRankUpOverlay(rankFromLevel(next.level)), 350);
      else if (didLevelUp) setTimeout(() => setLevelUpOverlay(next.level), 350);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={G.app}>
      {/* Solo Leveling Shadow Army Effect */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'hidden'
      }}>
        {/* Dark purple atmospheric base */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 20%, rgba(30,10,50,0.4) 50%, rgba(10,5,25,0.8) 100%)',
          animation: 'shadowPulse 6s ease-in-out infinite'
        }} />
        
        {/* Shadow silhouettes - left side */}
        <div style={{
          position: 'absolute',
          left: '-5%',
          top: '10%',
          width: '25%',
          height: '80%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 30%, transparent 70%)',
          clipPath: 'polygon(0% 20%, 40% 0%, 80% 15%, 100% 40%, 90% 70%, 60% 100%, 20% 90%, 0% 60%)',
          opacity: 0.6,
          animation: 'shadowFloat1 15s ease-in-out infinite'
        }}>
          {/* Glowing purple eye */}
          <div style={{
            position: 'absolute',
            top: '25%',
            right: '30%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#a78bfa',
            boxShadow: '0 0 20px 8px rgba(167,139,250,0.8), 0 0 40px 12px rgba(167,139,250,0.4)',
            animation: 'eyeGlow 3s ease-in-out infinite'
          }} />
        </div>

        {/* Shadow silhouettes - right side */}
        <div style={{
          position: 'absolute',
          right: '-5%',
          top: '5%',
          width: '30%',
          height: '85%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 30%, transparent 70%)',
          clipPath: 'polygon(20% 0%, 60% 10%, 100% 25%, 100% 60%, 80% 90%, 40% 100%, 0% 80%, 10% 40%)',
          opacity: 0.6,
          animation: 'shadowFloat2 18s ease-in-out infinite reverse'
        }}>
          {/* Multiple glowing eyes */}
          <div style={{
            position: 'absolute',
            top: '20%',
            left: '25%',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#c4b5fd',
            boxShadow: '0 0 15px 6px rgba(196,181,253,0.8), 0 0 30px 10px rgba(196,181,253,0.4)',
            animation: 'eyeGlow 2.5s ease-in-out infinite 0.5s'
          }} />
          <div style={{
            position: 'absolute',
            top: '45%',
            left: '40%',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#a78bfa',
            boxShadow: '0 0 18px 7px rgba(167,139,250,0.8), 0 0 35px 11px rgba(167,139,250,0.4)',
            animation: 'eyeGlow 3.5s ease-in-out infinite 1s'
          }} />
        </div>

        {/* Bottom shadow mass */}
        <div style={{
          position: 'absolute',
          bottom: '-10%',
          left: '10%',
          right: '10%',
          height: '40%',
          background: 'radial-gradient(ellipse at top, rgba(0,0,0,0.8) 0%, rgba(20,10,40,0.6) 30%, transparent 70%)',
          clipPath: 'polygon(0% 30%, 15% 0%, 35% 20%, 50% 5%, 70% 25%, 85% 10%, 100% 35%, 95% 100%, 5% 100%)',
          opacity: 0.7,
          animation: 'shadowFloat3 20s ease-in-out infinite'
        }}>
          {/* Ground-level glowing eyes */}
          <div style={{
            position: 'absolute',
            top: '15%',
            left: '30%',
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: '#7c3aed',
            boxShadow: '0 0 25px 10px rgba(124,58,237,0.9), 0 0 50px 15px rgba(124,58,237,0.5)',
            animation: 'eyeGlow 4s ease-in-out infinite 1.5s'
          }} />
          <div style={{
            position: 'absolute',
            top: '25%',
            left: '65%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#a78bfa',
            boxShadow: '0 0 20px 8px rgba(167,139,250,0.9), 0 0 40px 12px rgba(167,139,250,0.5)',
            animation: 'eyeGlow 3.2s ease-in-out infinite 0.8s'
          }} />
        </div>

        {/* Purple aura wisps */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse at 20% 30%, rgba(167,139,250,0.15) 0%, transparent 40%),
            radial-gradient(ellipse at 80% 60%, rgba(124,58,237,0.15) 0%, transparent 40%),
            radial-gradient(ellipse at 50% 80%, rgba(196,181,253,0.1) 0%, transparent 50%)
          `,
          animation: 'auraShift 12s ease-in-out infinite'
        }} />

        {/* Vignette darkening */}
        <div style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 200px 50px rgba(5,5,15,0.8)',
          animation: 'vignettePulse 8s ease-in-out infinite'
        }} />
      </div>
      
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
        @keyframes dangerPulse { 0%,100% { border-color: rgba(255,149,0,0.4); box-shadow: none; } 50% { border-color: rgba(255,149,0,0.8); box-shadow: 0 0 20px rgba(255,149,0,0.2); } }
        
        /* Solo Leveling Shadow Army Animations */
        @keyframes shadowPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        @keyframes shadowFloat1 {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); opacity: 0.6; }
          50% { transform: translateY(-3%) translateX(2%) scale(1.02); opacity: 0.7; }
        }
        @keyframes shadowFloat2 {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); opacity: 0.6; }
          50% { transform: translateY(2%) translateX(-2%) scale(1.03); opacity: 0.7; }
        }
        @keyframes shadowFloat3 {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.7; }
          50% { transform: translateY(-2%) scale(1.01); opacity: 0.8; }
        }
        @keyframes eyeGlow {
          0%, 100% { 
            opacity: 1; 
            box-shadow: 0 0 20px 8px rgba(167,139,250,0.8), 0 0 40px 12px rgba(167,139,250,0.4);
          }
          50% { 
            opacity: 0.6; 
            box-shadow: 0 0 30px 12px rgba(167,139,250,1), 0 0 60px 20px rgba(167,139,250,0.6);
          }
        }
        @keyframes auraShift {
          0%, 100% { transform: translateY(0); opacity: 1; }
          33% { transform: translateY(-2%); opacity: 0.8; }
          66% { transform: translateY(2%); opacity: 0.9; }
        }
        @keyframes vignettePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.9; }
        }
      `}</style>

      {rankUpOverlay  && <RankUpOverlay  rank={rankUpOverlay}   onDismiss={() => setRankUpOverlay(null)} />}
      {!rankUpOverlay && levelUpOverlay && <LevelUpOverlay level={levelUpOverlay} onDismiss={() => setLevelUpOverlay(null)} />}

      <div style={{ padding: "14px 24px", background: "rgba(3,3,15,0.98)", borderBottom: "1px solid rgba(80,60,180,0.15)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#a78bfa" }}>HUNTER SYSTEM</div>
        <div style={{ width: 1, height: 16, background: "rgba(120,100,255,0.2)" }} />
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 12, color: "#3a3a5a", letterSpacing: 2 }}>「 I alone am the exception 」</div>
      </div>

      <nav style={G.nav}>
        {["Profile", "Quests", "Skills", "Stats", "Challenges", "Roadmaps"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={G.navBtn(tab === t)}>{t}</button>
        ))}
      </nav>

      {tab === "Profile"    && <ProfileTab    state={state} dispatch={dispatchQuest} />}
      {tab === "Quests"     && <QuestsTab     state={state} dispatch={dispatchQuest} flashQuestId={flashQuestId} />}
      {tab === "Skills"     && <SkillsTab     state={state} dispatch={dispatchWithOverlay} />}
      {tab === "Stats"      && <StatsTab      state={state} />}
      {tab === "Challenges" && <ChallengesTab state={state} dispatch={dispatch} />}
      {tab === "Roadmaps"   && <RoadmapsTab   state={state} dispatch={dispatch} />}

      <Notification msg={state._notification} onClose={() => dispatch({ type: "CLEAR_NOTIFICATION" })} />
    </div>
  );
}