from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .http_errors import BadRequest, NotFound

_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$")


@dataclass(frozen=True)
class Project:
    name: str
    path: Path


def _sanitize_name(name: str) -> str:
    name = (name or "").strip()
    if not _SAFE_NAME_RE.match(name):
        raise BadRequest("Invalid project name; use letters/numbers/._- (max 64).")
    return name


def project_path(projects_dir: Path, name: str) -> Project:
    safe = _sanitize_name(name)
    yaml_path = (projects_dir / f"{safe}.yaml").resolve()
    yml_path = (projects_dir / f"{safe}.yml").resolve()
    path = yaml_path if yaml_path.exists() or not yml_path.exists() else yml_path
    if projects_dir not in path.parents and path != projects_dir:
        raise BadRequest("Invalid project path.")
    return Project(name=safe, path=path)


def list_projects(projects_dir: Path) -> list[str]:
    if not projects_dir.exists():
        return []
    names: list[str] = []
    for p in sorted(list(projects_dir.glob("*.yaml")) + list(projects_dir.glob("*.yml"))):
        names.append(p.stem)
    return names


def read_project_yaml(projects_dir: Path, name: str) -> str:
    proj = project_path(projects_dir, name)
    if not proj.path.exists():
        raise NotFound("Project not found.")
    return proj.path.read_text(encoding="utf-8")


def write_project_yaml(projects_dir: Path, name: str, yaml_text: str) -> None:
    proj = project_path(projects_dir, name)
    projects_dir.mkdir(parents=True, exist_ok=True)
    proj.path.write_text(yaml_text or "", encoding="utf-8")
