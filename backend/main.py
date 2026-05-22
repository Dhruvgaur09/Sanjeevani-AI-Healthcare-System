import sqlite3
import json
import os
import dotenv
import time
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import google.generativeai as genai
from fastapi.responses import JSONResponse
import hashlib

# In-memory predictions cache: user_email -> { "timestamp": float, "data": dict }
predictions_cache = {}

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
dotenv.load_dotenv(dotenv_path)

app = FastAPI(title="Sanjeevni API", version="1.0.0")

# Setup Gemini SDK
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print("API KEY:", GEMINI_API_KEY[:8] + "..." + GEMINI_API_KEY[-4:] if GEMINI_API_KEY else "NOT SET")
if GEMINI_API_KEY:
    GEMINI_API_KEY = GEMINI_API_KEY.strip().strip("'").strip('"')
    genai.configure(api_key=GEMINI_API_KEY)

# ─── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── DATABASE SETUP ──────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "sanjeevni.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()

    # Users table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            avatar TEXT,
            password TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Health data table (one row per user, upserted on log)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS health_data (
            user_email TEXT PRIMARY KEY,
            water INTEGER DEFAULT 0,
            steps INTEGER DEFAULT 0,
            sleep REAL DEFAULT 0.0,
            calories INTEGER DEFAULT 0,
            protein INTEGER DEFAULT 0,
            carbs INTEGER DEFAULT 0,
            fat INTEGER DEFAULT 0,
            blood_sugar INTEGER DEFAULT 0,
            bp_sys INTEGER DEFAULT 0,
            bp_dia INTEGER DEFAULT 0,
            cholesterol INTEGER DEFAULT 0,
            heart_rate INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Readings history table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            date TEXT NOT NULL,
            bs INTEGER,
            bp TEXT,
            chol INTEGER,
            note TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # History arrays (stored as JSON)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS history (
            user_email TEXT PRIMARY KEY,
            bs_history TEXT DEFAULT '[]',
            bp_sys_history TEXT DEFAULT '[]',
            bp_dia_history TEXT DEFAULT '[]'
        )
    """)


    # User Roadmap table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_roadmap (
            user_email TEXT PRIMARY KEY,
            calorie_goal TEXT,
            calorie_val INTEGER,
            hydration_target TEXT,
            hydration_val INTEGER,
            movement_goal TEXT,
            movement_val INTEGER,
            clinical_context TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()

init_db()

# ─── HELPERS ────────────────────────────────────────────────────────────────
DEFAULT_USER = "default@sanjeevni.app"

def ensure_user_data(email: str):
    """Create default health data & history rows if they don't exist."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO health_data (user_email) VALUES (?)", (email,))
    cur.execute("INSERT OR IGNORE INTO history (user_email) VALUES (?)", (email,))
    
    # Ensure there is at least one baseline reading in readings table
    existing = cur.execute("SELECT id FROM readings WHERE user_email=? LIMIT 1", (email,)).fetchone()
    if not existing:
        today = datetime.now().strftime("%b %d, %I:%M %p")
        cur.execute(
            "INSERT INTO readings (user_email, date, bs, bp, chol, note) VALUES (?, ?, ?, ?, ?, ?)",
            (email, today, 0, "0/0", 0, "Initial profile created.")
        )
    conn.commit()
    conn.close()

