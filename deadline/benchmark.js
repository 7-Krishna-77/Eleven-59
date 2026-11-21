// 15 Unseen Mixed English/Hinglish Test Cases & Live Accuracy Scorer

import { parseDeadlines } from "./parser.js";
import { deduplicateAndMergeTasks } from "./dedup.js";

// Fixed anchor: Wednesday, Nov 18, 2026 at 10:00 AM IST (+05:30)
const BENCHMARK_ANCHOR = "2026-11-18T10:00:00+05:30";

export const BENCHMARK_CASES = [
  {
    id: 1,
    input: "CS301 Graph Theory assignment kal raat 11:59 baje tak submit karna hai.",
    sourceType: "WhatsApp",
    expectedCourse: "CS301",
    expectedIso: "2026-11-19T23:59:00+05:30",
    dedupGroup: "cs301_graph"
  },
  {
    id: 2,
    input: "Subject: CS301 Graph Theory Problem Set — Due tomorrow EOD.",
    sourceType: "Email",
    expectedCourse: "CS301",
    expectedIso: "2026-11-19T23:59:00+05:30",
    dedupGroup: "cs301_graph"
  },
  {
    id: 3,
    input: "MA201 Linear Algebra quiz aaj dopahar 2 baje hoga.",
    sourceType: "WhatsApp",
    expectedCourse: "MA201",
    expectedIso: "2026-11-18T14:00:00+05:30",
    dedupGroup: "ma201_quiz"
  },
  {
    id: 4,
    input: "CS302 DBMS Normalization lab report parso subah submit karni hai.",
    sourceType: "WhatsApp",
    expectedCourse: "CS302",
    expectedIso: "2026-11-20T09:00:00+05:30",
    dedupGroup: "cs302_dbms"
  },
  {
    id: 5,
    input: "CS302 DBMS Normalization Lab Report deadline: Nov 20 9am.",
    sourceType: "PDF",
    expectedCourse: "CS302",
    expectedIso: "2026-11-20T09:00:00+05:30",
    dedupGroup: "cs302_dbms"
  },
  {
    id: 6,
    input: "PH102 Electromagnetics viva this Friday shaam 6 baje.",
    sourceType: "WhatsApp",
    expectedCourse: "PH102",
    expectedIso: "2026-11-20T18:00:00+05:30",
    dedupGroup: "ph102_viva"
  },
  {
    id: 7,
    input: "CS301 Operating Systems scheduler project due next Monday 5pm sharp.",
    sourceType: "Email",
    expectedCourse: "CS301",
    expectedIso: "2026-11-23T17:00:00+05:30",
    dedupGroup: "cs301_os"
  },
  {
    id: 8,
    input: "MA201 Probability sheet 23rd Nov midnight tak upload kar do.",
    sourceType: "WhatsApp",
    expectedCourse: "MA201",
    expectedIso: "2026-11-23T23:59:00+05:30",
    dedupGroup: "ma201_prob"
  },
  {
    id: 9,
    input: "CS302 SQL Indexing assignment 25/11 tak bhejna hai.",
    sourceType: "WhatsApp",
    expectedCourse: "CS302",
    expectedIso: "2026-11-25T23:59:00+05:30",
    dedupGroup: "cs302_sql"
  },
  {
    id: 10,
    input: "PH102 Lab manual submission Nov 24 6pm in department office.",
    sourceType: "Email",
    expectedCourse: "PH102",
    expectedIso: "2026-11-24T18:00:00+05:30",
    dedupGroup: "ph102_manual"
  },
  {
    id: 11,
    input: "CS301 ML regression notebook aaj raat 11:59 baje tak karna hai.",
    sourceType: "WhatsApp",
    expectedCourse: "CS301",
    expectedIso: "2026-11-18T23:59:00+05:30",
    dedupGroup: "cs301_ml"
  },
  {
    id: 12,
    input: "MA201 Calculus tutorial is hafte submit karna hoga.",
    sourceType: "WhatsApp",
    expectedCourse: "MA201",
    expectedIso: "2026-11-20T23:59:00+05:30",
    dedupGroup: "ma201_calc"
  },
  {
    id: 13,
    input: "CS302 ER Diagram assignment kal dopahar 2 baje tak upload karo.",
    sourceType: "WhatsApp",
    expectedCourse: "CS302",
    expectedIso: "2026-11-19T14:00:00+05:30",
    dedupGroup: "cs302_er"
  },
  {
    id: 14,
    input: "PH102 Optics assignment parso shaam 6 baje tak dena hai.",
    sourceType: "WhatsApp",
    expectedCourse: "PH102",
    expectedIso: "2026-11-20T18:00:00+05:30",
    dedupGroup: "ph102_optics"
  },
  {
    id: 15,
    input: "CS301 Distributed consensus report due 26/11 at 11:59 PM.",
    sourceType: "PDF",
    expectedCourse: "CS301",
    expectedIso: "2026-11-26T23:59:00+05:30",
    dedupGroup: "cs301_consensus"
  }
];

