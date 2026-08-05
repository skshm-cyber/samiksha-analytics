"""
Samiksha Analytics — FastAPI Application

Entry point for the backend server.
Start with: uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .database.connection import engine, Base
from .api.ingestion import router as ingestion_router
from .api.analytics import router as analytics_router

load_dotenv()


# =============================================================================
# LIFESPAN — run startup/shutdown tasks
# =============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup: create tables (for dev only — in production use migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database tables verified.")
    yield
    # On shutdown: dispose connection pool
    await engine.dispose()
    print("🔌 Database connections closed.")


# =============================================================================
# APP
# =============================================================================
app = FastAPI(
    title="Samiksha Analytics API",
    version="1.0.0",
    lifespan=lifespan,
)


# =============================================================================
# CORS
# =============================================================================
# Allow your GitHub Pages frontend to call this API.
# In production, set CORS_ORIGINS env var to your actual domain.
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]

# Always allow localhost for development
dev_origins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8080", "http://127.0.0.1:8080"]
for dev in dev_origins:
    if dev not in cors_origins:
        cors_origins.append(dev)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# ROUTES
# =============================================================================
app.include_router(ingestion_router)
app.include_router(analytics_router)


# =============================================================================
# HEALTH CHECK — Render pings this to verify the service is alive
# =============================================================================
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "samiksha-analytics-api"}


# =============================================================================
# ROOT — simple welcome
# =============================================================================
@app.get("/")
async def root():
    return {
        "service": "Samiksha Analytics API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
