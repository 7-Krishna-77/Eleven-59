// UI State Management, localStorage Persistence, Filters, Inline Editing, .ICS Export & Demo Data

import {
  parseDeadlines,
  toIstWallDate,
  formatIstIso,
  parseIstIsoToWallDate,
  formatReadableIst,
  getCurrentIstAnchorString,
  findSubmissionLink
} from "./parser.js";
import { deduplicateAndMergeTasks } from "./dedup.js";
import { extractTextFromPdfFile } from "./pdfReader.js";
import { runAccuracyBenchmark } from "./benchmark.js";
import {
  clearClassTrackerMemory,
  getClassTrackerSnapshot,
  initializeClassTracker
} from "./classTracker.js";
import {
  clearSavedBrowserData,
  initializeLocalSave,
  isLocalSaveEnabled,
  readSharedState,
  saveSharedState,
  setLocalSaveEnabled
} from "./localSave.js";

const STORAGE_KEY_TASKS = "m10_deadline_aggregator_tasks_v1";
const STORAGE_KEY_GEMINI = "m10_gemini_api_key_v1";
const STORAGE_KEY_PROFILE = "eleven59_profile_v1";
const STORAGE_KEY_THEME = "eleven59_theme_v1";
const STORAGE_KEY_CLASS_TASKS = "eleven59_class_tasks_v1";

const SAMPLE_MESSY_DATA = [
  {
    sourceType: "WhatsApp",
    anchorTime: "2026-11-20T10:00:00+05:30",
    text: "Guys CS301 Graph Theory assignment kal raat 11:59 baje tak submit karna hai portal pe. Aur MA201 Linear Algebra quiz aaj dopahar 2 baje hoga."
  },
  {
    sourceType: "Email",
    anchorTime: "2026-11-20T11:30:00+05:30",
    subject: "CS301 Graph Theory Problem Set Reminder",
    courseHint: "CS301",
    text: "Reminder: Please upload the CS301 Graph Theory Assignment before tomorrow 11:59 PM IST."
  },
  {
    sourceType: "PDF",
    anchorTime: "2026-11-20T09:00:00+05:30",
    text: "Course Handout CS301: Graph Theory Assignment due Saturday 11:59 PM. CS302 DBMS Normalization Lab Report due 23rd Nov 6pm. PH102 Electromagnetics viva parso subah."
  },
  {
    sourceType: "WhatsApp",
    anchorTime: "2026-11-18T14:00:00+05:30",
    text: "CS302 SQL Join worksheet kal shaam 6 baje tak bhejna tha, abhi tak pending hai."
  }
];

let state = {
  tasks: [],
  geminiApiKey: "",
  profile: {
    name: "Student",
    course: "B.Tech · Sem 5"
  },
  filters: {
    course: "ALL",
    source: "ALL",
    search: "",
    crunchRange: null
  },
  editingTaskId: null,
  expandedTaskIds: new Set()
};

const livePreviewTimers = new WeakMap();
const CRUNCH_WINDOW_MS = 12 * 60 * 60 * 1000;
const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;
let currentCrunchCluster = null;

function showToast(message) {
  const el = document.getElementById("toastBanner");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.add("hidden");
  }, 3400);
}

function renderProfile() {
  const { name, course } = state.profile;
  document.getElementById("profileName").textContent = name;
  document.getElementById("profileCourse").textContent = course;
  document.getElementById("profileInitials").textContent = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function loadProfile() {
  try {
    const raw = isLocalSaveEnabled() ? localStorage.getItem(STORAGE_KEY_PROFILE) : null;
    if (raw) {
      const saved = JSON.parse(raw);
      if (
        !saved ||
        typeof saved.name !== "string" ||
        typeof saved.course !== "string" ||
        !saved.name.trim() ||
        !saved.course.trim()
      ) {
        throw new Error("Saved profile is incomplete.");
      }
      state.profile = { name: saved.name.trim(), course: saved.course.trim() };
    }
  } catch {
    state.profile = { name: "Student", course: "B.Tech · Sem 5" };
    showToast("Could not load the saved profile. Showing the default profile.");
  }
  renderProfile();
}

function closeProfilePopover() {
  document.getElementById("profilePopover")?.classList.add("hidden");
  document.getElementById("profileTrigger")?.setAttribute("aria-expanded", "false");
}

function applyTheme(theme) {
  const isDay = theme === "day";
  document.body.classList.toggle("theme-day", isDay);
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function loadTheme() {
  let theme = "night";
  try {
    theme =
      isLocalSaveEnabled() && localStorage.getItem(STORAGE_KEY_THEME) === "day"
        ? "day"
        : "night";
  } catch {
    showToast("Could not load the saved theme. Using night mode.");
  }
  applyTheme(theme);
}

function selectTheme(theme) {
  if (theme !== "day" && theme !== "night") return;
  applyTheme(theme);
  if (!isLocalSaveEnabled()) return;
  try {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  } catch {
    showToast("Theme changed, but the preference could not be saved.");
  }
}

function loadState() {
  try {
    const sharedState = readSharedState();
    const rawTasks = isLocalSaveEnabled()
      ? localStorage.getItem(STORAGE_KEY_TASKS) ||
        (Array.isArray(sharedState.deadlines)
          ? JSON.stringify(sharedState.deadlines)
          : null)
      : null;
    if (rawTasks) {
      const parsed = JSON.parse(rawTasks);
      if (Array.isArray(parsed)) state.tasks = parsed;
    }
  } catch {
    state.tasks = [];
  }
  try {
    state.geminiApiKey = isLocalSaveEnabled()
      ? localStorage.getItem(STORAGE_KEY_GEMINI) || ""
      : "";
  } catch {
    state.geminiApiKey = "";
    showToast("Could not load the saved parser key.");
  }
}

function saveState() {
  if (!isLocalSaveEnabled()) return true;
  try {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(state.tasks));
    const classTasks = getClassTrackerSnapshot();
    localStorage.setItem(STORAGE_KEY_CLASS_TASKS, JSON.stringify(classTasks));
    if (!saveSharedState({ deadlines: state.tasks, classTasks })) {
      throw new Error("Shared browser state could not be saved.");
    }
    return true;
  } catch {
    showToast("Could not save to localStorage (storage quota exceeded).");
    return false;
  }
}

function renderLocalSaveControls() {
  const enabled = isLocalSaveEnabled();
  const status = document.getElementById("localSaveStatus");
  const toggle = document.getElementById("localSaveToggle");
  if (!status || !toggle) return;
  status.textContent = `Local Save: ${enabled ? "ON" : "OFF"}`;
  status.classList.toggle("is-off", !enabled);
  toggle.textContent = enabled ? "Turn Off" : "Turn On";
  toggle.setAttribute("aria-pressed", String(enabled));
}

function switchMainTab(tabName) {
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.classList.toggle("border-indigo-600", active);
    btn.classList.toggle("text-indigo-600", active);
    btn.classList.toggle("border-transparent", !active);
    btn.classList.toggle("text-slate-500", !active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
  });
}

