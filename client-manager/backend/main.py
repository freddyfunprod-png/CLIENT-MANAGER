"""
Unified CRM + Maps Scraper — FastAPI entry point.
Run from the backend/ directory:
  python main.py
"""
import logging
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from routes.scraper_routes import router as scraper_router
from routes.client_routes import router as client_router
from routes.plan_routes import router as plan_router
from routes.ai_routes import router as ai_router
from routes.vendor_routes import router as vendor_router

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Unified CRM + Maps Scraper",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(scraper_router)
app.include_router(client_router)
app.include_router(plan_router)
app.include_router(ai_router)
app.include_router(vendor_router)


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("✅ Base de datos lista")
    logger.info("🚀 Unified CRM corriendo en http://localhost:8000")


# ── Serve React frontend (production) ─────────────────────────────────────────
DIST = Path(__file__).parent.parent / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        # Don't intercept API routes
        if full_path.startswith("api/") or full_path == "docs":
            return
        index = DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
else:
    logger.warning("⚠️  Frontend dist not found. Run 'npm run build' in frontend/")

    @app.get("/", include_in_schema=False)
    async def root():
        return {"message": "Backend OK. Frontend not built yet.", "docs": "/docs"}


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
