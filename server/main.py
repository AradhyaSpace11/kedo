from fastapi import FastAPI, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os, json
import requests
from datetime import datetime, date

# ---------- load .env ----------
from dotenv import load_dotenv
load_dotenv(override=True)

# ---------- Google Gemini (LLM) ----------
import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("⚠️  WARNING: GEMINI_API_KEY not found in environment variables")
    print("   Get your API key from: https://makersuite.google.com/app/apikey")
    print("   Add it to your .env file: GEMINI_API_KEY=your_key_here")

genai.configure(api_key=GEMINI_API_KEY)

GEMINI_MODEL = "gemini-2.5-flash"
_gemini = genai.GenerativeModel(GEMINI_MODEL) if GEMINI_API_KEY else None

# ---------- Portia (configured for Google provider) ----------
from portia import (
    InMemoryToolRegistry,
    Portia,
    InputClarification,
    Config,
)
from portia.open_source_tools.local_file_writer_tool import FileWriterTool

# Portia configuration
if GEMINI_API_KEY:
    portia_config = Config.from_default(
        llm_provider="google",
        default_model="google/gemini-2.5-flash",  # model override format: provider/model
    )
    portia_tools = InMemoryToolRegistry.from_local_tools([FileWriterTool()])
    portia = Portia(config=portia_config, tools=portia_tools)
else:
    print("⚠️  WARNING: Portia AI disabled due to missing GEMINI_API_KEY")
    portia = None

# ---------- Pydantic models ----------
class Macro(BaseModel):
    protein: float
    carbs: float
    fat: float

class Ingredient(BaseModel):
    item: str
    quantity: str

class Meal(BaseModel):
    dish_name: str
    image: Optional[str] = None
    macros: Macro
    ingredients: List[Ingredient]
    recipe_steps: List[str]
    video_link: Optional[str] = None

class UserProfile(BaseModel):
    name: str
    age: int
    gender: str
    height: float
    weight: float
    goal: str
    restrictions: List[str] = []
    allergies: List[str] = []
    activity: str
    meal_times: Optional[Dict[str, str]] = None  # {"breakfast":"08:00", ...}

class PantryItem(BaseModel):
    name: str
    quantity: str

class Pantry(BaseModel):
    items: List[PantryItem]

class CustomFood(BaseModel):
    free_text: str

# ---------- in-memory state ----------
STATE: Dict[str, Any] = {"profile": None, "pantry": Pantry(items=[])}

# ---------- helpers ----------
def _extract_text_from_gemini(resp: Any) -> str:
    """Safely extract text from Gemini response without raising."""
    # Try quick accessor
    try:
        t = getattr(resp, "text", None)
        if t:
            return str(t)
    except Exception:
        pass
    # Try candidates → content → parts
    try:
        candidates = getattr(resp, "candidates", None) or []
        if candidates:
            content = getattr(candidates[0], "content", None)
            parts = getattr(content, "parts", None) or []
            if parts:
                # parts may have .text or .as_dict()
                p0 = parts[0]
                t = getattr(p0, "text", None)
                if t:
                    return str(t)
                # fallback: try dict
                try:
                    d = p0.to_dict() if hasattr(p0, "to_dict") else (p0 if isinstance(p0, dict) else None)
                    if d and isinstance(d, dict):
                        return str(d.get("text", ""))
                except Exception:
                    pass
    except Exception:
        pass
    return ""

def _strip_code_fences(s: str) -> str:
    if not s:
        return s
    s = s.strip()
    # Remove triple backtick fences if present
    if s.startswith("```"):
        # remove the first line and last triple backticks
        lines = s.splitlines()
        # drop first line (```json or ```)
        if lines:
            lines = lines[1:]
        # remove trailing ``` if present
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    return s

def gemini_json(prompt: str):
    """Call Gemini, extract text safely, and parse JSON if possible."""
    if not _gemini:
        return {"_error": "gemini_not_configured", "detail": "GEMINI_API_KEY not found in environment variables"}
    
    try:
        resp = _gemini.generate_content(prompt)
    except Exception as e:
        return {"_error": "gemini_call_failed", "detail": str(e)}
    text = _extract_text_from_gemini(resp)
    text = _strip_code_fences(text)
    if not text:
        return {"_error": "empty_response"}
    try:
        return json.loads(text)
    except Exception:
        # Not valid JSON; return raw text for debugging
        return {"_error": "invalid_json", "raw": text}

