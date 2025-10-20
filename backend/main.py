# backend/main.py
# AI NOTES + QUIZ WEBAPP — FINAL
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import os, re, io, json, random, difflib
from collections import Counter
from PIL import Image
import pytesseract
from dotenv import load_dotenv
load_dotenv()

# PDF helpers
from pdfminer.high_level import extract_text
import pdfplumber
from pdf2image import convert_from_bytes
import httpx

app = FastAPI(title="AI Notes Webapp", version="1.1.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.1.1"}

STOPWORDS = {
    "a","an","the","and","or","but","if","then","so","of","in","on","to","for","by","with",
    "is","are","was","were","be","been","being","as","at","from","it","its","this","that",
    "which","into","such","than","also","they","their","there","these","those","very","over",
    "under","across","can","could","should","would","may","might","will","shall"
}

def _sentences_from_notes(md: str):
    raw = md.replace("\r", "")
    lines = [ln.strip("-• ").strip() for ln in raw.splitlines()]
    text = " ".join([ln for ln in lines if ln])
    sents = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sents if 35 <= len(s.strip()) <= 220]

def _keywords(s: str, k=5, extra_stop=None):
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z\-]+", s)]
    stop = set(STOPWORDS)
    if extra_stop:
        stop |= set(extra_stop)
    freq = Counter([w for w in words if w not in stop])
    return [w for w,_ in freq.most_common(k)]

def _similar(a: str, b: str):
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()

def _pdf_text_fast(pdf_bytes: bytes, use_ocr: bool = False, ocr_dpi: int = 250) -> str:
    if use_ocr:
        pages = convert_from_bytes(pdf_bytes, dpi=ocr_dpi)
        return "\n".join(pytesseract.image_to_string(img) for img in pages)
    try:
        t = extract_text(io.BytesIO(pdf_bytes)) or ""
        if t.strip():
            return t
    except Exception:
        pass
    try:
        out = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for p in pdf.pages:
                out.append(p.extract_text() or "")
        return "\n".join(out)
    except Exception:
        return ""

def _heuristic_notes(raw: str, ratio: float = 0.35, max_bullets: int = 10) -> str:
    lines = [ln.strip() for ln in raw.splitlines()]
    def is_head(ln: str):
        return bool(re.match(r"^(#+\s|[A-Z][A-Z0-9 \-]{4,}$|[0-9]+\.\s)", ln))
    sections = []
    cur_title, cur_buf = "Document", []
    for ln in lines:
        if is_head(ln):
            if cur_buf:
                sections.append((cur_title, cur_buf))
            cur_title = re.sub(r"^#+\s*", "", ln)
            cur_buf = []
        elif ln:
            cur_buf.append(ln)
    if cur_buf:
        sections.append((cur_title, cur_buf))
    if not sections:
        sections = [("Document", [l for l in lines if l])]
    md = ["# Important Notes"]
    for title, buf in sections:
        if not buf: continue
        n_keep = max(3, int(len(buf) * ratio))
        n_keep = min(n_keep, max_bullets)
        scored = sorted(buf, key=lambda s: (s.strip().startswith(("-", "•")), len(s)), reverse=True)
        keep = scored[:n_keep]
        md.append(f"\n## {title}")
        for s in keep:
            s = re.sub(r"^\s*[-•]\s*", "", s)
            md.append(f"- {s}")
    return "\n".join(md)

async def call_ollama(model: str, prompt: str) -> str:
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post("http://localhost:11434/api/generate", json={"model": model, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}})
        r.raise_for_status()
        data = r.json()
        return data.get("response", "")

@app.post("/api/notes")
async def make_notes(file: UploadFile = File(...), ratio: str = Form("auto"), max_bullets: str = Form("auto"), auto: str = Form("true"), ocr: str = Form("false")):
    try:
        pdf_bytes = await file.read()
        text = _pdf_text_fast(pdf_bytes, use_ocr=(ocr.lower() == "true"))
        if not text.strip():
            raise HTTPException(status_code=422, detail="Could not read any text from PDF. Try enabling OCR.")
        if auto.lower() == "true":
            L = max(1, len(text.splitlines()))
            r = 0.25 if L > 1200 else 0.35
            mb = 8 if L > 1200 else 10
        else:
            r = max(0.1, min(0.6, float(ratio)))
            mb = max(1, min(20, int(max_bullets)))
        md = _heuristic_notes(text, ratio=r, max_bullets=mb)
        return {"markdown": md}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"notes error: {e}")

