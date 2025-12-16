## ESPHome Visual Editor (PoC)

Schema-driven visual editor for ESPHome configs with ESP board selection and pinout images.

<img src="./assets/eve-show.gif">

## Installation

This is the simplest way to run both backend + frontend together.

```sh
docker compose up --build
```

- **App (UI + API)**: `http://localhost:6056/` (API at `http://localhost:6056/api/meta`)

## Development

Use the DevContainer


## Configuration

- **`PORT`**: default `6056`
- **`HOST`**: default `0.0.0.0`
- **`RELOAD`**: set to `1` to run Uvicorn reload
- **`PROJECTS_DIR`**: directory for YAML projects (default `./projects`)
- **`CORS_ORIGINS`**: comma-separated list of allowed origins (default `http://localhost:6056`)
- **`COMPONENTS_ALLOWLIST`**: optional allowlist `domain:platform,domain:platform,...`
- **`STATIC_DIR`**: optional directory to serve as static frontend




