@echo off
echo Starting Backend API (Port 8000)...
cd ..\backend
..\venv\Scripts\python -m uvicorn main:app --reload --port 8000