@app.post("/api/smart-notes")
async def make_smart_notes(file: UploadFile = File(...), provider: str = Form("openai"), model: str = Form("gpt-4o-mini"), ocr: str = Form("false")):
    try:
        pdf_bytes = await file.read()
        text = _pdf_text_fast(pdf_bytes, use_ocr=(ocr.lower() == "true"))
        if not text.strip():
            raise HTTPException(status_code=422, detail="Could not read any text from PDF. Try enabling OCR.")
        text = text[:12000]
        system = ("You are a meticulous note maker. Summarize the document into clean Markdown with sections and concise bullets (max 8 per section). Preserve key definitions, formulas, and lists. Do not invent facts.")
        user = f"Make exam-ready notes from the following content:\n\n{text}"
        if provider.lower() == "openai":
            from openai import AsyncOpenAI
            api = os.getenv("OPENAI_API_KEY")
            if not api:
                raise HTTPException(status_code=401, detail="OPENAI_API_KEY not set.")
            client = AsyncOpenAI(api_key=api)
            resp = await client.chat.completions.create(model=model, temperature=0.2, messages=[{"role":"system","content":system},{"role":"user","content":user}])
            md = resp.choices[0].message.content.strip()
        else:
            prompt = system + "\n\n" + user + "\n\nReturn only Markdown."
            md = await call_ollama(model or "llama3.1", prompt)
            md = md.strip()
        if not md.lstrip().startswith("#"):
            md = "# Important Notes\n\n" + md
        return {"markdown": md}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"smart-notes error: {e}")

# ---------------- QUIZ utilities ----------------
def _choose_distractors(keywords, answer_word, needed=3):
    distractors = []
    for w in keywords:
        if len(distractors) >= needed: break
        lw = w.lower()
        if lw != (answer_word or "").lower() and lw not in distractors:
            distractors.append(lw)
    while len(distractors) < needed:
        cand = "option" + str(random.randint(1, 99))
        if cand not in distractors and cand.lower() != (answer_word or "").lower():
            distractors.append(cand)
    return distractors[:needed]

def _make_objective_from_sentence(s: str):
    keys = _keywords(s, k=8, extra_stop={"that","this","these","those","using","such","into","than","also","they","their","there","been","being","very","over","under","across","based"})
    answer = None
    for k in keys:
        if len(k) >= 4:
            answer = k; break
    if not answer and keys: answer = keys[0]
    if not answer:
        m = re.findall(r"[A-Za-z]{4,}", s)
        answer = m[0] if m else None
    if not answer:
        question_text = s
        options = ["A", "B", "C", "D"]
        return {"q": question_text, "options": options, "answer_index": -1, "answer_text": None}
    distract = _choose_distractors(keys, answer, needed=3)
    opts = [answer] + distract
    seen = set(); uniq_opts = []
    for o in opts:
        oo = (o or "").strip()
        if not oo: continue
        if oo.lower() in seen: continue
        seen.add(oo.lower()); uniq_opts.append(oo)
    while len(uniq_opts) < 4:
        filler = "option" + str(random.randint(1, 99))
        if filler.lower() not in seen:
            uniq_opts.append(filler); seen.add(filler.lower())
    pairs = [{"text": t, "is_answer": (t.strip().lower() == answer.strip().lower())} for t in uniq_opts[:4]]
    random.shuffle(pairs)
    options_final = [p["text"] for p in pairs]
    answer_index = next((i for i,p in enumerate(pairs) if p["is_answer"]), -1)
    answer_text = answer if answer_index == -1 else options_final[answer_index]
    try:
        stem = re.sub(rf"\b{re.escape(answer)}\b", "____", s, flags=re.I)
    except re.error:
        stem = s
    return {"q": stem.strip(), "options": options_final, "answer_index": answer_index, "answer_text": answer_text}

def _make_subjective_from_sentence(s: str):
    q = "Explain briefly: " + s.split(".")[0] + "."
    return {"q": q, "answer": s}

