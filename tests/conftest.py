import copy
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import main as app_module  # noqa: E402


def _clone_model(model):
    if hasattr(model, "model_copy"):
        return model.model_copy(deep=True)
    return model.copy(deep=True)


def _fake_gemini_json(prompt, timeout=None):
    if "Structure the following free-text pantry" in prompt:
        return {
            "items": [
                {"name": "Paneer", "quantity": "200 g"},
                {"name": "Spinach", "quantity": "1 bunch"},
                {"name": "Ghee", "quantity": "20 g"},
            ]
        }
    if "Estimate macronutrients" in prompt:
        return {"protein": 18, "carbs": 8, "fat": 12}
    if "Return ONE JSON meal object" in prompt:
        return {
            "dish_name": "Chicken Test Meal",
            "macros": {"protein": 40, "carbs": 3, "fat": 18},
            "ingredients": [{"item": "Chicken breast", "quantity": "120 g"}],
            "recipe_steps": ["Cook Chicken breast until done."],
            "image_query": "chicken test meal",
            "video_link": None,
        }
    return [
        {
            "dish_name": "Paneer Spinach Bowl",
            "macros": {"protein": 28, "carbs": 6, "fat": 30},
            "ingredients": [
                {"item": "Paneer", "quantity": "120 g"},
                {"item": "Spinach", "quantity": "1 bunch"},
            ],
            "recipe_steps": ["Cook Paneer with Spinach."],
            "image_query": "paneer spinach bowl",
            "video_link": None,
        },
        {
            "dish_name": "Mushroom Cheese Skillet",
            "macros": {"protein": 22, "carbs": 5, "fat": 25},
            "ingredients": [
                {"item": "Mushrooms", "quantity": "120 g"},
                {"item": "Cheese", "quantity": "40 g"},
            ],
            "recipe_steps": ["Cook Mushrooms with Cheese."],
            "image_query": "mushroom cheese skillet",
            "video_link": None,
        },
        {
            "dish_name": "Avocado Cucumber Bowl",
            "macros": {"protein": 6, "carbs": 8, "fat": 24},
            "ingredients": [
                {"item": "Avocado", "quantity": "1"},
                {"item": "Cucumber", "quantity": "1"},
            ],
            "recipe_steps": ["Assemble Avocado with Cucumber."],
            "image_query": "avocado cucumber bowl",
            "video_link": None,
        },
    ]


@pytest.fixture(autouse=True)
def reset_backend_state(monkeypatch):
    app_module.STATE.clear()
    app_module.STATE.update(
        {
            "auth": {"email": app_module.DEFAULT_EMAIL, "logged_in": True},
            "profile": _clone_model(app_module.DEFAULT_PROFILE),
            "pantry": _clone_model(app_module.DEFAULT_PANTRY),
            "reminders": copy.deepcopy(app_module.DEFAULT_REMINDERS),
            "plans": {},
            "totals": {},
            "targets": None,
            "suggestion_counters": {},
            "user_docs": {},
        }
    )
    monkeypatch.setattr(app_module, "gemini_json", _fake_gemini_json)
    yield


@pytest.fixture()
def client():
    return TestClient(app_module.app)


@pytest.fixture()
def backend():
    return app_module
