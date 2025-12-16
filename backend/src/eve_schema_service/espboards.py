from __future__ import annotations

import re
import time
import urllib.request
from dataclasses import dataclass
from typing import Any

ESPBOARDS_BASE = "https://www.espboards.dev"


@dataclass(frozen=True)
class EspBoard:
    target: str  # "esp32" | "esp8266"
    slug: str
    name: str
    url: str
    image_url: str
    microcontroller: str | None = None  # esp32 only (esp32, esp32s3, ...)


@dataclass(frozen=True)
class EspBoardPin:
    value: str  # e.g. GPIO23
    label: str  # e.g. 23
    description: str | None = None
    meta: dict[str, str] | None = None


def _fetch(url: str, timeout_s: int = 20) -> str:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _abs(url: str) -> str:
    if url.startswith("http"):
        return url
    if not url.startswith("/"):
        url = "/" + url
    return ESPBOARDS_BASE + url


_ESP32_MICRO_RE = re.compile(r'href="/esp32/microcontroller/([^/]+)/"', re.IGNORECASE)


def _parse_esp8266_boards(html: str) -> list[EspBoard]:
    boards: list[EspBoard] = []
    # Card contains: <a href="/esp8266/<slug>/"> ... <img ... src="/img/<...>.png"> ... <h3>NAME</h3>
    card_re = re.compile(
        r'href="/esp8266/(?P<slug>[^/]+)/"[^>]*>.*?<img[^>]+src="(?P<img>[^"]+)"[^>]*>.*?<h3[^>]*>(?P<name>[^<]+)</h3>',
        re.IGNORECASE | re.DOTALL,
    )
    seen: set[str] = set()
    for m in card_re.finditer(html):
        slug = m.group("slug").strip()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        name = re.sub(r"\s+", " ", m.group("name")).strip()
        img = _abs(m.group("img").strip())
        boards.append(
            EspBoard(
                target="esp8266",
                slug=slug,
                name=name or slug,
                url=f"{ESPBOARDS_BASE}/esp8266/{slug}/",
                image_url=img,
            )
        )
    return boards


def _parse_esp32_boards_from_microcontroller(html: str, microcontroller: str) -> list[EspBoard]:
    boards: list[EspBoard] = []
    # Card contains: <a href="/esp32/<slug>/"> ... <img ... src="/img/<...>.png"> ... <h3>NAME</h3>
    card_re = re.compile(
        r'href="/esp32/(?P<slug>[^/]+)/"[^>]*>.*?<img[^>]+src="(?P<img>[^"]+)"[^>]*>.*?<h3[^>]*>(?P<name>[^<]+)</h3>',
        re.IGNORECASE | re.DOTALL,
    )
    seen: set[str] = set()
    for m in card_re.finditer(html):
        slug = m.group("slug").strip()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        name = re.sub(r"\s+", " ", m.group("name")).strip()
        img = _abs(m.group("img").strip())
        boards.append(
            EspBoard(
                target="esp32",
                slug=slug,
                name=name or slug,
                url=f"{ESPBOARDS_BASE}/esp32/{slug}/",
                image_url=img,
                microcontroller=microcontroller,
            )
        )
    return boards


def _load_esp32_boards() -> list[EspBoard]:
    root = _fetch(f"{ESPBOARDS_BASE}/esp32/")
    micros = sorted(set(_ESP32_MICRO_RE.findall(root)))
    boards_by_slug: dict[str, EspBoard] = {}
    for micro in micros:
        try:
            html = _fetch(f"{ESPBOARDS_BASE}/esp32/microcontroller/{micro}/")
        except Exception:
            continue
        for b in _parse_esp32_boards_from_microcontroller(html, microcontroller=micro):
            # Prefer first seen; most board pages belong to a single microcontroller anyway.
            boards_by_slug.setdefault(b.slug, b)
    return sorted(boards_by_slug.values(), key=lambda b: b.name.lower())


def _load_esp8266_boards() -> list[EspBoard]:
    html = _fetch(f"{ESPBOARDS_BASE}/esp8266/")
    return sorted(_parse_esp8266_boards(html), key=lambda b: b.name.lower())


_CACHE_TTL_S = 60 * 60 * 12  # 12h
_cache: dict[str, tuple[float, list[EspBoard]]] = {}
_details_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _strip_tags(html: str) -> str:
    html = re.sub(r"<[^>]+>", "", html)
    html = html.replace("&nbsp;", " ")
    html = html.replace("&amp;", "&")
    html = html.replace("&lt;", "<")
    html = html.replace("&gt;", ">")
    html = html.replace("&#39;", "'")
    html = html.replace("&quot;", '"')
    return re.sub(r"\s+", " ", html).strip()


def _extract_pinout_image_url(html: str) -> str | None:
    # Prefer an explicit pinout image when present (common for ESP8266 boards).
    for tag in re.findall(r"<img[^>]+>", html, flags=re.IGNORECASE):
        src_m = re.search(r'src="([^"]+)"', tag, flags=re.IGNORECASE)
        if not src_m:
            continue
        alt_m = re.search(r'alt="([^"]*)"', tag, flags=re.IGNORECASE)
        alt = (alt_m.group(1) if alt_m else "").lower()
        if "pinout" in alt:
            return _abs(src_m.group(1))
    # Fallback: any img tag that mentions pinout in the tag itself.
    for tag in re.findall(r"<img[^>]+>", html, flags=re.IGNORECASE):
        if "pinout" not in tag.lower():
            continue
        src_m = re.search(r'src="([^"]+)"', tag, flags=re.IGNORECASE)
        if src_m:
            return _abs(src_m.group(1))
    return None


