from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import re
import logging
import bcrypt
import jwt
import random
import uuid
import csv
import io
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Set

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Display order for 10 pillars (must match SECTOR_DEFS in seed section)
CANONICAL_SECTOR_CODES = (
    "AGR", "ECO", "EDU", "ENV", "GOV", "IND", "INF", "HLT", "SOC", "PMU",
)


def normalize_sectors_list(sectors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """One row per sector code; stable order for UI after mongorestore/merge duplicates."""
    by_code: Dict[str, Dict[str, Any]] = {}
    for s in sectors:
        code = (s.get("code") or "").strip().upper()
        if not code:
            continue
        if code not in by_code:
            by_code[code] = s
    rank = {c: i for i, c in enumerate(CANONICAL_SECTOR_CODES)}

    def sort_key(doc: Dict[str, Any]) -> tuple:
        c = (doc.get("code") or "").strip().upper()
        return (rank.get(c, 999), c)

    return sorted(by_code.values(), key=sort_key)


async def _dedupe_natural_key_collection(collection, field: str) -> int:
    """Delete duplicate documents that share the same business key (case-insensitive). Keeps oldest _id."""
    pipeline = [
        {"$match": {field: {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": {"$toUpper": f"${field}"}, "ids": {"$push": "$_id"}, "n": {"$sum": 1}}},
        {"$match": {"_id": {"$ne": ""}, "n": {"$gt": 1}}},
    ]
    deleted = 0
    async for bucket in collection.aggregate(pipeline):
        ids_sorted = sorted(bucket["ids"])
        to_del = ids_sorted[1:]
        if to_del:
            r = await collection.delete_many({"_id": {"$in": to_del}})
            deleted += int(r.deleted_count)
    return deleted


async def _dedupe_users_by_email() -> int:
    pipeline = [
        {"$match": {"email": {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": {"$toLower": "$email"}, "ids": {"$push": "$_id"}, "n": {"$sum": 1}}},
        {"$match": {"n": {"$gt": 1}}},
    ]
    deleted = 0
    async for bucket in db.users.aggregate(pipeline):
        ids_sorted = sorted(bucket["ids"])
        to_del = ids_sorted[1:]
        if to_del:
            r = await db.users.delete_many({"_id": {"$in": to_del}})
            deleted += int(r.deleted_count)
    return deleted


async def dedupe_reference_collections_at_startup() -> None:
    """Fix doubled rows after mongorestore on top of seeded data (KPIs, districts, sectors, users)."""
    try:
        k = await _dedupe_natural_key_collection(db.kpis, "kpi_id")
        s = await _dedupe_natural_key_collection(db.sectors, "code")
        d = await _dedupe_natural_key_collection(db.districts, "name")
        u = await _dedupe_users_by_email()
        if k or s or d or u:
            logger.info(
                "Removed duplicate MongoDB documents: kpis=%s sectors=%s districts=%s users=%s",
                k, s, d, u,
            )
    except Exception as e:
        logger.warning("Reference deduplication skipped: %s", e)


async def _drop_index_safely(collection, *names: str) -> None:
    for name in names:
        try:
            await collection.drop_index(name)
        except Exception:
            pass


async def ensure_kpi_sector_district_indexes() -> None:
    """Rebuild KPI/sector/district indexes (required after seed_data drops those collections)."""
    await _drop_index_safely(db.kpis, "kpi_id_1")
    await _drop_index_safely(db.sectors, "code_1")
    await _drop_index_safely(db.districts, "name_1")
    await db.kpis.create_index("sector_code")
    try:
        await db.kpis.create_index("kpi_id", unique=True)
    except Exception as e:
        logger.warning("Could not create unique index on kpis.kpi_id: %s", e)
        await db.kpis.create_index("kpi_id")
    await db.kpis.create_index("status")
    try:
        await db.districts.create_index("name", unique=True)
    except Exception as e:
        logger.warning("Could not create unique index on districts.name: %s", e)
        await db.districts.create_index("name")
    try:
        await db.sectors.create_index("code", unique=True)
    except Exception as e:
        logger.warning("Could not create unique index on sectors.code: %s", e)
        await db.sectors.create_index("code")


# ========== AUTH FUNCTIONS ==========
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))

def get_jwt_secret():
    return os.environ['JWT_SECRET']

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=2), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ========== PYDANTIC MODELS ==========
class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = "viewer"

class InsightRequest(BaseModel):
    context_type: str
    context_id: Optional[str] = None
    query: Optional[str] = None

class CompareRequest(BaseModel):
    districts: List[str]
    sector: Optional[str] = None

class KPIUpdateRequest(BaseModel):
    kpi_name: Optional[str] = None
    kpi_name_hi: Optional[str] = None
    theme: Optional[str] = None
    formula: Optional[str] = None
    unit: Optional[str] = None
    baseline_2024: Optional[float] = None
    current_value: Optional[float] = None
    target_2029: Optional[float] = None
    target_2036: Optional[float] = None
    target_2047: Optional[float] = None
    status: Optional[str] = None

class KPICreateRequest(BaseModel):
    kpi_id: str
    kpi_name: str
    kpi_name_hi: Optional[str] = ""
    sector_code: str
    theme: str
    formula: str = ""
    unit: str = "%"
    frequency: str = "Quarterly"
    baseline_2024: float = 0
    current_value: float = 0
    target_2029: float = 0
    target_2036: float = 0
    target_2047: float = 0

class KPIValueUpdate(BaseModel):
    current_value: float

class SectorUpdateRequest(BaseModel):
    name: Optional[str] = None
    name_hi: Optional[str] = None
    description: Optional[str] = None
    description_hi: Optional[str] = None
    color: Optional[str] = None

class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    assigned_sector: Optional[str] = None
    name: Optional[str] = None

# ========== ROLE HELPERS ==========
async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def require_dept_head_or_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") not in ("admin", "department_head"):
        raise HTTPException(status_code=403, detail="Admin or Department Head access required")
    return user

# ========== AUTH ENDPOINTS ==========
@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(req.password)
    role = req.role if req.role in ["admin", "department_head", "viewer"] else "viewer"
    user_doc = {"email": email, "password_hash": hashed, "name": req.name, "role": role, "created_at": datetime.now(timezone.utc).isoformat()}
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email, role)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=7200, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user_id, "email": email, "name": req.name, "role": role}

@api_router.post("/auth/login")
async def login(req: LoginRequest, request: Request, response: Response):
    email = req.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        last = attempt.get("last_attempt")
        if last:
            if isinstance(last, str):
                last = datetime.fromisoformat(last)
            if datetime.now(timezone.utc) - last.replace(tzinfo=timezone.utc) < timedelta(minutes=15):
                raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
            else:
                await db.login_attempts.delete_one({"identifier": identifier})
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last_attempt": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email, user["role"])
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=7200, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user_id, "email": email, "name": user["name"], "role": user["role"]}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    return await get_current_user(request)

@api_router.post("/auth/refresh")
async def refresh_token_endpoint(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        new_access = create_access_token(user_id, user["email"], user["role"])
        response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=7200, path="/")
        return {"message": "Token refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ========== SECTOR ENDPOINTS ==========
@api_router.get("/sectors")
async def get_sectors():
    raw = await db.sectors.find({}, {"_id": 0}).to_list(100)
    return normalize_sectors_list(raw)

@api_router.get("/sectors/{sector_code}")
async def get_sector(sector_code: str):
    sector = await db.sectors.find_one({"code": sector_code.upper()}, {"_id": 0})
    if not sector:
        raise HTTPException(status_code=404, detail="Sector not found")
    kpis = await db.kpis.find({"sector_code": sector_code.upper()}, {"_id": 0}).to_list(1000)
    sector["kpis"] = kpis
    return sector

# ========== KPI ENDPOINTS ==========
@api_router.get("/kpis")
async def get_kpis(
    sector: Optional[str] = None, theme: Optional[str] = None,
    status: Optional[str] = None, search: Optional[str] = None,
    page: int = 1, limit: int = 20
):
    query = {}
    if sector:
        query["sector_code"] = sector.upper()
    if theme:
        query["theme"] = {"$regex": theme, "$options": "i"}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"kpi_name": {"$regex": search, "$options": "i"}},
            {"kpi_id": {"$regex": search, "$options": "i"}},
            {"kpi_name_hi": {"$regex": search, "$options": "i"}}
        ]
    total = await db.kpis.count_documents(query)
    skip = (page - 1) * limit
    kpis = await db.kpis.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return {"data": kpis, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}

@api_router.get("/kpis/by-id/{kpi_id}")
async def get_kpi(kpi_id: str):
    kpi = await db.kpis.find_one({"kpi_id": kpi_id.upper()}, {"_id": 0})
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found")
    return kpi

# ========== DISTRICT ENDPOINTS ==========
@api_router.get("/districts")
async def get_districts():
    rows = await db.districts.find({}, {"_id": 0}).sort("rank", 1).to_list(200)
    return filter_to_canonical_districts(rows)