function switchIngestSubtab(subtab) {
  document.querySelectorAll(".ingest-subtab").forEach((btn) => {
    const active = btn.dataset.ingestTab === subtab;
    btn.classList.toggle("active", active);
    btn.classList.toggle("bg-indigo-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("bg-slate-100", !active);
    btn.classList.toggle("text-slate-700", !active);
  });

  document.querySelectorAll(".ingest-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `ingest-panel-${subtab}`);
  });
}

function getAnchorFromInput() {
  const input = document.getElementById("anchorSentTime");
  if (!input || !input.value) return new Date();
  // Interpret datetime-local value as IST (+05:30)
  return new Date(`${input.value}:00+05:30`);
}

function classifyUrgency(deadlineISO, nowWall) {
  const dueWall = parseIstIsoToWallDate(deadlineISO);
  const dueMs = dueWall.getTime();
  const nowMs = nowWall.getTime();

  const startOfTodayMs = Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate(), 0, 0, 0, 0);
  const endOfTodayMs = Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate(), 23, 59, 59, 999);
  const endOfWeekMs = startOfTodayMs + 7 * 24 * 60 * 60 * 1000;

  if (dueMs < nowMs) return "overdue";
  if (dueMs >= startOfTodayMs && dueMs <= endOfTodayMs) return "today";
  if (dueMs > endOfTodayMs && dueMs <= endOfWeekMs) return "week";
  return "upcoming";
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findPhraseRange(text, phrase) {
  if (!phrase) return null;
  const index = text.toLowerCase().indexOf(String(phrase).toLowerCase());
  return index < 0 ? null : { start: index, end: index + String(phrase).length };
}

function getLivePreviewRanges(text, tasks, submissionLink) {
  const ranges = [];
  const courseMatch = text.match(/\b[A-Z]{2,4}[-\s]?\d{2,4}[A-Z]?\b/i);
  if (courseMatch) {
    ranges.push({
      start: courseMatch.index,
      end: courseMatch.index + courseMatch[0].length,
      kind: "course",
      priority: 4
    });
  }

  let titleFound = false;
  let dateFound = false;
  for (const task of tasks) {
    const titleRange = findPhraseRange(text, task.title);
    if (titleRange) {
      ranges.push({ ...titleRange, kind: "title", priority: 2 });
      titleFound = true;
    }
    const dateRange = findPhraseRange(text, task.rawDatePhrase);
    if (dateRange) {
      ranges.push({ ...dateRange, kind: "date", priority: 3 });
      dateFound = true;
    }
  }

  if (!dateFound) {
    const dateMatch = text.match(
      /\b(?:day after tomorrow|tomorrow|today|aaj|kal|parso|is hafte|this week|(?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm|baje))\b/i
    );
    if (dateMatch) {
      ranges.push({
        start: dateMatch.index,
        end: dateMatch.index + dateMatch[0].length,
        kind: "date",
        priority: 3
      });
    }
  }

  if (submissionLink) {
    ranges.push({
      start: submissionLink.index,
      end: submissionLink.end,
      kind: "link",
      priority: 5,
      href: submissionLink.href
    });
  }

  if (!titleFound) {
    const start = courseMatch ? courseMatch.index + courseMatch[0].length : 0;
    const nextRange = ranges.find(
      (range) => (range.kind === "date" || range.kind === "link") && range.start >= start
    );
    let end = nextRange ? nextRange.start : text.length;
    let titleStart = start;
    const leadingNoise = text.slice(titleStart, end).match(/^(?:\s*(?:guys|yaar|bhai|reminder|please)\b[\s,:-]*)+/i);
    if (leadingNoise) titleStart += leadingNoise[0].length;
    let trailingCue = text.slice(titleStart, end).match(/\s+\b(?:due|deadline|submit|before|by|at|on)\b\s*$/i);
    while (trailingCue) {
      end = titleStart + trailingCue.index;
      trailingCue = text.slice(titleStart, end).match(/\s+\b(?:due|deadline|submit|before|by|at|on)\b\s*$/i);
    }
    while (titleStart < end && /[\s:|,-]/.test(text[titleStart])) titleStart++;
    while (end > titleStart && /[\s:|,-]/.test(text[end - 1])) end--;
    if (end - titleStart >= 3) {
      ranges.push({ start: titleStart, end, kind: "title", priority: 1 });
    }
  }

  return ranges
    .filter((range) => range.start >= 0 && range.end > range.start)
    .sort((a, b) => a.start - b.start || b.priority - a.priority || b.end - a.end);
}

