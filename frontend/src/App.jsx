// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./index.css";

const API = "http://localhost:8000"; // update if backend hosted elsewhere

export default function App() {
  const [tab, setTab] = useState("home"); // home | notes | quiz | exam | about
  return (
    <div className="page bg-anim">
      <div className="container">
        <Header tab={tab} setTab={setTab} />
        <main>
          {tab === "home" && <Home setTab={setTab} />}
          {tab === "notes" && <NotesSection />}
          {tab === "quiz" && <QuizSection />}
          {tab === "exam" && <ExamPlaceholder />}
          {tab === "about" && <About />}
        </main>
      </div>
    </div>
  );
}

/* ----------------------------- Header / Navbar ---------------------------- */
function Header({ tab, setTab }) {
  return (
    <header className="card header">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="title">
          <span className="dot" />
          AI Notes Studio
        </div>
        <nav className="nav mainnav">
          <button className={`navbtn ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
            Home
          </button>
          <button className={`navbtn ${tab === "notes" ? "active" : ""}`} onClick={() => setTab("notes")}>
            📝 Notes
          </button>
          <button className={`navbtn ${tab === "quiz" ? "active" : ""}`} onClick={() => setTab("quiz")}>
            ❓ Quiz
          </button>
          <button className={`navbtn ${tab === "exam" ? "active" : ""}`} onClick={() => setTab("exam")}>
            🧪 Exam
          </button>
          <button className={`navbtn ${tab === "about" ? "active" : ""}`} onClick={() => setTab("about")}>
            About
          </button>
        </nav>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <small className="muted">local demo</small>
      </div>
    </header>
  );
}

/* -------------------------------- Home ----------------------------------- */
function Home({ setTab }) {
  return (
    <section className="section">
      <div className="card">
        <h2>Welcome to AI Notes Studio</h2>
        <p className="muted">
          Generate clean exam-ready notes from PDFs, then create quizzes from those notes. History for notes and quizzes is saved locally.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button className="btn primary" onClick={() => setTab("notes")}>Start with Notes</button>
          <button className="btn" onClick={() => setTab("quiz")}>Open Quiz Generator</button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- About ---------------------------------- */
function About() {
  return (
    <section className="section">
      <div className="card">
        <h2>About</h2>
        <p className="muted">
          This demo shows an offline-first UI connecting to a FastAPI backend for PDF parsing, AI summarization (OpenAI/Ollama), and heuristic quiz generation.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------- Exam Placeholder ------------------------ */
function ExamPlaceholder() {
  return (
    <section className="section">
      <div className="card">
        <h2>Exam Simulator</h2>
        <p className="muted">Coming soon — exam mode will let you practice timed quizzes and track progress.</p>
      </div>
    </section>
  );
}

/* ------------------------------- NOTES ---------------------------------- */
function NotesSection() {
  const [file, setFile] = useState(null);
  const [smart, setSmart] = useState(true);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [useOcr, setUseOcr] = useState(true);
  const [auto, setAuto] = useState(true);
  const [ratio, setRatio] = useState(0.35);
  const [maxBullets, setMaxBullets] = useState(10);

  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem("notes_history") || "[]"));

  const inputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("notes_history", JSON.stringify(history));
  }, [history]);

  const onFileChange = (f) => {
    setFile(f);
  };

  const handleGenerate = async () => {
    setError("");
    if (!file) {
      setError("Please choose a PDF.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (smart) {
        form.append("provider", provider);
        form.append("model", model);
        form.append("ocr", String(useOcr));
        var endpoint = `${API}/api/smart-notes`;
      } else {
        form.append("auto", String(auto));
        form.append("ratio", auto ? "auto" : String(ratio));
        form.append("max_bullets", auto ? "auto" : String(maxBullets));
        form.append("ocr", String(useOcr));
        var endpoint = `${API}/api/notes`;
      }

      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Server error");
      setMarkdown(data.markdown || "");
      const entry = {
        id: Date.now(),
        fileName: file.name,
        mode: smart ? "smart" : "heuristic",
        provider,
        model,
        created: new Date().toISOString(),
        markdown: data.markdown || "",
      };
      setHistory((h) => [entry, ...h].slice(0, 40));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const downloadMd = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notes.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadHistoryItem = (item) => {
    setMarkdown(item.markdown || "");
  };

  const deleteHistory = (id) => {
    setHistory((h) => h.filter((it) => it.id !== id));
  };

  return (
    <section className="section">
      <div className="grid">
        <div className="panel card">
          <h2>AI Notes</h2>

          <div className="stack">
            <label className="switch">
              <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} />
              <span className="knob"></span>
              <span>Smart Mode (AI Summarizer)</span>
            </label>

            {smart ? (
              <div className="twocol">
                <div className="field">
                  <div className="label">Provider</div>
                  <select value={provider} onChange={(e) => { const v = e.target.value; setProvider(v); setModel(v === "openai" ? "gpt-4o-mini" : "llama3.1"); }}>
                    <option value="openai">OpenAI (cloud)</option>
                    <option value="ollama">Ollama (local)</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Model</div>
                  <input value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
              </div>
            ) : (
              <>
                <label className="switch">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                  <span className="knob"></span>
                  <span>Auto-tune summary & bullets</span>
                </label>

                <div className="twocol">
                  <div className="field" style={{ opacity: auto ? 0.55 : 1 }}>
                    <div className="label">Summary Ratio (0.1–0.6)</div>
                    <input type="number" min={0.1} max={0.6} step={0.05} disabled={auto} value={ratio} onChange={(e) => setRatio(parseFloat(e.target.value || 0.35))} />
                  </div>
                  <div className="field" style={{ opacity: auto ? 0.55 : 1 }}>
                    <div className="label">Max Bullets per Section (1–20)</div>
                    <input type="number" min={1} max={20} disabled={auto} value={maxBullets} onChange={(e) => setMaxBullets(parseInt(e.target.value || 10))} />
                  </div>
                </div>
              </>
            )}

            <label className="switch">
              <input type="checkbox" checked={useOcr} onChange={(e) => setUseOcr(e.target.checked)} />
              <span className="knob"></span>
              <span>Use OCR (for scanned PDFs)</span>
            </label>

            <div className="dnd uploader" onClick={() => inputRef.current?.click()}>
              <div style={{ fontWeight: 600 }}>Drop PDF here or click to choose</div>
              <div className="muted" style={{ marginTop: 8 }}>PDF is required to generate notes</div>
              <input ref={inputRef} type="file" accept="application/pdf" onChange={(e) => onFileChange(e.target.files?.[0] || null)} hidden />
              {file && <div className="muted small" style={{ marginTop: 8 }}>Selected: {file.name}</div>}
            </div>

            {error && <div className="error">⚠ {error}</div>}

            <div className="btnrow">
              <button className="btn primary" disabled={loading} onClick={handleGenerate}>{loading ? "Generating…" : "Generate Notes"}</button>
              <button className="btn" disabled={!markdown} onClick={downloadMd}>Download .md</button>
            </div>
          </div>
        </div>

        <div className="panel card">
          <h3>History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.length === 0 ? (
              <div className="muted">No notes history yet.</div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="qbox" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{h.fileName}</div>
                    <div className="muted small">{new Date(h.created).toLocaleString()} • {h.mode} • {h.provider}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => loadHistoryItem(h)}>Preview</button>
                    <button className="btn ghost" onClick={() => deleteHistory(h.id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Preview below the generator */}
      {markdown && (
        <div className="card reveal" style={{ marginTop: 18 }}>
          <h2>Preview</h2>
          <div className="preview markdown">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------- QUIZ ---------------------------------- */
function QuizSection() {
  const [source, setSource] = useState("paste"); // paste | pdf
  const [notesText, setNotesText] = useState("");
  const [quizFile, setQuizFile] = useState(null);
  const [useOcr, setUseOcr] = useState(true);
  const [qtype, setQtype] = useState("objective"); // objective | subjective
  const [count, setCount] = useState("");
  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [graded, setGraded] = useState(false);
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem("quiz_history") || "[]"));
  const fileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("quiz_history", JSON.stringify(history));
  }, [history]);

  const extractFromPdf = async (file) => {
    const form = new FormData();
    form.append("file", file);
    form.append("auto", "true");
    form.append("ocr", String(useOcr));
    const res = await fetch(`${API}/api/notes`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to read PDF");
    return data.markdown || "";
  };

  const normalizeQuestion = (rawQ) => {
    const qtext = rawQ.q || rawQ.question || rawQ.prompt || "";
    let options = Array.isArray(rawQ.options) ? rawQ.options.map((o) => (o == null ? "" : String(o).trim())) : [];
    if (!options.length && rawQ.options && typeof rawQ.options === "string") {
      options = rawQ.options.split("\n").map((o) => o.trim()).filter(Boolean);
    }
    if (options.length > 4) options = options.slice(0, 4);
    let answerIndex = -1;
    if (typeof rawQ.answer_index !== "undefined" && rawQ.answer_index !== null) {
      const parsed = parseInt(String(rawQ.answer_index), 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed < options.length) answerIndex = parsed;
    }
    let answerText = null;
    if (answerIndex === -1) {
      if (typeof rawQ.answer === "string" && rawQ.answer.trim()) {
        answerText = rawQ.answer.trim();
        const match = options.findIndex((opt) => String(opt).trim().toLowerCase() === answerText.toLowerCase());
        if (match >= 0) answerIndex = match;
      } else if (typeof rawQ.answer === "number") {
        const parsed = parseInt(String(rawQ.answer), 10);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed < options.length) answerIndex = parsed;
      }
    }
    if (!options.length && rawQ.raw && typeof rawQ.raw === "string") {
      const parts = rawQ.raw.split(/\n/).map((r) => r.trim()).filter(Boolean);
      const detected = [];
      for (const line of parts) {
        const m = line.match(/^[A-D]\W+\s*(.+)$/i);
        if (m) detected.push(m[1].trim());
      }
      if (detected.length >= 2) options = detected.slice(0, 4);
    }
    return { q: qtext, options, answer_index: answerIndex, answer_text: answerText, raw: rawQ };
  };

  const handleGenerate = async () => {
    setResult(null);
    setGraded(false);
    setQuiz([]);
    setAnswers([]);
    try {
      setLoading(true);
      const parsed = parseInt(String(count || "").trim() || "0", 10);
      if (!parsed || parsed < 1 || parsed > 20) {
        alert("Please enter # Questions as an integer between 1 and 20.");
        return;
      }
      const countInt = parsed;
      let notes = notesText.trim();
      if (source === "pdf") {
        if (!quizFile) {
          alert("Please choose a PDF for quiz.");
          return;
        }
        notes = await extractFromPdf(quizFile);
      }
      if (!notes || notes.trim().length < 10) {
        alert("No notes available to generate quiz. Paste notes or upload a PDF.");
        return;
      }
      const form = new FormData();
      form.append("notes", notes);
      form.append("qtype", qtype);
      form.append("count", String(countInt));
      form.append("provider", "heuristic");
      const res = await fetch(`${API}/api/quiz`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Quiz generation failed");
      const qs = Array.isArray(data.quiz) ? data.quiz : [];
      const normalized = qs.map((r) => normalizeQuestion(r));
      setQuiz(normalized);
      setAnswers(Array(normalized.length).fill(qtype === "objective" ? -1 : ""));
      // store to history
      setHistory((h) => [{ id: Date.now(), created: new Date().toISOString(), qtype, count: normalized.length, notesPreview: notes.slice(0, 250), quiz: normalized }, ...h].slice(0, 50));
    } catch (e) {
      alert((e && e.message) ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSelectOption = (qIndex, optIndex) => {
    setAnswers((prev) => { const cp = [...prev]; cp[qIndex] = Number(optIndex); return cp; });
  };

  const submitGrade = async () => {
    if (!quiz.length) return alert("No quiz to grade.");
    setLoading(true);
    try {
      if (qtype === "objective") {
        // Local grading
        let correct = 0;
        const resultsArr = [];
        quiz.forEach((q, i) => {
          const ai = Number.isInteger(q.answer_index) && q.answer_index >= 0 ? q.answer_index : -1;
          const ui = Number.isInteger(answers[i]) ? answers[i] : parseInt(String(answers[i] || "-1"), 10);
          const ok = ai >= 0 && ui === ai;
          if (ok) correct++;
          resultsArr.push({ i, correct: ok, your: ui, answer: ai });
        });
        const scoreLocal = Math.round((100 * correct) / Math.max(1, quiz.length));
        const localResult = { score: scoreLocal, correct, total: quiz.length, results: resultsArr };
        setResult(localResult);
        setGraded(true);

        // Send to backend grade endpoint (non-blocking)
        try {
          const form = new FormData();
          const sendQuiz = quiz.map((q) => ({ q: q.q, options: q.options, answer_index: q.answer_index }));
          const sendAns = answers.map((a) => (Number.isInteger(a) ? a : -1));
          form.append("quiz_json", JSON.stringify(sendQuiz));
          form.append("answers_json", JSON.stringify(sendAns));
          form.append("qtype", "objective");
          const res = await fetch(`${API}/api/grade`, { method: "POST", body: form });
          const data = await res.json();
          if (res.ok) setResult((prev) => ({ ...(prev || {}), ...data }));
        } catch (e) { console.warn("backend grade error", e); }

      } else {
        // Subjective grading uses backend
        const form = new FormData();
        const sendQuiz = quiz.map((q) => ({ q: q.q, answer: q.answer_text || q.raw?.answer || "" }));
        form.append("quiz_json", JSON.stringify(sendQuiz));
        form.append("answers_json", JSON.stringify(answers));
        form.append("qtype", "subjective");
        const res = await fetch(`${API}/api/grade`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Grading failed");
        setResult(data);
        setGraded(true);
      }
    } catch (e) {
      alert((e && e.message) ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadQuizFromHistory = (h) => {
    setQuiz(h.quiz || []);
    setAnswers(Array(h.quiz?.length || 0).fill(qtype === "objective" ? -1 : ""));
    setResult(null);
    setGraded(false);
  };

  return (
    <section className="section">
      <div className="grid">
        <div className="panel card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Quiz Generator</h2>
            <div className="muted small">History saved locally</div>
          </div>

          <div className="stack">
            <div className="twocol">
              <div className="field">
                <div className="label">Quiz Source</div>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="paste">Paste notes</option>
                  <option value="pdf">Upload PDF</option>
                </select>
              </div>

              <div className="field">
                <div className="label">Question Type</div>
                <select value={qtype} onChange={(e) => setQtype(e.target.value)}>
                  <option value="objective">Objective (MCQ)</option>
                  <option value="subjective">Subjective (short)</option>
                </select>
              </div>
            </div>

            {source === "paste" ? (
              <div className="field">
                <div className="label">Notes (paste)</div>
                <textarea className="textarea" placeholder="Paste notes or markdown…" value={notesText} onChange={(e) => setNotesText(e.target.value)} />
              </div>
            ) : (
              <>
                <label className="switch">
                  <input type="checkbox" checked={useOcr} onChange={(e) => setUseOcr(e.target.checked)} />
                  <span className="knob"></span>
                  <span>Use OCR (scanned PDF)</span>
                </label>
                <div className="uploader">
                  <button className="btn" onClick={() => fileRef.current?.click()}>Choose PDF</button>
                  <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => setQuizFile(e.target.files?.[0] || null)} />
                  {quizFile && <div className="muted small">Selected: {quizFile.name}</div>}
                </div>
              </>
            )}

            <div className="twocol">
              <div className="field">
                <div className="label"># Questions (1–20)</div>
                <input type="number" min={1} max={20} placeholder="Enter 1–20" value={count} onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { setCount(""); return; }
                  let v = parseInt(raw, 10);
                  if (isNaN(v)) v = "";
                  if (v !== "") { if (v < 1) v = 1; if (v > 20) v = 20; }
                  setCount(String(v));
                }} />
                <div className="small muted">Enter number then click Generate Quiz</div>
              </div>

              <div className="field">
                <div className="label">Actions</div>
                <div className="btnrow">
                  <button className="btn primary" disabled={loading} onClick={handleGenerate}>{loading ? "Generating…" : "Generate Quiz"}</button>
                  <button className="btn" disabled={!quiz.length || loading} onClick={submitGrade}>Submit & Grade</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel card">
          <h3>Quiz History</h3>
          {history.length === 0 ? <div className="muted">No quiz history yet.</div> : history.map((h) => (
            <div key={h.id} className="qbox" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{h.qtype} • {h.count} q</div>
                <div className="muted small">{new Date(h.created).toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => loadQuizFromHistory(h)}>Load</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quiz render */}
      {quiz.length > 0 && (
        <div className="card reveal" style={{ marginTop: 18 }}>
          <h2>Quiz</h2>
          <div className="quizlist">
            {quiz.map((q, i) => {
              const userAns = answers[i];
              const correctIdx = Number.isInteger(q.answer_index) && q.answer_index >= 0 ? q.answer_index : -1;
              const isObjective = qtype === "objective";

              return (
                <div key={i} className="qbox">
                  <div className="q"><span className="qn">{i + 1}.</span> {q.q}</div>

                  {isObjective && q.options && q.options.length > 0 ? (
                    <div className="opts">
                      {q.options.slice(0, 4).map((opt, j) => {
                        const selected = userAns === j;
                        const correct = graded && j === correctIdx;
                        const wrongSelected = graded && selected && !correct;
                        return (
                          <label key={j} className={`opt ${selected ? "sel" : ""} ${correct ? "correct" : ""} ${wrongSelected ? "wrong" : ""}`}>
                            <input type="radio" name={`q${i}`} checked={selected} onChange={() => onSelectOption(i, j)} />
                            <div className="letter">{String.fromCharCode(65 + j)}</div>
                            <div className="opttext">{opt}</div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea className="textarea" placeholder="Type your short answer…" value={answers[i] || ""} onChange={(e) => {
                      setAnswers((prev) => { const cp = [...prev]; cp[i] = e.target.value; return cp; });
                    }} />
                  )}

                  {graded && (
                    <div style={{ marginTop: 8 }} className="muted small">
                      {correctIdx >= 0 && q.options && q.options[correctIdx] != null ? <>Correct answer: {q.options[correctIdx]}</> : q.answer_text ? <>Correct answer: {q.answer_text}</> : <>Correct answer: (not available)</>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {result && (
            <div className="card resultcard" style={{ marginTop: 12 }}>
              <div className="score">Score: {result.score}% ({result.correct}/{result.total})</div>
              {result.results && result.results.length > 0 && <div className="muted small">Subjective answers graded by similarity heuristics (backend).</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
