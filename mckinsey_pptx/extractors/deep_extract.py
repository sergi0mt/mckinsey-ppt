"""
Deep pattern extraction from McKinsey reference PDFs.
Extracts action titles, section structures, bullet patterns, and content patterns
to build a real-world pattern library for the skill and validators.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from collections import Counter

import fitz  # PyMuPDF


def deep_extract_all(pdf_dir: str | Path, output_path: str | Path = None) -> dict:
    """Run deep extraction on all PDFs in directory."""
    pdf_dir = Path(pdf_dir)
    pdfs = sorted(pdf_dir.glob("*.pdf"))

    all_titles = []
    all_bullets = []
    all_section_structures = []
    title_verb_counter = Counter()
    title_length_counter = Counter()
    bullet_length_counter = Counter()
    slide_count_counter = Counter()
    font_size_by_position = {"top_quarter": Counter(), "middle": Counter(), "bottom_quarter": Counter()}

    for pdf_path in pdfs:
        try:
            print(f"Deep extracting: {pdf_path.name}...")
            result = _extract_single(pdf_path)
            all_titles.extend(result["titles"])
            all_bullets.extend(result["bullets"])
            all_section_structures.append(result["structure"])

            for t in result["titles"]:
                title_length_counter[len(t["text"].split())] += 1
                for verb in _extract_verbs(t["text"]):
                    title_verb_counter[verb] += 1

            for b in result["bullets"]:
                word_count = len(b.split())
                bucket = (word_count // 5) * 5  # group by 5s
                bullet_length_counter[f"{bucket}-{bucket+4} words"] += 1

            slide_count_counter[result["structure"]["page_count"]] += 1

        except Exception as e:
            print(f"  ERROR: {e}")

    # Classify action titles vs topic titles
    action_titles = [t for t in all_titles if t["is_action_title"]]
    topic_titles = [t for t in all_titles if not t["is_action_title"]]

    # Extract patterns from action titles
    action_title_patterns = _analyze_title_patterns(action_titles)

    report = {
        "summary": {
            "total_pdfs": len(pdfs),
            "total_titles_extracted": len(all_titles),
            "action_titles": len(action_titles),
            "topic_titles": len(topic_titles),
            "action_title_percentage": round(len(action_titles) / max(len(all_titles), 1) * 100, 1),
            "total_bullets_extracted": len(all_bullets),
            "avg_pages_per_deck": round(sum(s["page_count"] for s in all_section_structures) / max(len(all_section_structures), 1), 1),
        },
        "action_title_patterns": action_title_patterns,
        "title_verb_frequency": dict(title_verb_counter.most_common(40)),
        "title_word_count_distribution": dict(sorted(title_length_counter.items())),
        "bullet_length_distribution": dict(sorted(bullet_length_counter.items())),
        "sample_action_titles": [t["text"] for t in action_titles[:50]],
        "sample_topic_titles": [t["text"] for t in topic_titles[:30]],
        "sample_bullets": all_bullets[:50],
        "section_structures": all_section_structures,
    }

    if output_path:
        output_path = Path(output_path)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\nDeep extraction saved to: {output_path}")

    return report


def _extract_single(pdf_path: Path) -> dict:
    """Extract titles, bullets, and structure from a single PDF."""
    doc = fitz.open(str(pdf_path))
    titles = []
    bullets = []
    section_headers = []
    max_pages = min(len(doc), 50)

    for page_num in range(max_pages):
        page = doc[page_num]
        page_height = page.rect.height
        page_width = page.rect.width
        blocks = page.get_text("dict")["blocks"]

        page_spans = []
        for block in blocks:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span.get("text", "").strip()
                    if text and len(text) > 3:
                        page_spans.append({
                            "text": text,
                            "size": round(span.get("size", 0), 1),
                            "font": span.get("font", ""),
                            "bold": "Bold" in span.get("font", "") or "bold" in span.get("font", "").lower(),
                            "y": span["origin"][1],
                            "x": span["origin"][0],
                            "y_ratio": span["origin"][1] / page_height if page_height > 0 else 0,
                        })

        if not page_spans:
            continue

        # Find max font size on this page
        max_size = max(s["size"] for s in page_spans)

        # Titles: largest text in top 30% of page
        top_spans = [s for s in page_spans if s["y_ratio"] < 0.30]
        title_spans = [s for s in top_spans if s["size"] >= max_size * 0.85]

        for ts in title_spans:
            text = ts["text"]
            if len(text) < 5 or text.isdigit():
                continue

            is_action = _is_action_title(text)
            titles.append({
                "text": text,
                "page": page_num,
                "file": pdf_path.name,
                "size": ts["size"],
                "bold": ts["bold"],
                "is_action_title": is_action,
                "word_count": len(text.split()),
            })

            # Check if it's a section header (very large, bold, short)
            if ts["bold"] and len(text.split()) <= 6 and ts["size"] >= max_size * 0.95:
                section_headers.append({"text": text, "page": page_num})

        # Bullets: text starting with bullet chars or following bullet patterns
        for s in page_spans:
            text = s["text"]
            if (text.startswith(("•", "–", "—", "►", "■", "●", "○", "▪", "‣")) or
                re.match(r'^[\-]\s', text) or
                (s["x"] > page_width * 0.08 and s["size"] < max_size * 0.8 and
                 s["y_ratio"] > 0.2 and not s["bold"])):
                # Clean bullet char
                clean = re.sub(r'^[•–—►■●○▪‣\-]\s*', '', text).strip()
                if clean and len(clean) > 5:
                    bullets.append(clean)

    structure = {
        "file": pdf_path.name,
        "page_count": len(doc),
        "section_count": len(section_headers),
        "sections": [s["text"] for s in section_headers],
        "titles_found": len(titles),
        "action_titles_found": sum(1 for t in titles if t["is_action_title"]),
        "bullets_found": len(bullets),
    }

    doc.close()
    return {"titles": titles, "bullets": bullets, "structure": structure}


def _is_action_title(text: str) -> bool:
    """Determine if a title is an action title (conclusion) vs topic label."""
    text_lower = text.lower().strip()

    # Topic indicators (NOT action titles)
    topic_starters = [
        "table of contents", "agenda", "appendix", "overview", "introduction",
        "background", "context", "contents", "index", "disclaimer",
        "confidential", "draft", "exhibit", "figure", "source",
    ]
    if any(text_lower.startswith(w) for w in topic_starters):
        return False

    # Too short to be an action title
    if len(text.split()) < 5:
        return False

    # Contains action verbs typical of McKinsey conclusions
    action_verbs = [
        r'\b(will|should|must|need|can|could|would|may)\b',
        r'\b(increase|decrease|reduce|improve|drive|enable|create|generate)\b',
        r'\b(represent|account|grow|reach|exceed|decline|rise|fall)\b',
        r'\b(require|suggest|indicate|demonstrate|show|reveal|highlight)\b',
        r'\b(offer|provide|support|address|deliver|achieve|ensure)\b',
        r'\b(is|are|has|have|remains|leads|results|emerges)\b',
        r'\b(transform|accelerate|optimize|strengthen|expand|capture)\b',
        r'\b(outperform|underperform|lag|surpass|dominate|disrupt)\b',
    ]
    has_verb = any(re.search(v, text_lower) for v in action_verbs)

    # Contains quantifiers (numbers, percentages, dollar amounts)
    has_quant = bool(re.search(r'(\d+%|\$\d|\d+\s*(million|billion|M|B|K|x|pp|bps))', text))

    # Comparative language
    has_comparison = bool(re.search(r'\b(more|less|higher|lower|faster|slower|larger|smaller|better|worse|most|least|top|bottom)\b', text_lower))

    # Long enough to be a sentence
    is_sentence_length = len(text.split()) >= 6

    return (has_verb or has_quant or has_comparison) and is_sentence_length


def _extract_verbs(text: str) -> list[str]:
    """Extract action verbs from a title text."""
    verbs = [
        "will", "should", "must", "need", "can", "could",
        "increase", "decrease", "reduce", "improve", "drive", "enable", "create",
        "represent", "account", "grow", "reach", "exceed", "decline",
        "require", "suggest", "indicate", "show", "reveal",
        "offer", "provide", "support", "deliver", "achieve",
        "transform", "accelerate", "optimize", "expand", "capture",
        "is", "are", "has", "have", "remains", "leads",
        "outperform", "dominate", "disrupt",
    ]
    found = []
    text_lower = text.lower()
    for v in verbs:
        if re.search(rf'\b{v}\b', text_lower):
            found.append(v)
    return found


def _analyze_title_patterns(action_titles: list[dict]) -> dict:
    """Analyze patterns in confirmed action titles."""
    if not action_titles:
        return {}

    # Word count stats
    word_counts = [t["word_count"] for t in action_titles]
    avg_words = sum(word_counts) / len(word_counts)

    # Opening word patterns
    opener_counter = Counter()
    for t in action_titles:
        first_word = t["text"].split()[0] if t["text"].split() else ""
        opener_counter[first_word] += 1

    # Sentence structure patterns
    has_number = sum(1 for t in action_titles if re.search(r'\d', t["text"]))
    has_percent = sum(1 for t in action_titles if '%' in t["text"])
    has_dollar = sum(1 for t in action_titles if '$' in t["text"])
    has_comparison = sum(1 for t in action_titles
                         if re.search(r'\b(more|less|higher|lower|most|least|top)\b', t["text"].lower()))

    return {
        "count": len(action_titles),
        "avg_word_count": round(avg_words, 1),
        "min_word_count": min(word_counts),
        "max_word_count": max(word_counts),
        "median_word_count": sorted(word_counts)[len(word_counts) // 2],
        "pct_with_numbers": round(has_number / len(action_titles) * 100, 1),
        "pct_with_percentages": round(has_percent / len(action_titles) * 100, 1),
        "pct_with_dollar": round(has_dollar / len(action_titles) * 100, 1),
        "pct_with_comparison": round(has_comparison / len(action_titles) * 100, 1),
        "top_opening_words": dict(opener_counter.most_common(20)),
    }


if __name__ == "__main__":
    deep_extract_all(
        r"C:\Users\smont\Mckinsey claude\reference_pdfs",
        r"C:\Users\smont\Mckinsey claude\reference_pdfs\deep_patterns.json",
    )
