# 🗡️ Hunter System

> *"I alone am the exception."*

A Solo Leveling-inspired life tracker that gamifies your personal growth journey. Transform your daily habits into quests, level up through real achievements, and become the Shadow Monarch of your own life.

**🔗 Live Demo:** [hunter-system-lovat.vercel.app](https://hunter-system-lovat.vercel.app)

---

## ✨ Features

### 🎮 **Gamified Progress System**
- **Quest System**: Rank your tasks from E (trivial) to S (extreme)
- **Level Up**: Gain 1000 EXP per level, earn +3 stat points
- **Rank Progression**: E → D → C → B → A → S (Shadow Monarch)
- **Streak Multipliers**: Build discipline with up to 2.0× EXP at 30-day streaks

### 📊 **Combat Statistics**
Allocate stat points across 5 core attributes:
- ⚔️ **Strength** - Physical power
- 💨 **Agility** - Speed and reflexes  
- 🧠 **Intelligence** - Mental capacity
- ❤️ **Vitality** - Health and endurance
- 👁️ **Perception** - Awareness and insight

### 🎯 **Skill Trees**
Choose 3 skill trees to master:
- **Body**: Run 5km → Marathon → Physical Peak
- **Mind**: 100 Books → Deep Work → Mental Mastery
- **Life**: Save $10k → Build Business → Financial Freedom
- **Social**: Communicator → Leader → Influencer

Each tree has 4 skills (E/D/C/B) that unlock as you level up.

### 🗺️ **365-Day Roadmaps**
Hand-crafted daily guides for mastery:
- **🐍 Python**: Zero to expert in 30 days
- **🤖 AI Engineering**: From basics to production ML
- **📿 Quran Memorization**: Complete Hifz in 1 year (1 page/day)
- **💪 Fitness**: Beginner to athlete transformation
- **💼 Entrepreneurship**: Side hustle to full business
- **🎵 Music Production**: DAW basics to first release
- **♟️ Chess**: 400 ELO to intermediate tactics

**Each task completed = +50 EXP**

### 🏆 **Challenge System**
- **Tree Challenges**: Unlock at 0%, 33%, 66%, 100% tree progress
- **Profile Dungeons**: Specialized challenges based on detected patterns
- **Penalties**: Fail a challenge = lose levels (high stakes!)

### 🌫️ **Solo Leveling Aesthetics**
- Animated shadow silhouettes with glowing purple eyes
- Dark theme with purple/black gradients
- Epic rank-up and level-up animations
- Cinzel, Orbitron, and Rajdhani fonts

---

## 🚀 Quick Start

### **Option 1: Use the Live App**
Visit [hunter-system-lovat.vercel.app](https://hunter-system-lovat.vercel.app) — your progress saves automatically to browser localStorage.

### **Option 2: Run Locally**
```bash
# 1. Download the files
# Get App.js and index.html from this repo

# 2. Open index.html in your browser
# That's it! No build step needed - pure React CDN.

# OR serve with a local server:
npx serve .
```

### **Option 3: Deploy Your Own**
```bash
# Fork this repo, then:
vercel deploy
# or
netlify deploy
```

---

## 📖 How to Use

### **1️⃣ Complete the Tutorial**
First launch shows a 7-step interactive guide explaining:
- Quest system and rankings
- Leveling and stat allocation
- Skill trees and roadmaps
- Streak mechanics

### **2️⃣ Set Up Your Profile**
- Choose your Hunter name
- Start at Level 1, Rank E
- Allocate initial stat points

### **3️⃣ Create Your Quests**
Click **"+ New Quest"** in the Quests tab:
- **Schedule**: Daily, Weekly, Main, or Side
- **Activity Type**: Physical, Mental, Discipline, Skill, Health, Social
- **Effort**: Trivial (< 5 min) → Extreme (4+ hrs)

System auto-calculates quest rank based on effort × category weight.

### **4️⃣ Build Your Streak**
Complete **all daily quests** to maintain your streak:
- **3 days** = 1.1× EXP multiplier
- **7 days** = 1.25× EXP
- **14 days** = 1.5× EXP
- **21 days** = 1.75× EXP
- **30 days** = 2.0× EXP 🔥

### **5️⃣ Follow Roadmaps**
Go to **Roadmaps** tab → Choose a path → Check off tasks daily.
- Python Day 1: "Install Python 3.12 → verify with `python --version`"
- Quran Day 1: "Memorize Al-Fatiha after Fajr - repeat 50x"
- Fitness Day 1: "20 squats, 10 push-ups, 1-min plank"

### **6️⃣ Activate Skill Trees**
Go to **Skills** tab → Choose 3 trees to focus on.
- Unlock skills by leveling up
- Complete skill objectives to mark them done
- Unlock tree challenges at 33%/66%/100% completion

---

## 🎨 Design Philosophy

### **Why Solo Leveling?**
The manhwa/anime captures the essence of real self-improvement:
- Start weak (E-rank)
- Daily grind (quests)
- Measurable progress (levels)
- Become exceptional (S-rank)

### **Key Principles**
1. **Transparency**: Your progress is visible, measurable, undeniable
2. **Consequence**: Streaks matter, failures have penalties
3. **Aesthetic**: Dark, atmospheric, powerful
4. **Autonomy**: You define your quests and goals

---

## 📊 Technical Details

### **Stack**
- **Frontend**: React 18 (CDN)
- **Styling**: Inline styles (no CSS files)
- **Fonts**: Google Fonts (Cinzel, Orbitron, Rajdhani)
- **Storage**: localStorage (persistent across sessions)
- **Deployment**: Vercel (static site)

### **File Structure**
```
/
├── index.html          # Entry point, loads React + App.js
├── App.js             # Complete app (3785 lines)
└── README.md          # You are here
```

### **Storage Key**
Data saved to `localStorage` under key: `hunter-system-v11`

### **State Structure**
```javascript
{
  hunter: { name: "Hunter", class: "Fighter" },
  level: 1,
  exp: 0,
  totalExp: 0,
  stats: { strength: 10, agility: 10, intelligence: 10, vitality: 10, perception: 10 },
  statPoints: 0,
  tutorialCompleted: false,
  quests: [...],
  skills: [...],
  activeTrees: [],
  treeProgress: {},
  challenges: [],
  roadmapProgress: {},
  streak: 0,
  longestStreak: 0,
  lastActive: null,
  weeklyResetDate: null
}
```

---

## 🎯 Roadmap Details

### **Python (30 Days)**
Zero to proficient. Covers:
- Setup & syntax (Days 1-5)
- Data structures & functions (Days 6-12)
- File I/O, APIs, web scraping (Days 13-20)
- Final project: CLI tool + web scraper (Days 21-30)

### **AI Engineering (30 Days)**
ML foundations to production systems:
- NumPy, Pandas, PyTorch (Days 1-10)
- CNNs, NLP, Transformers (Days 11-20)
- RAG, LangChain, deployment (Days 21-30)

### **Quran Memorization (365 Days)**
Complete Hifz with **1 page per day**:
- Juz 30 (Days 1-42): Short surahs
- Juz 29 → Juz 1 (Days 43-365): Progressive difficulty
- Weekly reviews (every 7 days)
- Monthly mega-reviews (every 30 days)
- **Every day specifies exact surah, ayat numbers, and page numbers**

### **Fitness (30 Days)**
Beginner to athlete:
- Bodyweight basics (Days 1-10)
- Cardio endurance (Days 11-20)
- Strength circuits (Days 21-30)

### **Entrepreneurship (30 Days)**
Side hustle to sustainable income:
- Idea validation & niche research (Days 1-7)
- Build landing page & capture emails (Days 8-14)
- Launch product & first sales (Days 15-21)
- Scale to $1000 MRR (Days 22-30)

### **Music Production (30 Days)**
DAW basics to first release:
- FL Studio/Ableton setup (Days 1-7)
- Melody, chords, basslines (Days 8-14)
- Drums, mixing, mastering (Days 15-21)
- Complete track & upload (Days 22-30)

### **Chess (30 Days)**
400 → 1200 ELO:
- Opening principles (Days 1-7)
- Tactical patterns (Days 8-14)
- Endgame basics (Days 15-21)
- Strategy & calculation (Days 22-30)

---

## 🏆 Achievement System

### **Roadmap Achievements**
Visible in **Profile** tab. Each roadmap shows:
- Icon and title
- Completion percentage (0-100%)
- Checkmark when complete ✓
- Glowing border for finished roadmaps

### **Skill Achievements**
18 total skills across 4 trees:
- **E-rank**: First Steps, Morning Ritual
- **D-rank**: Run 5km, Deep Work, No Junk Month
- **C-rank**: 100 Books, Bodyweight Master, Financial Base
- **B-rank**: Half Marathon, High-Value Skill, Teach Others
- **A-rank**: Marathon, Build Something Real, Physical Peak
- **S-rank**: Shadow Monarch (ultimate achievement)

---

## 🔥 Pro Tips

### **Maximize EXP Gain**
1. **Never break your streak** — the 2.0× multiplier is massive
2. **Focus on S-rank quests** when streak is high (2000+ EXP per quest)
3. **Complete roadmap tasks daily** (+50 EXP × 365 = 18,250 EXP/year)
4. **Finish Main quests** — these give huge one-time EXP boosts

### **Strategic Stat Allocation**
- **Strength**: Prioritize if doing physical challenges
- **Intelligence**: For AI/Python/learning roadmaps
- **Vitality**: Increases your challenge penalty resistance
- **Perception**: Helps detect profile patterns faster
- **Agility**: Useful for time-based challenges

### **Skill Tree Strategy**
Choose trees that align with your roadmaps:
- Python + AI roadmap → Mind tree
- Fitness roadmap → Body tree
- Entrepreneur roadmap → Life tree

### **Challenge Timing**
- Start Tree Challenges when you have a **high streak** (easier with EXP boost)
- Avoid challenges during busy weeks (penalties hurt!)
- Profile Dungeons are easier if you've been consistent

---

## 🌙 The Shadow Army Effect

The dark silhouettes with glowing purple eyes aren't just decoration — they represent:
- **Your past self** (the shadows you're leaving behind)
- **Your discipline** (watching over your daily actions)
- **Your potential** (the power you're building)

*They're always watching. Don't disappoint them.*

---

## 🐛 Known Issues / Limitations

- **No cloud sync**: Data stored locally in browser
- **No mobile app**: PWA could be added in future
- **No social features**: This is a solo journey
- **No undo button**: Actions are permanent (by design)

---

## 📜 License

MIT License - feel free to fork, modify, and deploy your own version.

---

## 🙏 Credits

**Inspired by:**
- Solo Leveling (manhwa/anime) by Chugong
- RPG progression systems
- Productivity apps like Habitica, Notion

**Built with:**
- React 18
- Pure dedication
- Late night coding sessions

---

## 💬 Philosophy

Most productivity apps are too soft. They let you skip tasks, reset streaks, delete failures.

**The Hunter System is different.**

Your quests are ranked. Your failures have consequences. Your progress is permanent.

You're not tracking tasks — you're **building a second life**.

Welcome to the System, Hunter.

*Now rise.*

---

**⚔️ May you reach S-rank and become the Shadow Monarch of your own destiny.**
