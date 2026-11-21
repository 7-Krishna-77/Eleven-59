// Cross-Source Duplicate Detection & Canonical Task Merging Engine

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "to", "in", "on", "at", "by", "with",
  "assignment", "homework", "hw", "lab", "submission", "task", "due", "portal",
  "karna", "hai", "hain", "baje", "tak", "kal", "aaj", "parso"
]);
const EXTENSION_CUE_REGEX =
  /\b(?:extended|postponed|shifted|moved\s+to|new\s+deadline)\b|\bab\b[\s\S]{0,40}\btak\b/i;

function hasExtensionCue(task) {
  const snippets = (task.rawEntries || []).map((entry) => entry.snippet || "");
  const text = [task.rawSnippet, task.notes, ...snippets].filter(Boolean).join(" ");
  return EXTENSION_CUE_REGEX.test(text);
}

export function normalizeCourseCode(code = "") {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function tokenizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export function levenshteinDistance(a = "", b = "") {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function computeTitleSimilarity(titleA = "", titleB = "") {
  const tokensA = tokenizeTitle(titleA);
  const tokensB = tokenizeTitle(titleB);

  let tokenOverlap = 0;
  if (tokensA.length > 0 && tokensB.length > 0) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    for (const tok of setA) {
      if (setB.has(tok)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    tokenOverlap = union > 0 ? intersection / union : 0;
  }

  const maxLen = Math.max(titleA.trim().length, titleB.trim().length);
  const levSim = maxLen > 0 ? 1 - levenshteinDistance(titleA.trim(), titleB.trim()) / maxLen : 0;

  return Math.max(tokenOverlap, levSim * 0.85 + tokenOverlap * 0.35);
}

export function areTasksDuplicate(taskA, taskB) {
  const courseA = normalizeCourseCode(taskA.course);
  const courseB = normalizeCourseCode(taskB.course);

  // Course must match if both are specific non-generic codes
  const genericCodes = new Set(["GEN101", ""]);
  if (!genericCodes.has(courseA) && !genericCodes.has(courseB) && courseA !== courseB) {
    return false;
  }

  const timeA = Date.parse(taskA.deadlineISO);
  const timeB = Date.parse(taskB.deadlineISO);
  const hoursDiff =
    !Number.isNaN(timeA) && !Number.isNaN(timeB)
      ? Math.abs(timeA - timeB) / (1000 * 60 * 60)
      : 999;

  const within24Hours = hoursDiff <= 24;
  const similarity = computeTitleSimilarity(taskA.title, taskB.title);
  const laterExtension =
    timeB > timeA &&
    hasExtensionCue(taskB);

  // Match if within 24h and reasonable title overlap, OR high title similarity on same course
  if (within24Hours && similarity >= 0.32) return true;
  if (
    !genericCodes.has(courseA) &&
    courseA === courseB &&
    similarity >= 0.55 &&
    (hoursDiff <= 72 || laterExtension)
  ) {
    return true;
  }
  return false;
}

const CONFIDENCE_RANK = { High: 3, Medium: 2, Low: 1 };

export function mergeTaskPair(existing, incoming) {
  const combinedSources = Array.from(
    new Set([...(existing.sources || [existing.sourceType]), ...(incoming.sources || [incoming.sourceType])])
  );

  const rawEntries = Array.isArray(existing.rawEntries)
    ? [...existing.rawEntries]
    : [
        {
          sourceType: existing.sourceType,
          rawDatePhrase: existing.rawDatePhrase,
          deadlineISO: existing.deadlineISO,
          snippet: existing.rawSnippet || existing.notes || existing.title
        }
      ];

  const incomingEntries = Array.isArray(incoming.rawEntries)
    ? incoming.rawEntries
    : [
        {
          sourceType: incoming.sourceType,
          rawDatePhrase: incoming.rawDatePhrase,
          deadlineISO: incoming.deadlineISO,
          snippet: incoming.rawSnippet || incoming.notes || incoming.title
        }
      ];

  for (const entry of incomingEntries) {
    const dupEntry = rawEntries.some(
      (e) => e.sourceType === entry.sourceType && e.snippet === entry.snippet
    );
    if (!dupEntry) rawEntries.push(entry);
  }

  const incomingHigherConf =
    (CONFIDENCE_RANK[incoming.confidence] || 1) > (CONFIDENCE_RANK[existing.confidence] || 1);

  const preferredTitle =
    incoming.title.length > existing.title.length && incoming.title.length <= 65
      ? incoming.title
      : existing.title;

  const existingDeadlineMs = Date.parse(existing.deadlineISO);
  const incomingDeadlineMs = Date.parse(incoming.deadlineISO);
  const deadlineExtended =
    !Number.isNaN(existingDeadlineMs) &&
    !Number.isNaN(incomingDeadlineMs) &&
    incomingDeadlineMs > existingDeadlineMs;
  const preferIncomingDeadline = deadlineExtended || incomingHigherConf;
  const preferredDeadline = preferIncomingDeadline ? incoming.deadlineISO : existing.deadlineISO;
  const preferredPhrase = preferIncomingDeadline ? incoming.rawDatePhrase : existing.rawDatePhrase;
  const preferredConfidence = preferIncomingDeadline ? incoming.confidence : existing.confidence;
  const previousDeadlineISO = deadlineExtended
    ? existing.previousDeadlineISO || existing.deadlineISO
    : existing.previousDeadlineISO;
  const preferredCourse =
    normalizeCourseCode(existing.course) === "GEN101" && normalizeCourseCode(incoming.course) !== "GEN101"
      ? incoming.course
      : existing.course;

  return {
    ...existing,
    title: preferredTitle,
    course: preferredCourse,
    deadlineISO: preferredDeadline,
    previousDeadlineISO,
    rawDatePhrase: preferredPhrase,
    confidence: preferredConfidence,
    submissionUrl: incoming.submissionUrl || existing.submissionUrl,
    sources: combinedSources,
    sourceType: combinedSources.join(" + "),
    rawEntries,
    mergedCount: rawEntries.length
  };
}

/**
 * Merges an array of incoming parsed tasks into an existing tasks list.
 * Returns { tasks, mergedCount, addedCount }.
 */
export function deduplicateAndMergeTasks(existingTasks = [], incomingTasks = []) {
  const result = existingTasks.map((t) => ({
    ...t,
    sources: t.sources || [t.sourceType],
    rawEntries:
      t.rawEntries ||
      [
        {
          sourceType: t.sourceType,
          rawDatePhrase: t.rawDatePhrase,
          deadlineISO: t.deadlineISO,
          snippet: t.rawSnippet || t.notes || t.title
        }
      ]
  }));

  let mergedCount = 0;
  let addedCount = 0;

  for (const incoming of incomingTasks) {
    const normalizedIncoming = {
      ...incoming,
      sources: incoming.sources || [incoming.sourceType],
      rawEntries:
        incoming.rawEntries ||
        [
          {
            sourceType: incoming.sourceType,
            rawDatePhrase: incoming.rawDatePhrase,
            deadlineISO: incoming.deadlineISO,
            snippet: incoming.rawSnippet || incoming.notes || incoming.title
          }
        ]
    };

    const matchIndex = result.findIndex((existing) => areTasksDuplicate(existing, normalizedIncoming));
    if (matchIndex !== -1) {
      result[matchIndex] = mergeTaskPair(result[matchIndex], normalizedIncoming);
      mergedCount++;
    } else {
      result.push(normalizedIncoming);
      addedCount++;
    }
  }

  return { tasks: result, mergedCount, addedCount };
}