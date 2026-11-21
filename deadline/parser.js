// Mixed English + Hinglish Deadline Extractor & IST (Asia/Kolkata, UTC+05:30) Resolver

const IST_OFFSET_MINUTES = 330; // +05:30
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const SUBMISSION_URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[A-Z0-9-]+\.)*(?:classroom\.google\.com|forms\.gle|github\.com|moodle(?:\.[A-Z0-9-]+)+)(?:\/[^\s<>"']*)?/i;

function isSubmissionLinkOnlySegment(segment) {
  const withoutUrl = segment.replace(SUBMISSION_URL_REGEX, " ");
  return withoutUrl
    .replace(/\b(?:submit|submission|upload|uploaded|uploading|link|here|portal)\b/gi, "")
    .replace(/[\s:.,!?-]/g, "")
    .length === 0;
}

const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

const WEEKDAYS = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1, somwar: 1,
  tuesday: 2, tue: 2, tues: 2, mangalwar: 2,
  wednesday: 3, wed: 3, budhwar: 3,
  thursday: 4, thu: 4, thurs: 4, guruwar: 4,
  friday: 5, fri: 5, shukrawar: 5,
  saturday: 6, sat: 6, shaniwar: 6
};

/**
 * Converts a Date or ISO string into an IST "wall-clock" Date object (stored in UTC fields for deterministic arithmetic)
 * plus helper formatters for `+05:30`.
 */
export function toIstWallDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Date(valid.getTime() + IST_OFFSET_MS);
}

/**
 * Formats an IST wall-clock Date into an explicit `+05:30` ISO string: YYYY-MM-DDTHH:mm:00+05:30
 */
export function formatIstIso(istWallDate) {
  const pad = (n) => String(n).padStart(2, "0");
  const year = istWallDate.getUTCFullYear();
  const month = pad(istWallDate.getUTCMonth() + 1);
  const day = pad(istWallDate.getUTCDate());
  const hour = pad(istWallDate.getUTCHours());
  const minute = pad(istWallDate.getUTCMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}:00+05:30`;
}

/**
 * Parses a `+05:30` ISO string back into an IST wall-clock Date for display/grouping.
 */
export function parseIstIsoToWallDate(isoString) {
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return toIstWallDate(new Date());
  return new Date(ms + IST_OFFSET_MS);
}

export function formatReadableIst(isoString) {
  const wall = parseIstIsoToWallDate(isoString);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dow = dayNames[wall.getUTCDay()];
  const day = wall.getUTCDate();
  const mon = monthNames[wall.getUTCMonth()];
  const yr = wall.getUTCFullYear();
  let hr = wall.getUTCHours();
  const min = String(wall.getUTCMinutes()).padStart(2, "0");
  const ampm = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${dow}, ${day} ${mon} ${yr} at ${hr}:${min} ${ampm} IST`;
}

export function getCurrentIstAnchorString() {
  const wall = toIstWallDate(new Date());
  const pad = (n) => String(n).padStart(2, "0");
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

export function findSubmissionLink(text = "") {
  const match = String(text).match(SUBMISSION_URL_REGEX);
  if (!match) return null;

  const raw = match[0].replace(/[.,!?;:)\]}]+$/g, "");
  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return {
      href: url.href,
      text: raw,
      index: match.index,
      end: match.index + raw.length
    };
  } catch {
    return null;
  }
}

export function extractSubmissionUrl(text = "") {
  return findSubmissionLink(text)?.href || "";
}

function makeIstDate(year, monthIndex, day, hour = 23, minute = 59) {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, 0, 0));
}

function extractTimeFromSegment(seg) {
  const lower = seg.toLowerCase();

  // Explicit 12h or 24h time e.g. "11:59 baje", "5pm sharp", "6:30 pm", "18:00", "9 baje", "11.30 am"
  const explicitMatch = lower.match(
    /\b(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm|baje|o'clock)?(?:\s*(sharp|tak|ko|se|onwards))?\b/
  );
  if (explicitMatch) {
    let hour = parseInt(explicitMatch[1], 10);
    const minute = explicitMatch[2] ? parseInt(explicitMatch[2], 10) : 0;
    const mer = (explicitMatch[3] || "").toLowerCase();

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      if (mer === "pm" && hour < 12) hour += 12;
      if (mer === "am" && hour === 12) hour = 0;
      if (mer === "baje") {
        // Hinglish context: if "subah" is nearby, keep AM; if "shaam"/"raat" or hour between 1 and 7 without subah, treat as PM
        if (/\bsubah\b/.test(lower)) {
          if (hour === 12) hour = 0;
        } else if (/\b(shaam|raat|dopahar)\b/.test(lower) || (hour >= 1 && hour <= 7)) {
          if (hour < 12) hour += 12;
        }
      }
      return { hour, minute, matchedTime: explicitMatch[0].trim(), hasExplicitTime: true };
    }
  }

  // Hinglish / English period keywords
  if (/\b(subah|morning)\b/.test(lower)) {
    return { hour: 9, minute: 0, matchedTime: lower.match(/\b(subah|morning)\b/)[0], hasExplicitTime: true };
  }
  if (/\b(dopahar|afternoon|noon)\b/.test(lower)) {
    return { hour: 14, minute: 0, matchedTime: lower.match(/\b(dopahar|afternoon|noon)\b/)[0], hasExplicitTime: true };
  }
  if (/\b(shaam|evening)\b/.test(lower)) {
    return { hour: 18, minute: 0, matchedTime: lower.match(/\b(shaam|evening)\b/)[0], hasExplicitTime: true };
  }
  if (/\b(raat|eod|midnight|night)\b/.test(lower)) {
    return { hour: 23, minute: 59, matchedTime: lower.match(/\b(raat|eod|midnight|night)\b/)[0], hasExplicitTime: true };
  }

  return { hour: 23, minute: 59, matchedTime: "", hasExplicitTime: false };
}

