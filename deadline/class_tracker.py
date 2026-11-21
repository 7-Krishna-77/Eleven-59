import re


def evaluate_submission(submission_text: str, required_keywords: list[str], min_words: int = 12) -> dict:
    """
    Evaluate a student's submission and return status, score (0-100),
    score breakdown, and matched/missing keywords.
    """
    cleaned = (submission_text or "").strip()
    words = re.findall(r"[a-z0-9_+#.-]+", cleaned.lower())
    word_count = len(words)

    if not cleaned or word_count < 5:
        return {
            "status": "Not Completed",
            "score": 0,
            "keyword_points": 0,
            "completeness_points": 0,
            "structure_points": 0,
            "word_count": word_count,
            "matched_keywords": [],
            "missing_keywords": required_keywords,
            "feedback": "No meaningful work submitted yet.",
        }

    keywords = [kw.strip().lower() for kw in required_keywords if kw.strip()]
    matched = []
    missing = []

    lower_cleaned = cleaned.lower()
    for kw in keywords:
        if re.search(rf"\b{re.escape(kw)}\b", lower_cleaned) or kw in lower_cleaned:
            matched.append(kw)
        else:
            missing.append(kw)

    # 1. Keyword coverage (max 60 points)
    if keywords:
        keyword_ratio = len(matched) / len(keywords)
        keyword_points = round(keyword_ratio * 60)
    else:
        keyword_points = 45

    # 2. Completeness / length (max 25 points)
    target = max(min_words, 1)
    completeness_points = round(min(1.0, word_count / target) * 25)

    # 3. Structure / clarity (max 15 points)
    has_multiple_lines_or_sentences = ("\n" in cleaned) or (cleaned.count(".") >= 1) or (word_count >= 18)
    has_detail_markers = bool(
        re.search(r"[:\-=(){}]|\b(step|output|result|logic|query|code|example)\b", lower_cleaned)
    )
    structure_points = 0
    if has_multiple_lines_or_sentences:
        structure_points += 8
    if has_detail_markers:
        structure_points += 7

    total_score = min(100, keyword_points + completeness_points + structure_points)

    if total_score >= 75:
        feedback = "Strong submission covering most task requirements clearly."
    elif total_score >= 45:
        feedback = "Decent start, though some expected topics or details can be expanded."
    else:
        feedback = "Submitted briefly, but misses several expected task keywords."

    return {
        "status": "Completed",
        "score": total_score,
        "keyword_points": keyword_points,
        "completeness_points": completeness_points,
        "structure_points": structure_points,
        "word_count": word_count,
        "matched_keywords": matched,
        "missing_keywords": missing,
        "feedback": feedback,
    }


def analyze_class_task(task: dict) -> dict:
    """
    Summarize a class task across all students in the roster:
    - Categorizes students into 'completed_list' and 'not_completed_list'
    - Picks the highest-scoring completed student as 'almost_right' reference
    - Builds a clear summary message for the class and pending students
    """
    roster = task.get("students", [])
    submissions = task.get("submissions", {})
    keywords = task.get("keywords", [])

    completed_list = []
    not_completed_list = []

    for student_name in roster:
        sub_text = submissions.get(student_name, "")
        eval_result = evaluate_submission(sub_text, keywords)

        record = {
            "student": student_name,
            "submission": sub_text.strip(),
            **eval_result,
        }

        if eval_result["status"] == "Completed":
            completed_list.append(record)
        else:
            not_completed_list.append(record)

    completed_list.sort(key=lambda x: (x["score"], x["word_count"]), reverse=True)

    almost_right = completed_list[0] if completed_list else None
    total_students = len(roster)
    completed_count = len(completed_list)
    pending_count = len(not_completed_list)

    if total_students == 0:
        summary_message = "No students added to this class task yet."
    elif completed_count == 0:
        summary_message = (
            f"0 out of {total_students} students have completed this work yet. "
            "No reference submission is available yet."
        )
    else:
        best = almost_right
        summary_message = (
            f"{completed_count} out of {total_students} students have completed this work. "
            f"Among completed submissions, {best['student']}'s work is almost right "
            f"(Score: {best['score']}/100) and can be used as a reference by the {pending_count} "
            f"student(s) who haven't completed it yet."
        )

    return {
        "task_id": task["id"],
        "title": task["title"],
        "subject": task["subject"],
        "keywords": keywords,
        "total_students": total_students,
        "completed_count": completed_count,
        "pending_count": pending_count,
        "completed_list": completed_list,
        "not_completed_list": not_completed_list,
        "almost_right": almost_right,
        "summary_message": summary_message,
    }


def create_default_tasks() -> list[dict]:
    """Sample class tasks so you can test or demo right away."""
    return [
        {
            "id": "task-1",
            "title": "SQL Normalization & ER Diagram Assignment",
            "subject": "DBMS",
            "keywords": ["1nf", "2nf", "3nf", "primary key", "foreign key", "dependency"],
            "students": ["Aarav", "Priya", "Rohan", "Ananya", "Kabir"],
            "submissions": {
                "Aarav": (
                    "Explained 1NF atomic values, 2NF partial dependency removal, and 3NF transitive dependency. "
                    "Defined primary key and foreign key relationships with a student-course schema example."
                ),
                "Priya": "Completed 1NF and 2NF notes and drew basic tables with primary key.",
                "Rohan": "",
                "Ananya": "Working on normalization, will upload soon.",
                "Kabir": "Covered 1NF, 2NF, 3NF and primary key with a short table example.",
            },
        },
        {
            "id": "task-2",
            "title": "Python File Handling & Dictionary Report",
            "subject": "PYTHON",
            "keywords": ["open", "read", "write", "dictionary", "loop", "exception"],
            "students": ["Aarav", "Priya", "Rohan", "Ananya"],
            "submissions": {
                "Aarav": "Wrote script using open and dictionary inside a loop to count word frequencies.",
                "Priya": "",
                "Rohan": (
                    "Used open() with read and write modes, stored parsed records in a dictionary, "
                    "iterated with a loop, and added try/except error handling."
                ),
                "Ananya": "",
            },
        },
    ]