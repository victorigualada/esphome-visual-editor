from __future__ import annotations

from functools import lru_cache
from typing import Any

import voluptuous as vol

try:  # voluptuous>=0.15
    from voluptuous import markers as _markers  # type: ignore

    _Required = _markers.Required
    _Optional = _markers.Optional
except Exception:  # voluptuous<=0.14 (ESPHome pins 0.14.x)
    from voluptuous.schema_builder import Optional as _Optional  # type: ignore
    from voluptuous.schema_builder import Required as _Required  # type: ignore


def _callable_id(v: Any) -> str | None:
    if hasattr(v, "func") and callable(v.func):
        f = v.func
        return f"{getattr(f, '__module__', '')}.{getattr(f, '__name__', '')}".strip(".") or None
    if callable(v):
        return f"{getattr(v, '__module__', '')}.{getattr(v, '__name__', '')}".strip(".") or None
    return None


def _merge_ui(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    out = dict(a)
    if "ui" in b:
        out.setdefault("ui", {})
        out["ui"] = {**out["ui"], **b["ui"]}

    # Preserve validator origins across merges (e.g. vol.All, vol.Any).
    # We store origins in ui.origins (list[str]) and optionally ui.origin (string).
    ui = out.get("ui")
    if isinstance(ui, dict):
        origins: list[str] = []
        for src in (a, b):
            src_ui = src.get("ui")
            if not isinstance(src_ui, dict):
                continue
            o = src_ui.get("origin")
            if isinstance(o, str) and o:
                origins.append(o)
            os = src_ui.get("origins")
            if isinstance(os, list):
                for x in os:
                    if isinstance(x, str) and x:
                        origins.append(x)

        if origins:
            # Stable unique
            seen: set[str] = set()
            uniq: list[str] = []
            for o in origins:
                if o in seen:
                    continue
                seen.add(o)
                uniq.append(o)
            ui.setdefault("origin", uniq[0])
            ui["origins"] = uniq
    for k in ("minimum", "maximum", "minLength", "maxLength", "pattern", "default", "options"):
        if k in b and k not in out:
            out[k] = b[k]
    return out


def _with_origin(schema: dict[str, Any], origin: str | None) -> dict[str, Any]:
    if not origin:
        return schema
    out = dict(schema)
    ui = out.get("ui")
    if not isinstance(ui, dict):
        ui = {}
    ui.setdefault("origin", origin)
    origins = ui.get("origins")
    if not isinstance(origins, list):
        origins = []
    if origin not in origins:
        origins = [origin, *[x for x in origins if isinstance(x, str) and x and x != origin]]
    ui["origins"] = origins
    out["ui"] = ui
    return out


@lru_cache(maxsize=1)
def _mqtt_field_keys() -> set[str]:
    """Derive per-entity MQTT option keys from ESPHome's own schema fragments."""
    keys: set[str] = set()
    try:
        import esphome.config_validation as cv  # type: ignore

        schemas = [
            getattr(cv, "MQTT_COMPONENT_SCHEMA", None),
            getattr(cv, "MQTT_COMMAND_COMPONENT_SCHEMA", None),
        ]
        for s in schemas:
            schema_dict = getattr(s, "schema", None)
            if not isinstance(schema_dict, dict):
                continue
            for k in schema_dict.keys():
                key_name, _is_req, _default = _convert_key(k)
                if key_name:
                    keys.add(key_name)
    except Exception:
        # If ESPHome isn't importable, just don't tag anything.
        keys = set()
    return keys


def _convert_key(key: Any) -> tuple[str, bool, Any | None]:
    def _clean_default(d: Any | None) -> Any | None:
        if d is None:
            return None
        try:
            if d is getattr(vol, "UNDEFINED", None):
                return None
            if isinstance(d, getattr(vol, "Undefined", object)):
                return None
        except Exception:
            pass
        return d

    def _safe_default(k: Any) -> Any | None:
        try:
            return _clean_default(getattr(k, "default", None))
        except Exception:
            return None

    if isinstance(key, _Required):
        return str(key.schema), True, _safe_default(key)
    if isinstance(key, _Optional):
        return str(key.schema), False, _safe_default(key)
    return str(key), False, None


def _type_from_py(t: Any) -> dict[str, Any] | None:
    if t is bool:
        return {"type": "boolean"}
    if t is int:
        return {"type": "int"}
    if t is float:
        return {"type": "float"}
    if t is str:
        return {"type": "string"}
    return None


def _coerce_json_scalar(v: Any) -> Any:
    if v is None or isinstance(v, str | int | float | bool):
        return v
    # ESPHome TimePeriod (common in range validators)
    if hasattr(v, "total_seconds") and isinstance(v.total_seconds, int | float):
        return float(v.total_seconds)
    if hasattr(v, "total_milliseconds") and isinstance(v.total_milliseconds, int | float):
        return float(v.total_milliseconds)
    return str(v)


def _known_validator_to_schema(validator: Any, *, key_name: str | None) -> dict[str, Any] | None:
    vid = _callable_id(validator)
    if vid in {
        "esphome.config_validation._validate_entity_name",
        "esphome.config_validation._validate_icon",
    }:
        return _with_origin({"type": "string"}, vid)
    if vid in {
        "esphome.config_validation.boolean",
        "esphome.config_validation.boolean_",
    }:
        return _with_origin({"type": "boolean"}, vid)
    if vid in {"esphome.config_validation.string"}:
        return _with_origin({"type": "string"}, vid)
    if vid in {"esphome.config_validation.int_", "esphome.config_validation.int_range"}:
        return _with_origin({"type": "int"}, vid)
    if vid in {"esphome.config_validation.float_"}:
        return _with_origin({"type": "float"}, vid)

    if key_name in {"id"} or (key_name is not None and key_name.endswith("_id")):
        return {"type": "id"}
    if key_name in {"pin"} or (key_name is not None and key_name.endswith("_pin")):
        return {"type": "pin", "capabilities": ["gpio"]}
    return None


def _convert_validator(validator: Any, *, key_name: str | None = None) -> dict[str, Any]:
    origin = _callable_id(validator)
    if isinstance(validator, vol.Schema):
        return _convert_schema_dict(validator.schema)

    if isinstance(validator, dict):
        return _convert_schema_dict(validator)

    if isinstance(validator, list) and len(validator) == 1:
        return {"type": "array", "items": _convert_validator(validator[0], key_name=key_name)}

    py_t = _type_from_py(validator)
    if py_t is not None:
        return _with_origin(py_t, origin)

    known = _known_validator_to_schema(validator, key_name=key_name)
    if known is not None:
        return known

    if isinstance(validator, vol.Coerce):
        coerced = _type_from_py(validator.type)
        if coerced is not None:
            return _with_origin(coerced, origin)

    if isinstance(validator, vol.In):
        opts = list(validator.container)
        return {
            "type": "enum",
            "options": [{"value": _coerce_json_scalar(o), "label": str(o)} for o in opts],
        }

    if isinstance(validator, vol.Any):
        return {
            "type": "any_of",
            "options": [_convert_validator(v, key_name=key_name) for v in validator.validators],
        }

    if isinstance(validator, vol.All):
        parts = [_convert_validator(v, key_name=key_name) for v in validator.validators]
        if not parts:
            return {"type": "raw_yaml", "reason": "Empty vol.All"}

        # Prefer richer structural types when present. This matters for common
        # ESPHome patterns like `vol.All(cv.ensure_list, [cv.string])` where the
        # first validator may be an unknown callable (rendered as raw_yaml) but
        # the second clearly describes an array.
        base: dict[str, Any] | None = None
        for p in parts:
            if p.get("type") == "array":
                base = p
                break
        if base is None:
            for p in parts:
                if p.get("type") != "raw_yaml":
                    base = p
                    break
        if base is None:
            base = parts[0]

        out = dict(base)
        for p in parts:
            if p is base:
                continue
            out = _merge_ui(out, p)
        return out

    if isinstance(validator, vol.Range):
        base: dict[str, Any] = {"type": "number"}
        if validator.min is not None:
            base["minimum"] = _coerce_json_scalar(validator.min)
        if validator.max is not None:
            base["maximum"] = _coerce_json_scalar(validator.max)
        return base

    if isinstance(validator, vol.Length):
        base: dict[str, Any] = {"type": "string"}
        if validator.min is not None:
            base["minLength"] = validator.min
        if validator.max is not None:
            base["maxLength"] = validator.max
        return base

    if isinstance(validator, vol.Match):
        return {"type": "string", "pattern": validator.pattern.pattern}

    if origin:
        return _with_origin({"type": "raw_yaml", "reason": f"Unsupported validator: {origin}"}, origin)
    return {"type": "raw_yaml", "reason": f"Unsupported validator: {type(validator).__name__}"}


def _convert_schema_dict(schema_dict: dict[Any, Any]) -> dict[str, Any]:
    def _json_compatible(v: Any, *, depth: int = 0) -> bool:
        if depth > 6:
            return False
        if v is None or isinstance(v, str | int | float | bool):
            return True
        if isinstance(v, list):
            return all(_json_compatible(x, depth=depth + 1) for x in v)
        if isinstance(v, dict):
            return all(isinstance(k, str) and _json_compatible(val, depth=depth + 1) for k, val in v.items())
        return False

    properties: dict[str, Any] = {}
    required: list[str] = []
    for raw_key, raw_validator in schema_dict.items():
        key_name, is_required, default = _convert_key(raw_key)
        prop_schema = _convert_validator(raw_validator, key_name=key_name)
        # ESPHome uses cv.OnlyWith(key, "mqtt") (and similar) for conditional fields.
        # Tag these so the UI can group/hide them based on the presence of that core block.
        only_with = getattr(raw_key, "_component", None)
        if isinstance(only_with, str) and only_with:
            prop_schema.setdefault("ui", {})
            if isinstance(prop_schema.get("ui"), dict):
                prop_schema["ui"].setdefault("only_with", only_with)
                prop_schema["ui"].setdefault("group", only_with)
        # Also tag any keys that come from ESPHome's shared MQTT component schema fragments.
        if key_name in _mqtt_field_keys():
            prop_schema.setdefault("ui", {})
            if isinstance(prop_schema.get("ui"), dict):
                prop_schema["ui"].setdefault("only_with", "mqtt")
                prop_schema["ui"].setdefault("group", "mqtt")
        if default is not None and prop_schema.get("type") not in {"raw_yaml"} and _json_compatible(default):
            prop_schema.setdefault("default", default)
        properties[key_name] = prop_schema
        if is_required:
            required.append(key_name)
    out: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        out["required"] = required
    return out


def convert_config_schema_to_ui(config_schema: Any, *, domain: str, platform: str) -> dict[str, Any]:
    root = _convert_validator(config_schema)
    if root.get("type") == "object":
        props = root.setdefault("properties", {})
        if "platform" not in props:
            props["platform"] = {"type": "const", "value": platform}
        if "platform" not in root.get("required", []):
            root.setdefault("required", [])
            if "platform" not in root["required"]:
                root["required"].append("platform")

        # Some ESPHome schemas mark internal fields as Required even though they
        # are auto-populated by the framework (so they are not required in YAML).
        # Example: `esphome.build_path` is derived and inserted automatically.
        internal_required_overrides: dict[tuple[str, str], set[str]] = {
            ("esphome", "esphome"): {"build_path"},
        }
        drop_required = internal_required_overrides.get((domain, platform))
        if drop_required and isinstance(root.get("required"), list):
            root["required"] = [k for k in root["required"] if k not in drop_required]

        # Targeted schema overrides for better UI rendering.
        # Some ESPHome options are defined as "string or list of strings" (or wrapped in
        # ensure_list helpers), but in YAML they are effectively lists and we want to
        # render them with the array editor.
        if (domain, platform) == ("esphome", "esphome"):
            adv = props.get("advanced")
            if isinstance(adv, dict) and adv.get("type") == "object":
                adv_props = adv.setdefault("properties", {})
                if isinstance(adv_props, dict) and "areas" in adv_props:
                    adv_props["areas"] = {"type": "array", "items": {"type": "string"}}

    root.setdefault("ui", {})
    root["ui"].setdefault("domain", domain)
    root["ui"].setdefault("platform", platform)
    return root
