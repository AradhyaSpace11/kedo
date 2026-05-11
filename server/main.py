from fastapi import FastAPI, Form, UploadFile, File, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os, json
from datetime import datetime, date
from pathlib import Path
import math
import re
import hashlib
import random
import struct
import urllib.request
import zlib
from functools import lru_cache
from urllib.parse import quote

# ---------- load .env ----------
from dotenv import load_dotenv
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
for env_file in (ROOT_DIR / ".env", BASE_DIR / ".env"):
    if env_file.exists():
        load_dotenv(env_file, override=True)

# ---------- Google Gemini (LLM) ----------
import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
if not GEMINI_API_KEY:
    print("⚠️  WARNING: GEMINI_API_KEY not found in environment variables")
    print("   Get your API key from: https://makersuite.google.com/app/apikey")
    print("   Add it to your .env file: GEMINI_API_KEY=your_key_here")

genai.configure(api_key=GEMINI_API_KEY)

GEMINI_MODEL = "gemini-2.5-flash"
_gemini = genai.GenerativeModel(GEMINI_MODEL) if GEMINI_API_KEY else None

# ---------- Clarification Model (Replaces Portia) ----------
class InputClarification(BaseModel):
    step: int
    user_guidance: str
    argument_name: str

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
DEFAULT_PROFILE = UserProfile(
    name="Aradhya Gaonkar", age=21, gender="male",
    height=178.0, weight=72.0, goal="keto style diet",
    restrictions=["Indian keto style", "no beef", "no pork"],
    allergies=[], activity="moderate",
    meal_times={"breakfast": "08:00", "lunch": "13:00", "dinner": "20:00"}
)

DEFAULT_PANTRY = Pantry(items=[
    PantryItem(name="Eggs", quantity="12"),
    PantryItem(name="Paneer", quantity="500 g"),
    PantryItem(name="Chicken breast", quantity="700 g"),
    PantryItem(name="Fish fillets", quantity="500 g"),
    PantryItem(name="Greek yogurt", quantity="500 g"),
    PantryItem(name="Cheese", quantity="300 g"),
    PantryItem(name="Ghee", quantity="250 g"),
    PantryItem(name="Coconut oil", quantity="250 ml"),
    PantryItem(name="Spinach", quantity="2 bunches"),
    PantryItem(name="Cauliflower", quantity="1 head"),
    PantryItem(name="Mushrooms", quantity="250 g"),
    PantryItem(name="Bell peppers", quantity="3"),
    PantryItem(name="Cucumber", quantity="2"),
    PantryItem(name="Avocado", quantity="2"),
    PantryItem(name="Almonds", quantity="250 g"),
    PantryItem(name="Walnuts", quantity="200 g"),
    PantryItem(name="Coconut milk", quantity="400 ml"),
    PantryItem(name="Fresh cream", quantity="200 ml"),
    PantryItem(name="Lemon", quantity="3"),
    PantryItem(name="Coriander", quantity="1 bunch"),
    PantryItem(name="Green chilli", quantity="6"),
    PantryItem(name="Ginger", quantity="100 g"),
    PantryItem(name="Garlic", quantity="100 g"),
    PantryItem(name="Salt", quantity="500 g"),
    PantryItem(name="Black pepper", quantity="100 g"),
    PantryItem(name="Turmeric", quantity="100 g"),
    PantryItem(name="Cumin", quantity="100 g"),
    PantryItem(name="Garam masala", quantity="100 g"),
    PantryItem(name="Red chilli powder", quantity="100 g"),
])

STATE: Dict[str, Any] = {"profile": DEFAULT_PROFILE, "pantry": DEFAULT_PANTRY}

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
    import re
    # extract content inside ```json ... ``` if present anywhere
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", s, re.DOTALL)
    if m:
        return m.group(1).strip()
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

def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def _normalize_macro(value: Any) -> Dict[str, float]:
    value = value if isinstance(value, dict) else {}
    return {
        "protein": _as_float(value.get("protein")),
        "carbs": _as_float(value.get("carbs")),
        "fat": _as_float(value.get("fat")),
    }

