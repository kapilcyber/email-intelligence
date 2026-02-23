@echo off
REM Use Windows Python launcher (py) so this works when python/pip are not on PATH
echo Checking for Python...
py -3 --version >nul 2>&1
if errorlevel 1 (
    echo Python not found. Install Python 3.11+ from https://www.python.org/downloads/
    echo During install, check "Add Python to PATH" or "Add py to PATH".
    exit /b 1
)
py -3 --version
echo.
echo Creating virtual environment...
py -3 -m venv .venv
if errorlevel 1 (
    echo Failed to create venv.
    exit /b 1
)
echo Activating and installing dependencies...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo.
echo Done. Activate the venv with:  .venv\Scripts\activate
echo Then run the API with:  run.bat   or   python -m uvicorn app.main:app --reload --port 8000
