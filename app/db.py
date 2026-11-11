from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401  (jadvallarni ro'yxatdan o'tkazish)

    Base.metadata.create_all(engine)
    _add_missing_columns()


def _sql_default(column) -> str:
    """Yangi ustun uchun mavjud qatorlarga qo'yiladigan qiymat."""
    from sqlalchemy import Boolean, Integer

    default = column.default.arg if column.default is not None and not callable(column.default.arg) else None
    if isinstance(column.type, Boolean):
        val = bool(default)
        if engine.dialect.name == "postgresql":
            return "true" if val else "false"
        return "1" if val else "0"
    if isinstance(column.type, Integer):
        return str(int(default or 0))
    text = "" if default is None else str(default)
    return "'" + text.replace("'", "''") + "'"


def _add_missing_columns():
    """Oddiy avto-migratsiya: modelga qo'shilgan yangi ustunlarni mavjud jadvallarga qo'shadi."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing or column.primary_key:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                null = "" if column.nullable else f" NOT NULL DEFAULT {_sql_default(column)}"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{null}'))
