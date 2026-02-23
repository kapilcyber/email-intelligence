@echo off
REM Install backend dependencies. Use this when python works but pip is missing or you want a quick install.
echo Checking Python...
python --version
if errorlevel 1 (
    echo Python not found. Install from https://www.python.org/downloads/
    exit /b 1
)
echo.
echo Ensuring pip is available...
python -m ensurepip --upgrade
if errorlevel 1 (
    echo ensurepip failed. Try: python -m ensurepip --default-pip
    exit /b 1
)
echo.
echo Installing dependencies from requirements.txt...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo pip install failed.
    exit /b 1
)
echo.
echo Done. Run the API with:
echo   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
echo Or use run.bat if you prefer using a venv (run setup.bat first).