function resolveDateFromSegment(seg, anchorWall) {
  const lower = seg.toLowerCase();
  const baseYear = anchorWall.getUTCFullYear();
  const baseMonth = anchorWall.getUTCMonth();
  const baseDay = anchorWall.getUTCDate();
  const baseDow = anchorWall.getUTCDay();

  const timeInfo = extractTimeFromSegment(lower);
  let targetDate = null;
  let datePhrase = "";
  let confidence = "Medium";

  // 1. Explicit date like "23rd Nov", "Nov 24 6pm", "24 November"
  const monthPattern = new RegExp(
    `\\b(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${Object.keys(MONTHS).join("|")})|(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?)\\b`,
    "i"
  );
  const mMatch = lower.match(monthPattern);
  if (mMatch) {
    const dayNum = parseInt(mMatch[1] || mMatch[4], 10);
    const monKey = (mMatch[2] || mMatch[3]).toLowerCase();
    const monIdx = MONTHS[monKey];
    let yr = baseYear;
    // If the month is earlier in the year than anchor month by > 2 months, roll to next year
    if (monIdx < baseMonth - 2) yr += 1;
    targetDate = makeIstDate(yr, monIdx, dayNum, timeInfo.hour, timeInfo.minute);
    datePhrase = mMatch[0].trim();
    confidence = "High";
  }

  // 2. Numeric slash date like "25/11" or "25/11/2026"
  if (!targetDate) {
    const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (slashMatch) {
      const dayNum = parseInt(slashMatch[1], 10);
      const monIdx = parseInt(slashMatch[2], 10) - 1;
      let yr = slashMatch[3] ? parseInt(slashMatch[3], 10) : baseYear;
      if (yr < 100) yr += 2000;
      if (monIdx >= 0 && monIdx <= 11 && dayNum >= 1 && dayNum <= 31) {
        targetDate = makeIstDate(yr, monIdx, dayNum, timeInfo.hour, timeInfo.minute);
        datePhrase = slashMatch[0].trim();
        confidence = "High";
      }
    }
  }

  // 3. Relative days: aaj/today, kal/tomorrow, parso (+2 days)
  if (!targetDate && /\b(parso|day after tomorrow)\b/.test(lower)) {
    const d = new Date(Date.UTC(baseYear, baseMonth, baseDay + 2));
    targetDate = makeIstDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), timeInfo.hour, timeInfo.minute);
    datePhrase = lower.match(/\b(parso|day after tomorrow)\b/)[0];
    confidence = timeInfo.hasExplicitTime ? "High" : "Medium";
  }

  if (!targetDate && /\b(kal|tomorrow)\b/.test(lower)) {
    const d = new Date(Date.UTC(baseYear, baseMonth, baseDay + 1));
    targetDate = makeIstDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), timeInfo.hour, timeInfo.minute);
    datePhrase = lower.match(/\b(kal|tomorrow)\b/)[0];
    confidence = timeInfo.hasExplicitTime ? "High" : "Medium";
  }

  if (!targetDate && /\b(aaj|today)\b/.test(lower)) {
    targetDate = makeIstDate(baseYear, baseMonth, baseDay, timeInfo.hour, timeInfo.minute);
    datePhrase = lower.match(/\b(aaj|today)\b/)[0];
    confidence = timeInfo.hasExplicitTime ? "High" : "Medium";
  }

  // 4. Weekday expressions: "this Friday", "next Monday", bare weekday
  if (!targetDate) {
    const wkKeys = Object.keys(WEEKDAYS).join("|");
    const wkRegex = new RegExp(`\\b(?:(this|next)\\s+)?(${wkKeys})\\b`, "i");
    const wkMatch = lower.match(wkRegex);
    if (wkMatch) {
      const modifier = (wkMatch[1] || "").toLowerCase();
      const targetDow = WEEKDAYS[wkMatch[2].toLowerCase()];
      let delta = (targetDow - baseDow + 7) % 7;
      if (modifier === "next") {
        delta = delta === 0 ? 7 : delta + 7;
      } else if (modifier === "this") {
        // "this Friday": if today is past Friday or same day with no future feel, keep current week unless already passed by > 2 days
        if (delta === 0) delta = 0;
      }
      const d = new Date(Date.UTC(baseYear, baseMonth, baseDay + delta));
      targetDate = makeIstDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), timeInfo.hour, timeInfo.minute);
      datePhrase = wkMatch[0].trim();
      confidence = modifier ? "High" : "Medium";
    }
  }

  // 5. "is hafte" / "this week" -> Friday end of week or +4 days
  if (!targetDate && /\b(is hafte|this week)\b/.test(lower)) {
    const deltaToFri = (5 - baseDow + 7) % 7;
    const daysAdd = deltaToFri > 0 ? deltaToFri : 4;
    const d = new Date(Date.UTC(baseYear, baseMonth, baseDay + daysAdd));
    targetDate = makeIstDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), timeInfo.hour, timeInfo.minute);
    datePhrase = lower.match(/\b(is hafte|this week)\b/)[0];
    confidence = "Low";
  }

  // 6. Time-only phrase without explicit day -> assume today (or tomorrow if already passed by >3h)
  if (!targetDate && timeInfo.hasExplicitTime) {
    let candidate = makeIstDate(baseYear, baseMonth, baseDay, timeInfo.hour, timeInfo.minute);
    const anchorMinutes = anchorWall.getUTCHours() * 60 + anchorWall.getUTCMinutes();
    const candMinutes = timeInfo.hour * 60 + timeInfo.minute;
    if (candMinutes < anchorMinutes - 180) {
      const d = new Date(Date.UTC(baseYear, baseMonth, baseDay + 1));
      candidate = makeIstDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), timeInfo.hour, timeInfo.minute);
      datePhrase = `${timeInfo.matchedTime} (next day)`;
      confidence = "Low";
    } else {
      datePhrase = timeInfo.matchedTime;
      confidence = "Medium";
    }
    targetDate = candidate;
  }

  if (!targetDate) return null;

  const fullPhrase = [datePhrase, timeInfo.matchedTime]
    .filter((p, idx, arr) => p && !arr.slice(0, idx).some((prev) => prev.includes(p) || p.includes(prev)))
    .join(" ")
    .trim();

  return {
    deadlineISO: formatIstIso(targetDate),
    rawDatePhrase: fullPhrase || datePhrase,
    confidence
  };
}

function extractCourseCode(text, fallbackCourse = "") {
  if (fallbackCourse && fallbackCourse.trim()) {
    return fallbackCourse.trim().toUpperCase();
  }
  const match = text.match(/\b([A-Z]{2,4}[-\s]?\d{2,4}[A-Z]?)\b/);
  if (match) {
    return match[1].replace(/[-\s]+/, "").toUpperCase();
  }
  const knownSubjects = [
    { rx: /\b(dbms|database)\b/i, code: "CS302" },
    { rx: /\b(graph theory|algorithms|dsa|os|operating system|ml|machine learning|cn|networks)\b/i, code: "CS301" },
    { rx: /\b(linear algebra|calculus|probability|maths?)\b/i, code: "MA201" },
    { rx: /\b(physics|electromagnetics|quantum)\b/i, code: "PH102" }
  ];
  for (const item of knownSubjects) {
    if (item.rx.test(text)) return item.code;
  }
  return "GEN101";
}

function cleanTaskTitle(segment, course) {
  let title = segment
    .replace(/\b(guys|yaar|bhai|please|plz|reminder|urgent|fyi|note)\b/gi, "")
    .replace(/\b(aaj|today|kal|tomorrow|parso|subah|dopahar|shaam|raat|eod|midnight|is hafte|this week)\b/gi, "")
    .replace(/\b(this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|somwar|mangalwar|budhwar|guruwar|shukrawar|shaniwar)\b/gi, "")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, "")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "")
    .replace(/\b\d{1,2}(?:[:.]\d{1,2})?\s*(?:am|pm|baje|o'clock)?(?:\s*(?:sharp|tak|ko|se))?\b/gi, "")
    .replace(/\b(submit|karna|karo|dena|bhejna|upload|due|deadline|hai|hain|tak|portal|pe|par)\b/gi, " ")
    .replace(new RegExp(`\\b${course}\\b`, "gi"), "")
    .replace(/[|•\-–—:;()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!title || title.length < 3) {
    title = `${course} Submission`;
  }
  return title
    .split(" ")
    .slice(0, 7)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
}

const DEADLINE_SIGNAL_REGEX =
  /\b(assignment|hw|homework|lab|viva|quiz|exam|midterm|endsem|project|report|submission|submit|due|deadline|karna|bhejna|upload|aaj|today|kal|tomorrow|parso|subah|dopahar|shaam|raat|eod|midnight|baje|am|pm|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2})\b/i;

/**
 * Optional Gemini enhancement when user has saved an API key in Settings.
 */
async function enhanceWithGeminiIfConfigured(rawText, anchorIso, sourceType, baseTasks, apiKey) {
  if (!apiKey || !navigator.onLine) return null;
  try {
    const prompt = `You are a strict JSON deadline extractor for Indian university students.
Anchor time (IST +05:30): ${anchorIso}
Source: ${sourceType}
Text: """${rawText}"""
Return ONLY a JSON array of objects with keys: title, course, deadlineISO (must end in +05:30), rawDatePhrase, confidence ("High"|"Medium"|"Low"), notes.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = textOut.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed.map((item, idx) => ({
      id: `task_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      title: String(item.title || baseTasks[0]?.title || "Assignment").trim(),
      course: extractCourseCode(String(item.course || item.title || rawText), ""),
      deadlineISO: /\+05:30$/.test(String(item.deadlineISO || ""))
        ? String(item.deadlineISO)
        : formatIstIso(toIstWallDate(item.deadlineISO || new Date())),
      rawDatePhrase: String(item.rawDatePhrase || "Gemini extracted").trim(),
      sourceType,
      submissionUrl: extractSubmissionUrl(rawText),
      confidence: ["High", "Medium", "Low"].includes(item.confidence) ? item.confidence : "High",
      notes: String(item.notes || rawText.trim()).slice(0, 240),
      rawSnippet: rawText.trim(),
      sources: [sourceType]
    }));
  } catch {
    return null;
  }
}