PIXABAY_KEY = os.getenv("PIXABAY_KEY", "")

def _pixabay_image(query: str) -> Optional[str]:
    """Get image from Pixabay API if key is configured."""
    if not PIXABAY_KEY:
        return None
    try:
        url = f"https://pixabay.com/api/?key={PIXABAY_KEY}&q={requests.utils.quote(query)}&image_type=photo&per_page=3&safesearch=true"
        r = requests.get(url, timeout=5)
        if r.ok:
            data = r.json()
            hits = (data or {}).get("hits", [])
            if hits:
                # prefer largeImageURL if present, else webformatURL
                h0 = hits[0]
                return h0.get("largeImageURL") or h0.get("webformatURL") or h0.get("previewURL")
    except Exception:
        pass
    return None

def _ensure_image_url(dish_name: Optional[str], current: Optional[str]) -> str:
    """Return a usable image URL; try current → Pixabay → Unsplash placeholder."""
    if current and isinstance(current, str) and current.startswith("http"):
        return current
    q = (dish_name or "meal").strip()
    img = _pixabay_image(f"food {q}")
    if img and isinstance(img, str) and img.startswith("http"):
        return img
    # Fallback to Unsplash source endpoint
    q2 = q.replace(" ", "+")
    return f"https://source.unsplash.com/800x600/?food,{q2}"

def ensure_meal_times(profile: UserProfile):
    """Human-in-the-loop: require explicit meal times once."""
    if not profile.meal_times:
        return InputClarification(
            step=0,
            user_guidance="Please provide preferred meal times (HH:MM) for breakfast, lunch, and dinner.",
            argument_name="meal_times",
        )
    return None

