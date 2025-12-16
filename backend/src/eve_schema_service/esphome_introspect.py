from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from .convert.voluptuous_to_ui import convert_config_schema_to_ui


@dataclass(frozen=True)
class ComponentRef:
    domain: str
    platform: str


@lru_cache(maxsize=1)
def _components_path() -> Path:
    import esphome.components as components_pkg  # type: ignore

    return Path(list(components_pkg.__path__)[0])


@lru_cache(maxsize=1)
def _platform_domains() -> set[str]:
    """
    Domain packages (sensor, switch, light, ...) declare IS_PLATFORM_COMPONENT = True.
    We use this to identify valid YAML "domains" without importing every module.
    """
    domains: set[str] = set()
    root = _components_path()
    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        init_py = entry / "__init__.py"
        if not init_py.exists():
            continue
        try:
            text = init_py.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "IS_PLATFORM_COMPONENT" in text and "True" in text:
            # Be conservative: require the exact assignment to avoid false positives.
            if "IS_PLATFORM_COMPONENT = True" in text:
                domains.add(entry.name)
    return domains


def discover_components(limit_to: set[tuple[str, str]] | None = None) -> list[ComponentRef]:
    out: list[ComponentRef] = []
    if limit_to is not None:
        for domain, platform in sorted(limit_to):
            out.append(ComponentRef(domain=domain, platform=platform))
        return out

    return _discover_all_components()


@lru_cache(maxsize=1)
def _discover_all_components() -> list[ComponentRef]:
    out: list[ComponentRef] = []
    root = _components_path()
    domains = _platform_domains()
    for platform_dir in root.iterdir():
        if not platform_dir.is_dir():
            continue
        if platform_dir.name.startswith("_"):
            continue
        for domain in domains:
            if (platform_dir / domain / "__init__.py").exists() or (platform_dir / f"{domain}.py").exists():
                out.append(ComponentRef(domain=domain, platform=platform_dir.name))
    out.sort(key=lambda r: (r.domain, r.platform))
    return out


@lru_cache(maxsize=4096)
def load_component_ui_schema(domain: str, platform: str) -> dict[str, Any]:
    import esphome.loader as loader  # type: ignore

    _ensure_core_initialized()
    manifest = loader.get_platform(domain, platform)
    mod = manifest.module
    config_schema = getattr(mod, "CONFIG_SCHEMA", None) or getattr(manifest, "config_schema", None)
    if config_schema is None:
        raise KeyError("No CONFIG_SCHEMA found")
    ui_schema = convert_config_schema_to_ui(config_schema, domain=domain, platform=platform)
    return {
        "domain": domain,
        "platform": platform,
        "displayName": f"{domain}.{platform}",
        "docs": {"description": (mod.__doc__ or "").strip() or None},
        "schema": ui_schema,
    }


@lru_cache(maxsize=256)
def load_core_component_ui_schema(name: str) -> dict[str, Any]:
    import esphome.loader as loader  # type: ignore

    _ensure_core_initialized()
    if name == "esphome":
        return load_esphome_root_ui_schema()
    manifest = loader.get_component(name)
    mod = manifest.module
    config_schema = getattr(mod, "CONFIG_SCHEMA", None) or getattr(manifest, "config_schema", None)
    if config_schema is None:
        raise KeyError("No CONFIG_SCHEMA found")
    ui_schema = convert_config_schema_to_ui(config_schema, domain=name, platform=name)
    return {
        "name": name,
        "displayName": name,
        "docs": {"description": (mod.__doc__ or "").strip() or None},
        "schema": ui_schema,
    }


@lru_cache(maxsize=1)
def load_esphome_root_ui_schema() -> dict[str, Any]:
    _ensure_core_initialized()
    import esphome.core.config as core_config  # type: ignore

    config_schema = getattr(core_config, "CONFIG_SCHEMA", None)
    if config_schema is None:
        raise KeyError("No core CONFIG_SCHEMA found")
    ui_schema = convert_config_schema_to_ui(config_schema, domain="esphome", platform="esphome")
    return {
        "name": "esphome",
        "displayName": "esphome",
        "docs": {"description": "Root ESPHome configuration (esphome: block)."},
        "schema": ui_schema,
    }


def _ensure_core_initialized(target_platform: str = "esp32") -> None:
    """
    Some modules access CORE at import time (e.g. to build hw interface lists).
    Initialize a minimal CORE so schema imports don't crash.
    """
    try:
        from esphome.const import (  # type: ignore
            KEY_CORE,
            KEY_NAME,
            KEY_TARGET_FRAMEWORK,
            KEY_TARGET_PLATFORM,
            KEY_VARIANT,
        )
        from esphome.core import CORE  # type: ignore

        if not isinstance(getattr(CORE, "data", None), dict):
            CORE.data = {}

        CORE.data.setdefault(KEY_CORE, {})
        core = CORE.data.get(KEY_CORE, {})
        core.setdefault(KEY_TARGET_PLATFORM, target_platform)
        core.setdefault(KEY_TARGET_FRAMEWORK, "arduino")
        core.setdefault(KEY_NAME, "eve")
        core.setdefault(KEY_VARIANT, None)
        CORE.data[KEY_CORE] = core
    except Exception:
        # Best-effort initialization; callers can handle missing/partial CORE state.
        pass