def get_all_data(email: str):
    ensure_user_data(email)
    conn = get_db()
    cur = conn.cursor()

    # Health metrics
    row = cur.execute("SELECT * FROM health_data WHERE user_email=?", (email,)).fetchone()
    health_data = {
        "water": row["water"],
        "steps": row["steps"],
        "sleep": row["sleep"],
        "calories": row["calories"],
        "protein": row["protein"],
        "carbs": row["carbs"],
        "fat": row["fat"],
        "bloodSugar": row["blood_sugar"],
        "bloodPressureSys": row["bp_sys"],
        "bloodPressureDia": row["bp_dia"],
        "cholesterol": row["cholesterol"],
        "heartRate": row["heart_rate"],
    }

    # History arrays
    hist = cur.execute("SELECT * FROM history WHERE user_email=?", (email,)).fetchone()
    bs_history = json.loads(hist["bs_history"])
    bp_sys_history = json.loads(hist["bp_sys_history"])
    bp_dia_history = json.loads(hist["bp_dia_history"])

    # Readings (last 10)
    rows = cur.execute(
        "SELECT date, bs, bp, chol, note FROM readings WHERE user_email=? ORDER BY created_at DESC LIMIT 10",
        (email,)
    ).fetchall()
    readings = [{"date": r["date"], "bs": r["bs"], "bp": r["bp"], "chol": r["chol"], "note": r["note"]} for r in rows]

    # Roadmap
    roadmap_row = cur.execute("SELECT * FROM user_roadmap WHERE user_email=?", (email,)).fetchone()
    roadmap = None
    if roadmap_row:
        roadmap = {
            "calorieGoal": roadmap_row["calorie_goal"],
            "calorieVal": roadmap_row["calorie_val"],
            "hydrationTarget": roadmap_row["hydration_target"],
            "hydrationVal": roadmap_row["hydration_val"],
            "movementGoal": roadmap_row["movement_goal"],
            "movementVal": roadmap_row["movement_val"],
            "clinicalContext": roadmap_row["clinical_context"]
        }

    conn.close()

    return {
        "healthData": health_data,
        "bsHistory": bs_history,
        "bpSysHistory": bp_sys_history,
        "bpDiaHistory": bp_dia_history,
        "readings": readings,
        "roadmap": roadmap
    }

# ─── ROUTES ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Sanjeevni API is running 🫀"}

@app.post("/api/login")
def login(payload: dict = Body(...)):
    method = payload.get("method", "email")
    email = payload.get("email", DEFAULT_USER)
    password = payload.get("password", "")
    name = "John Doe" if method == "google" else email.split("@")[0]
    avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={name}"

    hashed_pw = hashlib.sha256(password.encode()).hexdigest() if password else ""

    conn = get_db()
    cur = conn.cursor()
    
    # Check if user exists
    user = cur.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    
    is_new_user = False
    if not user:
        # Create new user
        cur.execute(
            "INSERT INTO users (email, name, avatar, password) VALUES (?, ?, ?, ?)",
            (email, name, avatar, hashed_pw)
        )
        conn.commit()
        is_new_user = True
    else:
        # Verify password for existing user (if not using google login)
        if method != "google" and user["password"] and user["password"] != hashed_pw:
            conn.close()
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Invalid password")

    conn.close()

    ensure_user_data(email)
    return {"name": name, "email": email, "avatar": avatar, "isNewUser": is_new_user}

@app.get("/api/health-data")
def get_health_data(user: str = DEFAULT_USER):
    return get_all_data(user)

@app.post("/api/log-data")
def log_data(payload: dict = Body(...)):
    email = payload.get("userEmail", DEFAULT_USER)
    ensure_user_data(email)

    conn = get_db()
    cur = conn.cursor()

    # Build SQL updates dynamically for only provided fields
    field_map = {
        "water": "water", "steps": "steps", "sleep": "sleep",
        "calories": "calories", "protein": "protein", "carbs": "carbs",
        "fat": "fat", "bloodSugar": "blood_sugar",
        "bpSys": "bp_sys", "bpDia": "bp_dia",
        "cholesterol": "cholesterol", "heartRate": "heart_rate",
    }

    updates = []
    values = []
    for form_key, db_col in field_map.items():
            if form_key in payload and payload[form_key] not in [None, ""]:
                updates.append(f"{db_col} = ?")
                if db_col in ("water", "steps", "calories", "protein", "carbs", "fat", "blood_sugar", "bp_sys", "bp_dia", "cholesterol", "heart_rate"):
                    values.append(int(payload[form_key]))
                else:
                    values.append(float(payload[form_key]))

    if updates:
        values.append(datetime.now().isoformat())
        values.append(email)
        cur.execute(
            f"UPDATE health_data SET {', '.join(updates)}, updated_at = ? WHERE user_email = ?",
            values
        )

    # Update history arrays
    if "bloodSugar" in payload and payload["bloodSugar"] not in [None, ""]:
        hist = cur.execute("SELECT bs_history FROM history WHERE user_email=?", (email,)).fetchone()
        arr = json.loads(hist["bs_history"])
        arr = arr[1:] + [int(payload["bloodSugar"])]
        cur.execute("UPDATE history SET bs_history=? WHERE user_email=?", (json.dumps(arr), email))

    if "bpSys" in payload and payload["bpSys"] not in [None, ""]:
        hist = cur.execute("SELECT bp_sys_history FROM history WHERE user_email=?", (email,)).fetchone()
        arr = json.loads(hist["bp_sys_history"])
        arr = arr[1:] + [int(payload["bpSys"])]
        cur.execute("UPDATE history SET bp_sys_history=? WHERE user_email=?", (json.dumps(arr), email))

    if "bpDia" in payload and payload["bpDia"] not in [None, ""]:
        hist = cur.execute("SELECT bp_dia_history FROM history WHERE user_email=?", (email,)).fetchone()
        arr = json.loads(hist["bp_dia_history"])
        arr = arr[1:] + [int(payload["bpDia"])]
        cur.execute("UPDATE history SET bp_dia_history=? WHERE user_email=?", (json.dumps(arr), email))

    # Save reading log entry only if medical fields are actually updated
    medical_keys = ["bloodSugar", "bpSys", "bpDia", "cholesterol"]
    has_medical_update = any(k in payload and payload[k] not in [None, ""] for k in medical_keys)
    if has_medical_update:
        row = cur.execute("SELECT * FROM health_data WHERE user_email=?", (email,)).fetchone()
        today = datetime.now().strftime("%b %d, %I:%M %p")
        cur.execute(
            "INSERT INTO readings (user_email, date, bs, bp, chol, note) VALUES (?, ?, ?, ?, ?, ?)",
            (email, today, row["blood_sugar"],
             f"{row['bp_sys']}/{row['bp_dia']}", row["cholesterol"], "Manual entry")
        )
    
    conn.commit()
    conn.close()

    # Clear cached predictions since health data was updated
    if email in predictions_cache:
        predictions_cache.pop(email, None)

    return get_all_data(email)

