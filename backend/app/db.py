import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# Ensure the SQLite directory exists.
if settings.database_url.startswith("sqlite:///"):
    db_path = settings.database_url.replace("sqlite:///", "", 1)
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    # Import models so they register with SQLModel metadata before create_all.
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def run_migrations() -> None:
    """Bring the database up to the latest Alembic revision (used at startup)."""
    from alembic import command
    from alembic.config import Config

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(root, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(root, "alembic"))
    command.upgrade(cfg, "head")


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