export async function runAccuracyBenchmark(geminiApiKey = "") {
  const results = [];
  let extractionHits = 0;
  let dateHits = 0;
  let dedupHits = 0;

  let runningMerged = [];
  const seenGroups = new Map(); // dedupGroup -> canonicalTaskId

  for (const tc of BENCHMARK_CASES) {
    const parsed = await parseDeadlines(tc.input, {
      sourceType: tc.sourceType,
      anchorTime: BENCHMARK_ANCHOR,
      geminiApiKey
    });

    const topTask = parsed[0] || null;
    const extractionOk =
      Boolean(topTask) &&
      topTask.course.toUpperCase().replace(/[^A-Z0-9]/g, "") === tc.expectedCourse;

    let dateOk = false;
    if (topTask) {
      const actualMs = Date.parse(topTask.deadlineISO);
      const expectedMs = Date.parse(tc.expectedIso);
      const diffHours = Math.abs(actualMs - expectedMs) / (1000 * 60 * 60);
      dateOk = diffHours <= 2.0;
    }

    const prevCount = runningMerged.length;
    const { tasks: nextMerged, mergedCount } = deduplicateAndMergeTasks(
      runningMerged,
      topTask ? [topTask] : []
    );
    runningMerged = nextMerged;

    const groupAlreadySeen = seenGroups.has(tc.dedupGroup);
    let dedupOk = false;
    if (!topTask) {
      dedupOk = false;
    } else if (groupAlreadySeen) {
      dedupOk = mergedCount > 0 || runningMerged.length === prevCount;
    } else {
      dedupOk = runningMerged.length === prevCount + 1;
      const added = runningMerged[runningMerged.length - 1];
      if (added) seenGroups.set(tc.dedupGroup, added.id);
    }

    if (extractionOk) extractionHits++;
    if (dateOk) dateHits++;
    if (dedupOk) dedupHits++;

    results.push({
      id: tc.id,
      input: tc.input,
      expectedCourse: tc.expectedCourse,
      actualCourse: topTask ? topTask.course : "NONE",
      expectedIso: tc.expectedIso,
      actualIso: topTask ? topTask.deadlineISO : "NONE",
      extractionOk,
      dateOk,
      dedupOk,
      passed: extractionOk && dateOk && dedupOk
    });
  }

  const total = BENCHMARK_CASES.length;
  const extractionAcc = Math.round((extractionHits / total) * 1000) / 10;
  const dateAcc = Math.round((dateHits / total) * 1000) / 10;
  const dedupAcc = Math.round((dedupHits / total) * 1000) / 10;

  return {
    results,
    metrics: {
      extractionAcc,
      dateAcc,
      dedupAcc,
      extractionHits,
      dateHits,
      dedupHits,
      total
    }
  };
}