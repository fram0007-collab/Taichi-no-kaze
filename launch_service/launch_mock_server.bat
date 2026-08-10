@echo off
echo Starting Mock Server (Port 8081)...
cd ..
venv\Scripts\python -m mockserver.run
