import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, MetaData, select

# Set paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Load backend environment variables for default source
load_dotenv(dotenv_path=PROJECT_ROOT / "backend" / ".env", override=True)

def migrate():
    # 1. Determine Source Database URL
    source_url = os.getenv("DATABASE_URL")
    if not source_url:
        print("Error: DATABASE_URL not found in backend/.env")
        sys.exit(1)
        
    # Standardize URL (convert asyncpg to standard postgresql sync for migration tool)
    source_sync_url = source_url.replace("postgresql+asyncpg://", "postgresql://").replace("ssl=require", "sslmode=require")
    
    print(f"Source Database: {source_sync_url.split('@')[-1]} (from backend/.env)")
    
    # 2. Determine Target Database URL
    target_url = None
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    else:
        target_url = input("Enter target Neon Database URL (connection string): ").strip()
        
    if not target_url:
        print("Error: Target database URL is required.")
        sys.exit(1)
        
    target_sync_url = target_url.replace("postgresql+asyncpg://", "postgresql://").replace("ssl=require", "sslmode=require")
    print(f"Target Database: {target_sync_url.split('@')[-1]}")
    
    if source_sync_url == target_sync_url:
        print("Error: Source and Target database URLs cannot be the same.")
        sys.exit(1)

    print("\nConnecting to source database...")
    source_engine = create_engine(source_sync_url)
    
    print("Reflecting source database schema...")
    metadata = MetaData()
    metadata.reflect(bind=source_engine)
    
    if not metadata.tables:
        print("Warning: No tables found in the source database to migrate.")
        sys.exit(0)
        
    print(f"Found {len(metadata.tables)} tables in schema:")
    for t_name in metadata.tables:
        print(f" - {t_name}")
        
    print("\nConnecting to target database...")
    target_engine = create_engine(target_sync_url)
    
    print("Creating tables on target database...")
    metadata.create_all(bind=target_engine)
    print("Tables created successfully or already exist.")
    
    print("\nMigrating data table-by-table...")
    # metadata.sorted_tables preserves foreign key order dependency
    for table in metadata.sorted_tables:
        t_name = table.name
        print(f"Migrating table '{t_name}'...")
        
        # Read data from source
        with source_engine.connect() as src_conn:
            rows = src_conn.execute(select(table)).fetchall()
            
        if not rows:
            print(f" - Table '{t_name}' is empty. Skipping data migration.")
            continue
            
        print(f" - Found {len(rows)} rows to copy.")
        
        # Convert row objects to dictionaries
        # Using _mapping for SQLAlchemy 1.4/2.0 compatibility
        insert_data = [dict(row._mapping) for row in rows]
        
        # Write to target
        with target_engine.connect() as tgt_conn:
            # Clean up target table before inserting to prevent unique constraint conflicts
            tgt_conn.execute(table.delete())
            # Insert the rows
            tgt_conn.execute(table.insert(), insert_data)
            tgt_conn.commit()
            
        print(f" - Successfully copied {len(rows)} rows to '{t_name}'.")

    print("\nDatabase migration completed successfully!")

if __name__ == "__main__":
    migrate()