# ---------- FastAPI ----------
app = FastAPI(title="Kedo API (Gemini 2.5 Flash + Portia HITL)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- endpoints ----------
@app.post("/user/profile")
def upsert_profile(p: UserProfile):
    STATE["profile"] = p
    return {"ok": True}

@app.get("/user/profile")
def get_profile():
    prof = STATE.get("profile")
    if not prof:
        return {"profile": None}
    return {"profile": prof}

@app.post("/user/prescription")
async def upload_prescription(file: UploadFile = File(...)):
    os.makedirs("uploads/prescriptions", exist_ok=True)
    filename = f"{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}_{file.filename}"
    path = os.path.join("uploads", "prescriptions", filename)
    with open(path, "wb") as f:
        f.write(await file.read())
    STATE.setdefault("user_docs", {})["prescription_path"] = path
    return {"ok": True, "path": path}

@app.post("/pantry/update")
def update_pantry(pantry: Pantry):
    STATE["panery"] = pantry  # typo fix below
    STATE["pantry"] = pantry
    return {"ok": True}

@app.get("/pantry")
def get_pantry():
    return {"pantry": STATE.get("pantry")}

@app.post("/pantry/remake")
def remake_pantry(text: str = Form(...)):
    """
    Accepts free text and uses Gemini to structure into pantry JSON.
    Schema: {"items": [{"name": string, "quantity": string}]}
    """
    prompt = f"""
Structure the following free-text pantry/fridge inventory into JSON with schema:
{{"items": [{{"name": string, "quantity": string}}]}}
Return ONLY the JSON object.

Input:\n{text}
"""
    data = gemini_json(prompt)
    try:
        items = [PantryItem(name=i.get("name", ""), quantity=i.get("quantity", "")) for i in (data.get("items", []) if isinstance(data, dict) else [])]
        pantry = Pantry(items=items)
    except Exception:
        # fallback: simple colon parsing
        items: List[PantryItem] = []
        for line in text.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                items.append(PantryItem(name=k.strip(), quantity=v.strip()))
        pantry = Pantry(items=items)
    STATE["pantry"] = pantry
    return {"ok": True, "pantry": STATE["pantry"]}

@app.get("/meals/recommendations")
def meals_recommendations():
    profile: UserProfile = STATE.get("profile")
    pantry: Pantry = STATE.get("pantry")

    if not profile:
        return {"error": "profile_missing"}

    clar = ensure_meal_times(profile)
    if clar:
        return {"state": "NEED_CLARIFICATION", "clarification": clar.model_dump()}

    prompt = f"""
You are a nutrition assistant. For the profile JSON and pantry JSON, return EXACT JSON array of 3 meals (Breakfast, Lunch, Dinner).
Each meal object must contain:
- dish_name (string)
- macros (object grams): {"protein": number, "carbs": number, "fat": number}
- ingredients (array): [{"item": string, "quantity": string}]
- recipe_steps (array of strings)
- video_link (string or null)

Profile: {profile.model_dump_json()}
Pantry: {STATE["pantry"].model_dump_json()}
Return ONLY the JSON array.
"""
    data = gemini_json(prompt)
    if isinstance(data, dict) and data.get("_error"):
        return {"state": "LLM_ERROR", "error": data}
    # Ensure images exist for each meal
    try:
        if isinstance(data, list):
            enriched = []
            for m in data:
                mm = dict(m)
                mm["image"] = _ensure_image_url(mm.get("dish_name"), mm.get("image"))
                enriched.append(mm)
            data = enriched
    except Exception:
        pass
    STATE.setdefault("plans", {})[str(date.today())] = data
    return {"state": "COMPLETE", "meals": data}

@app.get("/plan/today")
def get_today_plan():
    plan = STATE.get("plans", {}).get(str(date.today()))
    return {"date": str(date.today()), "meals": plan}

@app.get("/meals/suggest_another")
def suggest_another(slot: str = "Lunch"):
    profile: UserProfile = STATE.get("profile")
    pantry: Pantry = STATE.get("pantry")
    if not profile:
        return {"error": "profile_missing"}

    prompt = f"""
Return ONE JSON meal object for slot "{slot}" using schema:
{{"dish_name": string,
  "macros": {{"protein": number, "carbs": number, "fat": number}},
  "ingredients": [{{"item": string, "quantity": string}}],
  "recipe_steps": [string],
  "video_link": string|null}}
Profile: {profile.model_dump_json()}
Pantry: {pantry.model_dump_json()}
Return ONLY the JSON object.
"""
    data = gemini_json(prompt)
    if isinstance(data, dict) and data.get("_error"):
        return {"error": data}
    try:
        d = dict(data) if isinstance(data, dict) else {}
        d["image"] = _ensure_image_url(d.get("dish_name"), d.get("image"))
        data = d
    except Exception:
        pass
    return {"meal": data}

@app.get("/meals/recommend_snack")
def recommend_snack(max_calories: int = 300):
    profile: UserProfile = STATE.get("profile")
    pantry: Pantry = STATE.get("pantry")
    if not profile:
        return {"error": "profile_missing"}
    prompt = f"""
Return ONE JSON meal object (snack) with total calories <= {max_calories}. Keep quick/simple.
Schema:
{{"dish_name": string,
  "macros": {{"protein": number, "carbs": number, "fat": number}},
  "ingredients": [{{"item": string, "quantity": string}}],
  "recipe_steps": [string],
  "video_link": string|null}}
Profile: {profile.model_dump_json()}
Pantry: {pantry.model_dump_json()}
Return ONLY the JSON object.
"""
    data = gemini_json(prompt)
    if isinstance(data, dict) and data.get("_error"):
        return {"error": data}
    try:
        d = dict(data) if isinstance(data, dict) else {}
        d["image"] = _ensure_image_url(d.get("dish_name"), d.get("image"))
        data = d
    except Exception:
        pass
    return {"meal": data}

@app.post("/meals/log_eaten")
def log_eaten(meal: Meal):
    # Naive deduction: remove pantry items that match ingredient names (case-insensitive substring)
    pantry: Pantry = STATE.get("pantry")
    remaining: List[PantryItem] = []
    deducted_names: List[str] = []
    ing_names = [i.item.lower() for i in (meal.ingredients or [])]
    for it in pantry.items:
        name_l = it.name.lower()
        if any(k in name_l or name_l in k for k in ing_names):
            deducted_names.append(it.name)
            # skip (deduct)
        else:
            remaining.append(it)
    STATE["pantry"] = Pantry(items=remaining)
    # maintain daily totals in state
    totals = STATE.setdefault("totals", {str(date.today()): {"protein": 0, "carbs": 0, "fat": 0}})
    day = totals.setdefault(str(date.today()), {"protein": 0, "carbs": 0, "fat": 0})
    day["protein"] += float(meal.macros.protein)
    day["carbs"] += float(meal.macros.carbs)
    day["fat"] += float(meal.macros.fat)
    totals[str(date.today())] = day
    STATE["totals"] = totals
    return {"ok": True, "deducted": deducted_names, "macros": meal.macros, "totals": day, "pantry": STATE["pantry"]}

@app.post("/meals/log_custom")
def log_custom(food: CustomFood):
    prompt = f"""
Estimate macronutrients in grams for: "{food.free_text}".
Return ONLY a JSON object:
{{"protein": number, "carbs": number, "fat": number}}
"""
    data = gemini_json(prompt)
    if isinstance(data, dict) and data.get("_error"):
        return {"error": data, "macros": {"protein": 0, "carbs": 0, "fat": 0}}
    # accumulate daily totals
    try:
        p = float(data.get("protein", 0)) if isinstance(data, dict) else 0
        c = float(data.get("carbs", 0)) if isinstance(data, dict) else 0
        f = float(data.get("fat", 0)) if isinstance(data, dict) else 0
    except Exception:
        p = c = f = 0
    totals = STATE.setdefault("totals", {str(date.today()): {"protein": 0, "carbs": 0, "fat": 0}})
    day = totals.setdefault(str(date.today()), {"protein": 0, "carbs": 0, "fat": 0})
    day["protein"] += p
    day["carbs"] += c
    day["fat"] += f
    totals[str(date.today())] = day
    STATE["totals"] = totals
    return {"macros": data, "totals": day}

@app.get("/macros/targets")
def macros_targets():
    # Fixed daily targets requested by user
    targets = {"calories": 1500.0, "protein": 70.0, "carbs": 70.0, "fat": 200.0}
    STATE["targets"] = targets
    return {"targets": targets}

@app.get("/macros/today")
def macros_today():
    totals = STATE.get("totals", {}).get(str(date.today()), {"protein": 0, "carbs": 0, "fat": 0})
    targets = STATE.get("targets")
    return {"totals": totals, "targets": targets}

@app.post("/clarifications/resolve")
def resolve_clar(payload: Dict[str, Any]):
    """Accepts either {"breakfast":"08:00", ...} or {"meal_times": {...}}"""
    if not isinstance(payload, dict):
        return {"ok": False, "error": "invalid_payload"}
    meal_times: Optional[Dict[str, str]] = None
    if all(k in payload for k in ["breakfast", "lunch", "dinner"]):
        meal_times = {"breakfast": str(payload.get("breakfast", "")), "lunch": str(payload.get("lunch", "")), "dinner": str(payload.get("dinner", ""))}
    else:
        mt = payload.get("meal_times")
        if isinstance(mt, dict):
            meal_times = {"breakfast": str(mt.get("breakfast", "")), "lunch": str(mt.get("lunch", "")), "dinner": str(mt.get("dinner", ""))}
    if not meal_times:
        return {"ok": False, "error": "meal_times_missing"}
    prof: UserProfile = STATE.get("profile")
    if prof:
        prof.meal_times = meal_times
        STATE["profile"] = prof
    return {"ok": True, "meal_times": meal_times}

# Run:
# uvicorn main:app --reload --port 8000

# ---------- scheduler: generate plan daily at 12:00 ----------
try:
    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler(timezone="UTC")

    def _generate_daily_plan_job():
        profile: UserProfile = STATE.get("profile")
        if not profile:
            return
        clar = ensure_meal_times(profile)
        if clar:
            return
        # reuse meals_recommendations logic via prompt
        pantry: Pantry = STATE.get("pantry")
        prompt = f"""
You are a nutrition assistant. For the profile JSON and pantry JSON, return EXACT JSON array of 3 meals (Breakfast, Lunch, Dinner).
Each meal object must contain:
- dish_name (string)
- macros (object grams): {"protein": number, "carbs": number, "fat": number}
- ingredients (array): [{"item": string, "quantity": string}]
- recipe_steps (array of strings)
- video_link (string or null)

Profile: {profile.model_dump_json()}
Pantry: {STATE["pantry"].model_dump_json()}
Return ONLY the JSON array.
"""
        data = gemini_json(prompt)
        STATE.setdefault("plans", {})[str(date.today())] = data

    # schedule at 12:00 local time; use cron with hour=12
    scheduler.add_job(_generate_daily_plan_job, "cron", hour=12, minute=0)
    scheduler.start()
except Exception:
    # APScheduler optional
    pass