def _normalize_ingredients(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    items: List[Dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            name = item.get("item") or item.get("name") or item.get("ingredient") or ""
            quantity = item.get("quantity") or item.get("amount") or ""
            if name:
                items.append({"item": str(name), "quantity": str(quantity)})
        elif isinstance(item, str) and item.strip():
            items.append({"item": item.strip(), "quantity": ""})
    return items

def _normalize_steps(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(step) for step in value if str(step).strip()]
    if isinstance(value, str) and value.strip():
        return [line.strip() for line in value.splitlines() if line.strip()]
    return []

def _normalize_meal(value: Any, fallback_name: str = "Meal") -> Dict[str, Any]:
    value = value if isinstance(value, dict) else {}
    dish_name = value.get("dish_name") or value.get("name") or value.get("title") or fallback_name
    ingredients = _normalize_ingredients(value.get("ingredients"))
    image_query = value.get("image_query") or " ".join([dish_name] + [item["item"] for item in ingredients[:3]])
    meal = {
        "dish_name": str(dish_name),
        "image": value.get("image"),
        "macros": _normalize_macro(value.get("macros")),
        "ingredients": ingredients,
        "recipe_steps": _normalize_steps(value.get("recipe_steps") or value.get("steps") or value.get("recipe")),
        "video_link": value.get("video_link"),
    }
    meal["image"] = _ensure_image_url(image_query, meal["image"])
    return meal

def _normalize_meal_list(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, dict):
        value = value.get("meals") or value.get("recommendations") or []
    if not isinstance(value, list):
        return []
    return [_normalize_meal(item, f"Meal {idx + 1}") for idx, item in enumerate(value) if isinstance(item, dict)]

def _parse_pantry_text(text: str) -> Pantry:
    items: List[PantryItem] = []
    for raw_line in text.splitlines():
        line = raw_line.strip().lstrip("-*").strip()
        if not line:
            continue
        if ":" in line:
            name, quantity = line.split(":", 1)
        elif "-" in line:
            name, quantity = line.split("-", 1)
        elif "," in line:
            name, quantity = line.split(",", 1)
        else:
            name, quantity = line, ""
        name = name.strip()
        quantity = quantity.strip()
        if name:
            items.append(PantryItem(name=name, quantity=quantity))
    return Pantry(items=items)

def _pantry_from_text(text: str) -> Pantry:
    prompt = f"""
Structure the following free-text pantry/fridge inventory into JSON with schema:
{{"items": [{{"name": string, "quantity": string}}]}}
Return ONLY the JSON object.

Input:\n{text}
"""
    data = gemini_json(prompt)
    pantry = _parse_pantry_text(text)
    if isinstance(data, dict) and not data.get("_error"):
        try:
            items = [
                PantryItem(name=str(i.get("name", "")).strip(), quantity=str(i.get("quantity", "")).strip())
                for i in data.get("items", [])
                if isinstance(i, dict) and str(i.get("name", "")).strip()
            ]
            if items:
                pantry = Pantry(items=items)
        except Exception:
            pass
    return pantry

COMMON_UNLISTED_INGREDIENTS = [
    "salt", "pepper", "black pepper", "oil", "olive oil", "butter", "ghee",
    "water", "sugar", "honey", "garlic", "onion", "ginger", "lemon", "lime",
    "vinegar", "soy sauce", "spice", "spices", "masala", "chili", "chilli",
]

def _stable_seed(value: str) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)

def _generated_food_image_url(query: str) -> str:
    clean = re.sub(r"\s+", " ", str(query or "simple keto meal")).strip()
    prompt = (
        f"realistic food photo of {clean}, Indian keto home cooking, "
        "single plated dish, natural light, no text"
    )
    seed = _stable_seed(clean) % 2147483647
    encoded = quote(prompt, safe="")
    return f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=384&model=turbo&seed={seed}&enhance=false&private=true&safe=true"

REAL_FOOD_PHOTO_FALLBACKS = [
    (
        ("palak", "paneer", "spinach", "bhurji"),
        [
            "https://images.unsplash.com/photo-1565557623262-b51c2513a641a?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=900&q=80",
        ],
    ),
    (
        ("chicken", "curry", "coconut", "masala"),
        [
            "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1565557623262-b51c2513a641a?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80",
        ],
    ),
    (
        ("egg", "omelette", "breakfast"),
        [
            "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80",
        ],
    ),
    (
        ("fish", "salmon"),
        [
            "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1485921325833-c519f76c4927?auto=format&fit=crop&w=900&q=80",
        ],
    ),
]

GENERIC_REAL_FOOD_PHOTOS = [
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
]

def _real_food_photo_urls(query: str) -> List[str]:
    key = _canonical_name(query)
    selected: List[str] = []
    for words, urls in REAL_FOOD_PHOTO_FALLBACKS:
        if any(word in key for word in words):
            selected.extend(urls)

    specific = list(dict.fromkeys(selected))
    generic = [url for url in GENERIC_REAL_FOOD_PHOTOS if url not in specific]
    if specific:
        offset = _stable_seed(query or "simple keto meal") % len(specific)
        specific = specific[offset:] + specific[:offset]
    return specific + generic

def _fetch_image_url(url: str, timeout: float) -> Optional[tuple]:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Kedo/1.0",
                "Accept": "image/jpeg,image/png,image/webp,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            media_type = (resp.headers.get("content-type") or "").split(";", 1)[0].lower()
            data = resp.read(4_000_001)
            if media_type in {"image/jpeg", "image/jpg", "image/png", "image/webp"} and 1024 < len(data) <= 4_000_000:
                return data, media_type
    except Exception:
        pass
    return None

def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )

def _encode_rgb_png(width: int, height: int, rows: List[bytearray]) -> bytes:
    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(raw, 6))
        + _png_chunk(b"IEND", b"")
    )

def _blend(a: int, b: int, t: float) -> int:
    return max(0, min(255, int(a + (b - a) * t)))

