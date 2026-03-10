# Alembic migrations

Database URL is taken from app config: `DATABASE_URL` or `POSTGRES_*` in backend `.env`.

**From backend directory:**

```bash
# Apply all pending migrations
alembic upgrade head

# Create a new migration after changing app.db.models
alembic revision --autogenerate -m "describe_change"

# Roll back one revision
alembic downgrade -1

# Show current revision
alembic current

# Show history
alembic history
```

**First-time or fresh DB:** Run `alembic upgrade head` to create tables (senders, emails, attachments, teams, users).

**Existing DB already in sync with models:** Run `alembic stamp head` to mark current state without running migrations.