@app.get("/api/readings")
def get_readings(user: str = DEFAULT_USER, limit: int = 10):
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT date, bs, bp, chol, note FROM readings WHERE user_email=? ORDER BY created_at DESC LIMIT ?",
        (user, limit)
    ).fetchall()
    conn.close()
    return [{"date": r["date"], "bs": r["bs"], "bp": r["bp"], "chol": r["chol"], "note": r["note"]} for r in rows]

def get_heuristic_predictions(hd: dict):
    # 1. Cardiovascular Risk
    bp_sys = hd["bloodPressureSys"]
    bp_dia = hd["bloodPressureDia"]
    chol = hd["cholesterol"]
    hr = hd["heartRate"]
    steps = hd["steps"]
    
    cv_points = 0
    if bp_sys >= 140 or bp_dia >= 90:
        cv_points += 40
    elif bp_sys >= 130 or bp_dia >= 80:
        cv_points += 20
    
    if chol >= 240:
        cv_points += 35
    elif chol >= 200:
        cv_points += 20
        
    if hr < 60 or hr > 100:
        cv_points += 15
        
    if steps < 5000:
        cv_points += 10
    elif steps >= 10000:
        cv_points -= 10
        
    cv_risk = max(5, min(95, 10 + cv_points))
    
    # 2. Diabetes Risk
    bs = hd["bloodSugar"]
    sleep = hd["sleep"]
    
    diab_points = 0
    if bs > 125:
        diab_points += 50
    elif bs > 100:
        diab_points += 30
    elif bs < 70:
        diab_points += 15
        
    if steps < 5000:
        diab_points += 15
    elif steps >= 10000:
        diab_points -= 10
        
    if sleep < 6:
        diab_points += 10
        
    diab_risk = max(5, min(95, 15 + diab_points))
    
    # 3. Overall Risk
    overall_risk = round((cv_risk + diab_risk) / 2)
    
    # 4. AI Recommendations
    recommendations = []
    
    if cv_risk >= 50:
        recommendations.append({
            "icon": "❤️",
            "title": "Urgent Cardiologist Consultation",
            "desc": f"Your cardiovascular risk is elevated ({cv_risk}%) due to high blood pressure ({bp_sys}/{bp_dia}) and cholesterol ({chol} mg/dL). Please consult a specialist.",
            "meta": f"AI Heuristic Model · Confidence: {min(cv_risk + 15, 98)}%",
            "btn": "Find Doctor",
            "btnPath": "/doctors"
        })
        
    if diab_risk >= 40:
        recommendations.append({
            "icon": "🍬",
            "title": "Metabolic Care Assessment",
            "desc": f"Diabetes Risk: {diab_risk}%. Your fasting glucose of {bs} mg/dL is outside the optimal range. Focus on complex carbohydrates and moderate post-meal walks.",
            "meta": f"AI Heuristic Model · Confidence: {min(diab_risk + 18, 96)}%",
            "btn": None,
            "btnPath": None
        })
        
    if steps < 8000:
        recommendations.append({
            "icon": "🏃",
            "title": "Optimize Daily Activity",
            "desc": f"Your current steps ({steps}) are below the cardio-protective threshold of 10,000 steps. Increasing this can lower cardiovascular risk by up to 22%.",
            "meta": "AI Fitness Coach · Confidence: 94%",
            "btn": None,
            "btnPath": None
        })
        
    if hd["water"] < 6:
        recommendations.append({
            "icon": "💧",
            "title": "Optimize Hydration Levels",
            "desc": f"At {hd['water']} glasses of water today, your kidney filtration rate and cardiovascular system are under minor stress. Increase hydration to at least 8 glasses.",
            "meta": "AI Hydration Expert · Confidence: 97%",
            "btn": None,
            "btnPath": None
        })
        
    recommendations.append({
        "icon": "✅",
        "title": "Sanjeevni Smart AI Monitoring",
        "desc": "Keep logging your metrics regularly. The AI model performs best with consistent daily readings to establish your personal health baseline.",
        "meta": "General Health Model · Confidence: 99%",
        "btn": None,
        "btnPath": None
    })
    
    return {
        "cvRisk": cv_risk,
        "diabRisk": diab_risk,
        "overallRisk": overall_risk,
        "recommendations": recommendations
    }

