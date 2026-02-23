from sqlalchemy import create_engine
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings

settings = get_settings()
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.db import models  # noqa: F401
    try:
        Base.metadata.create_all(bind=engine)
    except ProgrammingError as e:
        # Index/table already exists (e.g. from a previous run or manual create)
        msg = str(e.orig) if getattr(e, "orig", None) else str(e)
        if "already exists" not in msg.lower():
            raise
