@echo off
REM Run FastAPI backend (use after setup.bat)
if not exist .venv\Scripts\activate.bat (
    echo Run setup.bat first to create .venv and install dependencies.
    exit /b 1
)
call .venv\Scripts\activate.bat
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