@app.post("/api/generate-goal")
def generate_goal(payload: dict = Body(...)):
    age = payload.get("age", 25)
    weight = payload.get("weight", 70)
    height = payload.get("height", 170)
    gender = payload.get("gender", "Male")
    goal = payload.get("goal", "Fitness")
    
    if not GEMINI_API_KEY:
        return {"goalDetail": f"A personalized {goal.lower()} plan optimized for a {age}-year-old {gender}."}
        
    try:
        prompt = f"""
        You are a highly intelligent fitness AI. Generate a short, punchy 1-sentence fitness objective (max 15 words) 
        for a {age}-year-old {gender} (Weight: {weight}kg, Height: {height}cm) who selected the primary goal of '{goal}'.
        The sentence should read as a first-person objective or a direct command for the user. Do not use quotes.
        """
        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(prompt)
        text = response.text.strip().replace('"', '')
        return {"goalDetail": text}
    except Exception as e:
        print("Error generating goal:", e)
        return {"goalDetail": f"A personalized {goal.lower()} plan optimized for a {age}-year-old {gender}."}


@app.post("/api/generate-roadmap")
def generate_roadmap(payload: dict = Body(...)):
    email = payload.get("email")
    age = payload.get("age", 25)
    weight = payload.get("weight", 70)
    height = payload.get("height", 170)
    gender = payload.get("gender", "Male")
    goal = payload.get("goal", "Fitness")
    diet = payload.get("diet", "Veg")
    conditions = payload.get("conditions", [])

    cal_val = 1820 if goal == "Fat Loss" else 2850 if goal == "Muscle Gain" else 2200
    hyd_val = 10
    mov_val = 12000 if goal == "Marathon" else 10000

    fallback = {
        "calorieGoal": f"{cal_val:,} kcal",
        "calorieVal": cal_val,
        "hydrationTarget": "8-10 glasses (2.5L)",
        "hydrationVal": hyd_val,
        "movementGoal": f"{mov_val:,} steps",
        "movementVal": mov_val,
        "clinicalContext": ", ".join(conditions) if conditions else "No Conditions Active"
    }

    result = fallback

    if GEMINI_API_KEY:
        try:
            prompt = f"""
            You are an expert medical and fitness AI. Given the following user profile, generate a personalized health roadmap.
            Profile: Age {age}, {gender}, Weight {weight}kg, Height {height}cm, Goal: {goal}, Diet: {diet}, Medical Conditions: {', '.join(conditions) if conditions else 'None'}.
            
            Respond with exactly valid JSON having these 7 keys only:
            - "calorieGoal": A string with the recommended daily calorie intake (e.g., "1,950 kcal").
            - "calorieVal": An integer representing only the calorie number (e.g., 1950).
            - "hydrationTarget": A string with the daily water recommendation (e.g., "3 Liters" or "10 glasses").
            - "hydrationVal": An integer representing the number of 250ml glasses of water recommended daily (e.g., 12 for 3L, 10 for 2.5L, 8 for 2L).
            - "movementGoal": A string with daily activity recommendation (e.g., "8,000 steps").
            - "movementVal": An integer representing the daily steps target (e.g., 8000).
            - "clinicalContext": A short, impactful string of medical advice based on their conditions and age (e.g., "Monitor sugar closely").

            Output ONLY the JSON object, no markdown, no quotes.
            """
            model = genai.GenerativeModel('gemini-2.0-flash', generation_config={"response_mime_type": "application/json"})
            response = model.generate_content(prompt)
            text = response.text.strip()
            result = json.loads(text)
        except Exception as e:
            print("Error generating roadmap:", e)
            result = fallback

    if email:
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO user_roadmap 
                (user_email, calorie_goal, calorie_val, hydration_target, hydration_val, movement_goal, movement_val, clinical_context)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    email,
                    result.get("calorieGoal"),
                    result.get("calorieVal"),
                    result.get("hydrationTarget"),
                    result.get("hydrationVal"),
                    result.get("movementGoal"),
                    result.get("movementVal"),
                    result.get("clinicalContext")
                )
            )
            conn.commit()
            conn.close()
        except Exception as db_err:
            print("Database error saving roadmap:", db_err)

    return result

