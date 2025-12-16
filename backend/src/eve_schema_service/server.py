from __future__ import annotations

import importlib.metadata
from datetime import UTC, datetime

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from .config import load_settings
from .espboards import get_board_catalog, get_board_details
from .esphome_introspect import discover_components, load_component_ui_schema, load_core_component_ui_schema
from .http_errors import BadRequest, NotFound
from .projects import list_projects, read_project_yaml, write_project_yaml
from .validate import validate_with_esphome_cli

settings = load_settings()


async def meta(_: Request) -> JSONResponse:
    try:
        esphome_version = importlib.metadata.version("esphome")
    except Exception:
        esphome_version = None

    return JSONResponse(
        {
            "version": "0.1",
            "generatedAt": datetime.now(UTC).isoformat(),
            "esphomeVersion": esphome_version,
        }
    )


async def components(request: Request) -> JSONResponse:
    all_raw = request.query_params.get("all", "0")
    allow_all = all_raw == "1" or settings.allowlist is None
    allowlist = None if allow_all else settings.allowlist
    comps = discover_components(limit_to=allowlist)
    return JSONResponse(
        {
            "allowlistMode": 0 if allow_all else 1,
            "components": [{"domain": c.domain, "platform": c.platform} for c in comps],
        }
    )


async def schema(request: Request) -> JSONResponse:
    domain = request.path_params["domain"]
    platform = request.path_params["platform"]
    if settings.allowlist is not None and (domain, platform) not in settings.allowlist:
        return JSONResponse(
            {"detail": "Component not available (not in allowlist)."},
            status_code=404,
        )
    try:
        return JSONResponse(load_component_ui_schema(domain, platform))
    except KeyError as e:
        return JSONResponse({"detail": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"detail": f"Failed to load schema: {e}"}, status_code=400)


async def core_schema(request: Request) -> JSONResponse:
    name = request.path_params["name"]
    try:
        return JSONResponse(load_core_component_ui_schema(name))
    except KeyError as e:
        return JSONResponse({"detail": str(e)}, status_code=404)
    except Exception as e:
        return JSONResponse({"detail": f"Failed to load core schema: {e}"}, status_code=400)


async def espboards_catalog(request: Request) -> JSONResponse:
    target = request.path_params["target"]
    try:
        return JSONResponse({"target": target, "boards": get_board_catalog(target)})
    except Exception as e:
        return JSONResponse({"detail": f"Failed to load board catalog: {e}"}, status_code=400)


async def espboards_board(request: Request) -> JSONResponse:
    target = request.path_params["target"]
    slug = request.path_params["slug"]
    try:
        return JSONResponse(get_board_details(target, slug))
    except Exception as e:
        return JSONResponse({"detail": f"Failed to load board details: {e}"}, status_code=400)


async def projects(_: Request) -> JSONResponse:
    return JSONResponse({"projects": list_projects(settings.projects_dir)})


async def project_get(request: Request) -> JSONResponse:
    name = request.path_params["name"]
    try:
        return JSONResponse({"name": name, "yaml": read_project_yaml(settings.projects_dir, name)})
    except NotFound as e:
        return JSONResponse({"detail": str(e)}, status_code=404)
    except BadRequest as e:
        return JSONResponse({"detail": str(e)}, status_code=400)


async def project_put(request: Request) -> JSONResponse:
    name = request.path_params["name"]
    body = await request.json()
    yaml_text = str(body.get("yaml", ""))
    try:
        write_project_yaml(settings.projects_dir, name, yaml_text)
    except BadRequest as e:
        return JSONResponse({"detail": str(e)}, status_code=400)
    return JSONResponse({"ok": True})


async def validate(request: Request) -> JSONResponse:
    body = await request.json()
    yaml_text = str(body.get("yaml", ""))
    res = validate_with_esphome_cli(yaml_text)
    return JSONResponse({"ok": res.ok, "stdout": res.stdout, "stderr": res.stderr, "returncode": res.returncode})


routes = [
    Route("/api/meta", meta, methods=["GET"]),
    Route("/api/components", components, methods=["GET"]),
    Route("/api/schema/{domain:str}/{platform:str}", schema, methods=["GET"]),
    Route("/api/core-schema/{name:str}", core_schema, methods=["GET"]),
    Route("/api/espboards/{target:str}", espboards_catalog, methods=["GET"]),
    Route("/api/espboards/{target:str}/{slug:str}", espboards_board, methods=["GET"]),
    Route("/api/projects", projects, methods=["GET"]),
    Route("/api/projects/{name:str}", project_get, methods=["GET"]),
    Route("/api/projects/{name:str}", project_put, methods=["PUT"]),
    Route("/api/validate", validate, methods=["POST"]),
]

if settings.static_dir is not None and settings.static_dir.exists():
    routes.append(Mount("/", app=StaticFiles(directory=str(settings.static_dir), html=True), name="static"))

app = Starlette(routes=routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