function renderHighlightedPreviewText(text, ranges) {
  let html = "";
  let cursor = 0;

  for (const range of ranges) {
    if (range.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, range.start));
    const value = escapeHtml(text.slice(range.start, range.end));
    if (range.kind === "link") {
      html += `<a class="preview-highlight preview-link" href="${escapeHtml(range.href)}" target="_blank" rel="noopener noreferrer">${value}</a>`;
    } else {
      html += `<span class="preview-highlight preview-${range.kind}">${value}</span>`;
    }
    cursor = range.end;
  }

  return html + escapeHtml(text.slice(cursor));
}

function scheduleLivePreview(preview, text, sourceType, courseHint = "") {
  const requestId = Number(preview.dataset.previewRequest || 0) + 1;
  preview.dataset.previewRequest = String(requestId);
  clearTimeout(livePreviewTimers.get(preview));

  if (!text.trim()) {
    preview.classList.add("hidden");
    preview.replaceChildren();
    return;
  }

  preview.classList.remove("hidden");
  preview.innerHTML = `<div class="live-preview-heading">Live Detection Preview</div><p class="preview-loading">Resolving dates in IST…</p>`;
  const timer = setTimeout(async () => {
    try {
      const tasks = await parseDeadlines(text, {
        sourceType,
        anchorTime: getAnchorFromInput(),
        courseHint,
        geminiApiKey: ""
      });
      if (preview.dataset.previewRequest !== String(requestId)) return;

      const link = findSubmissionLink(text);
      const highlightedText = renderHighlightedPreviewText(text, getLivePreviewRanges(text, tasks, link));
      const resolutionHtml = tasks.length
        ? tasks
            .map(
              (task) => `<div class="live-preview-resolution">
                <span class="resolved-label">→ Resolved IST:</span>
                <time>${escapeHtml(formatReadableIst(task.deadlineISO))}</time>
                <span class="preview-confidence">${escapeHtml(task.confidence)} confidence</span>
              </div>`
            )
            .join("")
        : `<p class="preview-no-resolution">Add a date or time phrase to resolve an IST deadline.</p>`;

      preview.innerHTML = `
        <div class="live-preview-heading">Live Detection Preview</div>
        <div class="live-preview-text">${highlightedText}</div>
        <div class="live-preview-results">${resolutionHtml}</div>
      `;
    } catch (error) {
      if (preview.dataset.previewRequest !== String(requestId)) return;
      preview.innerHTML = `<div class="live-preview-heading">Live Detection Preview</div>
        <p class="preview-error">Preview unavailable: ${escapeHtml(error.message || "Could not resolve this text.")}</p>`;
    }
  }, 250);
  livePreviewTimers.set(preview, timer);
}

function findCrunchCluster(tasks, nowMs = Date.now()) {
  const upcoming = tasks
    .filter((task) => !task.completed && task.status !== "completed")
    .map((task) => ({ task, time: Date.parse(task.deadlineISO) }))
    .filter(({ time }) => Number.isFinite(time) && time >= nowMs)
    .sort((a, b) => a.time - b.time);

  let bestStart = 0;
  let bestEnd = 0;
  let right = 0;
  for (let left = 0; left < upcoming.length; left++) {
    if (right < left) right = left;
    while (right < upcoming.length && upcoming[right].time - upcoming[left].time <= CRUNCH_WINDOW_MS) {
      right++;
    }
    if (right - left > bestEnd - bestStart) {
      bestStart = left;
      bestEnd = right;
    }
  }

  if (bestEnd - bestStart < 2) return null;
  const items = upcoming.slice(bestStart, bestEnd);
  return {
    tasks: items.map(({ task }) => task),
    start: items[0].time,
    end: items[items.length - 1].time
  };
}

function renderCrunchAlert() {
  const banner = document.getElementById("crunchAlertBanner");
  const message = document.getElementById("crunchAlertMessage");
  const action = document.getElementById("crunchAlertAction");
  if (!banner || !message || !action) return;

  currentCrunchCluster = findCrunchCluster(state.tasks);
  if (!currentCrunchCluster) {
    state.filters.crunchRange = null;
    banner.classList.add("hidden");
    return;
  }

  const referenceTask = currentCrunchCluster.tasks[Math.floor(currentCrunchCluster.tasks.length / 2)];
  message.textContent =
    `${currentCrunchCluster.tasks.length} deadlines due within 12h around ` +
    formatReadableIst(referenceTask.deadlineISO);
  action.textContent = state.filters.crunchRange ? "Clear cluster filter" : "Show cluster";
  banner.classList.remove("hidden");
}

function updateCountdowns() {
  const now = Date.now();
  document.querySelectorAll("[data-countdown-deadline]").forEach((pill) => {
    const due = Date.parse(pill.dataset.countdownDeadline);
    const remaining = due - now;
    if (!Number.isFinite(due) || remaining < 0 || remaining > COUNTDOWN_WINDOW_MS) {
      pill.classList.add("hidden");
      return;
    }

    const totalMinutes = Math.ceil(remaining / 60000);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    pill.textContent = `${hours}h ${minutes}m left`;
    pill.classList.remove("hidden");
  });
}

