import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

# Set paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

# Load backend environment variables
load_dotenv(dotenv_path=PROJECT_ROOT / "backend" / ".env", override=True)

from database import Base
from backend.models import Zone, PoiMaster, JabodetabekWaterway, ZoneStatus

def dump_and_seed():
    pg_url = os.getenv("DATABASE_URL")
    if not pg_url:
        print("Error: DATABASE_URL not found in backend/.env")
        sys.exit(1)
    
    # Strip async prefix for synchronous extraction
    pg_sync_url = pg_url.replace("postgresql+asyncpg://", "postgresql://").replace("ssl=require", "sslmode=require")
    print(f"Connecting to Neon PostgreSQL: {pg_sync_url[:60]}...")
    
    pg_engine = create_engine(pg_sync_url)
    PgSession = sessionmaker(bind=pg_engine)
    pg_session = PgSession()
    
    data = {}
    try:
        # Extract Zones
        print("Extracting zones...")
        zones = pg_session.query(Zone).all()
        data["zones"] = [
            {
                "zone_id": z.zone_id,
                "name": z.name,
                "latitude": z.latitude,
                "longitude": z.longitude,
                "radius_m": z.radius_m,
                "capacity": z.capacity,
                "historical_flood_vulnerability": float(z.historical_flood_vulnerability or 0.5),
                "traffic_speed_baseline": float(z.traffic_speed_baseline or 40.0)
            }
            for z in zones
        ]
        
        # Extract POIs
        print("Extracting POIs...")
        pois = pg_session.query(PoiMaster).all()
        data["pois"] = [
            {
                "poi_id": p.poi_id,
                "name": p.name,
                "category": p.category,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "zone_id": p.zone_id,
                "source": p.source,
                "is_safe_zone": p.is_safe_zone
            }
            for p in pois
        ]
        
        # Extract Waterways
        print("Extracting waterways...")
        waterways = pg_session.query(JabodetabekWaterway).all()
        data["waterways"] = [
            {
                "hyriv_id": w.hyriv_id,
                "next_down": w.next_down,
                "main_riv": w.main_riv,
                "length_km": w.length_km,
                "dist_dn_km": w.dist_dn_km,
                "dist_up_km": w.dist_up_km,
                "catch_skm": w.catch_skm,
                "upland_skm": w.upland_skm,
                "dis_av_cms": w.dis_av_cms,
                "coordinates_json": w.coordinates_json,
                "current_discharge_cms": w.current_discharge_cms,
                "discharge_ratio": w.discharge_ratio,
                "alert_level": w.alert_level
            }
            for w in waterways
        ]
        
        # Extract Zone Statuses
        print("Extracting zone statuses...")
        statuses = pg_session.query(ZoneStatus).all()
        data["zone_status"] = [
            {
                "zone_id": s.zone_id,
                "traffic_score": float(s.traffic_score or 0),
                "weather_score": float(s.weather_score or 0),
                "crowd_score": float(s.crowd_score or 0),
                "earthquake_score": float(s.earthquake_score or 0),
                "waterway_score": float(s.waterway_score or 0),
                "overall_risk_score": float(s.overall_risk_score or 0),
                "dominant_risk": s.dominant_risk,
                "recommended_action": s.recommended_action
            }
            for s in statuses
        ]
        
    except Exception as e:
        print(f"Error extracting data from Neon: {e}")
        pg_session.close()
        sys.exit(1)
    finally:
        pg_session.close()
        
    # Write to seed file
    seed_file = PROJECT_ROOT / "mockserver" / "seed_data.json"
    with open(seed_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Successfully dumped seed data to {seed_file}")
    
    # Initialize local SQLite DB
    sqlite_db_path = PROJECT_ROOT / "local_db.sqlite"
    print(f"Initializing local SQLite database: {sqlite_db_path}")
    
    # Remove existing local DB if any
    if sqlite_db_path.exists():
        os.remove(sqlite_db_path)
        
    sqlite_engine = create_engine(f"sqlite:///{sqlite_db_path}")
    Base.metadata.create_all(sqlite_engine)
    
    # Seed the SQLite DB
    SqliteSession = sessionmaker(bind=sqlite_engine)
    sqlite_session = SqliteSession()
    
    try:
        print("Seeding zones...")
        for z in data["zones"]:
            sqlite_session.add(Zone(**z))
            
        print("Seeding POIs...")
        for p in data["pois"]:
            sqlite_session.add(PoiMaster(**p))
            
        print("Seeding waterways...")
        for w in data["waterways"]:
            sqlite_session.add(JabodetabekWaterway(**w))
            
        print("Seeding zone statuses...")
        for s in data["zone_status"]:
            sqlite_session.add(ZoneStatus(**s))
            
        sqlite_session.commit()
        print("Local SQLite database seeded successfully!")
    except Exception as e:
        sqlite_session.rollback()
        print(f"Error seeding local SQLite DB: {e}")
    finally:
        sqlite_session.close()

if __name__ == "__main__":
    dump_and_seed()
