"""Declarative base — kept separate so workers can import models without triggering the async engine."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
