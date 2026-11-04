"""Database setup. SQLite by default (local), PostgreSQL via DATABASE_URL (production)."""
from __future__ import annotations

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
    # Hosts hand out postgres:// or postgresql://. Pin the psycopg2 driver we ship, because
    # newer SQLAlchemy versions would otherwise pick psycopg3 (not installed) for these URLs.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+psycopg2://" + url[len(prefix):]
            break
    return url


URL = _database_url()

if URL.startswith("sqlite"):
    path = URL.replace("sqlite:///", "", 1)
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    engine = create_engine(URL, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _):  # SQLite ignores foreign keys unless asked
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
else:
    engine = create_engine(URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(bind=engine)