@app.post("/api/predictions")
def get_predictions(payload: dict = Body(...)):
    user = payload.get("user", DEFAULT_USER)
    force = payload.get("force", False)
    appointments = payload.get("appointments", [])
    survey = payload.get("survey") or payload.get("surveyData")
    now = time.time()
    
    # 15 minutes = 900 seconds cache duration
    if user in predictions_cache and not force:
        cached = predictions_cache[user]
        if now - cached["timestamp"] < 900:
            print(f"Returning cached predictions for {user} ({int(now - cached['timestamp'])}s old)")
            cached_data = cached["data"].copy()
            cached_data["cachedAt"] = cached["timestamp"]
            cached_data["isCached"] = True
        return JSONResponse(content=cached_data, ensure_ascii=False)

    data = get_all_data(user)
    hd = data["healthData"]
    
    if not GEMINI_API_KEY:
        pred = get_heuristic_predictions(hd)
        predictions_cache[user] = {"timestamp": now, "data": pred}
        pred_copy = pred.copy()
        pred_copy["cachedAt"] = now
        pred_copy["isCached"] = False
        return JSONResponse(content=pred_copy, ensure_ascii=False)
        
    try:
        prompt = f"""
        You are an expert AI physician advising on the Sanjeevni Smart Health Platform.
        Analyze the patient's health parameters and trends:
        
        Current Metrics:
        - Water intake: {hd['water']} glasses
        - Steps today: {hd['steps']}
        - Sleep duration: {hd['sleep']} hours
        - Calories intake/burned: {hd['calories']} kcal
        - Macros: Protein {hd['protein']}g, Carbs {hd['carbs']}g, Fat {hd['fat']}g
        - Blood Sugar: {hd['bloodSugar']} mg/dL
        - Blood Pressure: {hd['bloodPressureSys']}/{hd['bloodPressureDia']} mmHg
        - Cholesterol: {hd['cholesterol']} mg/dL
        - Heart Rate: {hd['heartRate']} bpm
        
        History & Trends (past 7 readings):
        - Blood Sugar trend: {data['bsHistory']}
        - BP Systolic trend: {data['bpSysHistory']}
        - BP Diastolic trend: {data['bpDiaHistory']}
        
        Recent Manual Entries:
        {json.dumps(data['readings'], indent=2)}
        
        Upcoming Booked Doctor Appointments:
        {json.dumps(appointments, indent=2)}

        Patient Personal Profile & Onboarding Survey Data:
        {json.dumps(survey, indent=2) if survey else "Not completed yet"}
        
        Calculate the following health risk assessments (each value must be an integer between 5 and 95 representing percentage risk):
        1. Overall Health Risk percentage
        2. Diabetes Risk percentage (5-year outlook)
        3. Cardiovascular Risk percentage
        
        Also generate a list of personalized, highly relevant, clear, and empathetic health recommendations.
        For each recommendation, provide:
        - "icon": A single health-themed emoji matching the recommendation (e.g. ❤️, 🍬, 🏃, 💧, 🥗, 😴, 💊)
        - "title": A clear, short header (e.g. "Optimize Daily Activity", "Urgent Cardiologist Consultation", "Pre-Diabetes Warning")
        - "desc": A detailed and compassionate clinical description of the finding, citing the patient's actual values and what actions they should take (1-2 sentences).
        - "meta": A string describing the confidence or specialty (e.g. "AI Cardiology Expert · Confidence: 92%")
        - "btn": Optional button label (e.g. "Find Doctor" or null)
        - "btnPath": Optional route for the button (e.g. "/doctors" or null)
        
        Return your response strictly as a valid JSON object matching this schema:
        {{
            "cvRisk": integer,
            "diabRisk": integer,
            "overallRisk": integer,
            "recommendations": [
                {{
                    "icon": "icon_emoji",
                    "title": "title_text",
                    "desc": "description_text",
                    "meta": "meta_text",
                    "btn": "button_label_or_null",
                    "btnPath": "button_path_or_null"
                }}
            ]
        }}
        Do not output any markdown formatting, code block backticks (like ```json), or extra text outside the JSON.
        """
        
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        pred = json.loads(response.text)
        predictions_cache[user] = {"timestamp": now, "data": pred}
        pred_copy = pred.copy()
        pred_copy["cachedAt"] = now
        pred_copy["isCached"] = False
        return JSONResponse(content=pred_copy, ensure_ascii=False)
    except Exception as e:
        print(f"Gemini API Error, falling back to heuristics: {e}")
        pred = get_heuristic_predictions(hd)
        predictions_cache[user] = {"timestamp": now, "data": pred}
        pred_copy = pred.copy()
        pred_copy["cachedAt"] = now
        pred_copy["isCached"] = False
        return pred_copy