/**
 * Main parser entry point. Works 100% deterministically offline in IST (+05:30).
 */
export async function parseDeadlines(rawText, options = {}) {
  const {
    sourceType = "WhatsApp",
    anchorTime = new Date(),
    courseHint = "",
    geminiApiKey = ""
  } = options;

  const trimmed = (rawText || "").trim();
  if (!trimmed) return [];

  const anchorWall = toIstWallDate(anchorTime);
  const anchorIso = formatIstIso(anchorWall);
  const submissionUrl = extractSubmissionUrl(trimmed);

  // Split text into candidate sentences / lines / clauses
  const segments = trimmed
    .split(/\n+|(?<=[.!?])\s+|\s+(?:aur|and|also|plus)\s+(?=[A-Z0-9])/i)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 4 &&
        DEADLINE_SIGNAL_REGEX.test(s) &&
        !isSubmissionLinkOnlySegment(s)
    );

  const candidates = segments.length > 0 ? segments : [trimmed];
  const tasks = [];

  for (let i = 0; i < candidates.length; i++) {
    const seg = candidates[i];
    const resolved = resolveDateFromSegment(seg, anchorWall) || resolveDateFromSegment(trimmed, anchorWall);
    if (!resolved) continue;

    const course = extractCourseCode(`${seg} ${trimmed}`, courseHint);
    const title = cleanTaskTitle(seg, course);

    tasks.push({
      id: `task_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      course,
      deadlineISO: resolved.deadlineISO,
      rawDatePhrase: resolved.rawDatePhrase,
      sourceType,
      submissionUrl,
      confidence: resolved.confidence,
      notes: seg.slice(0, 220),
      rawSnippet: trimmed,
      sources: [sourceType]
    });
  }

  // Fallback if text has clear academic task words without parsed date
  if (tasks.length === 0 && /\b(assignment|hw|homework|lab|quiz|exam|project|submission)\b/i.test(trimmed)) {
    const fallbackWall = new Date(Date.UTC(anchorWall.getUTCFullYear(), anchorWall.getUTCMonth(), anchorWall.getUTCDate() + 1, 23, 59));
    const course = extractCourseCode(trimmed, courseHint);
    tasks.push({
      id: `task_${Date.now()}_fb_${Math.random().toString(36).slice(2, 7)}`,
      title: cleanTaskTitle(trimmed, course),
      course,
      deadlineISO: formatIstIso(fallbackWall),
      rawDatePhrase: "No explicit date found (defaulted +1d EOD)",
      sourceType,
      submissionUrl,
      confidence: "Low",
      notes: trimmed.slice(0, 220),
      rawSnippet: trimmed,
      sources: [sourceType]
    });
  }

  if (geminiApiKey) {
    const aiTasks = await enhanceWithGeminiIfConfigured(trimmed, anchorIso, sourceType, tasks, geminiApiKey);
    if (aiTasks && aiTasks.length > 0) return aiTasks;
  }

  return tasks;
}