function updateCourseFilterOptions() {
  const select = document.getElementById("filterCourse");
  if (!select) return;
  const current = state.filters.course;
  const courses = Array.from(new Set(state.tasks.map((t) => t.course).filter(Boolean))).sort();

  select.innerHTML = `<option value="ALL">All Courses</option>`;
  for (const c of courses) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
  select.value = courses.includes(current) ? current : "ALL";
  state.filters.course = select.value;
}

function getFilteredTasks() {
  const { course, source, search, crunchRange } = state.filters;
  const q = search.trim().toLowerCase();

  return state.tasks.filter((task) => {
    if (crunchRange) {
      const deadline = Date.parse(task.deadlineISO);
      if (deadline < crunchRange.start || deadline > crunchRange.end) return false;
    }
    if (course !== "ALL" && task.course !== course) return false;
    if (source !== "ALL") {
      const srcList = task.sources || [task.sourceType];
      if (!srcList.some((s) => s.toLowerCase().includes(source.toLowerCase()))) return false;
    }
    if (q) {
      const hay = `${task.title} ${task.course} ${task.rawDatePhrase} ${task.notes || ""} ${(task.sources || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function isoToDatetimeLocalIst(isoString) {
  const wall = parseIstIsoToWallDate(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

function renderTaskCard(task, bucket) {
  const badgeMap = {
    overdue: { cls: "urgency-overdue", label: "Overdue" },
    today: { cls: "urgency-today", label: "Due Today" },
    week: { cls: "urgency-week", label: "This Week" },
    upcoming: { cls: "urgency-upcoming", label: "Upcoming" }
  };
  const bInfo = badgeMap[bucket];

  const conf = task.confidence || "Medium";
  const confCls =
    conf === "High" ? "confidence-high" : conf === "Low" ? "confidence-low" : "confidence-medium";

  const sources = task.sources && task.sources.length > 0 ? task.sources : [task.sourceType];
  const sourceChips = sources.map((s) => `<span class="source-chip">${escapeHtml(s)}</span>`).join("");
  const submissionLink = findSubmissionLink(
    task.submissionUrl || task.rawSnippet || task.notes || ""
  );
  const submissionLinkHtml = submissionLink
    ? `<a class="submit-link" href="${escapeHtml(submissionLink.href)}" target="_blank" rel="noopener noreferrer">Submit ↗</a>`
    : "";
  const previousDeadlineMs = Date.parse(task.previousDeadlineISO || "");
  const showExtension =
    Number.isFinite(previousDeadlineMs) &&
    previousDeadlineMs < Date.parse(task.deadlineISO);
  const extensionHtml = showExtension
    ? `<div class="deadline-extension">
        <span class="extension-label">Extended</span>
        <time>${escapeHtml(formatReadableIst(task.previousDeadlineISO))}</time>
        <span aria-hidden="true">→</span>
        <time>${escapeHtml(formatReadableIst(task.deadlineISO))}</time>
      </div>`
    : "";

  const rawEntries = task.rawEntries || [
    {
      sourceType: task.sourceType,
      rawDatePhrase: task.rawDatePhrase,
      deadlineISO: task.deadlineISO,
      snippet: task.rawSnippet || task.notes || task.title
    }
  ];

  const isExpanded = state.expandedTaskIds.has(task.id);
  const isEditing = state.editingTaskId === task.id;

  const dateSectionHtml = isEditing
    ? `<div class="inline-flex items-center gap-1.5 mt-1">
         <input
           type="datetime-local"
           class="inline-date-input"
           data-edit-input="${task.id}"
           value="${isoToDatetimeLocalIst(task.deadlineISO)}"
         />
         <button type="button" data-save-date="${task.id}" class="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded cursor-pointer">Save</button>
         <button type="button" data-cancel-date="${task.id}" class="px-2 py-0.5 text-xs bg-slate-200 text-slate-700 rounded cursor-pointer">Cancel</button>
       </div>`
    : `<button
         type="button"
         data-start-edit="${task.id}"
         title="Click to edit deadline"
         class="deadline-time text-sm font-semibold text-slate-800 hover:text-indigo-600 underline decoration-dotted underline-offset-4 cursor-pointer"
       >
         ${escapeHtml(formatReadableIst(task.deadlineISO))}
       </button>`;

  const snippetsDrawerHtml = isExpanded
    ? `<div class="mt-3 pt-3 border-t border-slate-100 space-y-2">
         <div class="text-xs font-semibold uppercase tracking-wider text-slate-400">
           Source Snippets (${rawEntries.length})
         </div>
         ${rawEntries
           .map(
             (e) => `<div class="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
               <div class="flex items-center justify-between font-semibold text-slate-700">
                 <span>${escapeHtml(e.sourceType)}</span>
                 <span class="text-indigo-600">"${escapeHtml(e.rawDatePhrase)}"</span>
               </div>
               <p class="text-slate-600">${escapeHtml(e.snippet)}</p>
             </div>`
           )
           .join("")}
       </div>`
    : "";

  return `
    <article class="task-card bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="course-code px-2 py-0.5 text-xs font-bold rounded-md">${escapeHtml(task.course)}</span>
            <span class="urgency-badge ${bInfo.cls}">${bInfo.label}</span>
            <span class="confidence-pill ${confCls}">${escapeHtml(conf)} Conf.</span>
          </div>
          <div class="flex items-center gap-1">${sourceChips}</div>
        </div>

        <h4 class="text-base font-bold text-slate-900 mt-2.5">${escapeHtml(task.title)}</h4>

        <div class="flex flex-wrap items-center gap-3 mt-1.5">
          ${dateSectionHtml}
          <span class="why-date-trigger inline-flex items-center text-xs font-medium text-indigo-600" tabindex="0">
            Why this date?
            <span class="why-date-tooltip">
              <strong>Matched phrase:</strong> "${escapeHtml(task.rawDatePhrase)}"<br/>
              <strong>Normalized:</strong> ${escapeHtml(formatReadableIst(task.deadlineISO))}
            </span>
          </span>
        </div>
        <div class="task-live-meta">
          <span class="deadline-countdown hidden" data-countdown-deadline="${escapeHtml(task.deadlineISO)}" aria-live="off"></span>
          ${submissionLinkHtml}
        </div>
        ${extensionHtml}
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        <button
          type="button"
          data-toggle-sources="${task.id}"
          class="font-semibold text-slate-600 hover:text-indigo-600 cursor-pointer"
        >
          ${isExpanded ? "Hide raw snippets" : `View ${rawEntries.length > 1 ? "merged " : ""}raw snippet${rawEntries.length > 1 ? "s" : ""}`}
        </button>
        <button
          type="button"
          data-delete-task="${task.id}"
          class="font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
        >
          Remove
        </button>
      </div>
      ${snippetsDrawerHtml}
    </article>
  `;
}

function renderDashboard() {
  updateCourseFilterOptions();
  renderCrunchAlert();
  const filtered = getFilteredTasks();
  const nowWall = toIstWallDate(new Date());

  const buckets = {
    overdue: [],
    today: [],
    week: [],
    upcoming: []
  };

  const sorted = [...filtered].sort((a, b) => Date.parse(a.deadlineISO) - Date.parse(b.deadlineISO));
  for (const task of sorted) {
    const b = classifyUrgency(task.deadlineISO, nowWall);
    buckets[b].push(task);
  }

  document.getElementById("count-overdue").textContent = String(buckets.overdue.length);
  document.getElementById("count-today").textContent = String(buckets.today.length);
  document.getElementById("count-week").textContent = String(buckets.week.length);
  document.getElementById("count-upcoming").textContent = String(buckets.upcoming.length);
  document.getElementById("taskCountBadge").textContent = String(state.tasks.length);

  const container = document.getElementById("dashboardGroups");
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
        <p class="text-base font-semibold text-slate-700">No deadlines yet — you’re all caught up.</p>
        <p class="text-sm text-slate-500">Drop a messy WhatsApp forward, email, or PDF into Add sources and we’ll get it sorted.</p>
      </div>
    `;
    updateCountdowns();
    return;
  }

  const groupMeta = [
    { key: "overdue", title: "Overdue", accent: "text-rose-700" },
    { key: "today", title: "Due Today", accent: "text-amber-700" },
    { key: "week", title: "Due This Week", accent: "text-indigo-700" },
    { key: "upcoming", title: "Upcoming", accent: "text-emerald-700" }
  ];

  container.innerHTML = groupMeta
    .filter((g) => buckets[g.key].length > 0)
    .map(
      (g) => `
      <div class="space-y-3">
        <div class="urgency-heading glass-heading">
          <h3 class="text-sm font-bold uppercase tracking-wider ${g.accent}">
            ${g.title} (${buckets[g.key].length})
          </h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${buckets[g.key].map((t) => renderTaskCard(t, g.key)).join("")}
        </div>
      </div>
    `
    )
    .join("");
  updateCountdowns();
}

function renderLatestExtraction(extractedTasks, addedCount, mergedCount) {
  const box = document.getElementById("lastExtractionBox");
  const list = document.getElementById("lastExtractionList");
  if (!box || !list) return;

  box.classList.remove("hidden");
  if (!extractedTasks || extractedTasks.length === 0) {
    list.innerHTML = `<p class="text-amber-700">No explicit deadline phrases detected. Try adding a day or time like "kal raat 11:59 baje" or "Nov 24 6pm".</p>`;
    return;
  }

  const summary = `<p class="text-xs font-semibold text-indigo-700 mb-2">
    Parsed ${extractedTasks.length} item(s) • Added ${addedCount} new • Merged ${mergedCount} duplicate(s)
  </p>`;

  const itemsHtml = extractedTasks
    .map(
      (t) => `<div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="font-bold text-slate-900">[${escapeHtml(t.course)}] ${escapeHtml(t.title)}</span>
          <span class="text-xs text-slate-500 ml-2">Phrase: "${escapeHtml(t.rawDatePhrase)}"</span>
        </div>
        <span class="text-xs font-semibold text-slate-700">${escapeHtml(formatReadableIst(t.deadlineISO))}</span>
      </div>`
    )
    .join("");

  list.innerHTML = summary + itemsHtml;
}

async function handleIngestText(rawText, sourceType, courseHint = "") {
  const anchorTime = getAnchorFromInput();
  const parsed = await parseDeadlines(rawText, {
    sourceType,
    anchorTime,
    courseHint,
    geminiApiKey: state.geminiApiKey
  });

  const { tasks, addedCount, mergedCount } = deduplicateAndMergeTasks(state.tasks, parsed);
  state.tasks = tasks;
  saveState();
  renderDashboard();
  renderLatestExtraction(parsed, addedCount, mergedCount);
  showToast(`Added ${addedCount}, merged ${mergedCount} from ${sourceType}.`);
}

async function handleLoadSampleData() {
  let runningTasks = [...state.tasks];
  let totalAdded = 0;
  let totalMerged = 0;
  const allParsed = [];

  for (const item of SAMPLE_MESSY_DATA) {
    const combinedText = item.subject ? `${item.subject}\n${item.text}` : item.text;
    const parsed = await parseDeadlines(combinedText, {
      sourceType: item.sourceType,
      anchorTime: item.anchorTime,
      courseHint: item.courseHint || "",
      geminiApiKey: state.geminiApiKey
    });
    allParsed.push(...parsed);
    const res = deduplicateAndMergeTasks(runningTasks, parsed);
    runningTasks = res.tasks;
    totalAdded += res.addedCount;
    totalMerged += res.mergedCount;
  }

  state.tasks = runningTasks;
  saveState();
  renderDashboard();
  renderLatestExtraction(allParsed, totalAdded, totalMerged);
  switchMainTab("dashboard");
  showToast(`Loaded sample data: +${totalAdded} tasks, ${totalMerged} duplicates merged.`);
}

function exportToIcs() {
  if (state.tasks.length === 0) {
    showToast("No tasks to export.");
    return;
  }

  const formatUtcIcs = (isoStr) => {
    const d = new Date(isoStr);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };

  const escapeIcsText = (s = "") =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//eleven59//IST Deadline Calendar//EN",
    "CALSCALE:GREGORIAN"
  ];

  for (const task of state.tasks) {
    const startUtc = formatUtcIcs(task.deadlineISO);
    const endDate = new Date(Date.parse(task.deadlineISO) + 30 * 60 * 1000);
    const endUtc = formatUtcIcs(endDate.toISOString());
    const sources = (task.sources || [task.sourceType]).join(", ");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(task.id)}@eleven59`);
    lines.push(`DTSTAMP:${formatUtcIcs(new Date().toISOString())}`);
    lines.push(`DTSTART:${startUtc}`);
    lines.push(`DTEND:${endUtc}`);
    lines.push(`SUMMARY:${escapeIcsText(`[${task.course}] ${task.title}`)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(`Sources: ${sources} | Phrase: "${task.rawDatePhrase}" | IST: ${formatReadableIst(task.deadlineISO)}`)}`
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "eleven59-deadlines.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${state.tasks.length} deadlines to .ICS`);
}