def get_heuristic_chat_reply(message: str, hd: dict):
    m = message.lower()
    
    def get_status(type, val):
        if type == 'bs':
            if val < 70:   return 'Low (⚠️)'
            if val <= 100: return 'Normal (✅)'
            if val <= 125: return 'Pre-diabetic (⚠️)'
            return 'High (🚨)'
        if type == 'bpSys':
            if val < 120:  return 'Normal (✅)'
            if val < 130:  return 'Elevated (⚠️)'
            if val < 140:  return 'Stage 1 (⚠️)'
            return 'Stage 2 (🚨)'
        if type == 'chol':
            if val < 170:  return 'Normal (✅)'
            if val < 200:  return 'Borderline (ℹ️)'
            return 'High (🚨)'
        return 'OK'

    if 'blood sugar' in m or 'glucose' in m:
        return f"Your current blood sugar is {hd['bloodSugar']} mg/dL ({get_status('bs', hd['bloodSugar'])}). Normal range is 70–100 mg/dL fasting. {'Consider reducing sugar intake and increasing exercise.' if hd['bloodSugar'] > 100 else 'Keep up the good work!'}"
    if 'blood pressure' in m or 'bp' in m:
        return f"Your BP is {hd['bloodPressureSys']}/{hd['bloodPressureDia']} mmHg ({get_status('bpSys', hd['bloodPressureSys'])}). {'Reduce sodium, exercise regularly, and consult a doctor.' if hd['bloodPressureSys'] >= 130 else 'Maintain your current healthy habits!'}"
    if 'cholesterol' in m:
        return f"Your cholesterol is {hd['cholesterol']} mg/dL ({get_status('chol', hd['cholesterol'])}). {'Reduce saturated fats, increase fiber, and exercise.' if hd['cholesterol'] >= 170 else 'Great cholesterol levels!'}"
    if 'step' in m or 'walk' in m:
        return f"You've done {hd['steps']:,} steps today — {int(hd['steps'] / 10000 * 100)}% of your 10,000 goal. {'Try to add a 20-minute walk!' if hd['steps'] < 7000 else 'Great job! Keep it up!'}"
    if 'sleep' in m:
        return f"You slept {hd['sleep']} hours. {'Good sleep! Aim for 7-9 hours consistently.' if hd['sleep'] >= 7 else 'You need more sleep. Try going to bed 30 minutes earlier.'}"
    if 'water' in m or 'hydrat' in m:
        return f"You've had {hd['water']} glasses today. {'Great hydration!' if hd['water'] >= 8 else 'Try to reach 8 glasses (2L) daily.'}"
    if 'score' in m or 'summar' in m or 'status' in m:
        return f"📊 Health Summary:\n• Blood Sugar: {hd['bloodSugar']} mg/dL — {get_status('bs', hd['bloodSugar'])}\n• BP: {hd['bloodPressureSys']}/{hd['bloodPressureDia']} — {get_status('bpSys', hd['bloodPressureSys'])}\n• Cholesterol: {hd['cholesterol']} — {get_status('chol', hd['cholesterol'])}\n• Steps: {hd['steps']:,}/10,000\n• Sleep: {hd['sleep']}h\n• Water: {hd['water']}/8 glasses"
    if 'food' in m or 'eat' in m or 'diet' in m or 'avoid' in m:
        sugar_tip = '🍬 Reduce refined carbs & sugary drinks\n' if hd['bloodSugar'] > 100 else ''
        bp_tip = '🧂 Limit sodium to under 2,300mg/day\n' if hd['bloodPressureSys'] >= 130 else ''
        chol_tip = '🥩 Reduce saturated & trans fats\n' if hd['cholesterol'] >= 170 else ''
        return f"Based on your data:\n{sugar_tip}{bp_tip}{chol_tip}✅ Eat more: leafy greens, whole grains, omega-3 fish"
    if 'doctor' in m or 'appointment' in m:
        doc_rec = ' Dr. Johny Paji (Cardiologist) is available nearby — 2.3km away, 15 min wait.'
        return f"Based on your health parameters:\n{'⚠️ I recommend seeing a cardiologist soon.' if (hd['bloodPressureSys'] >= 130 or hd['cholesterol'] >= 170) else ''}{doc_rec}"
    return f"Based on your data (BS: {hd['bloodSugar']}, BP: {hd['bloodPressureSys']}/{hd['bloodPressureDia']}), I recommend maintaining regular monitoring. What specific aspect of your health would you like to know?"

