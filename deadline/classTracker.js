import {
  isLocalSaveEnabled,
  readSharedState,
  saveSharedState
} from "./localSave.js";

const STORAGE_KEY = "eleven59_class_tasks_v1";
const MINIMUM_SCORE = 50;
const MINIMUM_KEYWORD_COVERAGE = 0.5;
let currentTasks = [];

function splitList(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function studentKey(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeText(text) {
  return String(text || "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function createTask(title, subject, keywordsText, rosterText, id = "") {
  const taskTitle = title.trim();
  const taskSubject = subject.trim();
  const students = splitList(rosterText);
  if (!taskTitle || !taskSubject) {
    throw new Error("Enter both a task title and subject.");
  }
  if (students.length === 0) {
    throw new Error("Add at least one student to the class roster.");
  }

  return {
    id: id || `class-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: taskTitle,
    subject: taskSubject,
    keywords: splitList(keywordsText),
    students,
    submissions: {}
  };
}

function evaluateSubmission(text, keywords) {
  const submission = String(text || "").trim();
  const words = submission.match(/[a-z0-9_+#.-]+/gi) || [];
  const wordCount = words.length;
  const required = Array.isArray(keywords) ? keywords : [];
  const normalizedSubmission = ` ${normalizeText(submission)} `;
  const matched = required.filter((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword && normalizedSubmission.includes(` ${normalizedKeyword} `);
  });
  const missing = required.filter((keyword) => !matched.includes(keyword));

  if (!submission || wordCount < 5) {
    return {
      completed: false,
      score: 0,
      keywordPoints: 0,
      completenessPoints: 0,
      structurePoints: 0,
      wordCount,
      matched,
      missing,
      feedback: "Add a little more detail before marking this complete."
    };
  }

  const keywordPoints = required.length
    ? Math.round((matched.length / required.length) * 60)
    : 45;
  const completenessPoints = Math.round(Math.min(1, wordCount / 12) * 25);
  const lowerSubmission = submission.toLocaleLowerCase();
  const hasReadableStructure =
    submission.includes("\n") || /[.!?]/.test(submission) || wordCount >= 18;
  const hasDetailMarkers =
    /[:\-={}]/.test(submission) ||
    /\b(step|output|result|logic|query|code|example)\b/.test(lowerSubmission);
  const structurePoints = (hasReadableStructure ? 8 : 0) + (hasDetailMarkers ? 7 : 0);
  const score = Math.min(100, keywordPoints + completenessPoints + structurePoints);
  const keywordCoverage = required.length ? matched.length / required.length : 1;
  const completed =
    score >= MINIMUM_SCORE &&
    keywordCoverage >= MINIMUM_KEYWORD_COVERAGE;

  let feedback = "Add more detail or cover more of the required criteria.";
  if (completed && score >= 75) feedback = "Strong work: the main criteria are covered clearly.";
  else if (completed) feedback = "Completed. A little more detail could make this stronger.";

  return {
    completed,
    score,
    keywordPoints,
    completenessPoints,
    structurePoints,
    wordCount,
    matched,
    missing,
    feedback
  };
}

function analyzeTask(task) {
  const completed = [];
  const notCompleted = [];

  for (const student of task.students) {
    const savedNote = task.submissions[studentKey(student)];
    const note = typeof savedNote === "string" ? savedNote : "";
    const rating = evaluateSubmission(note, task.keywords);
    const result = { student, note, rating };
    if (rating.completed) {
      completed.push(result);
    } else {
      notCompleted.push(result);
    }
  }

  completed.sort(
    (left, right) =>
      right.rating.score - left.rating.score ||
      studentKey(left.student).localeCompare(studentKey(right.student))
  );
  const reference = completed[0] || null;
  const completedCount = completed.length;
  const totalCount = task.students.length;
  const summary = reference
    ? `${completedCount} out of ${totalCount} students have completed this work. Among completed submissions, ${reference.student}'s work is almost right (Score: ${reference.rating.score}/100) and can be used as a reference.`
    : `0 out of ${totalCount} students have completed this work yet. No reference submission is available yet.`;

  return { completed, notCompleted, reference, completedCount, totalCount, summary };
}

function createDemoTasks() {
  const databaseTask = createTask(
    "SQL Normalization & ER Diagram Assignment",
    "DBMS",
    "1NF, 2NF, 3NF, primary key, foreign key, dependency",
    "Aarav, Priya, Rohan, Ananya, Kabir",
    "eleven59-demo-dbms"
  );
  databaseTask.submissions = {
    [studentKey("Aarav")]:
      "Explained 1NF atomic values, 2NF partial dependency removal, and 3NF transitive dependency. Defined primary key and foreign key relationships with a student-course schema example.",
    [studentKey("Priya")]:
      "Completed 1NF and 2NF notes and drew basic tables with primary key.",
    [studentKey("Ananya")]: "Working on normalization, will upload soon.",
    [studentKey("Kabir")]:
      "Covered 1NF, 2NF, 3NF and primary key with a short table example."
  };

  const pythonTask = createTask(
    "Python File Handling & Dictionary Report",
    "PYTHON",
    "open, read, write, dictionary, loop, exception",
    "Aarav, Priya, Rohan, Ananya",
    "eleven59-demo-python"
  );
  pythonTask.submissions = {
    [studentKey("Aarav")]:
      "Wrote a script using open and dictionary inside a loop to count word frequencies.",
    [studentKey("Rohan")]:
      "Used open() with read and write modes, stored parsed records in a dictionary, iterated with a loop, and added try/except error handling."
  };
  return [databaseTask, pythonTask];
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function addListItems(list, values) {
  for (const value of values) {
    list.appendChild(createElement("li", "", value));
  }
}

function renderStudentList(title, rows, isCompleted) {
  const section = createElement("section", "class-tracker-list-card");
  section.appendChild(createElement("h3", "class-tracker-list-title", title));
  if (rows.length === 0) {
    section.appendChild(
      createElement(
        "p",
        "class-tracker-empty-note",
        isCompleted
          ? "No submissions meet the completion criteria yet."
          : "Everyone in the roster has completed this task."
      )
    );
    return section;
  }

  const list = createElement("ul", "class-tracker-student-list");
  for (const row of rows) {
    const item = createElement("li", "class-tracker-student");
    const nameLine = createElement("div", "class-tracker-student-heading");
    nameLine.appendChild(createElement("strong", "", row.student));
    if (isCompleted) {
      nameLine.appendChild(
        createElement("span", "class-tracker-score", `${row.rating.score}/100`)
      );
    } else if (row.note) {
      nameLine.appendChild(
        createElement("span", "class-tracker-incomplete-score", `${row.rating.score}/100`)
      );
    } else {
      nameLine.appendChild(createElement("span", "class-tracker-pending", "No submission"));
    }
    item.appendChild(nameLine);

    if (isCompleted) {
      item.appendChild(
        createElement(
          "p",
          "class-tracker-breakdown",
          `Keywords ${row.rating.keywordPoints}/60 · Completeness ${row.rating.completenessPoints}/25 · Structure ${row.rating.structurePoints}/15`
        )
      );
    } else {
      item.appendChild(
        createElement(
          "p",
          "class-tracker-breakdown",
          row.note
            ? row.rating.missing.length
              ? `Still needs: ${row.rating.missing.join(", ")}`
              : row.rating.feedback
            : "No work has been submitted yet."
        )
      );
    }
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function renderReport(container, task) {
  container.replaceChildren();
  if (!task) {
    container.classList.add("hidden");
    return;
  }

  const report = analyzeTask(task);
  container.classList.remove("hidden");
  const summaryCard = createElement("section", "class-tracker-summary");
  summaryCard.appendChild(createElement("p", "class-tracker-summary-label", "CLASS PROGRESS"));
  summaryCard.appendChild(createElement("p", "class-tracker-summary-message", report.summary));

  const stats = createElement("div", "class-tracker-stats");
  stats.appendChild(
    createElement("div", "class-tracker-stat", `${report.completedCount} / ${report.totalCount} Completed`)
  );
  stats.appendChild(
    createElement("div", "class-tracker-stat", `${report.notCompleted.length} Not Completed`)
  );
  summaryCard.appendChild(stats);
  container.appendChild(summaryCard);

  const taskHeading = createElement("div", "class-tracker-report-heading");
  taskHeading.appendChild(
    createElement("h3", "", `${task.subject} · ${task.title}`)
  );
  taskHeading.appendChild(
    createElement(
      "p",
      "class-tracker-keywords",
      task.keywords.length ? `Required criteria: ${task.keywords.join(", ")}` : "No keywords were specified."
    )
  );
  container.appendChild(taskHeading);

  const studentColumns = createElement("div", "class-tracker-results-grid");
  studentColumns.appendChild(
    renderStudentList("Completed", report.completed, true)
  );
  studentColumns.appendChild(
    renderStudentList("Not Completed", report.notCompleted, false)
  );
  container.appendChild(studentColumns);

  if (report.reference) {
    const referenceCard = createElement("section", "class-tracker-reference");
    const header = createElement("div", "class-tracker-reference-heading");
    header.appendChild(createElement("div", "class-tracker-reference-label", "ALMOST RIGHT REFERENCE"));
    header.appendChild(
      createElement(
        "h3",
        "",
        `${report.reference.student} · ${report.reference.rating.score}/100`
      )
    );
    referenceCard.appendChild(header);
    referenceCard.appendChild(
      createElement("p", "class-tracker-reference-copy", report.reference.note)
    );
    referenceCard.appendChild(createElement("h4", "", "Key points covered"));

    const takeaways = report.reference.rating.matched;
    if (takeaways.length) {
      const list = createElement("ul", "class-tracker-takeaways");
      addListItems(list, takeaways);
      referenceCard.appendChild(list);
    } else {
      referenceCard.appendChild(
        createElement("p", "class-tracker-breakdown", "This task has no keyword checklist; use the reference for its clarity and structure.")
      );
    }
    container.appendChild(referenceCard);
  }

  const vivaCard = createElement("section", "class-tracker-viva");
  vivaCard.appendChild(createElement("h3", "", "Viva & Concept Self-Check"));
  vivaCard.appendChild(
    createElement(
      "p",
      "class-tracker-breakdown",
      "Try answering in your own words before opening each quick hint."
    )
  );
  const vivaList = createElement("div", "class-tracker-viva-list");
  for (const [index, check] of generateVivaSelfChecks(task, report.reference).entries()) {
    const item = createElement("article", "class-tracker-viva-item");
    item.appendChild(createElement("p", "", `${index + 1}. ${check.question}`));
    const details = createElement("details", "");
    details.appendChild(createElement("summary", "", "Quick Check Hint"));
    details.appendChild(createElement("p", "", check.hint));
    item.appendChild(details);
    vivaList.appendChild(item);
  }
  vivaCard.appendChild(vivaList);
  container.appendChild(vivaCard);
}

function generateVivaSelfChecks(task, reference) {
  const keywords = Array.isArray(task.keywords) ? task.keywords : [];
  const referenceText = reference?.note || "";
  const checks = [{
    question: `In ${task.subject}, what problem is "${task.title}" asking you to solve?`,
    hint: "Restate the goal in your own words and name the result your work should demonstrate."
  }];

  for (const keyword of keywords.slice(0, 3)) {
    const evidence = referenceText
      .split(/(?<=[.!?])\s+|\n+/)
      .find((line) => normalizeText(line).includes(normalizeText(keyword)));
    checks.push({
      question: `How does "${keyword}" work in your solution for "${task.title}"?`,
      hint: evidence
        ? `Use this reference clue to check your understanding: "${evidence.trim()}"`
        : `Point to where "${keyword}" appears in your work and explain how it meets the task criteria.`
    });
  }

  while (checks.length < 4) {
    checks.push({
      question: `How would you check that your work for "${task.title}" is correct?`,
      hint: "Name an expected result, example, or requirement that you can verify."
    });
  }
  return checks.slice(0, 4);
}

export function getClassTrackerSnapshot() {
  return currentTasks;
}

export function clearClassTrackerMemory() {
  currentTasks = [];
  const taskSelect = document.getElementById("classTaskSelect");
  if (!taskSelect) return;
  taskSelect.replaceChildren(new Option("Create or load a task first", ""));
  taskSelect.disabled = true;
  document.getElementById("classStudentSelect").replaceChildren(
    new Option("Choose a student", "")
  );
  document.getElementById("classStudentSelect").disabled = true;
  document.getElementById("classSubmissionText").disabled = true;
  document.getElementById("classSubmissionFile").disabled = true;
  document.querySelector('#classSubmissionForm button[type="submit"]').disabled = true;
  renderReport(document.getElementById("classTaskReport"), null);
}

export function initializeClassTracker(notify = () => {}) {
  const taskForm = document.getElementById("classTaskForm");
  const taskSelect = document.getElementById("classTaskSelect");
  const studentSelect = document.getElementById("classStudentSelect");
  const submissionForm = document.getElementById("classSubmissionForm");
  const submissionText = document.getElementById("classSubmissionText");
  const submissionFile = document.getElementById("classSubmissionFile");
  const reportContainer = document.getElementById("classTaskReport");
  const notice = document.getElementById("classTrackerNotice");

  if (!taskForm || !taskSelect || !studentSelect || !submissionForm || !reportContainer || !notice) {
    throw new Error("The class task helper markup is incomplete.");
  }

  let tasks = [];
  let selectedTaskId = "";
  try {
    const sharedState = readSharedState();
    const legacySaved = isLocalSaveEnabled()
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    const saved = isLocalSaveEnabled()
      ? Array.isArray(sharedState.classTasks) &&
        (sharedState.classTasks.length > 0 || !legacySaved)
        ? JSON.stringify(sharedState.classTasks)
        : legacySaved
      : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Saved class tasks are invalid.");
      tasks = parsed.filter(
        (task) =>
          task &&
          typeof task.id === "string" &&
          typeof task.title === "string" &&
          Array.isArray(task.students) &&
          task.submissions &&
          typeof task.submissions === "object"
      );
      selectedTaskId = tasks[tasks.length - 1]?.id || "";
    }
    currentTasks = tasks;
  } catch {
    notify("Could not load saved class tasks. Create a new task or try loading the sample class.");
  }

  const saveTasks = () => {
    currentTasks = tasks;
    if (!isLocalSaveEnabled()) return true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      const sharedState = readSharedState();
      let deadlines = Array.isArray(sharedState.deadlines)
        ? sharedState.deadlines
        : [];
      if (deadlines.length === 0) {
        const savedDeadlines = localStorage.getItem("m10_deadline_aggregator_tasks_v1");
        if (savedDeadlines) {
          const parsedDeadlines = JSON.parse(savedDeadlines);
          if (Array.isArray(parsedDeadlines)) deadlines = parsedDeadlines;
        }
      }
      return saveSharedState({ deadlines, classTasks: tasks });
    } catch {
      notify("Class task data could not be saved in this browser.");
      return false;
    }
  };

  const showNotice = (message) => {
    notice.textContent = message;
    notice.classList.remove("hidden");
  };

  const getSelectedTask = () =>
    tasks.find((task) => task.id === taskSelect.value) || null;

  const render = () => {
    const currentTaskId = taskSelect.value || selectedTaskId;
    taskSelect.replaceChildren();
    if (tasks.length === 0) {
      taskSelect.appendChild(new Option("Create or load a task first", ""));
      taskSelect.disabled = true;
    } else {
      taskSelect.disabled = false;
      for (const task of tasks) {
        taskSelect.appendChild(new Option(`${task.subject} · ${task.title}`, task.id));
      }
      selectedTaskId = tasks.some((task) => task.id === currentTaskId)
        ? currentTaskId
        : tasks[tasks.length - 1].id;
      taskSelect.value = selectedTaskId;
    }

    const task = getSelectedTask();
    const oldStudent = studentSelect.value;
    studentSelect.replaceChildren(new Option("Choose a student", ""));
    if (task) {
      for (const student of task.students) {
        studentSelect.appendChild(new Option(student, student));
      }
    }
    studentSelect.disabled = !task;
    studentSelect.value =
      task && task.students.includes(oldStudent) ? oldStudent : "";
    submissionText.disabled = !task;
    submissionFile.disabled = !task;
    submissionForm.querySelector('button[type="submit"]').disabled = !task;
    renderReport(reportContainer, task);
  };

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const task = createTask(
        document.getElementById("classTaskTitle").value,
        document.getElementById("classTaskSubject").value,
        document.getElementById("classTaskKeywords").value,
        document.getElementById("classTaskRoster").value
      );
      tasks.push(task);
      selectedTaskId = task.id;
      taskForm.reset();
      const saved = saveTasks();
      render();
      if (saved) {
        notice.classList.add("hidden");
        notify("Class task created. You can now record student work.");
      } else {
        showNotice("Task created for this session, but browser storage could not save it.");
      }
    } catch (error) {
      notify(error.message);
    }
  });

  taskSelect.addEventListener("change", () => {
    selectedTaskId = taskSelect.value;
    render();
  });

  submissionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = getSelectedTask();
    const student = studentSelect.value;
    let note = submissionText.value.trim();
    const file = submissionFile.files?.[0];

    if (!task) {
      notify("Create or select a class task first.");
      return;
    }
    if (!student) {
      notify("Choose a student from this task's roster.");
      return;
    }
    if (file) {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        notify("Upload a plain .txt file or paste the student's work.");
        return;
      }
      try {
        note = (await file.text()).trim();
      } catch {
        notify("The text file could not be read.");
        return;
      }
    }
    if (!note) {
      notify("Enter a submission note or upload a text file.");
      return;
    }
    if (note.length > 20_000) {
      notify("Submissions must be 20,000 characters or fewer.");
      return;
    }

    task.submissions[studentKey(student)] = note;
    selectedTaskId = task.id;
    const saved = saveTasks();
    submissionText.value = "";
    submissionFile.value = "";
    render();
    showNotice(
      saved
        ? `Saved work for ${student}.`
        : `Work for ${student} is available for this session, but browser storage could not save it.`
    );
  });

  document.getElementById("loadClassDemoBtn")?.addEventListener("click", () => {
    for (const task of createDemoTasks()) {
      if (!tasks.some((savedTask) => savedTask.id === task.id)) tasks.push(task);
    }
    selectedTaskId = "eleven59-demo-dbms";
    const saved = saveTasks();
    render();
    showNotice(
      saved
        ? "Loaded sample class tasks and student submissions."
        : "Loaded sample tasks for this session, but browser storage could not save them."
    );
  });

  render();
}