async function handleRunBenchmark() {
  const btn = document.getElementById("runBenchmarkBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Running 15 Cases...";
  }

  try {
    const { results, metrics } = await runAccuracyBenchmark(state.geminiApiKey);

    const setMetric = (metricId, statusId, pct, hits, total) => {
      const mEl = document.getElementById(metricId);
      const sEl = document.getElementById(statusId);
      const passedThreshold = pct >= 80;
      mEl.textContent = `${pct}% (${hits}/${total})`;
      sEl.textContent = passedThreshold ? "PASS · >= 80% target" : "Below 80% target";
      sEl.className = `scorecard-status mt-2 ${passedThreshold ? "scorecard-pass" : "scorecard-fail"}`;
      mEl.className = "metric-value mt-1";
    };

    setMetric("metricExtraction", "statusExtraction", metrics.extractionAcc, metrics.extractionHits, metrics.total);
    setMetric("metricDate", "statusDate", metrics.dateAcc, metrics.dateHits, metrics.total);
    setMetric("metricDedup", "statusDedup", metrics.dedupAcc, metrics.dedupHits, metrics.total);

    const tbody = document.getElementById("benchmarkTableBody");
    tbody.innerHTML = results
      .map(
        (r) => `<tr class="hover:bg-slate-50">
          <td class="py-2.5 px-3 font-semibold text-slate-600">${r.id}</td>
          <td class="py-2.5 px-3 max-w-xs">
            <div class="font-medium text-slate-800">${escapeHtml(r.input)}</div>
            <div class="scorecard-expected mt-1">Expected: ${escapeHtml(r.expectedCourse)} · ${escapeHtml(r.expectedIso)}</div>
          </td>
          <td class="py-2.5 px-3">
            <span class="scorecard-status ${r.extractionOk ? "scorecard-pass" : "scorecard-fail"}">
              ${escapeHtml(r.actualCourse)}
            </span>
          </td>
          <td class="py-2.5 px-3 text-xs">
            <span class="scorecard-date ${r.dateOk ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}">
              ${escapeHtml(r.actualIso)}
            </span>
          </td>
          <td class="py-2.5 px-3">
            <span class="scorecard-status ${r.dedupOk ? "scorecard-pass" : "scorecard-fail"}">
              ${r.dedupOk ? "OK" : "Mismatch"}
            </span>
          </td>
          <td class="py-2.5 px-3">
            <span class="scorecard-result ${r.passed ? "scorecard-pass" : "scorecard-fail"}">
              ${r.passed ? "PASS" : "FAIL"}
            </span>
          </td>
        </tr>`
      )
      .join("");

    showToast(`Benchmark complete: Ext ${metrics.extractionAcc}%, Date ${metrics.dateAcc}%, Dedup ${metrics.dedupAcc}%`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Run scorecard";
    }
  }
}

