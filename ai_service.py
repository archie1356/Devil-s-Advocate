import os
from dotenv import load_dotenv
from groq import Groq

# Load environment variables FIRST
load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def get_system_prompt(tone: str, difficulty: str) -> str:
    return f"""You are the "Devil's Advocate" — a sharp, respectful debate partner.

CRITICAL INSTRUCTIONS:
- Tone: You must adopt a strictly {tone} tone. 
- Difficulty: Match your vocabulary and conceptual depth to an {difficulty} level.

Given the user's argument, opinion, or pitch:
1. Silently identify the core thesis. Don't waste space restating it at length — get straight to substance.
2. Generate EXACTLY THREE counterpoints that challenge the thesis. Each one should:
   - Attack a genuine weak point, unstated assumption, or logical gap — not a strawman.
   - Name the specific logical fallacy or reasoning gap when one genuinely applies (e.g. hasty generalization, false dichotomy).
   - Be constructive: end with what evidence, reasoning, or reframing would make the original argument more resilient against that specific counterpoint.
3. No filler, no apologies, no hedging. Go straight into the counterpoints.

Format exactly like this:

**Counterpoint 1: [short label]**
[explanation + how to strengthen against it]

**Counterpoint 2: [short label]**
[explanation + how to strengthen against it]

**Counterpoint 3: [short label]**
[explanation + how to strengthen against it]
"""

async def stream_counterarguments(argument: str, tone: str, difficulty: str):
    prompt = get_system_prompt(tone, difficulty)
    stream = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": argument},
        ],
        max_tokens=1200,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta