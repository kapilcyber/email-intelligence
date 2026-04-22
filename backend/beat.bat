@echo off
REM Celery Beat: dispatches periodic tasks (mailbox auto-sync every N min, daily summary, etc.)
REM Run alongside the worker (separate terminal). Worker alone does NOT run the schedule.
if not exist .venv\Scripts\activate.bat (
    echo Run setup.bat first to create .venv and install dependencies.
    exit /b 1
)
call .venv\Scripts\activate.bat
celery -A app.workers.celery_app beat --loglevel=info
