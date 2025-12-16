from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    projects_dir: Path
    allowlist: set[tuple[str, str]] | None
    cors_origins: list[str]
    static_dir: Path | None


def _parse_allowlist(value: str) -> set[tuple[str, str]]:
    value = (value or "").strip()
    if not value:
        return set()
    items: set[tuple[str, str]] = set()
    for raw in value.split(","):
        raw = raw.strip()
        if not raw:
            continue
        if ":" not in raw:
            raise ValueError("COMPONENTS_ALLOWLIST must be 'domain:platform,...'")
        domain, platform = raw.split(":", 1)
        domain, platform = domain.strip(), platform.strip()
        if not domain or not platform:
            raise ValueError("COMPONENTS_ALLOWLIST entries must be 'domain:platform'")
        items.add((domain, platform))
    return items


def load_settings() -> Settings:
    projects_dir = Path(os.environ.get("PROJECTS_DIR") or os.environ.get("EVE_PROJECTS_DIR", "./projects")).resolve()
    allowlist_raw = (os.environ.get("COMPONENTS_ALLOWLIST") or os.environ.get("EVE_COMPONENTS_ALLOWLIST") or "").strip()
    allowlist = _parse_allowlist(allowlist_raw)
    cors_origins = [
        o.strip()
        for o in (
            os.environ.get("CORS_ORIGINS") or os.environ.get("EVE_CORS_ORIGINS") or "http://localhost:5174"
        ).split(",")
        if o.strip()
    ]
    static_dir_raw = (os.environ.get("STATIC_DIR") or os.environ.get("EVE_STATIC_DIR") or "").strip()
    static_dir = Path(static_dir_raw).resolve() if static_dir_raw else None

    # Home Assistant add-on options support (Supervisor mounts options at /data/options.json).
    options_path = Path("/data/options.json")
    if options_path.exists():
        try:
            options = json.loads(options_path.read_text(encoding="utf-8"))
            if isinstance(options, dict):
                opt_projects_dir = options.get("projects_dir")
                if isinstance(opt_projects_dir, str) and opt_projects_dir.strip():
                    projects_dir = Path(opt_projects_dir).resolve()
                opt_allowlist = options.get("allowlist")
                if isinstance(opt_allowlist, str):
                    allowlist_raw = opt_allowlist.strip()
                    allowlist = _parse_allowlist(allowlist_raw)
        except Exception:
            pass

    try:
        projects_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        # If the directory is not writable/mapped, endpoints will surface errors.
        pass

    return Settings(
        projects_dir=projects_dir,
        allowlist=None if not allowlist_raw else allowlist,
        cors_origins=cors_origins,
        static_dir=static_dir,
    )