def _blend_rgb(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(_blend(a[i], b[i], t) for i in range(3))

def _meal_placeholder_png(query: str) -> bytes:
    width, height = 512, 384
    seed = _stable_seed(query or "simple keto meal")
    rng = random.Random(seed)
    palettes = [
        ((20, 30, 44), (38, 54, 70), (238, 233, 217), [(45, 133, 83), (235, 177, 71), (218, 90, 68), (244, 231, 176)]),
        ((18, 33, 30), (54, 72, 58), (241, 237, 223), [(236, 164, 59), (91, 147, 87), (239, 214, 146), (194, 75, 62)]),
        ((26, 28, 45), (58, 54, 86), (236, 229, 211), [(228, 116, 73), (248, 201, 104), (76, 141, 91), (230, 230, 205)]),
    ]
    bg_a, bg_b, plate, food_colors = palettes[seed % len(palettes)]
    blobs = []
    for idx in range(14):
        angle = rng.random() * 6.28318
        radius = rng.uniform(0, 82)
        cx = 256 + int(radius * rng.uniform(0.65, 1.0) * math.cos(angle))
        cy = 202 + int(radius * rng.uniform(0.35, 0.75) * math.sin(angle))
        rx = rng.randint(22, 54)
        ry = rng.randint(12, 34)
        color = food_colors[(idx + seed) % len(food_colors)]
        blobs.append((cx, cy, rx, ry, color))

    rows: List[bytearray] = []
    for y in range(height):
        row = bytearray()
        t = y / max(1, height - 1)
        base = _blend_rgb(bg_a, bg_b, t)
        for x in range(width):
            color = base
            dx = (x - 256) / 190
            dy = (y - 205) / 118
            plate_distance = dx * dx + dy * dy
            if plate_distance <= 1:
                shade = min(1, plate_distance)
                color = _blend_rgb(plate, (200, 194, 178), shade * 0.35)
            if plate_distance <= 0.72:
                color = _blend_rgb(color, (246, 241, 226), 0.35)
            for cx, cy, rx, ry, blob_color in blobs:
                bx = (x - cx) / rx
                by = (y - cy) / ry
                if bx * bx + by * by <= 1:
                    color = _blend_rgb(color, blob_color, 0.86)
            if ((x - 198) / 42) ** 2 + ((y - 152) / 12) ** 2 <= 1:
                color = _blend_rgb(color, (255, 255, 255), 0.26)
            row.extend(color)
        rows.append(row)
    return _encode_rgb_png(width, height, rows)

def _fetch_generated_food_image(query: str) -> Optional[tuple]:
    return _fetch_image_url(_generated_food_image_url(query), timeout=12.0)

@lru_cache(maxsize=96)
def _meal_image_bytes(query: str) -> tuple:
    clean = re.sub(r"\s+", " ", str(query or "simple keto meal")).strip()
    generated = _fetch_generated_food_image(clean)
    if generated:
        return generated
    for url in _real_food_photo_urls(clean)[:4]:
        photo = _fetch_image_url(url, timeout=5.0)
        if photo:
            return photo
    return _meal_placeholder_png(clean), "image/png"

def _is_renderable_image_url(url: Any) -> bool:
    return (
        isinstance(url, str)
        and url.startswith(("http://", "https://"))
        and "source.unsplash.com" not in url
        and "unsplash.com/photos" not in url
    )

def _ensure_image_url(dish_name: Optional[str], current: Optional[str]) -> Optional[str]:
    """Return a usable image URL, preserving supplied direct image URLs."""
    if _is_renderable_image_url(current):
        return current
    q = (dish_name or "meal").strip()
    return _generated_food_image_url(q)

def _canonical_name(value: str) -> str:
    words = re.sub(r"[^a-z0-9]+", " ", str(value).lower()).split()
    normalized = []
    for word in words:
        if len(word) > 3 and word.endswith("s"):
            word = word[:-1]
        normalized.append(word)
    return " ".join(normalized)

def _pantry_names(pantry: Optional[Pantry]) -> List[str]:
    if not pantry or not isinstance(pantry.items, list):
        return []
    return [item.name for item in pantry.items if str(item.name).strip()]

def _name_matches_pantry(name: str, pantry_names: List[str]) -> bool:
    wanted = _canonical_name(name)
    if not wanted:
        return False
    for pantry_name in pantry_names:
        available = _canonical_name(pantry_name)
        if wanted == available or wanted in available or available in wanted:
            return True
    return False

def _merge_pantry_items(current: Pantry, additions: Pantry) -> Pantry:
    merged = [PantryItem(name=item.name, quantity=item.quantity) for item in (current.items if current else [])]
    index = {_canonical_name(item.name): pos for pos, item in enumerate(merged)}
    for item in additions.items:
        key = _canonical_name(item.name)
        if not key:
            continue
        if key in index:
            existing = merged[index[key]]
            if item.quantity and existing.quantity and item.quantity != existing.quantity:
                existing.quantity = f"{existing.quantity} + {item.quantity}"
            elif item.quantity:
                existing.quantity = item.quantity
        else:
            index[key] = len(merged)
            merged.append(item)
    return Pantry(items=merged)

def _clear_today_plan() -> None:
    STATE.setdefault("plans", {}).pop(str(date.today()), None)
    STATE.setdefault("suggestion_counters", {}).clear()

def _unavailable_step_ingredients(steps: List[str], pantry_names: List[str]) -> List[str]:
    text = " ".join(steps).lower()
    unavailable = []
    for item in COMMON_UNLISTED_INGREDIENTS:
        if _name_matches_pantry(item, pantry_names):
            continue
        if re.search(rf"\b{re.escape(item)}\b", text):
            unavailable.append(item)
    return unavailable

def _meal_pantry_violations(meal: Dict[str, Any], pantry: Optional[Pantry]) -> List[str]:
    pantry_names = _pantry_names(pantry)
    violations: List[str] = []
    if not pantry_names:
        return ["pantry_empty"]
    ingredients = meal.get("ingredients") or []
    if not ingredients:
        return ["ingredients_missing"]
    for ingredient in ingredients:
        name = ingredient.get("item") if isinstance(ingredient, dict) else str(ingredient)
        if not _name_matches_pantry(name, pantry_names):
            violations.append(str(name))
        if any(banned in _canonical_name(name) for banned in ["beef", "pork"]):
            violations.append(str(name))
    dish_name = _canonical_name(meal.get("dish_name", ""))
    if "beef" in dish_name:
        violations.append("beef")
    if "pork" in dish_name:
        violations.append("pork")
    violations.extend(_unavailable_step_ingredients(meal.get("recipe_steps") or [], pantry_names))
    return sorted(set(v for v in violations if v))

def _filter_pantry_only_meals(meals: List[Dict[str, Any]], pantry: Optional[Pantry]) -> List[Dict[str, Any]]:
    return [meal for meal in meals if not _meal_pantry_violations(meal, pantry)]

def _pick_pantry_item(pantry: Pantry, candidates: List[str]) -> Optional[str]:
    pantry_names = _pantry_names(pantry)
    for candidate in candidates:
        for pantry_name in pantry_names:
            if _name_matches_pantry(candidate, [pantry_name]):
                return pantry_name
    return None

def _find_pantry_item(pantry: Optional[Pantry], name: str) -> Optional[PantryItem]:
    if not pantry:
        return None
    for item in pantry.items:
        if _name_matches_pantry(name, [item.name]):
            return item
    return None

def _parse_amount(raw: str) -> Optional[float]:
    value = str(raw or "").strip()
    if not value:
        return None
    if "/" in value and value.count("/") == 1:
        left, right = value.split("/", 1)
        try:
            denom = float(right)
            return float(left) / denom if denom else None
        except ValueError:
            return None
    try:
        return float(value)
    except ValueError:
        return None

def _normalize_quantity_unit(unit: str) -> str:
    unit = re.sub(r"[^a-zA-Z]+", "", str(unit or "").lower())
    aliases = {
        "": "count", "pc": "count", "pcs": "count", "piece": "count", "pieces": "count",
        "egg": "count", "eggs": "count", "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
        "kg": "kg", "kilogram": "kg", "kilograms": "kg", "ml": "ml", "milliliter": "ml", "milliliters": "ml",
        "l": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
        "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
        "bunch": "bunch", "bunches": "bunch", "head": "head", "heads": "head",
        "bulb": "bulb", "bulbs": "bulb", "clove": "clove", "cloves": "clove",
        "jar": "jar", "jars": "jar",
    }
    return aliases.get(unit, unit or "count")

def _parse_quantity(value: str) -> Optional[Dict[str, Any]]:
    text = str(value or "").strip().lower()
    if not text or text in {"as available", "as needed", "to taste", "some"}:
        return None
    match = re.search(r"(\d+/\d+|\d+(?:\.\d+)?)\s*([a-zA-Z]*)", text)
    if not match:
        return None
    amount = _parse_amount(match.group(1))
    if amount is None:
        return None
    return {"amount": amount, "unit": _normalize_quantity_unit(match.group(2))}

def _base_quantity(amount: float, unit: str, prefer: Optional[str] = None) -> Optional[Dict[str, Any]]:
    unit = _normalize_quantity_unit(unit)
    prefer = _normalize_quantity_unit(prefer or "")
    if unit == "kg":
        return {"amount": amount * 1000, "unit": "g"}
    if unit == "g":
        return {"amount": amount, "unit": "g"}
    if unit == "l":
        return {"amount": amount * 1000, "unit": "ml"}
    if unit == "ml":
        return {"amount": amount, "unit": "ml"}
    if unit == "tsp":
        return {"amount": amount * 5, "unit": "g" if prefer == "g" else "ml"}
    if unit == "tbsp":
        return {"amount": amount * 15, "unit": "g" if prefer == "g" else "ml"}
    if unit == "clove" and prefer == "bulb":
        return {"amount": amount / 10, "unit": "bulb"}
    if unit == "jar" and prefer == "g":
        return {"amount": amount * 100, "unit": "g"}
    return {"amount": amount, "unit": unit}

def _format_quantity(amount: float, unit: str) -> str:
    if amount <= 0:
        amount = 0
    if abs(amount - round(amount)) < 0.001:
        number = str(int(round(amount)))
    else:
        number = f"{amount:.2f}".rstrip("0").rstrip(".")
    unit = _normalize_quantity_unit(unit)
    if unit == "count":
        return number
    if unit in {"g", "ml", "kg", "l", "tsp", "tbsp"}:
        return f"{number} {unit}"
    plural = "" if abs(amount - 1) < 0.001 else "s"
    if unit == "bunch":
        return f"{number} bunch{'' if abs(amount - 1) < 0.001 else 'es'}"
    return f"{number} {unit}{plural}"

SERVING_QUANTITIES = [
    ("coconut oil", "10 ml"), ("coconut milk", "120 ml"), ("fresh cream", "50 ml"),
    ("red chilli powder", "2 g"), ("garam masala", "2 g"), ("black pepper", "1 g"),
    ("green chilli", "1"), ("chicken breast", "180 g"), ("fish fillet", "180 g"),
    ("greek yogurt", "150 g"), ("bell pepper", "1"), ("cauliflower", "0.5 head"),
    ("mushroom", "100 g"), ("coriander", "0.25 bunch"), ("spinach", "1 bunch"),
    ("paneer", "120 g"), ("egg", "2"), ("cheese", "40 g"), ("ghee", "10 g"),
    ("cucumber", "0.5"), ("avocado", "0.5"), ("almond", "30 g"), ("walnut", "30 g"),
    ("lemon", "0.5"), ("ginger", "10 g"), ("garlic", "10 g"), ("salt", "2 g"),
    ("turmeric", "2 g"), ("cumin", "2 g"),
]

def _default_serving_quantity(name: str) -> str:
    key = _canonical_name(name)
    for token, quantity in SERVING_QUANTITIES:
        if token in key:
            return quantity
    return "1"

def _cap_to_available(requested: str, available: str) -> str:
    req = _parse_quantity(requested)
    avail = _parse_quantity(available)
    if not req or not avail:
        return requested
    req_base = _base_quantity(req["amount"], req["unit"], avail["unit"])
    avail_base = _base_quantity(avail["amount"], avail["unit"], req["unit"])
    if not req_base or not avail_base or req_base["unit"] != avail_base["unit"]:
        return requested
    if req_base["amount"] <= avail_base["amount"]:
        return requested
    return _format_quantity(avail["amount"], avail["unit"])

def _serving_quantity_for_item(name: str, pantry: Optional[Pantry]) -> str:
    quantity = _default_serving_quantity(name)
    pantry_item = _find_pantry_item(pantry, name)
    if pantry_item:
        quantity = _cap_to_available(quantity, pantry_item.quantity)
    return quantity

def _needs_specific_quantity(quantity: str) -> bool:
    text = str(quantity or "").strip().lower()
    return not text or text in {"as available", "as needed", "to taste", "some"}

def _ensure_meal_quantities(meal: Dict[str, Any], pantry: Optional[Pantry]) -> Dict[str, Any]:
    ingredients = meal.get("ingredients") or []
    for ingredient in ingredients:
        if not isinstance(ingredient, dict):
            continue
        item_name = str(ingredient.get("item", ""))
        if _needs_specific_quantity(ingredient.get("quantity", "")):
            ingredient["quantity"] = _serving_quantity_for_item(item_name, pantry)
            continue
        pantry_item = _find_pantry_item(pantry, item_name)
        if pantry_item:
            ingredient["quantity"] = _cap_to_available(str(ingredient.get("quantity", "")), pantry_item.quantity)
    meal["ingredients"] = ingredients
    return meal

def _subtract_quantity(available: str, used: str) -> Optional[str]:
    current = _parse_quantity(available)
    deduction = _parse_quantity(used)
    if not current or not deduction:
        return available
    current_base = _base_quantity(current["amount"], current["unit"], deduction["unit"])
    deduction_base = _base_quantity(deduction["amount"], deduction["unit"], current["unit"])
    if not current_base or not deduction_base or current_base["unit"] != deduction_base["unit"]:
        return available
    remaining_base = max(0, current_base["amount"] - deduction_base["amount"])
    if remaining_base <= 0.0001:
        return None
    if current_base["unit"] == current["unit"]:
        return _format_quantity(remaining_base, current["unit"])
    if current["unit"] == "kg" and current_base["unit"] == "g":
        return _format_quantity(remaining_base / 1000, "kg")
    if current["unit"] == "l" and current_base["unit"] == "ml":
        return _format_quantity(remaining_base / 1000, "l")
    return _format_quantity(remaining_base, current_base["unit"])

def _deduct_meal_ingredients_from_pantry(meal: Meal, pantry: Optional[Pantry]) -> Dict[str, Any]:
    if not pantry:
        return {"pantry": Pantry(items=[]), "deducted": []}
    deducted: List[Dict[str, str]] = []
    remaining: List[PantryItem] = []
    meal_ingredients = list(meal.ingredients or [])
    for pantry_item in pantry.items:
        match = next((ingredient for ingredient in meal_ingredients if _name_matches_pantry(ingredient.item, [pantry_item.name])), None)
        if not match:
            remaining.append(pantry_item)
            continue
        new_quantity = _subtract_quantity(pantry_item.quantity, match.quantity)
        deducted.append({"item": pantry_item.name, "used": match.quantity, "before": pantry_item.quantity, "after": new_quantity or "0"})
        if new_quantity:
            remaining.append(PantryItem(name=pantry_item.name, quantity=new_quantity))
    return {"pantry": Pantry(items=remaining), "deducted": deducted}

def _fallback_pantry_meal(
    pantry: Pantry,
    dish_name: str,
    candidates: List[List[str]],
    steps: List[str],
    macros: Dict[str, float],
    require_all_candidates: bool = False,
) -> Optional[Dict[str, Any]]:
    ingredients: List[Dict[str, str]] = []
    used = set()
    for group in candidates:
        item = _pick_pantry_item(pantry, group)
        if item and _canonical_name(item) not in used:
            used.add(_canonical_name(item))
            ingredients.append({"item": item, "quantity": _serving_quantity_for_item(item, pantry)})
    if require_all_candidates and len(ingredients) < len(candidates):
        return None
    if not ingredients:
        return None
    allowed_names = [ingredient["item"] for ingredient in ingredients]
    clean_steps = []
    format_args = {f"i{idx}": name for idx, name in enumerate(allowed_names)}
    for step in steps:
        try:
            clean_steps.append(step.format(**format_args))
        except KeyError:
            clean_steps = []
            break
    if not clean_steps:
        if len(allowed_names) == 1:
            clean_steps = [f"Prepare {allowed_names[0]} as a simple pantry-only meal."]
        elif len(allowed_names) == 2:
            clean_steps = [f"Cook or assemble {allowed_names[0]} with {allowed_names[1]} as a simple pantry-only meal."]
        else:
            clean_steps = [f"Cook or assemble {', '.join(allowed_names[:-1])}, and {allowed_names[-1]} as a simple pantry-only meal."]
    meal = {
        "dish_name": dish_name,
        "image": _ensure_image_url(" ".join([dish_name] + allowed_names[:4]), None),
        "macros": macros,
        "ingredients": ingredients,
        "recipe_steps": clean_steps,
        "video_link": None,
    }
    return meal if not _meal_pantry_violations(meal, pantry) else None

def _usable_fallback_pantry_names(pantry: Pantry) -> List[str]:
    names: List[str] = []
    seen = set()
    for name in _pantry_names(pantry):
        key = _canonical_name(name)
        if not key or "beef" in key or "pork" in key or key in seen:
            continue
        seen.add(key)
        names.append(name)
    return names

def _fallback_item_category(name: str) -> str:
    key = _canonical_name(name)
    if any(token in key for token in ["egg", "paneer", "chicken", "fish", "yogurt", "cheese", "tofu"]):
        return "protein"
    if any(token in key for token in ["spinach", "cauliflower", "mushroom", "pepper", "cucumber", "avocado"]):
        return "veg"
    if any(token in key for token in ["ghee", "oil", "cream", "almond", "walnut", "coconut"]):
        return "fat"
    if any(token in key for token in ["salt", "pepper", "turmeric", "cumin", "masala", "chilli", "chili", "ginger", "garlic", "lemon", "coriander"]):
        return "seasoning"
    return "other"

def _fallback_macros_for_names(names: List[str]) -> Dict[str, float]:
    totals = {"protein": 0.0, "carbs": 0.0, "fat": 0.0}
    estimates = {
        "egg": (12, 1, 10),
        "paneer": (22, 4, 28),
        "chicken": (45, 0, 8),
        "fish": (36, 0, 14),
        "yogurt": (16, 5, 8),
        "cheese": (16, 2, 24),
        "spinach": (3, 2, 0),
        "cauliflower": (4, 6, 0),
        "mushroom": (4, 3, 0),
        "pepper": (1, 4, 0),
        "cucumber": (1, 3, 0),
        "avocado": (3, 6, 22),
        "ghee": (0, 0, 14),
        "oil": (0, 0, 14),
        "cream": (2, 2, 18),
        "almond": (6, 3, 14),
        "walnut": (4, 2, 18),
        "coconut": (2, 4, 14),
    }
    for name in names:
        key = _canonical_name(name)
        protein, carbs, fat = (2, 1, 1)
        for token, values in estimates.items():
            if token in key:
                protein, carbs, fat = values
                break
        totals["protein"] += protein
        totals["carbs"] += carbs
        totals["fat"] += fat
    return {key: round(value, 1) for key, value in totals.items()}

def _generic_fallback_pantry_meals(
    pantry: Pantry,
    count: int,
    seen: set[str],
    slot: Optional[str] = None,
    guidance: Optional[str] = None,
) -> List[Dict[str, Any]]:
    names = _usable_fallback_pantry_names(pantry)
    if not names:
        return []

    by_category: Dict[str, List[str]] = {"protein": [], "veg": [], "fat": [], "seasoning": [], "other": []}
    for name in names:
        by_category.setdefault(_fallback_item_category(name), []).append(name)

    preferred_bases = by_category["protein"] + by_category["veg"] + by_category["fat"] + by_category["other"] + by_category["seasoning"]
    partners = by_category["veg"] + by_category["fat"] + by_category["seasoning"] + by_category["protein"] + by_category["other"]
    seed = _stable_seed(" ".join([slot or "", guidance or "", ",".join(names)]))
    title_variants = ["Simple {base} Plate", "Quick {base} Bowl", "Warm {base} Skillet", "{base} Pantry Meal"]
    meals: List[Dict[str, Any]] = []

    for offset in range(max(count * 4, len(preferred_bases) * 3)):
        base = preferred_bases[(seed + offset) % len(preferred_bases)]
        selected = [base]
        for candidate in partners[offset % len(partners):] + partners[:offset % len(partners)]:
            if _canonical_name(candidate) != _canonical_name(base):
                selected.append(candidate)
                break
        if len(selected) < 2 and len(names) > 1:
            selected.append(names[(names.index(base) + 1) % len(names)])
        title = title_variants[offset % len(title_variants)].format(base=base)
        if len(selected) > 1 and offset % 2 == 1:
            title = f"{base} {selected[1]} Bowl"
        key = _canonical_name(title)
        if not key or key in seen:
            continue
        if len(selected) == 1:
            steps = ["Prepare {i0} as a simple pantry-only meal."]
        elif len(selected) == 2:
            steps = ["Cook or assemble {i0} with {i1} as a simple pantry-only meal."]
        else:
            steps = ["Cook or assemble {i0}, {i1}, and {i2} as a simple pantry-only meal."]
        meal = _fallback_pantry_meal(
            pantry,
            title,
            [[name] for name in selected[:3]],
            steps,
            _fallback_macros_for_names(selected[:3]),
        )
        if meal:
            seen.add(key)
            meals.append(meal)
            if len(meals) >= count:
                break
    return meals

def _fallback_pantry_only_meals(
    pantry: Pantry,
    count: int,
    existing: Optional[List[Dict[str, Any]]] = None,
    slot: Optional[str] = None,
    guidance: Optional[str] = None,
) -> List[Dict[str, Any]]:
    existing = existing or []
    meals = list(existing)
    seen = {_canonical_name(meal.get("dish_name", "")) for meal in meals}
    templates = [
        (
            "Paneer Egg Bhurji",
            [["Paneer"], ["Eggs"], ["Ghee", "Coconut oil"], ["Salt"], ["Black pepper"], ["Turmeric"], ["Green chilli"]],
            ["Cook {i0}, {i1}, {i2}, {i3}, {i4}, {i5}, and {i6} together until just set."],
            {"protein": 34, "carbs": 5, "fat": 32},
        ),
        (
            "Chicken Spinach Keto Stir Fry",
            [["Chicken breast"], ["Spinach"], ["Ghee", "Coconut oil"], ["Garlic"], ["Salt"], ["Black pepper"]],
            ["Cook {i0} with {i1}, {i2}, {i3}, {i4}, and {i5} until the chicken is done."],
            {"protein": 48, "carbs": 4, "fat": 26},
        ),
        (
            "Fish Cauliflower Masala",
            [["Fish fillets"], ["Cauliflower"], ["Ghee", "Coconut oil"], ["Turmeric"], ["Cumin"], ["Salt"]],
            ["Cook {i0} and {i1} with {i2}, {i3}, {i4}, and {i5} until tender."],
            {"protein": 42, "carbs": 8, "fat": 24},
        ),
        (
            "Mushroom Cheese Omelette",
            [["Eggs"], ["Mushrooms"], ["Cheese"], ["Ghee", "Coconut oil"], ["Salt"], ["Black pepper"]],
            ["Cook {i0}, {i1}, {i2}, {i3}, {i4}, and {i5} into a soft omelette."],
            {"protein": 31, "carbs": 5, "fat": 35},
        ),
        (
            "Avocado Paneer Bowl",
            [["Avocado"], ["Paneer"], ["Cucumber"], ["Coriander"], ["Lemon"], ["Salt"], ["Black pepper"]],
            ["Combine {i0}, {i1}, {i2}, {i3}, {i4}, {i5}, and {i6} into a cold keto bowl."],
            {"protein": 25, "carbs": 9, "fat": 38},
        ),
    ]
    if slot or guidance:
        shift = _stable_seed(" ".join([slot or "", guidance or ""])) % len(templates)
        templates = templates[shift:] + templates[:shift]
    for dish_name, candidates, steps, macros in templates:
        if len(meals) >= count:
            break
        if _canonical_name(dish_name) in seen:
            continue
        meal = _fallback_pantry_meal(pantry, dish_name, candidates, steps, macros, require_all_candidates=True)
        if meal:
            seen.add(_canonical_name(dish_name))
            meals.append(meal)
    if len(meals) < count:
        meals.extend(_generic_fallback_pantry_meals(pantry, count - len(meals), seen, slot=slot, guidance=guidance))
    return meals[:count]

def _pantry_only_prompt(
    profile: UserProfile,
    pantry: Pantry,
    count: int,
    slot: Optional[str] = None,
    max_calories: Optional[int] = None,
    exclude_dishes: Optional[List[str]] = None,
    guidance: Optional[str] = None,
) -> str:
    pantry_names = ", ".join(_pantry_names(pantry))
    slot_text = f' for slot "{slot}"' if slot else ""
    calories_text = f" Total calories must be <= {max_calories}." if max_calories else ""
    exclude_text = f" Do not repeat these dish names: {', '.join(exclude_dishes)}." if exclude_dishes else ""
    guidance_text = f"\nUser direction for this regeneration: {guidance}" if guidance else ""
    shape = "array" if count != 1 else "object"
    count_text = f"Return EXACT JSON array of {count} meals" if count != 1 else "Return ONE JSON meal object"
    return f"""
You are a strict pantry-only nutrition assistant.
{count_text}{slot_text}.{calories_text}{exclude_text}

ABSOLUTE RULES:
- Use ONLY ingredients from this exact pantry list: {pantry_names}
- Every ingredient item in the JSON must match a pantry item.
- Do NOT add salt, pepper, oil, water, spices, sauces, garnish, or optional ingredients unless that exact item is in the pantry.
- Do NOT use beef or pork under any circumstance.
- Prefer Indian keto-style dishes.
- Use concrete serving quantities for every ingredient, such as "2", "120 g", "10 ml", or "0.5 head". Never use "as available".
- recipe_steps must only mention the listed meal ingredients and cooking actions.
- If a normal recipe would need a missing ingredient, choose a simpler dish instead.
{guidance_text}

Return ONLY the JSON {shape}. No markdown.
Schema:
{{
  "dish_name": string,
  "macros": {{"protein": number, "carbs": number, "fat": number}},
  "ingredients": [{{"item": string, "quantity": string}}],
  "recipe_steps": [string],
  "image_query": string,
  "video_link": string|null
}}

Profile: {profile.model_dump_json()}
Pantry: {pantry.model_dump_json()}
"""

def _generate_pantry_only_meals(
    profile: UserProfile,
    pantry: Pantry,
    count: int,
    slot: Optional[str] = None,
    max_calories: Optional[int] = None,
    guidance: Optional[str] = None,
    attempts: int = 3,
) -> Dict[str, Any]:
    meals: List[Dict[str, Any]] = []
    seen: set[str] = set()
    last_error: Optional[Any] = None

    for _ in range(attempts):
        request_count = max(count * 2, count)
        prompt = _pantry_only_prompt(
            profile,
            pantry,
            count=request_count if count > 1 else 1,
            slot=slot,
            max_calories=max_calories,
            exclude_dishes=[meal["dish_name"] for meal in meals],
            guidance=guidance,
        )
        data = gemini_json(prompt)
        if isinstance(data, dict) and data.get("_error"):
            last_error = data
            continue
        raw_meals = _normalize_meal_list(data) if count > 1 else [_normalize_meal(data, slot or "Meal")]
        valid_meals = _filter_pantry_only_meals(raw_meals, pantry)
        for meal in valid_meals:
            meal = _ensure_meal_quantities(meal, pantry)
            key = _canonical_name(meal.get("dish_name", ""))
            if key and key not in seen:
                seen.add(key)
                meals.append(meal)
            if len(meals) >= count:
                return {"meals": meals[:count], "error": None}
        last_error = {"_error": "no_pantry_only_meals", "raw": data}

    fallback_meals = _fallback_pantry_only_meals(pantry, count, meals, slot=slot, guidance=guidance)
    return {"meals": fallback_meals[:count], "error": last_error}

def ensure_meal_times(profile: UserProfile):
    """Human-in-the-loop: require explicit meal times once."""
    if not profile.meal_times:
        return InputClarification(
            step=0,
            user_guidance="Please provide preferred meal times (HH:MM) for breakfast, lunch, and dinner.",
            argument_name="meal_times",
        )
    return None

async def _read_text_payload(request: Request) -> str:
    content_type = request.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            payload = await request.json()
            if isinstance(payload, dict):
                return str(payload.get("text", ""))
        if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            return str(form.get("text", ""))
        return (await request.body()).decode("utf-8").strip()
    except Exception:
        return ""

# ---------- FastAPI ----------
app = FastAPI(title="Kedo API (Gemini 2.5 Flash)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- endpoints ----------
@app.get("/images/meal")
def meal_image(query: str = "simple keto meal"):
    data, media_type = _meal_image_bytes(query)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )

@app.post("/user/profile")
def upsert_profile(p: UserProfile):
    if not p.meal_times:
        existing: Optional[UserProfile] = STATE.get("profile")
        p.meal_times = existing.meal_times if existing else DEFAULT_PROFILE.meal_times
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
    STATE["pantry"] = pantry
    _clear_today_plan()
    return {"ok": True}

@app.get("/pantry")
def get_pantry():
    return {"pantry": STATE.get("pantry")}

@app.post("/pantry/remake")
async def remake_pantry(request: Request):
    """
    Accepts free text and uses Gemini to structure into pantry JSON.
    Schema: {"items": [{"name": string, "quantity": string}]}
    """
    text = await _read_text_payload(request)

    if not text.strip():
        return {"ok": False, "error": "text_missing", "pantry": STATE.get("pantry")}

    pantry = _pantry_from_text(text)
    STATE["pantry"] = pantry
    _clear_today_plan()
    return {"ok": True, "pantry": STATE["pantry"]}

@app.post("/pantry/add")
async def add_pantry_items(request: Request):
    text = await _read_text_payload(request)
    if not text.strip():
        return {"ok": False, "error": "text_missing", "pantry": STATE.get("pantry")}
    additions = _pantry_from_text(text)
    if not additions.items:
        return {"ok": False, "error": "no_items_found", "pantry": STATE.get("pantry")}
    pantry = _merge_pantry_items(STATE.get("pantry", Pantry(items=[])), additions)
    STATE["pantry"] = pantry
    _clear_today_plan()
    return {"ok": True, "added": additions.items, "pantry": STATE["pantry"]}

@app.get("/meals/recommendations")
def meals_recommendations():
    profile: UserProfile = STATE.get("profile")
    pantry: Pantry = STATE.get("pantry")

    if not profile:
        return {"error": "profile_missing"}

    clar = ensure_meal_times(profile)
    if clar:
        return {"state": "NEED_CLARIFICATION", "clarification": clar.model_dump()}

    if not _pantry_names(pantry):
        return {"state": "NEED_PANTRY", "message": "Add pantry items before requesting meals."}

    generated = _generate_pantry_only_meals(profile, pantry, count=3, attempts=3)
    meals = generated["meals"]
    if len(meals) < 3:
        return {"state": "LLM_ERROR", "error": generated["error"] or {"_error": "not_enough_pantry_only_meals"}, "meals": meals}
    STATE.setdefault("plans", {})[str(date.today())] = meals
    return {"state": "COMPLETE", "meals": meals}

@app.get("/plan/today")
def get_today_plan():
    plan = STATE.get("plans", {}).get(str(date.today()))
    if isinstance(plan, list):
        pantry: Pantry = STATE.get("pantry")
        plan = [_ensure_meal_quantities(dict(meal), pantry) if isinstance(meal, dict) else meal for meal in plan]
        STATE.setdefault("plans", {})[str(date.today())] = plan
    return {"date": str(date.today()), "meals": plan}

@app.get("/meals/suggest_another")
def suggest_another(slot: str = "Lunch", guidance: Optional[str] = None):
    profile: UserProfile = STATE.get("profile")
    pantry: Pantry = STATE.get("pantry")
    if not profile:
        return {"error": "profile_missing"}
    if not _pantry_names(pantry):
        return {"error": {"_error": "pantry_empty", "detail": "Add pantry items before requesting meals."}}

    counter_key = f"{date.today()}:{slot}"
    counters = STATE.setdefault("suggestion_counters", {})
    counters[counter_key] = counters.get(counter_key, 0) + 1
    directed_guidance = " ".join(part for part in [guidance or "", f"variation {counters[counter_key]}"] if part).strip()
    generated = _generate_pantry_only_meals(profile, pantry, count=1, slot=slot, guidance=directed_guidance, attempts=3)
    if not generated["meals"]:
        return {"error": generated["error"] or {"_error": "no_pantry_only_meals"}}
    return {"meal": generated["meals"][0]}

@app.get("/meals/recommend_snack")
def recommend_snack(max_calories: int = 300):
    profile: UserProfile = STATE.get("profile")
    pantry: Pantry = STATE.get("pantry")
    if not profile:
        return {"error": "profile_missing"}
    if not _pantry_names(pantry):
        return {"error": {"_error": "pantry_empty", "detail": "Add pantry items before requesting snacks."}}

    generated = _generate_pantry_only_meals(profile, pantry, count=1, slot="Snack", max_calories=max_calories, attempts=3)
    if not generated["meals"]:
        return {"error": generated["error"] or {"_error": "no_pantry_only_meals"}}
    return {"meal": generated["meals"][0]}

@app.post("/meals/log_eaten")
def log_eaten(meal: Meal):
    pantry: Pantry = STATE.get("pantry")
    deduction = _deduct_meal_ingredients_from_pantry(meal, pantry)
    STATE["pantry"] = deduction["pantry"]
    # maintain daily totals in state
    totals = STATE.setdefault("totals", {str(date.today()): {"protein": 0, "carbs": 0, "fat": 0}})
    day = totals.setdefault(str(date.today()), {"protein": 0, "carbs": 0, "fat": 0})
    day["protein"] += float(meal.macros.protein)
    day["carbs"] += float(meal.macros.carbs)
    day["fat"] += float(meal.macros.fat)
    totals[str(date.today())] = day
    STATE["totals"] = totals
    return {"ok": True, "deducted": deduction["deducted"], "macros": meal.macros, "totals": day, "pantry": STATE["pantry"]}

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
    targets = {"calories": 1800.0, "protein": 120.0, "carbs": 30.0, "fat": 135.0}
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
        pantry: Pantry = STATE.get("pantry")
        if not _pantry_names(pantry):
            return
        generated = _generate_pantry_only_meals(profile, pantry, count=3, attempts=3)
        meals = generated["meals"]
        if len(meals) == 3:
            STATE.setdefault("plans", {})[str(date.today())] = meals

    # schedule at 12:00 local time; use cron with hour=12
    scheduler.add_job(_generate_daily_plan_job, "cron", hour=12, minute=0)
    scheduler.start()
except Exception:
    # APScheduler optional
    pass
