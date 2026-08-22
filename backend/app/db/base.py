"""SQLAlchemy Declarative Base definition.

This module provides the shared `Base` class for all ORM models. It is maintained
in an isolated module to allow Celery workers and migration runners to import
model declarations without instantiating the asynchronous database engine.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy database models in DocFlow."""
    pass
