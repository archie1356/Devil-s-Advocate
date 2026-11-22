import os
import shutil
import json
import traceback
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import AsyncGroq
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

load_dotenv()
app = FastAPI()
groq_client = AsyncGroq()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration & State ---
# NOTE: "llama3-8b-8192" has been decommissioned by Groq. Use a currently
# supported model. See https://console.groq.com/docs/models for the live list.
GROQ_MODEL = "llama-3.3-70b-versatile"

groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))
embedder = SentenceTransformer("all-MiniLM-L6-v2")
os.makedirs("temp_uploads", exist_ok=True)

# In-memory document store. Replaces the LangChain/Qdrant vector store.
# {"chunks": [str, ...], "embeddings": np.ndarray of shape (n_chunks, dim)}
doc_store = {"chunks": [], "embeddings": None}


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Simple sliding-window chunker, equivalent in spirit to LangChain's
    RecursiveCharacterTextSplitter but with zero extra dependencies."""
    chunks = []
    start = 0
    step = max(chunk_size - overlap, 1)
    while start < len(text):
        chunk = text[start:start + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
        start += step
    return chunks


def similarity_search(query: str, k: int = 4) -> list[str]:
    if doc_store["embeddings"] is None or len(doc_store["chunks"]) == 0:
        return []
    query_emb = embedder.encode([query], normalize_embeddings=True)[0]
    sims = doc_store["embeddings"] @ query_emb
    top_idx = np.argsort(sims)[::-1][:k]
    return [doc_store["chunks"][i] for i in top_idx]


# --- Pydantic Models ---
class DebateRequest(BaseModel):
    argument: str
    tone: str
    difficulty: str
    stance: str = "oppose"

class JudgeRequest(BaseModel):
    user_argument: str
    ai_response: str

class SummaryRequest(BaseModel):
    history: list[dict]

# --- Endpoints ---

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    global doc_store
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = f"temp_uploads/{file.filename}"
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        reader = PdfReader(file_path)
        full_text = "\n".join(page.extract_text() or "" for page in reader.pages)
        chunks = chunk_text(full_text)

        if not chunks:
            raise HTTPException(status_code=400, detail="Couldn't extract any text from this PDF (it may be scanned/image-only).")

        embeddings = embedder.encode(chunks, normalize_embeddings=True)
        doc_store = {"chunks": chunks, "embeddings": np.array(embeddings)}

        return {"status": "success", "message": f"Successfully processed {len(chunks)} chunks.", "chunks": len(chunks)}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/api/evaluate")
async def evaluate_argument(request: DebateRequest):
    system_prompt = """You are an expert debate judge and master logician.
Your task is to analyze the user's argument and provide a structured evaluation.

You MUST respond in valid JSON format with the following exact structure:
{
  "score": <an integer between 0 and 100 representing argument strength>,
  "strengths": [<array of strings detailing strong points>],
  "weaknesses": [<array of strings detailing weak points>],
  "fallacies": [<array of strings naming any logical fallacies detected, or "None">],
  "core_claim": "<The EXACT substring from the user's text representing their main thesis>",
  "unsupported_claims": [<array of EXACT substrings from the user's text that lack evidence or logic>]
}

CRITICAL: The strings in 'core_claim' and 'unsupported_claims' MUST be exact, word-for-word substrings copied directly from the user's prompt."""
    try:
        response = await groq_client.chat.completions.create(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": request.argument}],
            model=GROQ_MODEL,
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        data = json.loads(response.choices[0].message.content)

        # Guarantee the shape the frontend expects, even if the model
        # omits a field. This is what prevents a white-screen crash.
        data.setdefault("score", 0)
        data.setdefault("strengths", [])
        data.setdefault("weaknesses", [])
        data.setdefault("fallacies", ["None"])
        data.setdefault("core_claim", "")
        data.setdefault("unsupported_claims", [])
        return data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@app.post("/api/factcheck")
async def fact_check_argument(request: DebateRequest):
    if not doc_store["chunks"]:
        return {
            "status": "no_docs",
            "checks": [{"claim": "All claims", "status": "Unverified", "explanation": "No document evidence uploaded."}]
        }

    docs = similarity_search(request.argument, k=4)
    source_context = "".join([f"[Source {i+1}]: {chunk}\n" for i, chunk in enumerate(docs)])

    system_prompt = f"""You are an elite, objective fact-checker. Evaluate the user's claims against the Source Text.
Statuses: "Verified" (supported by text), "Contradicted" (conflicts with text), "Unverified" (not in text).

You MUST respond in valid JSON:
{{
  "status": "success",
  "checks": [
    {{
      "claim": "<statement>",
      "status": "Verified" | "Contradicted" | "Unverified",
      "explanation": "<1-sentence reason citing source>"
    }}
  ]
}}
--- SOURCE TEXT ---
{source_context}"""
    try:
        response = await groq_client.chat.completions.create(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": request.argument}],
            model=GROQ_MODEL, temperature=0.1, response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Fact-checking failed: {str(e)}")

@app.post("/api/judge")
async def judge_debate(request: JudgeRequest):
    system_prompt = """You are an impartial debate judge. Evaluate both sides based on logic, evidence, and structure.
Respond in valid JSON:
{
  "winner": "Human" | "AI" | "Tie",
  "reasoning": "<2-3 sentence explanation>"
}"""
    try:
        response = await groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"HUMAN:\n{request.user_argument}\n\nAI:\n{request.ai_response}"}
            ],
            model=GROQ_MODEL, temperature=0.2, response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/summary")
async def summarize_debate(request: SummaryRequest):
    history_text = ""
    for idx, item in enumerate(reversed(request.history)):
        history_text += f"Round {idx+1}:\nHuman: {item.get('argument')}\nAI: {item.get('response')}\n\n"

    system_prompt = """You are an expert summarizer. Provide a concise, high-level summary of the entire debate history provided. Highlight the core disagreements, key arguments made by both sides, and how the debate evolved."""

    try:
        response = await groq_client.chat.completions.create(
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": history_text}],
            model=GROQ_MODEL, temperature=0.4
        )
        return {"summary": response.choices[0].message.content}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/debate")
async def debate(request: DebateRequest):
    retrieved_context = ""
    if doc_store["chunks"]:
        docs = similarity_search(request.argument, k=3)
        if docs:
            retrieved_context = "\n--- CONTEXT ---\n" + "".join([f"{chunk}\n" for chunk in docs])

    persona = "You are an expert debate ally supporting the user." if request.stance == "support" else "You are the Devil's Advocate aiming to dismantle the user's argument."
    system_prompt = f"{persona}\nTone: {request.tone}\nDifficulty: {request.difficulty}\n{retrieved_context}\nAdopt the tone, structure clearly, and prioritize context if available."

    async def stream():
        try:
            stream_gen = await groq_client.chat.completions.create(
                messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": request.argument}],
                model=GROQ_MODEL, stream=True, temperature=0.7,
            )
            async for chunk in stream_gen:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            traceback.print_exc()
            yield f"Error: {str(e)}"

    return StreamingResponse(stream(), media_type="text/event-stream")