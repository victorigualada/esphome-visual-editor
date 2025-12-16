from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.environ.get("HOST") or os.environ.get("EVE_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT") or os.environ.get("EVE_PORT") or "6056")
    reload = (os.environ.get("RELOAD") or os.environ.get("EVE_RELOAD") or "0") == "1"
    uvicorn.run("eve_schema_service.server:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()