@api_router.get("/districts/{district_name}")
async def get_district(district_name: str):
    district = await db.districts.find_one({"name": {"$regex": f"^{district_name}$", "$options": "i"}}, {"_id": 0})
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    return district

# ========== DASHBOARD ENDPOINTS ==========
@api_router.get("/dashboard/overview")
async def get_dashboard_overview():
    sectors = normalize_sectors_list(await db.sectors.find({}, {"_id": 0}).to_list(100))
    total_kpis = await db.kpis.count_documents({})
    on_track = await db.kpis.count_documents({"status": "on_track"})
    at_risk = await db.kpis.count_documents({"status": "at_risk"})
    off_track = await db.kpis.count_documents({"status": "off_track"})
    key_kpis = await db.kpis.find(
        {"kpi_id": {"$in": ["ECO-001", "ECO-002", "EDU-001", "HLT-001", "AGR-001", "IND-001"]}},
        {"_id": 0}
    ).to_list(10)
    all_dist = await db.districts.find({}, {"_id": 0}).to_list(300)
    by_score_desc = sorted(all_dist, key=lambda x: float(x.get("overall_score") or 0), reverse=True)
    canon_desc = filter_to_canonical_districts(by_score_desc)
    top_districts = canon_desc[:5]
    by_score_asc = sorted(canon_desc, key=lambda x: float(x.get("overall_score") or 0))
    bottom_districts = by_score_asc[:5]
    districts_count = await count_canonical_district_names()
    return {
        "sectors": sectors,
        "districts_count": districts_count,
        "total_kpis": total_kpis,
        "kpi_status": {"on_track": on_track, "at_risk": at_risk, "off_track": off_track},
        "key_indicators": key_kpis,
        "top_districts": top_districts,
        "bottom_districts": bottom_districts
    }

@api_router.get("/dashboard/sector-performance")
async def get_sector_performance():
    sectors = normalize_sectors_list(await db.sectors.find({}, {"_id": 0}).to_list(100))
    result = []
    for s in sectors:
        on_track = await db.kpis.count_documents({"sector_code": s["code"], "status": "on_track"})
        at_risk = await db.kpis.count_documents({"sector_code": s["code"], "status": "at_risk"})
        off_track = await db.kpis.count_documents({"sector_code": s["code"], "status": "off_track"})
        total = on_track + at_risk + off_track
        result.append({**s, "kpi_count": total, "on_track": on_track, "at_risk": at_risk, "off_track": off_track})
    return result

# ========== COMPARISON ENDPOINT ==========
@api_router.post("/compare")
async def compare_districts(req: CompareRequest):
    result = []
    for name in req.districts[:4]:
        district = await db.districts.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}, {"_id": 0})
        if district:
            result.append(district)
    return result