def format_chat_history(history_list: list) -> list:
    """Format frontend history list to Gemini SDK role/parts structure."""
    formatted = []
    for msg in history_list:
        role = msg.get("role")
        text = msg.get("text", "")
        if not text:
            continue
        # Map frontend roles ('user'/'bot') to Gemini roles ('user'/'model')
        gemini_role = "model" if role == "bot" else "user"
        formatted.append({
            "role": gemini_role,
            "parts": [text]
        })
    # Gemini SDK requires the chat history to start with a user message.
    # If the list starts with a model response (the initial bot greeting), skip it.
    while formatted and formatted[0]["role"] == "model":
        formatted.pop(0)
    return formatted

@app.post("/api/chat")
def chat(payload: dict = Body(...)):
    message = payload.get("message", "")
    email = payload.get("userEmail", DEFAULT_USER)
    history_list = payload.get("history", [])
    appointments = payload.get("appointments", [])
    survey = payload.get("survey") or payload.get("surveyData")
    
    data = get_all_data(email)
    hd = data["healthData"]
    
    if not GEMINI_API_KEY:
        reply = get_heuristic_chat_reply(message, hd)
        return {"reply": reply}
        
    try:
        system_instruction = f"""
        You are an expert, compassionate, and helpful AI medical assistant at the Sanjeevni Smart Health Platform.
        You are talking directly to the patient. Always maintain a professional, empathetic, and encouraging tone.
        
        You have direct access to the patient's real health data:
        
        Patient's Current Health Metrics:
        - Water intake: {hd['water']}/8 glasses today
        - Daily Steps: {hd['steps']}/10,000 steps today
        - Sleep: {hd['sleep']} hours
        - Calories: {hd['calories']} kcal
        - Macros: Protein {hd.get('protein', 0)}g, Carbs {hd.get('carbs', 0)}g, Fat {hd.get('fat', 0)}g
        - Blood Sugar: {hd['bloodSugar']} mg/dL
        - Blood Pressure: {hd['bloodPressureSys']}/{hd['bloodPressureDia']} mmHg
        - Cholesterol: {hd['cholesterol']} mg/dL
        - Heart Rate: {hd['heartRate']} bpm
        
        Patient's History Trends (past 7 logs):
        - Blood Sugar Trend: {data.get('bsHistory', [])}
        - Blood Pressure Systolic Trend: {data.get('bpSysHistory', [])}
        - Blood Pressure Diastolic Trend: {data.get('bpDiaHistory', [])}
        
        Recent Health Log Readings & Clinical Notes:
        {json.dumps(data.get('readings', []), indent=2)}
        
        Upcoming Booked Doctor Appointments:
        {json.dumps(appointments, indent=2)}

        Patient Personal Profile & Onboarding Survey Data:
        {json.dumps(survey, indent=2) if survey else "Not completed yet"}
        
        Your instructions:
        1. Answer the patient's questions based on their real health metrics and historical logs/trends listed above.
        2. If the user asks about their history, logs, trends, or specific entries, reference the values and dates in the "Recent Health Log Readings" or "Patient's History Trends" sections.
        3. Provide high-quality clinical insights, lifestyle tips, dietary advice, or cardiologist/endocrinologist recommendations tailored to their actual numbers.
        4. Always remind them to consult a real physician for medical emergencies or diagnoses.
        5. Keep your response concise, engaging, and directly relevant. Use bullet points for steps or lists to make it highly readable.
        """
        
        model = genai.GenerativeModel(model_name="gemini-2.0-flash", system_instruction=system_instruction)
        
        if history_list:
            formatted_history = format_chat_history(history_list)
            chat_session = model.start_chat(history=formatted_history)
            response = chat_session.send_message(message)
        else:
            response = model.generate_content(message)
            
        return {"reply": response.text}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Gemini Chat Error: {e}")
        reply = get_heuristic_chat_reply(message, hd)
        return {"reply": reply}

