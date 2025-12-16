from __future__ import annotations


class EveError(Exception):
    pass


class BadRequest(EveError):
    pass


class NotFound(EveError):
    pass
