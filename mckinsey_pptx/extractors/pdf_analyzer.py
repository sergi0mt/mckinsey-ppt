"""
PDF Analyzer: Extract structural patterns from McKinsey reference presentations.
Parses PDFs to identify layouts, fonts, colors, action titles, and chart types.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Optional
from collections import Counter

import fitz  # PyMuPDF


def analyze_pdf(pdf_path: str | Path) -> dict:
    """Analyze a single PDF and extract presentation patterns.

    Returns dict with:
        - metadata: page count, dimensions, title
        - text_analysis: fonts used, font sizes, title patterns
        - color_analysis: dominant colors
        - layout_analysis: text vs image ratio, column detection
        - content_patterns: action titles, bullet patterns
    """
    pdf_path = Path(pdf_path)
    doc = fitz.open(str(pdf_path))

    result = {
        "file": pdf_path.name,
        "metadata": _extract_metadata(doc),
        "text_analysis": _analyze_text(doc),
        "color_analysis": _analyze_colors(doc),
        "layout_analysis": _analyze_layout(doc),
        "content_patterns": _extract_content_patterns(doc),
    }

    doc.close()
    return result


def _extract_metadata(doc: fitz.Document) -> dict:
    """Extract basic document metadata."""
    meta = doc.metadata or {}
    page = doc[0] if len(doc) > 0 else None
    dims = None
    if page:
        rect = page.rect
        dims = {"width": round(rect.width, 1), "height": round(rect.height, 1),
                "aspect_ratio": round(rect.width / rect.height, 2) if rect.height > 0 else 0}

    return {
        "page_count": len(doc),
        "title": meta.get("title", ""),
        "author": meta.get("author", ""),
        "dimensions": dims,
        "is_landscape": dims["width"] > dims["height"] if dims else False,
    }


def _analyze_text(doc: fitz.Document) -> dict:
    """Analyze text properties: fonts, sizes, styles."""
    font_counter = Counter()
    size_counter = Counter()
    all_texts = []

    max_pages = min(len(doc), 30)  # Limit to first 30 pages
    for page_num in range(max_pages):
        page = doc[page_num]
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    font_name = span.get("font", "unknown")
                    font_size = round(span.get("size", 0), 1)
                    text = span.get("text", "").strip()

                    if text and len(text) > 2:
                        font_counter[font_name] += 1
                        size_counter[font_size] += 1
                        all_texts.append({
                            "page": page_num,
                            "text": text[:200],
                            "font": font_name,
                            "size": font_size,
                            "bold": "Bold" in font_name or "bold" in font_name,
                            "y_pos": round(span["origin"][1], 1),
                        })

    # Identify likely title font size (largest frequent size)
    common_sizes = size_counter.most_common(10)
    title_size = max(common_sizes, key=lambda x: x[0])[0] if common_sizes else 0
    body_sizes = [s for s, _ in common_sizes if s < title_size]
    body_size = max(body_sizes) if body_sizes else 0

    return {
        "fonts_used": dict(font_counter.most_common(10)),
        "font_sizes": dict(size_counter.most_common(15)),
        "likely_title_size": title_size,
        "likely_body_size": body_size,
        "total_text_spans": len(all_texts),
    }


def _analyze_colors(doc: fitz.Document) -> dict:
    """Extract dominant colors from text and graphics."""
    text_colors = Counter()
    max_pages = min(len(doc), 20)

    for page_num in range(max_pages):
        page = doc[page_num]
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    color = span.get("color", 0)
                    if isinstance(color, int):
                        r = (color >> 16) & 0xFF
                        g = (color >> 8) & 0xFF
                        b = color & 0xFF
                        hex_color = f"#{r:02x}{g:02x}{b:02x}"
                        text_colors[hex_color] += 1

    # Filter out black/white and group similar colors
    interesting_colors = {c: n for c, n in text_colors.items()
                          if c not in ("#000000", "#ffffff", "#000001")}

    return {
        "all_text_colors": dict(text_colors.most_common(20)),
        "accent_colors": dict(Counter(interesting_colors).most_common(10)),
        "dominant_color": text_colors.most_common(1)[0][0] if text_colors else "#000000",
    }


def _analyze_layout(doc: fitz.Document) -> dict:
    """Analyze page layouts: text areas, image areas, columns."""
    layouts = []
    max_pages = min(len(doc), 20)

    for page_num in range(max_pages):
        page = doc[page_num]
        text_blocks = []
        image_blocks = []

        for block in page.get_text("dict")["blocks"]:
            bbox = block["bbox"]
            if block["type"] == 0:  # text
                text_blocks.append(bbox)
            elif block["type"] == 1:  # image
                image_blocks.append(bbox)

        page_rect = page.rect
        text_area = sum((b[2]-b[0]) * (b[3]-b[1]) for b in text_blocks)
        image_area = sum((b[2]-b[0]) * (b[3]-b[1]) for b in image_blocks)
        total_area = page_rect.width * page_rect.height

        layouts.append({
            "page": page_num,
            "text_blocks": len(text_blocks),
            "image_blocks": len(image_blocks),
            "text_ratio": round(text_area / total_area, 3) if total_area > 0 else 0,
            "image_ratio": round(image_area / total_area, 3) if total_area > 0 else 0,
        })

    avg_text_ratio = sum(l["text_ratio"] for l in layouts) / len(layouts) if layouts else 0
    avg_image_ratio = sum(l["image_ratio"] for l in layouts) / len(layouts) if layouts else 0

    return {
        "avg_text_ratio": round(avg_text_ratio, 3),
        "avg_image_ratio": round(avg_image_ratio, 3),
        "pages_analyzed": len(layouts),
        "avg_text_blocks_per_page": round(
            sum(l["text_blocks"] for l in layouts) / len(layouts), 1) if layouts else 0,
    }


def _extract_content_patterns(doc: fitz.Document) -> dict:
    """Extract content patterns: potential action titles, bullet structures."""
    potential_titles = []
    bullet_patterns = Counter()
    max_pages = min(len(doc), 30)

    for page_num in range(max_pages):
        page = doc[page_num]
        blocks = page.get_text("dict")["blocks"]

        page_texts = []
        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span.get("text", "").strip()
                    size = span.get("size", 0)
                    y = span["origin"][1]
                    if text and len(text) > 5:
                        page_texts.append({
                            "text": text, "size": size, "y": y,
                            "bold": "Bold" in span.get("font", ""),
                        })

        if not page_texts:
            continue

        # Title = largest text near top of page
        max_size = max(t["size"] for t in page_texts)
        top_texts = [t for t in page_texts if t["y"] < page.rect.height * 0.25]
        title_candidates = [t for t in top_texts if t["size"] >= max_size * 0.9]

        for tc in title_candidates:
            title_text = tc["text"]
            # Check if it looks like an action title (sentence vs topic)
            is_sentence = any(title_text.endswith(c) for c in ".!?") or len(title_text.split()) > 6
            has_verb = bool(re.search(r'\b(is|are|will|should|must|has|have|can|need|require|increase|decrease|drive|show|indicate|suggest|represent|account|grow|reach|create|enable|generate|improve|reduce)\b', title_text.lower()))

            potential_titles.append({
                "page": page_num,
                "text": title_text[:150],
                "is_action_title": is_sentence and has_verb,
                "word_count": len(title_text.split()),
            })

        # Detect bullet patterns
        for t in page_texts:
            if t["text"].startswith(("•", "-", "–", "►", "■", "●")):
                bullet_patterns["bullet_char"] += 1
            elif re.match(r'^\d+[\.\)]\s', t["text"]):
                bullet_patterns["numbered"] += 1

    action_title_count = sum(1 for t in potential_titles if t.get("is_action_title"))

    return {
        "total_titles_found": len(potential_titles),
        "action_titles_found": action_title_count,
        "action_title_ratio": round(action_title_count / len(potential_titles), 2) if potential_titles else 0,
        "sample_titles": [t["text"] for t in potential_titles[:10]],
        "bullet_style": dict(bullet_patterns),
    }


def analyze_batch(pdf_dir: str | Path, output_path: str | Path = None) -> dict:
    """Analyze all PDFs in a directory and produce a summary report."""
    pdf_dir = Path(pdf_dir)
    pdfs = list(pdf_dir.glob("*.pdf"))

    results = []
    for pdf in pdfs:
        try:
            print(f"Analyzing: {pdf.name}...")
            analysis = analyze_pdf(pdf)
            results.append(analysis)
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({"file": pdf.name, "error": str(e)})

    # Aggregate patterns
    summary = _aggregate_patterns(results)

    report = {
        "total_pdfs": len(pdfs),
        "analyzed": len([r for r in results if "error" not in r]),
        "summary": summary,
        "individual_results": results,
    }

    if output_path:
        output_path = Path(output_path)
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        print(f"\nReport saved to: {output_path}")

    return report


def _aggregate_patterns(results: list[dict]) -> dict:
    """Aggregate patterns across all analyzed PDFs."""
    valid = [r for r in results if "error" not in r]
    if not valid:
        return {}

    all_fonts = Counter()
    all_colors = Counter()
    total_action_ratio = 0
    page_counts = []

    for r in valid:
        if "text_analysis" in r:
            for font, count in r["text_analysis"].get("fonts_used", {}).items():
                all_fonts[font] += count
        if "color_analysis" in r:
            for color, count in r["color_analysis"].get("accent_colors", {}).items():
                all_colors[color] += count
        if "content_patterns" in r:
            total_action_ratio += r["content_patterns"].get("action_title_ratio", 0)
        if "metadata" in r:
            page_counts.append(r["metadata"].get("page_count", 0))

    return {
        "most_common_fonts": dict(all_fonts.most_common(10)),
        "most_common_accent_colors": dict(all_colors.most_common(10)),
        "avg_action_title_ratio": round(total_action_ratio / len(valid), 2) if valid else 0,
        "avg_page_count": round(sum(page_counts) / len(page_counts), 1) if page_counts else 0,
        "total_pages_analyzed": sum(page_counts),
    }


if __name__ == "__main__":
    import sys
    pdf_dir = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\smont\Mckinsey claude\reference_pdfs"
    output = r"C:\Users\smont\Mckinsey claude\reference_pdfs\analysis_report.json"
    analyze_batch(pdf_dir, output)
