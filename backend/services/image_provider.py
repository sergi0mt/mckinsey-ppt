"""Unified image search client for slide image_query fetching.

Three providers, picked at request time:
- pexels:   https://api.pexels.com/v1/search  (free tier: 200/h)
- unsplash: https://api.unsplash.com/search/photos  (free tier: 50/h demo)
- ai:       stub — wire up DALL-E or Stable Diffusion later

If the corresponding API key is missing in settings, the provider silently
returns [] so the slide just renders without an image (graceful degradation).
"""
from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

Provider = Literal["none", "pexels", "unsplash", "ai"]


@dataclass
class ImageRef:
    url: str           # direct URL to the image
    thumb_url: str = "" # smaller version for previews
    alt: str = ""
    credit: str = ""   # photographer / source attribution


async def search_images(
    query: str,
    provider: Provider = "pexels",
    count: int = 1,
    *,
    timeout: float = 8.0,
) -> list[ImageRef]:
    """Return up to `count` image refs for `query` from the chosen provider.

    Returns [] (instead of raising) if the provider is unconfigured or rate-
    limited — slides without an image are still valid output.
    """
    if not query or provider == "none":
        return []

    try:
        if provider == "pexels":
            return await _pexels_search(query, count, timeout=timeout)
        if provider == "unsplash":
            return await _unsplash_search(query, count, timeout=timeout)
        if provider == "ai":
            return await _ai_generate(query, count, timeout=timeout)
    except httpx.HTTPError as e:
        logger.warning("image_search %s failed for %r: %s", provider, query, e)
    except Exception as e:
        logger.exception("image_search %s crashed: %s", provider, e)
    return []


async def _pexels_search(query: str, count: int, *, timeout: float) -> list[ImageRef]:
    key = getattr(settings, "pexels_api_key", "") or ""
    if not key:
        logger.info("pexels_api_key not set — skipping image search")
        return []
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(
            "https://api.pexels.com/v1/search",
            params={"query": query, "per_page": max(1, min(count, 10)), "orientation": "landscape"},
            headers={"Authorization": key},
        )
        r.raise_for_status()
        data = r.json()
    out: list[ImageRef] = []
    for photo in data.get("photos", [])[:count]:
        src = photo.get("src", {}) or {}
        url = src.get("large2x") or src.get("large") or src.get("original") or ""
        if not url:
            continue
        out.append(ImageRef(
            url=url,
            thumb_url=src.get("medium") or src.get("small") or url,
            alt=photo.get("alt") or query,
            credit=f"Photo by {photo.get('photographer', 'unknown')} on Pexels",
        ))
    return out


async def _unsplash_search(query: str, count: int, *, timeout: float) -> list[ImageRef]:
    key = getattr(settings, "unsplash_access_key", "") or ""
    if not key:
        logger.info("unsplash_access_key not set — skipping image search")
        return []
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(
            "https://api.unsplash.com/search/photos",
            params={"query": query, "per_page": max(1, min(count, 10)), "orientation": "landscape"},
            headers={"Authorization": f"Client-ID {key}"},
        )
        r.raise_for_status()
        data = r.json()
    out: list[ImageRef] = []
    for photo in data.get("results", [])[:count]:
        urls = photo.get("urls", {}) or {}
        url = urls.get("regular") or urls.get("full") or urls.get("raw") or ""
        if not url:
            continue
        user = photo.get("user", {}) or {}
        out.append(ImageRef(
            url=url,
            thumb_url=urls.get("small") or url,
            alt=photo.get("alt_description") or query,
            credit=f"Photo by {user.get('name', 'unknown')} on Unsplash",
        ))
    return out


async def _ai_generate(query: str, count: int, *, timeout: float) -> list[ImageRef]:
    """Placeholder — wire up DALL-E / Stable Diffusion / fal.ai in V2."""
    logger.info("ai image provider not yet implemented; returning []")
    return []


async def fetch_images_for_slides(
    slides: list[dict],
    provider: Provider = "none",
    *,
    layouts_with_image: tuple[str, ...] = ("image_right", "image_left", "full_image", "title"),
) -> None:
    """Mutate slides in place — for slides whose layout uses images, fetch a
    matching image_url. Best-effort: failures leave image_url empty.

    Runs all fetches concurrently with asyncio.gather to keep latency bounded
    (Pexels at ~300-500ms each adds up serially for a 12-slide deck).
    """
    if provider == "none":
        return
    tasks: list[asyncio.Task] = []
    targets: list[dict] = []
    for s in slides:
        layout = (s.get("layout") or "").lower()
        query = (s.get("image_query") or "").strip()
        if not query or layout not in layouts_with_image:
            continue
        tasks.append(asyncio.create_task(search_images(query, provider=provider, count=1)))
        targets.append(s)
    if not tasks:
        return
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for slide, result in zip(targets, results):
        if isinstance(result, list) and result:
            slide["image_url"] = result[0].url