function bindEvents() {
  document.getElementById("localSaveToggle")?.addEventListener("click", () => {
    const enabled = !isLocalSaveEnabled();
    if (!setLocalSaveEnabled(enabled)) {
      showToast("Could not save the Local Save preference in this browser.");
      return;
    }
    renderLocalSaveControls();
    if (enabled) {
      const saved = saveState();
      showToast(saved
        ? "Local Save is ON. Current deadlines and class tasks were saved."
        : "Local Save is ON, but browser data could not be saved.");
    } else {
      showToast("Local Save is OFF. Changes will stay in memory until this page is closed.");
    }
  });

  document.getElementById("clearSavedDataBtn")?.addEventListener("click", () => {
    if (!clearSavedBrowserData()) {
      showToast("Could not clear all saved browser data. Check storage permissions.");
      return;
    }
    state.tasks = [];
    state.geminiApiKey = "";
    state.profile = { name: "Student", course: "B.Tech · Sem 5" };
    state.filters = { course: "ALL", source: "ALL", search: "", crunchRange: null };
    state.editingTaskId = null;
    state.expandedTaskIds.clear();
    clearClassTrackerMemory();
    renderProfile();
    applyTheme("night");
    renderLocalSaveControls();
    renderDashboard();
    showToast("Saved data cleared. Local Save is ON for a clean demo.");
  });

  const profileTrigger = document.getElementById("profileTrigger");
  const profilePopover = document.getElementById("profilePopover");
  const profileForm = document.getElementById("profileForm");
  const profileNameInput = document.getElementById("profileNameInput");
  const profileCourseInput = document.getElementById("profileCourseInput");

  profileTrigger?.addEventListener("click", () => {
    if (!profilePopover) return;
    if (!profilePopover.classList.contains("hidden")) {
      closeProfilePopover();
      return;
    }
    profileNameInput.value = state.profile.name;
    profileCourseInput.value = state.profile.course;
    profilePopover.classList.remove("hidden");
    profileTrigger.setAttribute("aria-expanded", "true");
    profileNameInput.focus();
  });

  profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = profileNameInput.value.trim();
    const course = profileCourseInput.value.trim();
    if (!name || !course) {
      showToast("Add your name and course details before saving.");
      return;
    }
    const profile = { name, course };
    if (isLocalSaveEnabled()) {
      try {
        localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
      } catch {
        showToast("Could not save your profile. Check browser storage permissions.");
        return;
      }
    }
    state.profile = profile;
    renderProfile();
    closeProfilePopover();
    showToast("Profile saved.");
  });

  document.getElementById("cancelProfileBtn")?.addEventListener("click", closeProfilePopover);
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      profilePopover &&
      profileTrigger &&
      target instanceof Node &&
      !profilePopover.contains(target) &&
      !profileTrigger.contains(target)
    ) {
      closeProfilePopover();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProfilePopover();
  });

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => selectTheme(button.dataset.themeChoice));
  });

  // Main navigation tabs
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchMainTab(btn.dataset.tab));
  });

  // Ingestion subtabs
  document.querySelectorAll(".ingest-subtab").forEach((btn) => {
    btn.addEventListener("click", () => switchIngestSubtab(btn.dataset.ingestTab));
  });

  // Jump from dashboard to ingest
  document.getElementById("jumpToIngestBtn")?.addEventListener("click", () => switchMainTab("ingest"));

  // Load Sample Messy Data
  document.getElementById("loadDemoBtn")?.addEventListener("click", handleLoadSampleData);

  // Export .ICS
  document.getElementById("exportIcsBtn")?.addEventListener("click", exportToIcs);

  // Clear all tasks
  document.getElementById("clearAllTasksBtn")?.addEventListener("click", () => {
    state.tasks = [];
    state.filters.crunchRange = null;
    state.editingTaskId = null;
    state.expandedTaskIds.clear();
    saveState();
    renderDashboard();
    showToast("All tasks cleared.");
  });

  // Filters
  document.getElementById("filterCourse")?.addEventListener("change", (e) => {
    state.filters.course = e.target.value;
    renderDashboard();
  });
  document.getElementById("filterSource")?.addEventListener("change", (e) => {
    state.filters.source = e.target.value;
    renderDashboard();
  });
  document.getElementById("searchTasks")?.addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderDashboard();
  });

  document.getElementById("crunchAlertAction")?.addEventListener("click", () => {
    if (state.filters.crunchRange) {
      state.filters.crunchRange = null;
    } else if (currentCrunchCluster) {
      state.filters.crunchRange = {
        start: currentCrunchCluster.start,
        end: currentCrunchCluster.end
      };
      state.filters.course = "ALL";
      state.filters.source = "ALL";
      state.filters.search = "";
      document.getElementById("filterCourse").value = "ALL";
      document.getElementById("filterSource").value = "ALL";
      document.getElementById("searchTasks").value = "";
    }
    renderDashboard();
  });

  const messageInput = document.getElementById("messageInput");
  const messagePreview = document.getElementById("messageLivePreview");
  const updateMessagePreview = () =>
    scheduleLivePreview(messagePreview, messageInput.value, "WhatsApp");
  messageInput?.addEventListener("input", updateMessagePreview);

  const emailBody = document.getElementById("emailBody");
  const emailSubject = document.getElementById("emailSubject");
  const emailCourseHint = document.getElementById("emailCourseHint");
  const emailPreview = document.getElementById("emailLivePreview");
  const updateEmailPreview = () =>
    scheduleLivePreview(
      emailPreview,
      [emailSubject.value, emailBody.value].filter(Boolean).join("\n"),
      "Email",
      emailCourseHint.value
    );
  emailBody?.addEventListener("input", updateEmailPreview);
  emailSubject?.addEventListener("input", updateEmailPreview);
  emailCourseHint?.addEventListener("input", updateEmailPreview);
  document.getElementById("anchorSentTime")?.addEventListener("change", () => {
    updateMessagePreview();
    updateEmailPreview();
  });

  // Parse Messy Message
  document.getElementById("parseMessageBtn")?.addEventListener("click", async () => {
    const textarea = document.getElementById("messageInput");
    const text = textarea?.value || "";
    if (!text.trim()) {
      showToast("Please paste a message first.");
      return;
    }
    await handleIngestText(text, "WhatsApp");
    textarea.value = "";
    updateMessagePreview();
  });

  // Parse Email
  document.getElementById("parseEmailBtn")?.addEventListener("click", async () => {
    const subj = document.getElementById("emailSubject")?.value || "";
    const courseHint = document.getElementById("emailCourseHint")?.value || "";
    const bodyEl = document.getElementById("emailBody");
    const body = bodyEl?.value || "";
    const combined = [subj, body].filter(Boolean).join("\n");
    if (!combined.trim()) {
      showToast("Please enter email subject or body.");
      return;
    }
    await handleIngestText(combined, "Email", courseHint);
    if (bodyEl) bodyEl.value = "";
    updateEmailPreview();
  });

  // PDF File Picker & Extraction
  const pdfInput = document.getElementById("pdfFileInput");
  document.getElementById("choosePdfBtn")?.addEventListener("click", () => pdfInput?.click());
  pdfInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById("pdfFileName").textContent = `Loaded: ${file.name}`;
    try {
      const extracted = await extractTextFromPdfFile(file);
      document.getElementById("pdfExtractedText").value = extracted;
      showToast(`Extracted text from ${file.name}`);
    } catch (err) {
      showToast(err.message || "Failed to read PDF.");
    }
  });

  // Parse PDF Text
  document.getElementById("parsePdfBtn")?.addEventListener("click", async () => {
    const pdfText = document.getElementById("pdfExtractedText")?.value || "";
    if (!pdfText.trim()) {
      showToast("Upload a PDF or paste syllabus text first.");
      return;
    }
    await handleIngestText(pdfText, "PDF");
  });

  // Dashboard task actions (inline edit, expand snippets, remove)
  document.getElementById("dashboardGroups")?.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const startEditId = target.dataset.startEdit;
    if (startEditId) {
      state.editingTaskId = startEditId;
      renderDashboard();
      return;
    }

    const cancelEditId = target.dataset.cancelDate;
    if (cancelEditId) {
      state.editingTaskId = null;
      renderDashboard();
      return;
    }

    const saveDateId = target.dataset.saveDate;
    if (saveDateId) {
      const inputEl = document.querySelector(`[data-edit-input="${saveDateId}"]`);
      if (inputEl && inputEl.value) {
        const updatedDate = new Date(`${inputEl.value}:00+05:30`);
        if (!Number.isNaN(updatedDate.getTime())) {
          const newIso = formatIstIso(toIstWallDate(updatedDate));
          state.tasks = state.tasks.map((t) =>
            t.id === saveDateId
              ? {
                  ...t,
                  deadlineISO: newIso,
                  rawDatePhrase: `Manually edited (${t.rawDatePhrase})`,
                  confidence: "High"
                }
              : t
          );
          state.editingTaskId = null;
          saveState();
          renderDashboard();
          showToast("Deadline updated in IST.");
        }
      }
      return;
    }

    const toggleId = target.dataset.toggleSources;
    if (toggleId) {
      if (state.expandedTaskIds.has(toggleId)) {
        state.expandedTaskIds.delete(toggleId);
      } else {
        state.expandedTaskIds.add(toggleId);
      }
      renderDashboard();
      return;
    }

    const deleteId = target.dataset.deleteTask;
    if (deleteId) {
      state.tasks = state.tasks.filter((t) => t.id !== deleteId);
      state.expandedTaskIds.delete(deleteId);
      saveState();
      renderDashboard();
      showToast("Task removed.");
    }
  });

  // Benchmark button
  document.getElementById("runBenchmarkBtn")?.addEventListener("click", handleRunBenchmark);

  // Settings Modal
  const modal = document.getElementById("settingsModal");
  const keyInput = document.getElementById("geminiApiKeyInput");
  const statusHint = document.getElementById("geminiStatusHint");

  const syncGeminiHint = () => {
    if (!statusHint) return;
    statusHint.textContent = state.geminiApiKey
      ? "Gemini API enhancement enabled (with offline fallback)"
      : "Offline Hinglish + IST parser active";
  };
  syncGeminiHint();

  document.getElementById("openSettingsBtn")?.addEventListener("click", () => {
    if (keyInput) keyInput.value = state.geminiApiKey;
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  });

  document.getElementById("closeSettingsBtn")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  });

  document.getElementById("saveSettingsBtn")?.addEventListener("click", () => {
    state.geminiApiKey = (keyInput?.value || "").trim();
    if (isLocalSaveEnabled()) {
      try {
        localStorage.setItem(STORAGE_KEY_GEMINI, state.geminiApiKey);
      } catch {
        showToast("Parser key updated for this session, but could not be saved.");
        return;
      }
    }
    syncGeminiHint();
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
    showToast("Parser settings saved.");
  });

  document.getElementById("clearGeminiKeyBtn")?.addEventListener("click", () => {
    state.geminiApiKey = "";
    if (keyInput) keyInput.value = "";
    if (isLocalSaveEnabled()) localStorage.removeItem(STORAGE_KEY_GEMINI);
    syncGeminiHint();
    showToast("Gemini API key cleared.");
  });
}

function init() {
  initializeLocalSave(showToast);
  loadState();
  loadProfile();
  loadTheme();
  const anchorInput = document.getElementById("anchorSentTime");
  if (anchorInput) {
    anchorInput.value = getCurrentIstAnchorString();
  }
  bindEvents();
  initializeClassTracker(showToast);
  renderLocalSaveControls();
  renderDashboard();
  updateCountdowns();
  window.setInterval(updateCountdowns, 60_000);
}

init();