# ========== AI INSIGHTS ENDPOINT ==========
@api_router.post("/insights/generate")
async def generate_insight(req: InsightRequest, request: Request):
    user = await get_current_user(request)
    context_data = ""
    if req.context_type == "sector" and req.context_id:
        sector = await db.sectors.find_one({"code": req.context_id.upper()}, {"_id": 0})
        kpis = await db.kpis.find({"sector_code": req.context_id.upper()}, {"_id": 0}).to_list(100)
        if sector:
            context_data = f"Sector: {sector['name']}\nDescription: {sector.get('description', '')}\n\nKPIs:\n"
            for kpi in kpis:
                context_data += f"- {kpi['kpi_name']}: Current={kpi['current_value']}{kpi['unit']}, Target2029={kpi['target_2029']}, Target2047={kpi['target_2047']}, Status={kpi['status']}\n"
    elif req.context_type == "district" and req.context_id:
        district = await db.districts.find_one({"name": {"$regex": f"^{req.context_id}$", "$options": "i"}}, {"_id": 0})
        if district:
            context_data = f"District: {district['name']}\nDivision: {district['division']}\nPopulation: {district['population']}\nOverall Score: {district['overall_score']}\nRank: {district['rank']}\nSector Scores: {district.get('scores', {})}"
    elif req.context_type == "general":
        total_kpis = await db.kpis.count_documents({})
        on_track = await db.kpis.count_documents({"status": "on_track"})
        at_risk = await db.kpis.count_documents({"status": "at_risk"})
        off_track = await db.kpis.count_documents({"status": "off_track"})
        context_data = f"MP Vision 2047 Overview:\nTotal KPIs: {total_kpis}\nOn Track: {on_track}\nAt Risk: {at_risk}\nOff Track: {off_track}"
    elif req.context_type == "kpi" and req.context_id:
        kpi = await db.kpis.find_one({"kpi_id": req.context_id.upper()}, {"_id": 0})
        if kpi:
            context_data = (
                f"KPI: {kpi.get('kpi_id')} - {kpi.get('kpi_name')}\n"
                f"Sector: {kpi.get('sector_code')}\nTheme: {kpi.get('theme')}\n"
                f"Unit: {kpi.get('unit')}\nStatus: {kpi.get('status')}\n"
                f"Baseline 2024: {kpi.get('baseline_2024')}\nCurrent: {kpi.get('current_value')}\n"
                f"Target 2029: {kpi.get('target_2029')}\nTarget 2036: {kpi.get('target_2036')}\nTarget 2047: {kpi.get('target_2047')}\n"
                f"Formula: {kpi.get('formula')}\n"
            )
    else:
        context_data = "General MP Vision 2047 status query."

    prompt = req.query or "Provide strategic insights and recommendations based on the data."
    try:
        response_text = ""
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
            llm_key = os.environ.get('EMERGENT_LLM_KEY')
            if llm_key:
                chat = LlmChat(
                    api_key=llm_key,
                    session_id=f"mp-vision-{uuid.uuid4()}",
                    system_message="You are an AI policy advisor for Madhya Pradesh Vision 2047. Analyze data and give concise, actionable insights. Focus on trends, risks, opportunities, and recommendations. Keep responses under 250 words. Use bullet points."
                ).with_model("openai", "gpt-5.2")
                message = UserMessage(text=f"{prompt}\n\nData:\n{context_data}")
                response_text = await chat.send_message(message)
        except Exception as e:
            logger.warning("AI provider unavailable; using heuristic insights: %s", e)

        if not response_text:
            # Heuristic fallback so Insights tab works in Docker without AI keys
            if req.context_type == "kpi" and req.context_id:
                kpi = await db.kpis.find_one({"kpi_id": req.context_id.upper()}, {"_id": 0})
                if not kpi:
                    response_text = "KPI not found."
                else:
                    b = float(kpi.get("baseline_2024") or 0)
                    c = float(kpi.get("current_value") or 0)
                    t = float(kpi.get("target_2029") or 0)
                    status = (kpi.get("status") or "").replace("_", " ")
                    if t == b:
                        pct = 100.0
                    else:
                        pct = ((c - b) / (t - b)) * 100.0
                    gap = (t - c)
                    response_text = (
                        f"- **Status**: {status}\n"
                        f"- **Progress to 2029**: {pct:.1f}% (Baseline {b:g} → Current {c:g} → Target {t:g})\n"
                        f"- **Gap to 2029 target**: {gap:g} {kpi.get('unit','')}\n"
                        f"- **Suggested next actions**:\n"
                        f"  - Verify latest data source and refresh cadence for this KPI.\n"
                        f"  - Identify the top 2 drivers affecting the KPI and assign owners.\n"
                        f"  - Create a 90-day action plan with milestones aligned to the 2029 target.\n"
                    )
            else:
                response_text = (
                    "- **Insight**: AI is not configured in this environment.\n"
                    "- **Action**: Set `EMERGENT_LLM_KEY` to enable AI-generated insights."
                )

        insight_doc = {
            "id": str(uuid.uuid4()), "context_type": req.context_type, "context_id": req.context_id,
            "query": prompt, "response": response_text, "generated_by": user.get("email", "unknown"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.insights.insert_one(insight_doc)
        return {"insight": response_text, "id": insight_doc["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI insight error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate insight: {str(e)}")

@api_router.get("/insights")
async def get_insights(limit: int = 10):
    return await db.insights.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

@api_router.get("/themes")
async def get_themes():
    return await db.kpis.distinct("theme")

# ========== PUBLIC STATS (no auth) ==========
@api_router.get("/public/stats")
async def public_stats():
    total_kpis = await db.kpis.count_documents({})
    on_track = await db.kpis.count_documents({"status": "on_track"})
    at_risk = await db.kpis.count_documents({"status": "at_risk"})
    off_track = await db.kpis.count_documents({"status": "off_track"})
    sectors = normalize_sectors_list(
        await db.sectors.find(
            {},
            {"_id": 0, "code": 1, "name": 1, "name_hi": 1, "color": 1, "icon": 1, "kpi_count": 1, "overall_score": 1, "status": 1, "description": 1, "description_hi": 1},
        ).to_list(100)
    )
    districts_count = await count_canonical_district_names()
    all_dist = await db.districts.find({}, {"_id": 0, "name": 1, "name_hi": 1, "division": 1, "overall_score": 1, "rank": 1, "scores": 1}).to_list(300)
    by_score = sorted(all_dist, key=lambda x: float(x.get("overall_score") or 0), reverse=True)
    top5 = filter_to_canonical_districts(by_score)[:5]
    return {
        "total_kpis": total_kpis,
        "kpi_status": {"on_track": on_track, "at_risk": at_risk, "off_track": off_track},
        "sectors": sectors,
        "districts_count": districts_count,
        "top_districts": top5,
        "progress_pct": round((on_track / max(total_kpis, 1)) * 100),
    }

# ========== ADMIN CRUD - KPIs ==========
@api_router.post("/admin/kpis")
async def create_kpi(req: KPICreateRequest, request: Request):
    await require_admin(request)
    existing = await db.kpis.find_one({"kpi_id": req.kpi_id.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="KPI ID already exists")
    status = compute_status(req.baseline_2024, req.current_value, req.target_2029)
    doc = {
        "id": str(uuid.uuid4()), "kpi_id": req.kpi_id.upper(), "kpi_name": req.kpi_name,
        "kpi_name_hi": req.kpi_name_hi or req.kpi_name, "sector_code": req.sector_code.upper(),
        "theme": req.theme, "formula": req.formula, "unit": req.unit,
        "frequency": req.frequency, "baseline_2024": req.baseline_2024,
        "current_value": req.current_value, "target_2029": req.target_2029,
        "target_2036": req.target_2036, "target_2047": req.target_2047,
        "status": status, "trend_data": generate_trend(req.baseline_2024, req.current_value),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.kpis.insert_one(doc)
    await _update_sector_stats(req.sector_code.upper())
    doc.pop("_id", None)
    return doc

@api_router.put("/admin/kpis/{kpi_id}")
async def update_kpi(kpi_id: str, req: KPIUpdateRequest, request: Request):
    await require_admin(request)
    update = {k: v for k, v in req.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "current_value" in update or "baseline_2024" in update or "target_2029" in update:
        kpi = await db.kpis.find_one({"kpi_id": kpi_id.upper()}, {"_id": 0})
        if kpi:
            b = update.get("baseline_2024", kpi["baseline_2024"])
            c = update.get("current_value", kpi["current_value"])
            t = update.get("target_2029", kpi["target_2029"])
            update["status"] = compute_status(b, c, t)
            update["trend_data"] = generate_trend(b, c)
    result = await db.kpis.update_one({"kpi_id": kpi_id.upper()}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="KPI not found")
    kpi = await db.kpis.find_one({"kpi_id": kpi_id.upper()}, {"_id": 0})
    await _update_sector_stats(kpi["sector_code"])
    return kpi

@api_router.delete("/admin/kpis/{kpi_id}")
async def delete_kpi(kpi_id: str, request: Request):
    await require_admin(request)
    kpi = await db.kpis.find_one({"kpi_id": kpi_id.upper()}, {"_id": 0})
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found")
    await db.kpis.delete_one({"kpi_id": kpi_id.upper()})
    await _update_sector_stats(kpi["sector_code"])
    return {"message": f"KPI {kpi_id} deleted"}

# ========== ADMIN CRUD - Sectors ==========
@api_router.put("/admin/sectors/{sector_code}")
async def update_sector(sector_code: str, req: SectorUpdateRequest, request: Request):
    await require_admin(request)
    update = {k: v for k, v in req.dict().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.sectors.update_one({"code": sector_code.upper()}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sector not found")
    return await db.sectors.find_one({"code": sector_code.upper()}, {"_id": 0})

# ========== ADMIN - Users ==========
@api_router.get("/admin/users")
async def list_users(request: Request):
    await require_admin(request)
    users = await db.users.find({}, {"password_hash": 0}).to_list(500)
    for u in users:
        u["_id"] = str(u["_id"])
    return users

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, req: UserUpdateRequest, request: Request):
    await require_admin(request)
    update = {k: v for k, v in req.dict().items() if v is not None}
    if "role" in update and update["role"] not in ("admin", "department_head", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    user["_id"] = str(user["_id"])
    return user

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    admin = await require_admin(request)
    if admin["_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# ========== DEPARTMENT HEAD - KPI Value Update ==========
@api_router.put("/kpis/{kpi_id}/update-value")
async def dept_update_kpi_value(kpi_id: str, req: KPIValueUpdate, request: Request):
    user = await require_dept_head_or_admin(request)
    kpi = await db.kpis.find_one({"kpi_id": kpi_id.upper()}, {"_id": 0})
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found")
    if user["role"] == "department_head":
        assigned = user.get("assigned_sector", "")
        if assigned and kpi["sector_code"] != assigned:
            raise HTTPException(status_code=403, detail=f"You can only edit KPIs in your assigned sector ({assigned})")
    new_status = compute_status(kpi["baseline_2024"], req.current_value, kpi["target_2029"])
    new_trend = generate_trend(kpi["baseline_2024"], req.current_value)
    await db.kpis.update_one(
        {"kpi_id": kpi_id.upper()},
        {"$set": {"current_value": req.current_value, "status": new_status, "trend_data": new_trend,
                  "updated_by": user.get("email"), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await _update_sector_stats(kpi["sector_code"])
    updated = await db.kpis.find_one({"kpi_id": kpi_id.upper()}, {"_id": 0})
    return updated

# ========== DISTRICT KPI BREAKDOWN ==========
@api_router.get("/districts/{district_name}/kpis")
async def get_district_kpis(district_name: str, sector: Optional[str] = None):
    district = await db.districts.find_one({"name": {"$regex": f"^{district_name}$", "$options": "i"}}, {"_id": 0})
    if not district:
        raise HTTPException(status_code=404, detail="District not found")
    query = {}
    if sector:
        query["sector_code"] = sector.upper()
    kpis = await db.kpis.find(query, {"_id": 0}).to_list(1000)
    district_kpis = []
    for kpi in kpis:
        sector_score = district.get("scores", {}).get(kpi["sector_code"], 50)
        variation = random.uniform(0.7, 1.3) * (sector_score / 70)
        district_value = round(kpi["current_value"] * variation, 2)
        if kpi["unit"] == "%":
            district_value = min(district_value, 100)
        district_kpis.append({
            **kpi,
            "district_value": district_value,
            "district_name": district["name"],
        })
    return {"district": district, "kpis": district_kpis}

# ========== EXPORT ENDPOINTS ==========
@api_router.get("/export/kpis")
async def export_kpis_csv(sector: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if sector:
        query["sector_code"] = sector.upper()
    if status:
        query["status"] = status
    kpis = await db.kpis.find(query, {"_id": 0, "trend_data": 0, "id": 0}).to_list(1000)
    output = io.StringIO()
    if kpis:
        writer = csv.DictWriter(output, fieldnames=["kpi_id", "kpi_name", "sector_code", "theme", "formula", "unit", "frequency", "baseline_2024", "current_value", "target_2029", "target_2036", "target_2047", "status"])
        writer.writeheader()
        for kpi in kpis:
            writer.writerow({k: kpi.get(k, "") for k in writer.fieldnames})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mp_vision_kpis_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@api_router.get("/export/districts")
async def export_districts_csv():
    raw = await db.districts.find({}, {"_id": 0, "id": 0}).sort("rank", 1).to_list(200)
    districts = filter_to_canonical_districts(raw)
    output = io.StringIO()
    sector_codes = ["AGR", "ECO", "EDU", "ENV", "GOV", "IND", "INF", "HLT", "SOC", "PMU"]
    fieldnames = ["rank", "name", "division", "population", "area_sq_km", "overall_score"] + [f"score_{c}" for c in sector_codes]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for d in districts:
        row = {k: d.get(k, "") for k in ["rank", "name", "division", "population", "area_sq_km", "overall_score"]}
        for c in sector_codes:
            row[f"score_{c}"] = d.get("scores", {}).get(c, "")
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mp_vision_districts_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@api_router.get("/export/sector/{sector_code}")
async def export_sector_csv(sector_code: str):
    kpis = await db.kpis.find({"sector_code": sector_code.upper()}, {"_id": 0, "trend_data": 0, "id": 0}).to_list(500)
    output = io.StringIO()
    if kpis:
        fields = ["kpi_id", "kpi_name", "theme", "formula", "unit", "baseline_2024", "current_value", "target_2029", "target_2036", "target_2047", "status"]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for kpi in kpis:
            writer.writerow({k: kpi.get(k, "") for k in fields})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mp_vision_{sector_code.lower()}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

# ========== PDF EXPORT ENDPOINTS ==========
def _build_pdf_header(pdf, title, subtitle=""):
    pdf.set_fill_color(10, 25, 48)
    pdf.rect(0, 0, 297, 28, 'F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_xy(10, 6)
    pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
    if subtitle:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_xy(10, 15)
        pdf.cell(0, 5, subtitle)
    pdf.set_text_color(0, 0, 0)
    pdf.set_xy(10, 32)

@api_router.get("/export/dashboard/pdf")
async def export_dashboard_pdf():
    from fpdf import FPDF
    sectors = normalize_sectors_list(await db.sectors.find({}, {"_id": 0}).to_list(100))
    total_kpis = await db.kpis.count_documents({})
    on_track = await db.kpis.count_documents({"status": "on_track"})
    at_risk = await db.kpis.count_documents({"status": "at_risk"})
    off_track = await db.kpis.count_documents({"status": "off_track"})
    all_dist = await db.districts.find({}, {"_id": 0}).to_list(300)
    canon_desc = filter_to_canonical_districts(sorted(all_dist, key=lambda x: float(x.get("overall_score") or 0), reverse=True))
    top_districts = canon_desc[:10]
    canon_asc = sorted(canon_desc, key=lambda x: float(x.get("overall_score") or 0))
    bottom_districts = canon_asc[:10]
    progress = round((on_track / max(total_kpis, 1)) * 100)

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    _build_pdf_header(pdf, "MP Vision 2047 - CM Dashboard", f"Generated: {datetime.now().strftime('%d %b %Y %H:%M')}")

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, f"Overall Progress: {progress}%   |   Total KPIs: {total_kpis}   |   On Track: {on_track}   |   At Risk: {at_risk}   |   Off Track: {off_track}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_fill_color(12, 164, 232)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(30, 7, "Code", border=1, fill=True)
    pdf.cell(80, 7, "Sector", border=1, fill=True)
    pdf.cell(25, 7, "KPIs", border=1, fill=True, align="C")
    pdf.cell(30, 7, "On Track", border=1, fill=True, align="C")
    pdf.cell(30, 7, "At Risk", border=1, fill=True, align="C")
    pdf.cell(30, 7, "Off Track", border=1, fill=True, align="C")
    pdf.cell(25, 7, "Score", border=1, fill=True, align="C")
    pdf.ln()
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 9)
    for s in sectors:
        s_on = await db.kpis.count_documents({"sector_code": s["code"], "status": "on_track"})
        s_at = await db.kpis.count_documents({"sector_code": s["code"], "status": "at_risk"})
        s_off = await db.kpis.count_documents({"sector_code": s["code"], "status": "off_track"})
        pdf.cell(30, 6, s["code"], border=1)
        pdf.cell(80, 6, s["name"][:40], border=1)
        pdf.cell(25, 6, str(s.get("kpi_count", 0)), border=1, align="C")
        pdf.cell(30, 6, str(s_on), border=1, align="C")
        pdf.cell(30, 6, str(s_at), border=1, align="C")
        pdf.cell(30, 6, str(s_off), border=1, align="C")
        pdf.cell(25, 6, str(s.get("overall_score", 0)), border=1, align="C")
        pdf.ln()
    pdf.ln(6)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(140, 7, "Top 10 Districts", new_x="RIGHT")
    pdf.cell(0, 7, "Bottom 10 Districts", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    for i in range(10):
        t = top_districts[i] if i < len(top_districts) else None
        b = bottom_districts[i] if i < len(bottom_districts) else None
        left = f"#{t['rank']}  {t['name']} ({t['division']}) - {t['overall_score']}" if t else ""
        right = f"#{b['rank']}  {b['name']} ({b['division']}) - {b['overall_score']}" if b else ""
        pdf.cell(140, 5, left)
        pdf.cell(0, 5, right, new_x="LMARGIN", new_y="NEXT")

    output = io.BytesIO()
    pdf.output(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=mp_vision_cm_dashboard_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )

@api_router.get("/export/sector/{sector_code}/pdf")
async def export_sector_pdf(sector_code: str):
    from fpdf import FPDF
    sector = await db.sectors.find_one({"code": sector_code.upper()}, {"_id": 0})
    if not sector:
        raise HTTPException(status_code=404, detail="Sector not found")
    kpis = await db.kpis.find({"sector_code": sector_code.upper()}, {"_id": 0, "trend_data": 0}).to_list(500)
    on_track = sum(1 for k in kpis if k["status"] == "on_track")
    at_risk = sum(1 for k in kpis if k["status"] == "at_risk")
    off_track = sum(1 for k in kpis if k["status"] == "off_track")
    score = round((on_track / max(len(kpis), 1)) * 100)

    def safe(text):
        return str(text).encode('ascii', 'replace').decode('ascii')

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    _build_pdf_header(pdf, safe(f"MP Vision 2047 - {sector['name']}"), safe(f"Sector Code: {sector['code']}  |  Generated: {datetime.now().strftime('%d %b %Y %H:%M')}"))

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, safe(f"Score: {score}%   |   Total KPIs: {len(kpis)}   |   On Track: {on_track}   |   At Risk: {at_risk}   |   Off Track: {off_track}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(12, 164, 232)
    pdf.set_text_color(255, 255, 255)
    cols = [("KPI ID", 22), ("Name", 70), ("Theme", 50), ("Unit", 18), ("Baseline", 22), ("Current", 22), ("T-2029", 22), ("T-2047", 22), ("Status", 22)]
    for label, w in cols:
        pdf.cell(w, 6, label, border=1, fill=True, align="C")
    pdf.ln()
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 7)
    for kpi in kpis:
        vals = [kpi["kpi_id"], kpi["kpi_name"][:35], kpi.get("theme", "")[:25], safe(kpi["unit"])[:8],
                str(kpi["baseline_2024"]), str(kpi["current_value"]), str(kpi["target_2029"]),
                str(kpi["target_2047"]), kpi["status"].replace("_", " ")]
        for (_, w), v in zip(cols, vals):
            pdf.cell(w, 5, safe(v), border=1)
        pdf.ln()

    output = io.BytesIO()
    pdf.output(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=mp_vision_{sector_code.lower()}_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )

# ========== HELPER: Update sector stats ==========
async def _update_sector_stats(sector_code: str):
    on_track = await db.kpis.count_documents({"sector_code": sector_code, "status": "on_track"})
    at_risk = await db.kpis.count_documents({"sector_code": sector_code, "status": "at_risk"})
    off_track = await db.kpis.count_documents({"sector_code": sector_code, "status": "off_track"})
    total = on_track + at_risk + off_track
    score = round((on_track / max(total, 1)) * 100, 1)
    status = "on_track" if score >= 60 else ("at_risk" if score >= 30 else "off_track")
    await db.sectors.update_one(
        {"code": sector_code},
        {"$set": {"kpi_count": total, "overall_score": score, "status": status}}
    )

# ========== SEED DATA ==========
SECTOR_DEFS = [
    ("AGR", "Agriculture & Allied Sectors", "कृषि एवं संबद्ध क्षेत्र", "Sprout", "#4CAF50",
     "Covers crop agriculture, irrigation, animal husbandry, fisheries, and forestry development across Madhya Pradesh.",
     "मध्य प्रदेश में फसल कृषि, सिंचाई, पशुपालन, मत्स्य पालन और वानिकी विकास को कवर करता है।"),
    ("ECO", "Economy, Macro Growth & Public Finance", "अर्थव्यवस्था, समष्टि विकास एवं लोक वित्त", "TrendingUp", "#1565C0",
     "Tracks GSDP growth, fiscal health, investment climate, and public finance management.",
     "जीएसडीपी वृद्धि, राजकोषीय स्वास्थ्य, निवेश वातावरण और लोक वित्त प्रबंधन को ट्रैक करता है।"),
    ("EDU", "Education, Skill Development & Employment", "शिक्षा, कौशल विकास एवं रोजगार", "GraduationCap", "#FF8F00",
     "Covers education quality, enrollment rates, skill development programs, and employment generation.",
     "शिक्षा गुणवत्ता, नामांकन दर, कौशल विकास कार्यक्रम और रोजगार सृजन को कवर करता है।"),
    ("ENV", "Environment, Climate, Tourism & Culture", "पर्यावरण, जलवायु, पर्यटन एवं संस्कृति", "TreePine", "#2E7D32",
     "Covers environmental sustainability, climate resilience, tourism development, and cultural preservation.",
     "पर्यावरणीय स्थिरता, जलवायु लचीलापन, पर्यटन विकास और सांस्कृतिक संरक्षण को कवर करता है।"),
    ("GOV", "Governance, Public Service Delivery & Law", "शासन, लोक सेवा वितरण एवं विधि", "Shield", "#5E35B1",
     "Tracks governance efficiency, e-governance adoption, citizen services, and law enforcement metrics.",
     "शासन दक्षता, ई-शासन अपनाने, नागरिक सेवाओं और कानून प्रवर्तन मेट्रिक्स को ट्रैक करता है।"),
    ("IND", "Industry, Manufacturing, MSME & Logistics", "उद्योग, विनिर्माण, एमएसएमई एवं रसद", "Factory", "#E65100",
     "Covers industrial growth, MSME development, manufacturing output, and logistics infrastructure.",
     "औद्योगिक विकास, एमएसएमई विकास, विनिर्माण उत्पादन और रसद बुनियादी ढांचे को कवर करता है।"),
    ("INF", "Infrastructure, Utilities & Urban-Rural Dev", "अवसंरचना, उपयोगिताएं एवं शहरी-ग्रामीण विकास", "Building2", "#00838F",
     "Covers road networks, power supply, water infrastructure, and urban-rural development initiatives.",
     "सड़क नेटवर्क, बिजली आपूर्ति, जल बुनियादी ढांचा और शहरी-ग्रामीण विकास पहलों को कवर करता है।"),
    ("HLT", "Health, Nutrition & Public Healthcare", "स्वास्थ्य, पोषण एवं सार्वजनिक स्वास्थ्य", "Heart", "#C62828",
     "Covers health outcomes, maternal & child health, nutrition programs, and healthcare infrastructure.",
     "स्वास्थ्य परिणाम, मातृ एवं शिशु स्वास्थ्य, पोषण कार्यक्रम और स्वास्थ्य सेवा बुनियादी ढांचे को कवर करता है।"),
    ("SOC", "Social Inclusion, Welfare & Community Dev", "सामाजिक समावेशन, कल्याण एवं सामुदायिक विकास", "Users", "#6A1B9A",
     "Covers women empowerment, tribal welfare, disability inclusion, and social protection programs.",
     "महिला सशक्तिकरण, जनजातीय कल्याण, दिव्यांग समावेशन और सामाजिक सुरक्षा कार्यक्रमों को कवर करता है।"),
    ("PMU", "PMU, Monitoring & Transformation", "पीएमयू, निगरानी एवं परिवर्तन", "BarChart3", "#37474F",
     "Covers vision monitoring, data governance, institutional capacity, and transformation tracking.",
     "विज़न निगरानी, डेटा शासन, संस्थागत क्षमता और परिवर्तन ट्रैकिंग को कवर करता है।"),
]

KPI_DEFS = {
    "AGR": [
        ("AGR-001", "Agri GVA Growth", "कृषि जीवीए वृद्धि", "Crop Agriculture & Farmer Prosperity", "Agri GVA growth rate", "%", 4.2, 5.8, 7.5, 10.0, 14.0),
        ("AGR-002", "Farmer Household Income", "किसान घरेलू आय", "Crop Agriculture & Farmer Prosperity", "Annual average farmer income", "Lakh", 1.2, 1.5, 2.5, 4.0, 8.0),
        ("AGR-004", "Crop Yield - Wheat", "फसल उपज - गेहूं", "Crop Agriculture & Farmer Prosperity", "Output / area", "qtl/ha", 28.5, 32.1, 40.0, 48.0, 55.0),
        ("AGR-011", "Irrigation Coverage", "सिंचाई कवरेज", "Water Resources & Irrigation", "Irrigated area / gross cropped area x100", "%", 42.0, 48.5, 60.0, 75.0, 90.0),
        ("AGR-013", "Micro-Irrigation Coverage", "सूक्ष्म सिंचाई कवरेज", "Water Resources & Irrigation", "Area under drip/sprinkler / irrigated area x100", "%", 12.0, 14.0, 30.0, 50.0, 70.0),
        ("AGR-025", "MSP Procurement Coverage", "एमएसपी खरीद कवरेज", "Agri Markets & Value Chains", "Farmers benefiting / eligible x100", "%", 35.0, 42.0, 60.0, 75.0, 90.0),
        ("AGR-042", "Dairy Productivity", "डेयरी उत्पादकता", "Animal Husbandry & Dairy", "Milk per animal per day", "Lit/day", 4.5, 5.2, 7.0, 9.0, 12.0),
        ("AGR-048", "Fisheries Production", "मत्स्य उत्पादन", "Fisheries & Aquaculture", "Total fish output", "Lakh MT", 1.8, 2.3, 4.0, 6.0, 10.0),
    ],
    "ECO": [
        ("ECO-001", "GSDP Growth Rate", "जीएसडीपी वृद्धि दर", "Macro Economy", "Year-on-year GSDP growth", "%", 7.2, 8.5, 10.0, 12.0, 14.0),
        ("ECO-002", "Per Capita Income", "प्रति व्यक्ति आय", "Macro Economy", "GSDP / population", "Lakh", 1.15, 1.42, 2.5, 4.5, 8.0),
        ("ECO-003", "Fiscal Deficit", "राजकोषीय घाटा", "Public Finance", "Fiscal deficit as % of GSDP", "%", 3.5, 3.2, 2.5, 2.0, 1.5),
        ("ECO-004", "Revenue Receipts Growth", "राजस्व प्राप्ति वृद्धि", "Public Finance", "YoY growth in revenue receipts", "%", 8.0, 10.2, 14.0, 16.0, 18.0),
        ("ECO-005", "Capital Expenditure Ratio", "पूंजी व्यय अनुपात", "Public Finance", "Capex / total expenditure x100", "%", 22.0, 25.5, 30.0, 35.0, 40.0),
        ("ECO-006", "FDI Inflow", "एफडीआई प्रवाह", "Investment", "Annual FDI inflow", "Cr", 8500, 9200, 25000, 50000, 100000),
        ("ECO-007", "Tax-to-GSDP Ratio", "कर-जीएसडीपी अनुपात", "Public Finance", "Own tax revenue / GSDP x100", "%", 6.8, 7.5, 9.0, 11.0, 13.0),
        ("ECO-008", "Export Growth", "निर्यात वृद्धि", "Trade", "YoY growth in state exports", "%", 5.0, 8.2, 15.0, 18.0, 22.0),
    ],
    "EDU": [
        ("EDU-001", "Literacy Rate", "साक्षरता दर", "School Education", "Literate population / total population x100", "%", 70.6, 74.2, 82.0, 90.0, 98.0),
        ("EDU-002", "GER - Primary", "जीईआर - प्राथमिक", "School Education", "Gross enrollment ratio - primary", "%", 96.5, 98.2, 100.0, 100.0, 100.0),
        ("EDU-003", "GER - Secondary", "जीईआर - माध्यमिक", "School Education", "Gross enrollment ratio - secondary", "%", 72.0, 78.5, 88.0, 95.0, 100.0),
        ("EDU-004", "GER - Higher Education", "जीईआर - उच्च शिक्षा", "Higher Education", "Gross enrollment ratio - higher ed", "%", 23.5, 28.0, 40.0, 55.0, 70.0),
        ("EDU-005", "Dropout Rate - Secondary", "ड्रॉपआउट दर - माध्यमिक", "School Education", "Students dropping out at secondary level", "%", 17.8, 14.5, 8.0, 3.0, 0.5),
        ("EDU-006", "Pupil-Teacher Ratio", "छात्र-शिक्षक अनुपात", "School Education", "Students per teacher", "Ratio", 32, 28, 22, 18, 15),
        ("EDU-007", "Digital Literacy Rate", "डिजिटल साक्षरता दर", "Skill Development", "Population with digital skills / total x100", "%", 28.0, 38.5, 55.0, 75.0, 95.0),
        ("EDU-008", "Skill Training Coverage", "कौशल प्रशिक्षण कवरेज", "Skill Development", "Youth skilled / target youth x100", "%", 15.0, 17.0, 40.0, 60.0, 85.0),
    ],
    "ENV": [
        ("ENV-001", "Forest Cover", "वन आवरण", "Environment", "Forest cover as % of state area", "%", 25.1, 26.5, 30.0, 33.0, 35.0),
        ("ENV-002", "Renewable Energy Share", "नवीकरणीय ऊर्जा हिस्सा", "Climate & Energy", "RE capacity / total capacity x100", "%", 18.0, 28.5, 45.0, 65.0, 85.0),
        ("ENV-003", "Air Quality - Good Days", "वायु गुणवत्ता - अच्छे दिन", "Environment", "Days with AQI < 100 / total days x100", "%", 55.0, 62.0, 75.0, 85.0, 95.0),
        ("ENV-004", "Water Body Rejuvenation", "जल निकाय कायाकल्प", "Water Conservation", "Rejuvenated / target x100", "%", 20.0, 32.0, 55.0, 75.0, 95.0),
        ("ENV-005", "Waste Processing Rate", "अपशिष्ट प्रसंस्करण दर", "Urban Environment", "Waste processed / total generated x100", "%", 35.0, 48.0, 70.0, 85.0, 98.0),
        ("ENV-006", "Carbon Emission Intensity", "कार्बन उत्सर्जन तीव्रता", "Climate & Energy", "CO2 per unit GSDP reduction from baseline", "%", 0.0, 8.0, 20.0, 35.0, 50.0),
        ("ENV-007", "Tourism Revenue Growth", "पर्यटन राजस्व वृद्धि", "Tourism & Culture", "YoY growth in tourism revenue", "%", 5.0, 12.0, 18.0, 22.0, 25.0),
        ("ENV-008", "Protected Area Coverage", "संरक्षित क्षेत्र कवरेज", "Environment", "Protected area / total area x100", "%", 10.5, 11.2, 13.0, 15.0, 17.0),
    ],
    "GOV": [
        ("GOV-001", "e-Governance Adoption", "ई-शासन अपनाना", "Digital Governance", "Services available online / total services x100", "%", 45.0, 58.0, 80.0, 92.0, 99.0),
        ("GOV-002", "Service Delivery TAT", "सेवा वितरण TAT", "Citizen Services", "Services delivered within TAT / total x100", "%", 55.0, 65.0, 80.0, 90.0, 98.0),
        ("GOV-003", "Citizen Satisfaction Score", "नागरिक संतुष्टि स्कोर", "Citizen Services", "Average satisfaction score", "Score", 3.2, 3.6, 4.0, 4.5, 4.8),
        ("GOV-004", "Grievance Resolution Rate", "शिकायत समाधान दर", "Citizen Services", "Resolved / total grievances x100", "%", 62.0, 72.0, 85.0, 92.0, 98.0),
        ("GOV-005", "Crime Rate", "अपराध दर", "Law Enforcement", "Crimes per lakh population", "Rate", 285, 262, 220, 180, 140),
        ("GOV-006", "Case Disposal Rate", "मामला निपटान दर", "Law Enforcement", "Cases disposed / total cases x100", "%", 42.0, 48.0, 60.0, 75.0, 90.0),
        ("GOV-007", "Tax Collection Efficiency", "कर संग्रह दक्षता", "Revenue", "Collected / target x100", "%", 78.0, 84.0, 92.0, 96.0, 99.0),
        ("GOV-008", "Digital Service Transactions", "डिजिटल सेवा लेनदेन", "Digital Governance", "YoY growth in digital transactions", "%", 15.0, 28.0, 45.0, 60.0, 80.0),
    ],
    "IND": [
        ("IND-001", "Industrial Growth Rate", "औद्योगिक वृद्धि दर", "Industrial Output", "YoY industrial output growth", "%", 6.5, 8.2, 12.0, 15.0, 18.0),
        ("IND-002", "MSME Registration Growth", "एमएसएमई पंजीकरण वृद्धि", "MSME Development", "New MSMEs registered YoY", "%", 8.0, 12.5, 20.0, 25.0, 30.0),
        ("IND-003", "Manufacturing GVA Share", "विनिर्माण जीवीए हिस्सा", "Industrial Output", "Manufacturing GVA / total GSDP x100", "%", 8.5, 10.2, 15.0, 20.0, 25.0),
        ("IND-004", "Logistics Performance Index", "रसद प्रदर्शन सूचकांक", "Logistics", "Composite logistics score", "Score", 2.8, 3.2, 3.8, 4.2, 4.5),
        ("IND-005", "Employment in Manufacturing", "विनिर्माण में रोजगार", "Industrial Output", "Workers in manufacturing sector", "Lakh", 18.5, 22.0, 35.0, 50.0, 70.0),
        ("IND-006", "Startup Ecosystem Score", "स्टार्टअप पारिस्थितिकी स्कोर", "Innovation", "Composite startup ecosystem score", "Score", 2.5, 3.4, 4.2, 4.6, 4.9),
        ("IND-007", "Industrial Investment", "औद्योगिक निवेश", "Investment", "New industrial investment", "Cr", 15000, 22000, 45000, 80000, 150000),
        ("IND-008", "Export Diversification Index", "निर्यात विविधीकरण सूचकांक", "Trade", "Export diversity composite score", "Index", 0.45, 0.47, 0.65, 0.78, 0.90),
    ],
    "INF": [
        ("INF-001", "Road Density", "सड़क घनत्व", "Transport", "Road length per 100 sq km", "km", 85.0, 92.0, 110.0, 130.0, 150.0),
        ("INF-002", "Rural Road Connectivity", "ग्रामीण सड़क संपर्क", "Transport", "Connected habitations / total x100", "%", 82.0, 88.5, 95.0, 99.0, 100.0),
        ("INF-003", "Power Availability", "विद्युत उपलब्धता", "Energy", "Hours of power supply per day", "Hours", 18.5, 20.0, 22.0, 23.5, 24.0),
        ("INF-004", "Water Supply Coverage", "जल आपूर्ति कवरेज", "Water", "Households with piped water / total x100", "%", 32.0, 48.0, 70.0, 90.0, 100.0),
        ("INF-005", "Sanitation Coverage", "स्वच्छता कवरेज", "Sanitation", "Households with toilet / total x100", "%", 72.0, 82.0, 95.0, 99.0, 100.0),
        ("INF-006", "Digital Connectivity", "डिजिटल संपर्क", "Digital", "Broadband connections per 100 population", "Rate", 12.0, 22.0, 45.0, 65.0, 85.0),
        ("INF-007", "Housing Completion Rate", "आवास पूर्णता दर", "Housing", "Houses completed / sanctioned x100", "%", 62.0, 72.0, 85.0, 92.0, 98.0),
        ("INF-008", "Urban Infrastructure Index", "शहरी अवसंरचना सूचकांक", "Urban Development", "Composite urban infrastructure score", "Index", 0.48, 0.55, 0.70, 0.82, 0.95),
    ],
    "HLT": [
        ("HLT-001", "Life Expectancy", "जीवन प्रत्याशा", "Health Outcomes", "Average life expectancy at birth", "Years", 65.5, 67.2, 70.0, 73.0, 76.0),
        ("HLT-002", "Infant Mortality Rate", "शिशु मृत्यु दर", "Maternal & Child Health", "Deaths per 1000 live births", "Rate", 48, 40, 25, 15, 5),
        ("HLT-003", "Maternal Mortality Ratio", "मातृ मृत्यु अनुपात", "Maternal & Child Health", "Deaths per lakh live births", "Rate", 173, 140, 80, 40, 15),
        ("HLT-004", "Hospital Bed Density", "अस्पताल बिस्तर घनत्व", "Healthcare Infrastructure", "Beds per 10000 population", "Rate", 8.5, 9.2, 18.0, 25.0, 35.0),
        ("HLT-005", "Doctor-Population Ratio", "डॉक्टर-जनसंख्या अनुपात", "Healthcare Infrastructure", "Doctors per 10000 population", "Rate", 3.2, 4.5, 8.0, 12.0, 18.0),
        ("HLT-006", "Immunization Coverage", "टीकाकरण कवरेज", "Maternal & Child Health", "Fully immunized children / total x100", "%", 62.0, 72.0, 88.0, 95.0, 99.0),
        ("HLT-007", "OOP Health Expenditure", "आउट-ऑफ-पॉकेट स्वास्थ्य व्यय", "Health Finance", "OOP as % of total health expenditure", "%", 55.0, 48.0, 35.0, 20.0, 10.0),
        ("HLT-008", "Disease Surveillance Coverage", "रोग निगरानी कवरेज", "Public Health", "Areas under surveillance / total x100", "%", 45.0, 58.0, 78.0, 90.0, 98.0),
    ],
    "SOC": [
        ("SOC-001", "Women Labour Force Participation", "महिला श्रम बल भागीदारी", "Women Empowerment", "Working women / working-age women x100", "%", 25.5, 30.0, 40.0, 50.0, 60.0),
        ("SOC-003", "SHG Coverage", "एसएचजी कवरेज", "Women Empowerment", "Women in SHGs / eligible x100", "%", 22.0, 30.0, 50.0, 70.0, 90.0),
        ("SOC-007", "Child Sex Ratio", "बाल लिंग अनुपात", "Child Development", "Girls per 1000 boys", "Ratio", 918, 928, 945, 960, 980),
        ("SOC-020", "Disability Pension Coverage", "दिव्यांग पेंशन कवरेज", "Disability Inclusion", "Beneficiaries / eligible x100", "%", 42.0, 55.0, 72.0, 88.0, 98.0),
        ("SOC-026", "SC Welfare Scheme Coverage", "अनुसूचित जाति कल्याण कवरेज", "Scheduled Caste Welfare", "Beneficiaries / eligible x100", "%", 48.0, 58.0, 72.0, 85.0, 95.0),
        ("SOC-027", "ST Welfare Scheme Coverage", "अनुसूचित जनजाति कल्याण कवरेज", "Tribal Development", "Beneficiaries / eligible x100", "%", 45.0, 55.0, 70.0, 85.0, 95.0),
        ("SOC-035", "Social Security Payment Timeliness", "सामाजिक सुरक्षा भुगतान समयबद्धता", "Social Protection", "Payments on time / due x100", "%", 58.0, 68.0, 82.0, 92.0, 98.0),
        ("SOC-051", "Community Participation Index", "सामुदायिक भागीदारी सूचकांक", "Social Inclusion", "Participation score", "Index", 0.35, 0.42, 0.58, 0.72, 0.88),
    ],
    "PMU": [
        ("PMU-001", "Vision KPI Coverage", "विज़न केपीआई कवरेज", "Monitoring & Performance", "KPIs with baseline, target, owner / total x100", "%", 40.0, 65.0, 85.0, 95.0, 100.0),
        ("PMU-005", "Data Refresh Compliance", "डेटा रिफ्रेश अनुपालन", "Data Governance", "KPIs refreshed on time / total due x100", "%", 35.0, 52.0, 78.0, 90.0, 98.0),
        ("PMU-007", "Department Reporting Compliance", "विभाग रिपोर्टिंग अनुपालन", "Monitoring & Performance", "Departments reporting on time / total x100", "%", 45.0, 62.0, 82.0, 92.0, 98.0),
        ("PMU-009", "Red KPI Recovery Rate", "लाल केपीआई रिकवरी दर", "Monitoring & Performance", "Red KPIs turned amber/green / total red x100", "%", 20.0, 35.0, 55.0, 72.0, 88.0),
        ("PMU-010", "District Performance Spread", "जिला प्रदर्शन प्रसार", "Regional Balance", "Top-bottom district score gap", "Gap", 42.0, 35.0, 25.0, 15.0, 8.0),
        ("PMU-014", "Budget to Outcome Linkage", "बजट-परिणाम संबंध", "Transformation", "Schemes mapped to outcomes / total x100", "%", 28.0, 42.0, 65.0, 82.0, 95.0),
        ("PMU-022", "Public Dashboard Transparency", "सार्वजनिक डैशबोर्ड पारदर्शिता", "Transparency", "Disclosure depth, timeliness, usability score", "Score", 2.5, 3.2, 4.0, 4.5, 4.8),
        ("PMU-040", "Vision 2047 Goal Achievement", "विज़न 2047 लक्ष्य प्राप्ति", "Transformation", "Achieved milestones / planned x100", "%", 0.0, 3.0, 35.0, 65.0, 100.0),
    ],
}

MP_DISTRICTS = [
    ("Bhopal", "भोपाल", "Bhopal", 2371061), ("Indore", "इंदौर", "Indore", 3276697),
    ("Jabalpur", "जबलपुर", "Jabalpur", 2463289), ("Gwalior", "ग्वालियर", "Gwalior", 2032036),
    ("Ujjain", "उज्जैन", "Ujjain", 1986864), ("Sagar", "सागर", "Sagar", 2378458),
    ("Dewas", "देवास", "Indore", 1563715), ("Satna", "सतना", "Rewa", 2228935),
    ("Ratlam", "रतलाम", "Indore", 1455069), ("Rewa", "रीवा", "Rewa", 2365106),
    ("Katni", "कटनी", "Jabalpur", 1291684), ("Singrauli", "सिंगरौली", "Rewa", 1178132),
    ("Burhanpur", "बुरहानपुर", "Indore", 757847), ("Morena", "मुरैना", "Chambal", 1965970),
    ("Khandwa", "खंडवा", "Indore", 1309443), ("Bhind", "भिंड", "Chambal", 1703005),
    ("Chhindwara", "छिंदवाड़ा", "Jabalpur", 2090922), ("Guna", "गुना", "Gwalior", 1241519),
    ("Shivpuri", "शिवपुरी", "Gwalior", 1726050), ("Vidisha", "विदिशा", "Bhopal", 1458875),
    ("Chhatarpur", "छतरपुर", "Sagar", 1762375), ("Damoh", "दमोह", "Sagar", 1264219),
    ("Mandsaur", "मंदसौर", "Ujjain", 1340411), ("Neemuch", "नीमच", "Ujjain", 826067),
    ("Narmadapuram", "नर्मदापुरम", "Narmadapuram", 1241350), ("Betul", "बैतूल", "Narmadapuram", 1575362),
    ("Shahdol", "शहडोल", "Shahdol", 1065685), ("Seoni", "सिवनी", "Jabalpur", 1379131),
    ("Datia", "दतिया", "Gwalior", 786754), ("Raisen", "रायसेन", "Bhopal", 1331699),
    ("Panna", "पन्ना", "Sagar", 1016520), ("Dhar", "धार", "Indore", 2185793),
    ("Jhabua", "झाबुआ", "Indore", 1024091), ("Barwani", "बड़वानी", "Indore", 1385881),
    ("Mandla", "मंडला", "Jabalpur", 1054905), ("Dindori", "डिंडोरी", "Jabalpur", 704524),
    ("Balaghat", "बालाघाट", "Jabalpur", 1701698), ("Tikamgarh", "टीकमगढ़", "Sagar", 1445166),
    ("Anuppur", "अनूपपुर", "Shahdol", 749521), ("Ashoknagar", "अशोकनगर", "Gwalior", 844979),
    ("Agar Malwa", "आगर मालवा", "Ujjain", 582490), ("Narsinghpur", "नरसिंहपुर", "Jabalpur", 1092141),
    ("Harda", "हरदा", "Narmadapuram", 570465), ("Umaria", "उमरिया", "Shahdol", 644758),
    ("Sheopur", "श्योपुर", "Chambal", 687952), ("Alirajpur", "अलीराजपुर", "Indore", 728999),
    ("Sidhi", "सीधी", "Rewa", 1127033), ("Shajapur", "शाजापुर", "Ujjain", 1512681),
    ("Khargone", "खरगोन", "Indore", 1873046), ("Sehore", "सीहोर", "Bhopal", 1311332),
    ("Rajgarh", "राजगढ़", "Bhopal", 1545814), ("Mauganj", "मौगंज", "Rewa", 585000),
    # Post-2011 / recent reorganisation — MP has 55 districts as of state records used by this portal
    ("Niwari", "निवारी", "Sagar", 129301),
    ("Maihar", "मैहर", "Rewa", 412058),
    ("Pandhurna", "पांढुर्णा", "Chhindwara", 334424),
]


def district_name_casefold(name: str) -> str:
    s = (name or "").strip()
    s = re.sub(r"[\u200b-\u200f\ufeff]", "", s)
    return s.casefold()


CANONICAL_MP_DISTRICT_KEYS = frozenset(district_name_casefold(t[0]) for t in MP_DISTRICTS)
EXPECTED_MP_DISTRICT_COUNT = len(MP_DISTRICTS)


def filter_to_canonical_districts(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Official MP catalogue only; first document wins per case-folded name (caller controls order)."""
    seen: Set[str] = set()
    out: List[Dict[str, Any]] = []
    for d in docs:
        k = district_name_casefold(d.get("name", ""))
        if k not in CANONICAL_MP_DISTRICT_KEYS or k in seen:
            continue
        seen.add(k)
        out.append(d)
    return out


async def count_canonical_district_names() -> int:
    """Distinct official district names present in MongoDB (ignores legacy / duplicate rows)."""
    docs = await db.districts.find({}, {"name": 1}).to_list(400)
    keys: Set[str] = set()
    for d in docs:
        k = district_name_casefold(d.get("name", ""))
        if k in CANONICAL_MP_DISTRICT_KEYS:
            keys.add(k)
    return len(keys)


async def purge_non_canonical_districts() -> None:
    """Remove district rows not in the official portal list (e.g. legacy names after mongorestore)."""
    all_docs = await db.districts.find({}, {"_id": 1, "name": 1}).to_list(300)
    del_ids = [
        d["_id"]
        for d in all_docs
        if district_name_casefold(d.get("name", "")) not in CANONICAL_MP_DISTRICT_KEYS
    ]
    if del_ids:
        r = await db.districts.delete_many({"_id": {"$in": del_ids}})
        logger.info("Removed %s district documents not in canonical MP list of %s", r.deleted_count, EXPECTED_MP_DISTRICT_COUNT)


async def upsert_missing_canonical_districts() -> None:
    """Insert any canonical district missing from DB (e.g. after purge or old 52-district seed)."""
    sector_codes = [s[0] for s in SECTOR_DEFS]
    existing = {district_name_casefold(d["name"]) for d in await db.districts.find({}, {"name": 1}).to_list(200)}
    added = 0
    for name, name_hi, division, population in MP_DISTRICTS:
        k = district_name_casefold(name)
        if k in existing:
            continue
        scores: Dict[str, float] = {}
        for code in sector_codes:
            base_score = random.uniform(35, 92)
            if name in ["Bhopal", "Indore", "Jabalpur"]:
                base_score = random.uniform(65, 95)
            elif name in ["Jhabua", "Alirajpur", "Dindori", "Barwani"]:
                base_score = random.uniform(30, 60)
            scores[code] = round(base_score, 1)
        overall = round(sum(scores.values()) / len(scores), 1)
        await db.districts.insert_one({
            "id": str(uuid.uuid4()), "name": name, "name_hi": name_hi,
            "division": division, "population": population,
            "area_sq_km": random.randint(2000, 12000),
            "scores": scores, "overall_score": overall, "rank": 0,
        })
        existing.add(k)
        added += 1
    if added:
        logger.info("Inserted %s missing canonical district row(s)", added)


async def recompute_district_ranks() -> None:
    """Ranks 1..N for canonical districts only (by overall_score); legacy rows are not ranked."""
    docs = await db.districts.find({}, {"_id": 1, "overall_score": 1, "name": 1}).to_list(300)
    by_score = sorted(docs, key=lambda x: float(x.get("overall_score") or 0), reverse=True)
    canon = filter_to_canonical_districts(by_score)
    for i, doc in enumerate(canon, 1):
        await db.districts.update_one({"_id": doc["_id"]}, {"$set": {"rank": i}})
    junk_ids = [d["_id"] for d in docs if district_name_casefold(d.get("name", "")) not in CANONICAL_MP_DISTRICT_KEYS]
    if junk_ids:
        await db.districts.update_many({"_id": {"$in": junk_ids}}, {"$set": {"rank": 0}})


def generate_trend(baseline, current, months=12):
    step = (current - baseline) / months
    month_names = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
    return [{"month": m, "value": round(baseline + step * (i + 1) + random.uniform(-abs(step) * 0.5, abs(step) * 0.5), 2)} for i, m in enumerate(month_names)]

def compute_status(baseline, current, target_2029):
    if target_2029 == baseline:
        return "on_track"
    progress = (current - baseline) / (target_2029 - baseline)
    if progress >= 0.35:
        return "on_track"
    elif progress >= 0.15:
        return "at_risk"
    else:
        return "off_track"

async def seed_data():
    existing_kpis = await db.kpis.count_documents({})
    if existing_kpis >= 600:
        logger.info(f"Full data already seeded ({existing_kpis} KPIs), skipping.")
        return

    # Drop and reseed if less than 600 KPIs (old partial data)
    if existing_kpis > 0:
        logger.info(f"Found {existing_kpis} KPIs, reseeding full 620...")
        await db.kpis.drop()
        await db.sectors.drop()
        await db.districts.drop()

    logger.info("Seeding full 620 KPIs from Excel dictionary...")

    # Try loading from Excel
    try:
        from seed_full_kpis import load_kpis_from_excel, get_sector_stats
        kpi_docs = load_kpis_from_excel()
    except Exception as e:
        logger.warning(f"Failed to load from Excel: {e}, falling back to inline data")
        kpi_docs = []

    if not kpi_docs:
        # Fallback to inline KPI_DEFS
        for code, kpis_list in KPI_DEFS.items():
            for kpi_id, name, name_hi, theme, formula, unit, baseline, current, t29, t36, t47 in kpis_list:
                status = compute_status(baseline, current, t29)
                kpi_docs.append({
                    "id": str(uuid.uuid4()), "kpi_id": kpi_id, "kpi_name": name, "kpi_name_hi": name_hi,
                    "sector_code": code, "theme": theme, "formula": formula, "unit": unit,
                    "frequency": "Quarterly", "baseline_2024": baseline, "current_value": current,
                    "target_2029": t29, "target_2036": t36, "target_2047": t47,
                    "status": status, "trend_data": generate_trend(baseline, current)
                })

    if kpi_docs:
        await db.kpis.insert_many(kpi_docs)

    # Seed sectors with computed stats
    sector_docs = []
    for code, name, name_hi, icon, color, desc, desc_hi in SECTOR_DEFS:
        sector_kpis = [k for k in kpi_docs if k["sector_code"] == code]
        on_track = sum(1 for k in sector_kpis if k["status"] == "on_track")
        total = len(sector_kpis) or 1
        score = round((on_track / total) * 100, 1)
        sector_docs.append({
            "id": str(uuid.uuid4()), "code": code, "name": name, "name_hi": name_hi,
            "icon": icon, "color": color, "description": desc, "description_hi": desc_hi,
            "kpi_count": len(sector_kpis), "overall_score": score,
            "status": "on_track" if score >= 60 else ("at_risk" if score >= 30 else "off_track")
        })
    if sector_docs:
        await db.sectors.insert_many(sector_docs)

    # Seed districts
    existing_districts = await db.districts.count_documents({})
    if existing_districts > 0:
        # Keep seed idempotent even if startup inserted canonical districts earlier
        await db.districts.drop()

    district_docs = []
    sector_codes = [s[0] for s in SECTOR_DEFS]
    for i, (name, name_hi, division, population) in enumerate(MP_DISTRICTS):
        scores = {}
        for code in sector_codes:
            base_score = random.uniform(35, 92)
            if name in ["Bhopal", "Indore", "Jabalpur"]:
                base_score = random.uniform(65, 95)
            elif name in ["Jhabua", "Alirajpur", "Dindori", "Barwani"]:
                base_score = random.uniform(30, 60)
            scores[code] = round(base_score, 1)
        overall = round(sum(scores.values()) / len(scores), 1)
        district_docs.append({
            "id": str(uuid.uuid4()), "name": name, "name_hi": name_hi,
            "division": division, "population": population,
            "area_sq_km": random.randint(2000, 12000),
            "scores": scores, "overall_score": overall, "rank": 0
        })
    district_docs.sort(key=lambda x: x["overall_score"], reverse=True)
    for i, d in enumerate(district_docs):
        d["rank"] = i + 1
    if district_docs:
        await db.districts.insert_many(district_docs)

    logger.info(f"Seeded {len(sector_docs)} sectors, {len(kpi_docs)} KPIs, {len(district_docs)} districts")

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@mpvision.gov.in")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Admin", "role": "admin", "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
    dept_email = "dept@mpvision.gov.in"
    if not await db.users.find_one({"email": dept_email}):
        await db.users.insert_one({
            "email": dept_email, "password_hash": hash_password("dept123"),
            "name": "Department Head - Agriculture", "role": "department_head",
            "assigned_sector": "AGR", "created_at": datetime.now(timezone.utc).isoformat()
        })
    viewer_email = "viewer@mpvision.gov.in"
    if not await db.users.find_one({"email": viewer_email}):
        await db.users.insert_one({
            "email": viewer_email, "password_hash": hash_password("viewer123"),
            "name": "Viewer User", "role": "viewer", "created_at": datetime.now(timezone.utc).isoformat()
        })
    memory_dir = ROOT_DIR.parent / "memory"
    try:
        memory_dir.mkdir(parents=True, exist_ok=True)
        with open(memory_dir / "test_credentials.md", "w") as f:
            f.write("# Test Credentials\n\n## Admin\n- Email: admin@mpvision.gov.in\n- Password: admin123\n- Role: admin\n\n")
            f.write("## Department Head\n- Email: dept@mpvision.gov.in\n- Password: dept123\n- Role: department_head\n\n")
            f.write("## Viewer\n- Email: viewer@mpvision.gov.in\n- Password: viewer123\n- Role: viewer\n\n")
            f.write("## Auth Endpoints\n- POST /api/auth/login\n- POST /api/auth/register\n- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n")
    except OSError as e:
        logger.warning("Skipping test_credentials.md write (%s): %s", memory_dir, e)

@app.on_event("startup")
async def startup():
    await dedupe_reference_collections_at_startup()
    await purge_non_canonical_districts()
    await upsert_missing_canonical_districts()
    await recompute_district_ranks()
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await ensure_kpi_sector_district_indexes()
    await seed_admin()
    await seed_data()
    await ensure_kpi_sector_district_indexes()
    logger.info("Server started, data seeded.")

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api_router)


def _normalize_cors_origin(url: str) -> str:
    o = (url or "").strip()
    return o.rstrip("/") if o else ""


def _cors_allow_origins() -> List[str]:
    """
    Browsers require an explicit Allow-Origin (not *) when credentials (cookies) are used.
    Set FRONTEND_URL to your deployed UI origin, e.g. https://mp-vision.demo.agrayianailabs.com
    Optional: CORS_ORIGINS=* keeps localhost dev origins plus FRONTEND_URL, or pass a
    comma-separated list of extra allowed origins.
    """
    raw = (os.environ.get("CORS_ORIGINS") or "").strip()
    fe = _normalize_cors_origin(os.environ.get("FRONTEND_URL") or "http://localhost:3000") or "http://localhost:3000"

    if raw == "*":
        return list(
            dict.fromkeys(
                [
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    fe,
                ]
            )
        )

    origins: List[str] = []
    if raw and raw != "*":
        for part in raw.split(","):
            o = _normalize_cors_origin(part)
            if o and o != "*":
                origins.append(o)
    if fe:
        origins.append(fe)
    out = list(dict.fromkeys(origins))
    return out if out else ["http://localhost:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
