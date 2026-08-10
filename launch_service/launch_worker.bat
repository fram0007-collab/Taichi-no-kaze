@echo off
echo Starting Worker Ingestion Loop...
cd ..
venv\Scripts\python -m worker.main