def _extract_board_image_url(html: str) -> str | None:
    # Prefer the main board image (often has alt ending with "image").
    for tag in re.findall(r"<img[^>]+>", html, flags=re.IGNORECASE):
        src_m = re.search(r'src="([^"]+)"', tag, flags=re.IGNORECASE)
        if not src_m:
            continue
        alt_m = re.search(r'alt="([^"]*)"', tag, flags=re.IGNORECASE)
        alt = (alt_m.group(1) if alt_m else "").lower()
        if alt.endswith(" image") or alt.endswith("image"):
            return _abs(src_m.group(1))
    return None


def _extract_board_name(html: str, slug: str) -> str:
    h1 = re.search(r"<h1[^>]*>([^<]+)</h1>", html, flags=re.IGNORECASE)
    if h1:
        return _strip_tags(h1.group(1)) or slug
    title = re.search(r"<title>([^<]+)</title>", html, flags=re.IGNORECASE)
    if title:
        t = _strip_tags(title.group(1))
        # Common format: "<name> Development Board, Details ..."
        return t.split(" Development Board", 1)[0].strip() or slug
    return slug


def _extract_pin_mappings(html: str, target: str) -> list[EspBoardPin]:
    """
    Parse the 'Pin Mappings' table. This is a GPIO-centric mapping that can be
    used to drive a pin picker.
    """
    _ = target
    body_idx = html.lower().find("<body")
    body = html[body_idx:] if body_idx != -1 else html
    idx = body.lower().find("pin mappings")
    segment = body[idx:] if idx != -1 else body

    m = re.search(r"<table[^>]*>(.*?)</table>", segment, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return []
    table = m.group(1)

    headers: list[str] = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.IGNORECASE | re.DOTALL):
        ths = re.findall(r"<th[^>]*>(.*?)</th>", row, flags=re.IGNORECASE | re.DOTALL)
        if ths:
            headers = [_strip_tags(h) for h in ths]
            break

    pins: list[EspBoardPin] = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.IGNORECASE | re.DOTALL):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.IGNORECASE | re.DOTALL)
        if not tds:
            continue
        values = [_strip_tags(td) for td in tds]
        if not values:
            continue

        raw_pin = values[0]
        if not raw_pin:
            continue

        gpio_num: str | None = None
        m_gpio = re.match(r"^GPIO\s*([0-9]+)$", raw_pin, flags=re.IGNORECASE)
        if m_gpio:
            gpio_num = m_gpio.group(1)
        elif raw_pin.isdigit():
            gpio_num = raw_pin
        else:
            m_digits = re.match(r"^([0-9]+)$", raw_pin)
            if m_digits:
                gpio_num = m_digits.group(1)

        value = f"GPIO{gpio_num}" if gpio_num is not None else raw_pin
        label = gpio_num if gpio_num is not None else raw_pin

        meta: dict[str, str] = {}
        description_parts: list[str] = []
        for idx2 in range(1, len(values)):
            v = values[idx2]
            if not v:
                continue
            header = headers[idx2] if idx2 < len(headers) and headers[idx2] else f"col{idx2}"
            meta[header] = v
            description_parts.append(f"{header}: {v}")

        pins.append(
            EspBoardPin(
                value=value,
                label=label,
                description=" · ".join(description_parts) if description_parts else None,
                meta=meta or None,
            )
        )

    def _sort_key(p: EspBoardPin) -> tuple[int, str]:
        m2 = re.match(r"^GPIO([0-9]+)$", p.value)
        if m2:
            return (0, f"{int(m2.group(1)):04d}")
        return (1, p.value)

    pins.sort(key=_sort_key)
    return pins


_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+", re.IGNORECASE)


def _norm_id(s: str) -> str:
    return _NON_ALNUM_RE.sub("_", (s or "").strip().lower()).strip("_")


def _tokens(s: str) -> set[str]:
    return {t for t in _NON_ALNUM_RE.sub(" ", (s or "").lower()).split() if t}


def get_board_catalog(target: str) -> list[dict[str, Any]]:
    target = target.strip().lower()
    if target not in {"esp32", "esp8266"}:
        raise ValueError("target must be esp32 or esp8266")

    now = time.time()
    cached = _cache.get(target)
    if cached and now - cached[0] < _CACHE_TTL_S:
        boards = cached[1]
    else:
        boards = _load_esp32_boards() if target == "esp32" else _load_esp8266_boards()
        _cache[target] = (now, boards)

    return [
        {
            "target": b.target,
            "slug": b.slug,
            "name": b.name,
            "url": b.url,
            "imageUrl": b.image_url,
            "microcontroller": b.microcontroller,
        }
        for b in boards
    ]


def get_board_details(target: str, slug: str) -> dict[str, Any]:
    target = target.strip().lower()
    slug = slug.strip()
    if target not in {"esp32", "esp8266"}:
        raise ValueError("target must be esp32 or esp8266")
    if not slug:
        raise ValueError("slug is required")

    cache_key = f"{target}:{slug}"
    now = time.time()
    cached = _details_cache.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL_S:
        return cached[1]

    url = f"{ESPBOARDS_BASE}/{target}/{slug}/"
    html = _fetch(url)
    name = _extract_board_name(html, slug=slug)
    pinout = _extract_pinout_image_url(html)
    board_image = _extract_board_image_url(html)
    pins = _extract_pin_mappings(html, target=target)

    payload: dict[str, Any] = {
        "target": target,
        "slug": slug,
        "name": name,
        "url": url,
        "pinoutImageUrl": pinout,
        "boardImageUrl": board_image,
        "pins": [
            {
                "value": p.value,
                "label": p.label,
                "description": p.description,
                "meta": p.meta,
            }
            for p in pins
        ],
    }
    _details_cache[cache_key] = (now, payload)
    return payload
