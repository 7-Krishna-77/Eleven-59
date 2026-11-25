
# ⏰ Eleven:59

**Turn messy college chats, emails, and PDFs into calm, normalized IST deadlines—and help classmates submit complete work with confidence.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-eleven59.vercel.app-111827?style=for-the-badge&logo=vercel)](https://eleven59.vercel.app/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-Web_App-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Timezone](https://img.shields.io/badge/Timezone-IST_(UTC%2B5%3A30)-16A34A?style=for-the-badge)](#)

---

## 📌 Overview

In college, critical academic deadlines rarely arrive in neat calendar invites. Instead, they are scattered across noisy WhatsApp group forwards, forwarded emails, and multi-page course PDFs—often written in mixed **English + Hinglish** with vague relative timing like *"kal raat 11:59 tak"*, *"tonight"*, or *"by Friday"*.

**Eleven:59** bridges the gap between chaotic student communication and calm execution. Built specifically around Indian college workflows and **Indian Standard Time (IST)**, it extracts and deduplicates deadlines, validates parser reliability via an interactive 15-case scorecard, and provides a collaborative **Class Task Completion & Reference Helper** so students can check missing requirements before submitting.

---

## ✨ Key Features

### 1. 🗂️ Smart Deadlines Workspace (`YOUR WORKSPACE`)
* **Urgency Bucketing:** Automatically organizes tasks into **Overdue**, **Due Today**, **This Week**, and **Upcoming**.
* **Crunch Alerts:** Flags tight, overlapping submission windows early so students can prioritize before the 11:59 PM rush.
* **Multi-Dimensional Filtering:** Filter active deadlines by **Course** and **Source** (**WhatsApp**, **Email**, **PDF**).

### 2. 📥 Multi-Source Ingestion & IST Normalization (`MESSAGES IN, CLARITY OUT`)
* **Messy Input Parsing:** Paste raw WhatsApp forwards, email notices, or load course PDFs alongside message timestamps.
* **Hinglish & Relative Date Resolution:** Converts casual expressions (*"kal"*, *"aaj shaam"*, *"tomorrow 11:59 PM"*, *"this Friday"*) into exact **IST (`UTC+5:30`)** timestamps.
* **Automatic Duplicate Merging:** Detects repeated announcements across groups/channels and merges them into a single clean deadline card.

### 3. 📊 Transparent Accuracy Scorecard (`15 ENGLISH + HINGLISH CASES`)
* **Built-In Benchmark Suite:** Evaluates parser performance live across **15 curated English and Hinglish test cases** (targeting $\ge 80\%$ accuracy).
* **Granular Breakdown:** Tracks independent accuracy metrics for **Course Extraction**, **IST Date Resolution**, and **Duplicate Merging**, complete with an inspectable case-by-case table.

### 4. 🤝 Class Task Completion & Reference Helper (`CLASS PROGRESS, MADE CLEAR`)
* **Task & Roster Setup:** Define a class assignment, required keywords/criteria, and student roster.
* **Completion Categorization & Scoring:** Splits students into **Completed** vs. **Not Completed** and scores submissions transparently out of 100 based on topic coverage, completeness, and structure.
* **"Almost Right" Peer Reference:** Automatically surfaces the highest-scoring completed submission as a benchmark reference for peers who are stuck.
* **"What's Missing" Gap Checker & Pre-Submission Checklist:** Compares draft or pending work against task criteria and the top reference to highlight missing concepts before final submission.

---

## 🔄 End-to-End Workflow

```text
[WhatsApp / Email / PDF]
          │
          ▼
  1. Add Source & Parse  ──► Resolves English/Hinglish relative dates to IST & merges duplicates
          │
          ▼
  2. Deadlines Workspace ──► Buckets into Overdue / Today / This Week / Upcoming + Crunch Alerts
          │
          ▼
  3. Accuracy Scorecard  ──► Validates extraction, IST normalization & merging across 15 test cases
          │
          ▼
  4. Class Task Helper   ──► Tracks completion, highlights "almost right" reference & checks gaps
```

---

## 🏗️ Project Architecture

Eleven:59 follows a clean, modular separation between web routing, deadline parsing, task analytics, and the responsive client interface:

```text
eleven59/
├── app.py                 # Flask entry point, HTTP routes, request handling & state orchestration
├── parser_engine.py       # Text/PDF ingestion, Hinglish + relative IST date resolution & deduplication
├── class_tracker.py       # Roster categorization, submission scoring, reference selection & gap checker
├── templates/
│   └── index.html         # Responsive workspace UI, modals, live scorecard & interactive task views
├── static/                # Stylesheets, client-side offline parser helpers & UI interactivity
├── requirements.txt       # Python dependencies
└── README.md              # Project documentation
```

### Tech Stack
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (Responsive dashboard, live filtering, offline Hinglish + IST parser support)
* **Backend:** Python 3, Flask (`app.py`, `parser_engine.py`, `class_tracker.py`)
* **Deployment:** Vercel (`https://eleven59.vercel.app/`)

---

## 🚀 Getting Started Locally

### Prerequisites
* Python 3.10 or higher
* `pip` package manager

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/7-Krishna-77/eleven59.git
   cd eleven59
   ```

2. **Create and activate a virtual environment (recommended):**
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the Flask application:**
   ```bash
   python app.py
   ```

5. **Open in your browser:**
   Navigate to `http://127.0.0.1:5000` to explore the workspace locally.

---

## 🎯 Why Eleven:59 Is Different

| Feature | Generic Note / To-Do Apps | Eleven:59 |
| :--- | :--- | :--- |
| **Input Method** | Manual typing & date picking | Direct paste of messy WhatsApp/Email/PDF text |
| **Language & Timezone** | English-only, manual timezones | Native English + Hinglish cues normalized to **IST** |
| **Repeated Notices** | Creates duplicate reminders | Automatically detects & merges duplicate notices |
| **Parser Verification** | None | Live 15-case accuracy scorecard ($\ge 80\%$ target) |
| **Peer & Draft Support** | Individual checklist only | Completion tracking, *"almost right"* reference & gap checker |

---

## 🛣️ Future Roadmap

* [ ] **Viva & Concept Self-Check Generator:** Auto-generate 3–4 quick conceptual self-test questions from task keywords so students verify understanding rather than copying structure.
* [ ] **Toggleable Local & File Persistence:** One-click toggle for saving workspace state across restarts (`JSON` / `localStorage`) with clean demo-reset support.
* [ ] **Crunch Time Study Splitter:** Automatically divide remaining hours before an 11:59 PM deadline into Drafting, Verification, and Buffer blocks.
* [ ] **Exportable Checklist Briefs:** One-click copy/export for personal pre-submission checklists and class progress summaries.

---

## 🏆 Built For

Originally conceptualized, built, tested, and deployed as a solo entry for the **CodeFuzion Hackathon** (advancing through Rounds 1 and 2 out of 600+ participants).

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
