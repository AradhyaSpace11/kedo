from datetime import date


def test_default_auth_logout_and_login_flow(client, backend):
    session = client.get("/auth/session").json()
    assert session == {"email": backend.DEFAULT_EMAIL, "logged_in": True}

    assert client.post("/auth/logout").json() == {"ok": True}
    assert client.get("/auth/session").json()["logged_in"] is False

    bad = client.post(
        "/auth/login",
        json={"email": backend.DEFAULT_EMAIL, "password": "wrong"},
    ).json()
    assert bad["ok"] is False
    assert bad["error"] == "invalid_credentials"

    good = client.post(
        "/auth/login",
        json={"email": backend.DEFAULT_EMAIL.upper(), "password": backend.DEFAULT_PASSWORD},
    ).json()
    assert good == {"ok": True, "email": backend.DEFAULT_EMAIL}
    assert client.get("/auth/session").json()["logged_in"] is True


def test_pantry_rejects_non_food_and_accepts_text_additions(client):
    rejected = client.post(
        "/pantry/update",
        json={"items": [{"name": "Screwdriver", "quantity": "2"}]},
    ).json()
    assert rejected["ok"] is False
    assert rejected["error"] == "validation_failed"
    assert "Screwdriver" in rejected["invalid_items"]

    text_rejected = client.post("/pantry/add", json={"text": "2 screwdrivers"}).json()
    assert text_rejected["ok"] is False
    assert text_rejected["error"] == "validation_failed"
    assert "screwdrivers" in text_rejected["invalid_items"]

    added = client.post("/pantry/add", json={"text": "paneer, spinach, and ghee"}).json()
    assert added["ok"] is True
    names = {item["name"] for item in added["added"]}
    assert {"Paneer", "Spinach", "Ghee"} <= names


def test_reminders_validate_times_and_fasting_blocks_meals(client):
    schedule = client.get("/reminders").json()["schedule"]
    today_key = date.today().strftime("%A").lower()

    invalid = dict(schedule)
    invalid[today_key] = {**invalid[today_key], "breakfast": "25:99"}
    invalid_response = client.post("/reminders", json={"schedule": invalid}).json()
    assert invalid_response["ok"] is False
    assert invalid_response["error"] == "validation_failed"

    fasting = dict(schedule)
    fasting[today_key] = {**fasting[today_key], "fasting": True}
    saved = client.post("/reminders", json={"schedule": fasting}).json()
    assert saved["ok"] is True
    assert saved["fasting_today"] is True

    recommendations = client.get("/meals/recommendations").json()
    assert recommendations["state"] == "FASTING"
    assert recommendations["meals"] == []

    plan = client.get("/plan/today").json()
    assert plan["state"] == "FASTING"
    assert plan["meals"] == []

    targets = client.get("/macros/targets").json()["targets"]
    assert targets["fasting"] is True
    assert targets["calories"] == 0.0


def test_profile_changes_personalized_macro_targets(client):
    default_targets = client.get("/macros/targets").json()["targets"]

    profile = client.get("/user/profile").json()["profile"]
    profile.update(
        {
            "age": 35,
            "height": 165,
            "weight": 95,
            "gender": "female",
            "activity": "sedentary",
            "goal": "weight loss keto",
        }
    )
    assert client.post("/user/profile", json=profile).json() == {"ok": True}

    updated_targets = client.get("/macros/targets").json()["targets"]
    assert updated_targets["calories"] != default_targets["calories"]
    assert updated_targets["protein"] > 0
    assert updated_targets["carbs"] <= 45
    assert updated_targets["fat"] > 0


def test_meal_recommendations_are_pantry_only_and_cached(client):
    result = client.get("/meals/recommendations").json()
    assert result["state"] == "COMPLETE"
    assert len(result["meals"]) == 3

    pantry_names = {item["name"].lower() for item in client.get("/pantry").json()["pantry"]["items"]}
    for meal in result["meals"]:
        assert meal["dish_name"]
        assert meal["image"].startswith("http")
        assert meal["ingredients"]
        for ingredient in meal["ingredients"]:
            assert ingredient["item"].lower() in pantry_names

    cached = client.get("/plan/today").json()
    assert len(cached["meals"]) == 3
    assert cached["meals"][0]["dish_name"] == result["meals"][0]["dish_name"]


def test_suggest_another_accepts_vegetarian_guidance_and_filters_nonveg(client):
    response = client.get(
        "/meals/suggest_another",
        params={"slot": "Lunch", "guidance": "give something vegetarian"},
    ).json()
    assert "error" not in response

    meal = response["meal"]
    combined = " ".join(
        [meal["dish_name"]]
        + [ingredient["item"] for ingredient in meal["ingredients"]]
        + meal["recipe_steps"]
    ).lower()
    for blocked in ("chicken", "fish", "egg", "beef", "pork", "mutton", "meat"):
        assert blocked not in combined


def test_custom_food_logging_rejects_gibberish_and_updates_totals(client):
    rejected = client.post("/meals/log_custom", json={"free_text": "blah blah blah"}).json()
    assert rejected["ok"] is False
    assert rejected["error"] == "validation_failed"

    logged = client.post("/meals/log_custom", json={"free_text": "one bowl paneer salad"}).json()
    assert logged["ok"] is True
    assert logged["macros"] == {"protein": 18, "carbs": 8, "fat": 12}
    assert logged["totals"] == {"protein": 18.0, "carbs": 8.0, "fat": 12.0}


def test_prescription_upload_rejects_non_image_files(client):
    response = client.post(
        "/user/prescription",
        files={"file": ("notes.txt", b"not an image", "text/plain")},
    ).json()
    assert response["ok"] is False
    assert response["error"] == "validation_failed"
    assert "prescription" in response["message"].lower()
