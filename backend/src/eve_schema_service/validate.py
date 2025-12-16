from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    stdout: str
    stderr: str
    returncode: int


_SECRET_RE = re.compile(r"!secret\s+([A-Za-z0-9_.-]+)")


def validate_with_esphome_cli(yaml_text: str, timeout_s: int = 30) -> ValidationResult:
    with tempfile.TemporaryDirectory(prefix="eve-") as tmpdir:
        config_path = f"{tmpdir}/config.yaml"
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(yaml_text or "")

        secret_keys = sorted(set(_SECRET_RE.findall(yaml_text or "")))
        if secret_keys:
            secrets_path = f"{tmpdir}/secrets.yaml"
            with open(secrets_path, "w", encoding="utf-8") as f:
                for k in secret_keys:
                    f.write(f'{k}: "__eve_dummy__"\n')

        proc = subprocess.run(
            [sys.executable, "-m", "esphome", "config", config_path],
            text=True,
            capture_output=True,
            timeout=timeout_s,
            check=False,
        )
        return ValidationResult(
            ok=proc.returncode == 0,
            stdout=proc.stdout,
            stderr=proc.stderr,
            returncode=proc.returncode,
        )