def _build_quiz_from_notes(md: str, qtype: str, count: int):
    sents = _sentences_from_notes(md)
    random.shuffle(sents)
    pool = sents[: max(30, count * 4)]
    out = []
    for s in pool:
        if qtype == "objective":
            obj = _make_objective_from_sentence(s)
            if "options" not in obj or not isinstance(obj["options"], list) or len(obj["options"]) < 4:
                opts = obj.get("options", [])[:]
                while len(opts) < 4: opts.append("option"+str(random.randint(1,99)))
                obj["options"] = opts[:4]
            if "answer_index" not in obj or not isinstance(obj["answer_index"], int):
                ai = -1; at = obj.get("answer_text") or ""
                for i,opt in enumerate(obj["options"]):
                    if opt and at and opt.strip().lower() == at.strip().lower(): ai = i; break
                obj["answer_index"] = ai
            if not obj.get("answer_text"):
                ai = obj.get("answer_index", -1)
                if ai >= 0 and ai < len(obj["options"]): obj["answer_text"] = obj["options"][ai]
                else: obj["answer_text"] = None
            out.append(obj)
        else:
            out.append(_make_subjective_from_sentence(s))
        if len(out) >= count: break
    while len(out) < count:
        if qtype == "objective":
            out.append({"q":"Placeholder question","options":["A","B","C","D"],"answer_index":0,"answer_text":"A"})
        else:
            out.append({"q":"Describe briefly ...","answer":""})
    return out

@app.post("/api/quiz")
async def make_quiz(notes: str = Form(...), qtype: str = Form("objective"), count: int = Form(5), provider: str = Form("heuristic"), model: str = Form(""),):
    try:
        if provider == "heuristic":
            quiz = _build_quiz_from_notes(notes, qtype, int(count))
            return JSONResponse({"type": qtype, "quiz": quiz})
        else:
            text = notes[:12000]
            prompt = ("Create a quiz from the following notes.\n" f"Type: {qtype}. Count: {count}.\nReturn strict JSON with `quiz` array. For objective: {{q, options[4], answer_index}}. For subjective: {{q, answer}}.\n\nNotes:\n" + text)
            if provider.lower() == "openai":
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
                msgs = [{"role":"system","content":"You return strict JSON only."},{"role":"user","content":prompt}]
                resp = await client.chat.completions.create(model=(model or "gpt-4o-mini"), messages=msgs, temperature=0.2)
                raw = resp.choices[0].message.content
            else:
                raw = await call_ollama(model or "llama3.1", prompt)
            m = re.search(r"\{.*\}", raw, flags=re.S)
            data = json.loads(m.group(0)) if m else json.loads(raw)
            return JSONResponse({"type": qtype, "quiz": data.get("quiz", [])})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/grade")
async def grade_quiz(quiz_json: str = Form(...), answers_json: str = Form(...), qtype: str = Form("objective"), files: list[UploadFile] = File(None),):
    quiz = json.loads(quiz_json)
    answers = json.loads(answers_json)
    if files and qtype == "subjective":
        texts = []
        for f in files:
            try:
                b = await f.read()
                img = Image.open(io.BytesIO(b)).convert("L")
                txt = pytesseract.image_to_string(img)
                texts.append(txt.strip())
            except Exception:
                texts.append("")
        for i, t in enumerate(texts):
            if i < len(answers) and isinstance(answers[i], str):
                answers[i] = (answers[i] + " " + t).strip()
    results, correct = [], 0
    total = len(quiz)
    if qtype == "objective":
        for i, q in enumerate(quiz):
            ai = -1
            if isinstance(q, dict):
                if "answer_index" in q and isinstance(q["answer_index"], int): ai = q["answer_index"]
                elif "answer" in q and isinstance(q["answer"], int): ai = int(q["answer"])
                else:
                    at = q.get("answer_text") or q.get("answer") or ""
                    opts = q.get("options") or []
                    for ii,opt in enumerate(opts):
                        if opt and at and str(opt).strip().lower() == str(at).strip().lower(): ai = ii; break
            ui = int(answers[i]) if str(answers[i]).isdigit() else -1
            ok = (ui == ai and ai >= 0)
            correct += 1 if ok else 0
            results.append({"i": i, "correct": ok, "your": ui, "answer": ai})
        score = round(100 * correct / max(1, total), 2)
    else:
        pts = []
        for i, q in enumerate(quiz):
            ref = ""
            if isinstance(q, dict):
                ref = q.get("answer", "") or q.get("answer_text", "") or ""
            ans = str(answers[i]) if i < len(answers) else ""
            s = _similar(ref, ans)
            kws = _keywords(ref, k=6)
            hit = sum(1 for k in kws if re.search(rf"\b{re.escape(k)}\b", ans, flags=re.I))
            coverage = (hit/len(kws)) if kws else 0.0
            score_item = 0.7*s + 0.3*coverage
            ok = score_item >= 0.62
            if ok: correct += 1
            pts.append(score_item)
            results.append({"i": i, "correct": ok, "score": round(score_item*100,1), "info": {"similarity": round(s,2), "keywords": kws, "coverage": round(coverage,2)}})
        score = round(100 * sum(pts) / max(1, total), 2)
    return JSONResponse({"score": score, "correct": correct, "total": total, "results": results})
