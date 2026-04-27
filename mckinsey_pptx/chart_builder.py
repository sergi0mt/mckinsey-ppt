"""
McKinsey-style chart builder using matplotlib.
Produces clean, annotated charts following consulting visualization standards.
Charts are rendered as images and embedded in PPTX slides.
"""
from __future__ import annotations
import io
from typing import Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from PIL import Image

from .config import CHART_DEFAULTS, COLORS
from .models import ChartSpec, ChartType


def _hex(rgb_color) -> str:
    """Convert RGBColor to hex string for matplotlib."""
    return f"#{rgb_color[0]:02x}{rgb_color[1]:02x}{rgb_color[2]:02x}"


def _apply_mckinsey_style(ax: plt.Axes, title: Optional[str] = None):
    """Apply McKinsey visual standards to a matplotlib axes."""
    ax.spines["top"].set_visible(CHART_DEFAULTS.SHOW_TOP_SPINE)
    ax.spines["right"].set_visible(CHART_DEFAULTS.SHOW_RIGHT_SPINE)
    ax.spines["left"].set_color("#666666")
    ax.spines["bottom"].set_color("#666666")
    ax.tick_params(colors="#666666", labelsize=CHART_DEFAULTS.MPL_TICK_SIZE)
    ax.set_facecolor("white")
    if title:
        ax.set_title(title, fontsize=CHART_DEFAULTS.MPL_TITLE_SIZE,
                      fontweight="bold", color="#333333", loc="left", pad=12)


def _add_so_what(ax: plt.Axes, text: str):
    """Add a 'so what' annotation box to the chart."""
    ax.annotate(
        text, xy=(0.98, 0.02), xycoords="axes fraction",
        fontsize=CHART_DEFAULTS.MPL_ANNOTATION_SIZE,
        ha="right", va="bottom",
        bbox=dict(boxstyle="round,pad=0.4", facecolor="#E8F0FE", edgecolor="#005182", alpha=0.9),
        color="#005182", fontweight="bold",
    )


def _add_source(fig: plt.Figure, source: str):
    """Add source citation at bottom of chart."""
    fig.text(0.02, 0.01, f"Source: {source}", fontsize=8, color="#999999",
             ha="left", va="bottom", style="italic")


