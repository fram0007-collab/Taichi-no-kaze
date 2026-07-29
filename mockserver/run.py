import sys
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from mockserver.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8081)
