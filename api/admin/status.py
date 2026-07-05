"""
GET /api/admin/status
Health check endpoint — keeps the backend warm and confirms DB connection.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api._db import get_db, cors_response, error_response
from sqlalchemy import text


async def handler(request):
    start = time.time()
    try:
        async with get_db() as db:
            res = await db.execute(text("SELECT COUNT(*) FROM zones"))
            zone_count = res.scalar()
            latency_ms = round((time.time() - start) * 1000, 2)

        return cors_response({
            "status": "healthy",
            "database": {
                "status": "healthy",
                "latency_ms": latency_ms,
                "provider": "supabase",
            },
            "cache": {"zones_loaded": zone_count},
            "deployment": "vercel-serverless",
        })
    except Exception as e:
        print(f"[admin/status] Error: {e}")
        return cors_response({
            "status": "degraded",
            "error": "Database connection failed",
            "deployment": "vercel-serverless",
        }, status=503)
