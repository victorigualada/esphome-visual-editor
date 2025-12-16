from __future__ import annotations

from pathlib import Path

from eve_schema_service.projects import list_projects, read_project_yaml, write_project_yaml


def test_projects_round_trip(tmp_path: Path) -> None:
    assert not list_projects(tmp_path)
    write_project_yaml(tmp_path, "demo", "a: 1\n")
    assert list_projects(tmp_path) == ["demo"]
    assert read_project_yaml(tmp_path, "demo") == "a: 1\n"