def _chart_to_image(fig: plt.Figure) -> io.BytesIO:
    """Convert matplotlib figure to PNG bytes."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=CHART_DEFAULTS.DPI,
                bbox_inches="tight", facecolor="white", edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return buf


# =============================================================================
# CHART RENDERERS
# =============================================================================

def render_waterfall(spec: ChartSpec) -> io.BytesIO:
    """Render a McKinsey-style waterfall chart."""
    if not spec.series or not spec.series[0].values:
        raise ValueError("Waterfall chart requires at least one series with values")

    values = spec.series[0].values
    categories = spec.categories or [f"Item {i+1}" for i in range(len(values))]

    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, CHART_DEFAULTS.FIG_HEIGHT))

    cumulative = 0
    bottoms = []
    colors = []
    for i, v in enumerate(values):
        if i == 0 or i == len(values) - 1:
            bottoms.append(0)
            colors.append(CHART_DEFAULTS.WATERFALL_TOTAL)
        else:
            if v >= 0:
                bottoms.append(cumulative)
                colors.append(CHART_DEFAULTS.WATERFALL_POSITIVE)
            else:
                bottoms.append(cumulative + v)
                colors.append(CHART_DEFAULTS.WATERFALL_NEGATIVE)
        cumulative += v if (i != len(values) - 1) else 0

    bars = ax.bar(categories, [abs(v) if (i != 0 and i != len(values)-1) else v
                               for i, v in enumerate(values)],
                  bottom=bottoms, color=colors, width=CHART_DEFAULTS.BAR_WIDTH,
                  edgecolor="none")

    # Connector lines
    for i in range(len(values) - 1):
        top = bottoms[i] + (abs(values[i]) if (i != 0) else values[i])
        ax.plot([i - 0.3, i + 1.3], [top, top],
                color=CHART_DEFAULTS.WATERFALL_CONNECTOR, linewidth=0.8,
                linestyle="--", alpha=0.6)

    # Data labels
    for i, (bar, v) in enumerate(zip(bars, values)):
        label = f"{v:+.1f}" if (i != 0 and i != len(values)-1) else f"{v:.1f}"
        y_pos = bar.get_y() + bar.get_height() + 0.02 * max(abs(x) for x in values)
        ax.text(bar.get_x() + bar.get_width()/2, y_pos, label,
                ha="center", va="bottom", fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE,
                fontweight="bold", color="#333333")

    _apply_mckinsey_style(ax, spec.title)
    if spec.y_label:
        ax.set_ylabel(spec.y_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)
    if spec.so_what:
        _add_so_what(ax, spec.so_what)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    return _chart_to_image(fig)


def render_bar_chart(spec: ChartSpec, horizontal: bool = False) -> io.BytesIO:
    """Render a McKinsey-style bar chart (vertical or horizontal)."""
    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, CHART_DEFAULTS.FIG_HEIGHT))

    categories = spec.categories
    n_series = len(spec.series)
    x = np.arange(len(categories))
    total_width = CHART_DEFAULTS.BAR_WIDTH
    bar_width = total_width / n_series if n_series > 1 else total_width

    for i, s in enumerate(spec.series):
        color = s.color or _hex(COLORS.CHART_SERIES[i % len(COLORS.CHART_SERIES)])
        offset = (i - n_series/2 + 0.5) * bar_width if n_series > 1 else 0

        if horizontal:
            bars = ax.barh(x + offset, s.values, height=bar_width, label=s.name,
                           color=color, edgecolor="none")
            for bar, v in zip(bars, s.values):
                ax.text(bar.get_width() + 0.01 * max(abs(x) for x in s.values),
                        bar.get_y() + bar.get_height()/2,
                        f"{v:,.1f}", va="center", fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE - 1)
        else:
            bars = ax.bar(x + offset, s.values, width=bar_width, label=s.name,
                          color=color, edgecolor="none")
            for bar, v in zip(bars, s.values):
                ax.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                        f"{v:,.1f}", ha="center", va="bottom",
                        fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE - 1)

    if horizontal:
        ax.set_yticks(x)
        ax.set_yticklabels(categories)
        ax.xaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)
    else:
        ax.set_xticks(x)
        ax.set_xticklabels(categories, rotation=30 if len(categories) > 6 else 0, ha="right")
        ax.yaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)

    if n_series > 1:
        ax.legend(frameon=False, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE)

    _apply_mckinsey_style(ax, spec.title)
    if spec.x_label:
        ax.set_xlabel(spec.x_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    if spec.y_label:
        ax.set_ylabel(spec.y_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    ax.set_axisbelow(True)
    if spec.so_what:
        _add_so_what(ax, spec.so_what)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    return _chart_to_image(fig)


def render_stacked_bar(spec: ChartSpec) -> io.BytesIO:
    """Render a McKinsey-style stacked bar chart."""
    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, CHART_DEFAULTS.FIG_HEIGHT))

    categories = spec.categories
    x = np.arange(len(categories))
    bottom = np.zeros(len(categories))

    for i, s in enumerate(spec.series):
        color = s.color or _hex(COLORS.CHART_SERIES[i % len(COLORS.CHART_SERIES)])
        vals = np.array(s.values)
        ax.bar(x, vals, bottom=bottom, label=s.name, color=color,
               width=CHART_DEFAULTS.BAR_WIDTH, edgecolor="none")

        # Labels inside bars
        for j, (v, b) in enumerate(zip(vals, bottom)):
            if v > 0:
                ax.text(j, b + v/2, f"{v:.0f}", ha="center", va="center",
                        fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE - 2, color="white",
                        fontweight="bold")
        bottom += vals

    ax.set_xticks(x)
    ax.set_xticklabels(categories, rotation=30 if len(categories) > 6 else 0, ha="right")
    ax.legend(frameon=False, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, loc="upper right")
    _apply_mckinsey_style(ax, spec.title)
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)
    if spec.so_what:
        _add_so_what(ax, spec.so_what)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    return _chart_to_image(fig)


def render_line_chart(spec: ChartSpec) -> io.BytesIO:
    """Render a McKinsey-style line chart."""
    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, CHART_DEFAULTS.FIG_HEIGHT))

    for i, s in enumerate(spec.series):
        color = s.color or _hex(COLORS.CHART_SERIES[i % len(COLORS.CHART_SERIES)])
        ax.plot(spec.categories, s.values, label=s.name, color=color,
                linewidth=2.5, marker="o", markersize=5)

    if len(spec.series) > 1:
        ax.legend(frameon=False, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE)

    _apply_mckinsey_style(ax, spec.title)
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)
    if spec.x_label:
        ax.set_xlabel(spec.x_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    if spec.y_label:
        ax.set_ylabel(spec.y_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    if spec.so_what:
        _add_so_what(ax, spec.so_what)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    return _chart_to_image(fig)


def render_2x2_matrix(spec: ChartSpec) -> io.BytesIO:
    """Render a McKinsey-style 2x2 matrix."""
    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, CHART_DEFAULTS.FIG_HEIGHT))

    ax.axhline(y=0.5, color=CHART_DEFAULTS.MATRIX_LINE_COLOR,
               linewidth=CHART_DEFAULTS.MATRIX_LINE_WIDTH)
    ax.axvline(x=0.5, color=CHART_DEFAULTS.MATRIX_LINE_COLOR,
               linewidth=CHART_DEFAULTS.MATRIX_LINE_WIDTH)

    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    # Quadrant labels
    labels = spec.quadrant_labels or ["", "", "", ""]
    positions = [(0.25, 0.75), (0.75, 0.75), (0.25, 0.25), (0.75, 0.25)]
    for label, (x, y) in zip(labels, positions):
        ax.text(x, y, label, ha="center", va="center",
                fontsize=CHART_DEFAULTS.MPL_TITLE_SIZE, fontweight="bold",
                color="#005182", alpha=0.8)

    # Data points
    if spec.data_points:
        for pt in spec.data_points:
            size = pt.get("size", 100)
            ax.scatter(pt["x"], pt["y"], s=size, color="#005182",
                       alpha=0.7, edgecolors="#003050", linewidth=1.5, zorder=5)
            ax.annotate(pt["label"], (pt["x"], pt["y"]),
                        textcoords="offset points", xytext=(8, 8),
                        fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#333333")

    # Axis labels
    ax.set_xlabel(f"← {spec.x_axis_low or 'Low'}          "
                  f"{spec.x_axis_high or 'High'} →",
                  fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    ax.set_ylabel(f"← {spec.y_axis_low or 'Low'}          "
                  f"{spec.y_axis_high or 'High'} →",
                  fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")

    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)

    _apply_mckinsey_style(ax, spec.title)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_visible(False)

    if spec.so_what:
        _add_so_what(ax, spec.so_what)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    return _chart_to_image(fig)


def render_harvey_balls(spec: ChartSpec) -> io.BytesIO:
    """Render a Harvey balls comparison table."""
    items = spec.items or []
    headers = spec.score_headers or [f"Criterion {i+1}" for i in range(
        len(items[0]["scores"]) if items else 0)]

    n_rows = len(items)
    n_cols = len(headers)

    fig_height = max(3, 0.8 * n_rows + 1.5)
    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, fig_height))
    ax.set_xlim(-0.5, n_cols + 0.5)
    ax.set_ylim(-0.5, n_rows + 0.5)
    ax.set_aspect("equal")
    ax.axis("off")

    # Headers
    for j, header in enumerate(headers):
        ax.text(j + 1, n_rows + 0.2, header, ha="center", va="bottom",
                fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, fontweight="bold", color="#333333")

    # Rows
    for i, item in enumerate(items):
        y = n_rows - 1 - i
        ax.text(-0.3, y, item["name"], ha="left", va="center",
                fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#333333")

        for j, score in enumerate(item["scores"]):
            x = j + 1
            # Draw Harvey ball (0=empty, 1=quarter, 2=half, 3=three-quarter, 4=full)
            circle = plt.Circle((x, y), 0.25, fill=False, edgecolor="#666666", linewidth=1.5)
            ax.add_patch(circle)

            if score > 0:
                angle = 90 - (score / 4) * 360
                wedge = mpatches.Wedge((x, y), 0.25, angle, 90,
                                        facecolor="#005182", edgecolor="#005182")
                ax.add_patch(wedge)

    if spec.title:
        ax.set_title(spec.title, fontsize=CHART_DEFAULTS.MPL_TITLE_SIZE,
                      fontweight="bold", color="#333333", loc="left", pad=15)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout()
    return _chart_to_image(fig)


def render_bubble_chart(spec: ChartSpec) -> io.BytesIO:
    """Render a McKinsey-style bubble chart."""
    fig, ax = plt.subplots(figsize=(CHART_DEFAULTS.FIG_WIDTH, CHART_DEFAULTS.FIG_HEIGHT))

    if spec.data_points:
        for pt in spec.data_points:
            size = pt.get("size", 200)
            ax.scatter(pt["x"], pt["y"], s=size, color="#005182",
                       alpha=0.6, edgecolors="#003050", linewidth=1.5)
            ax.annotate(pt["label"], (pt["x"], pt["y"]),
                        textcoords="offset points", xytext=(10, 10),
                        fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#333333")

    _apply_mckinsey_style(ax, spec.title)
    ax.set_axisbelow(True)
    ax.yaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)
    ax.xaxis.grid(True, color=CHART_DEFAULTS.GRID_COLOR, alpha=CHART_DEFAULTS.GRID_ALPHA)
    if spec.x_label:
        ax.set_xlabel(spec.x_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    if spec.y_label:
        ax.set_ylabel(spec.y_label, fontsize=CHART_DEFAULTS.MPL_LABEL_SIZE, color="#666666")
    if spec.so_what:
        _add_so_what(ax, spec.so_what)
    if spec.source:
        _add_source(fig, spec.source)

    fig.tight_layout(rect=[0, 0.03, 1, 1])
    return _chart_to_image(fig)


# =============================================================================
# DISPATCHER
# =============================================================================

def render_chart(spec: ChartSpec) -> io.BytesIO:
    """Render a chart based on its type. Returns PNG image bytes."""
    renderers = {
        ChartType.WATERFALL: render_waterfall,
        ChartType.BAR_VERTICAL: lambda s: render_bar_chart(s, horizontal=False),
        ChartType.BAR_HORIZONTAL: lambda s: render_bar_chart(s, horizontal=True),
        ChartType.GROUPED_BAR: lambda s: render_bar_chart(s, horizontal=False),
        ChartType.STACKED_BAR: render_stacked_bar,
        ChartType.LINE: render_line_chart,
        ChartType.MATRIX_2X2: render_2x2_matrix,
        ChartType.HARVEY_BALLS: render_harvey_balls,
        ChartType.BUBBLE: render_bubble_chart,
        ChartType.SCATTER: render_bubble_chart,
    }

    renderer = renderers.get(spec.chart_type)
    if not renderer:
        raise ValueError(f"Unsupported chart type: {spec.chart_type}")

    return renderer(spec)