HEURISTIC_FOODS = {
    "paneer": {"cal": 265, "pro": 18, "carbs": 1.2, "fat": 20},
    "roti": {"cal": 120, "pro": 3.5, "carbs": 22, "fat": 1.5},
    "chicken": {"cal": 165, "pro": 31, "carbs": 0, "fat": 3.6},
    "rice": {"cal": 130, "pro": 2.7, "carbs": 28, "fat": 0.3},
    "dal": {"cal": 116, "pro": 9, "carbs": 20, "fat": 4},
    "egg": {"cal": 78, "pro": 6, "carbs": 0.6, "fat": 5},
    "milk": {"cal": 103, "pro": 8, "carbs": 12, "fat": 2.4},
    "banana": {"cal": 210, "pro": 5, "carbs": 35, "fat": 3},
    "oats": {"cal": 150, "pro": 5, "carbs": 27, "fat": 2.5},
    "nuts": {"cal": 170, "pro": 6, "carbs": 6, "fat": 15},
}

@app.post("/api/analyze-food")
def analyze_food(payload: dict = Body(...)):
    food_name = payload.get("foodName", "").strip()
    quantity = float(payload.get("quantity", 1))
    
    if not food_name:
        return {"name": "Unknown Food", "cal": 0, "pro": 0, "carbs": 0, "fat": 0}
        
    # Check fallback list
    fallback_food = None
    fn_lower = food_name.lower()
    for key, val in HEURISTIC_FOODS.items():
        if key in fn_lower:
            fallback_food = {
                "name": food_name,
                "cal": round(val["cal"] * quantity),
                "pro": round(val["pro"] * quantity, 1),
                "carbs": round(val["carbs"] * quantity, 1),
                "fat": round(val["fat"] * quantity, 1)
            }
            break
            
    if not fallback_food:
        fallback_food = {
            "name": food_name,
            "cal": round(150 * quantity),
            "pro": round(5 * quantity, 1),
            "carbs": round(20 * quantity, 1),
            "fat": round(5 * quantity, 1)
        }
        
    if not GEMINI_API_KEY:
        return fallback_food
        
    try:
        prompt = f"""
        You are an expert nutritionist AI.
        Analyze the nutrition profile for the following food item:
        Food description: "{food_name}"
        Quantity/Servings: {quantity}
        
        Estimate the total calories (in kcal), protein (in grams), carbohydrates (in grams), and fat (in grams) for the given food item and quantity.
        
        Return your response strictly as a valid JSON object matching this schema:
        {{
            "name": "Cleaned Food Name with Quantity (e.g. 1 Chicken Wrap)",
            "cal": estimated_calories_integer,
            "pro": estimated_protein_grams,
            "carbs": estimated_carbohydrates_grams,
            "fat": estimated_fat_grams
        }}
        Do not output any markdown formatting, code block backticks (like ```json), or extra text outside the JSON.
        """
        
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Gemini Food Analysis Error: {e}")
        return fallback_food

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

