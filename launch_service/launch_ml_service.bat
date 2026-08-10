@echo off
echo Starting ML Service (Port 8002)...
cd ..\ml-service
..\venv\Scripts\python -m uvicorn main:app --reload --port 8002
