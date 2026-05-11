"""Color palette themes for the DeepResearch-style slide viewer.

Ported verbatim from sergi0mt/deepresearch (backend/app/api/agent.py L605-733).
Each theme has dark + light variants. The `_resolve_palette` helper adds a
synthetic "dim" mode that blends dark backgrounds toward light with high-
contrast text — useful for screen-sharing in well-lit rooms.

Palette fields documented at backend/app/api/agent.py L598-604.
"""
from __future__ import annotations
from typing import Any


# ── Theme color palettes for HTML output generation ──────────────────────────
THEME_PALETTES: dict[str, dict[str, dict[str, str]]] = {
    # Each palette: bg, card_bg, card_border, highlight_bg, text, text_secondary, heading,
    # accent1, accent2, accent3, accent4, border, gradient_start, gradient_end,
    # badge_bg, badge_text, success, warning, error, kpi_text, divider_accent,
    # chart_1..chart_4 (for bar charts, progress bars), font_heading, font_body
    "default": {
        "dark":  {"bg": "#0c1525", "card_bg": "#132040", "card_border": "#1e3050", "highlight_bg": "#162848", "text": "#e2e8f0", "text_secondary": "#94a3b8", "heading": "#60a5fa", "accent1": "#3b82f6", "accent2": "#10b981", "accent3": "#f59e0b", "accent4": "#8b5cf6", "border": "#1e3050", "gradient_start": "#1e3a5f", "gradient_end": "#0c1525", "badge_bg": "#1e3a5f", "badge_text": "#93c5fd", "success": "#10b981", "warning": "#f59e0b", "error": "#ef4444", "kpi_text": "#60a5fa", "divider_accent": "#3b82f6", "chart_1": "#3b82f6", "chart_2": "#10b981", "chart_3": "#f59e0b", "chart_4": "#8b5cf6", "font_heading": "'Inter', 'Segoe UI', sans-serif", "font_body": "'Inter', 'Segoe UI', sans-serif"},
        "light": {"bg": "#f0f5ff", "card_bg": "#ffffff", "card_border": "#dae1f0", "highlight_bg": "#dbeafe", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#1d4ed8", "accent1": "#2563eb", "accent2": "#059669", "accent3": "#d97706", "accent4": "#7c3aed", "border": "#dae1f0", "gradient_start": "#2563eb", "gradient_end": "#60a5fa", "badge_bg": "#dbeafe", "badge_text": "#1d4ed8", "success": "#059669", "warning": "#d97706", "error": "#dc2626", "kpi_text": "#1d4ed8", "divider_accent": "#2563eb", "chart_1": "#2563eb", "chart_2": "#059669", "chart_3": "#d97706", "chart_4": "#7c3aed", "font_heading": "'Inter', 'Segoe UI', sans-serif", "font_body": "'Inter', 'Segoe UI', sans-serif"},
    },
    "midnight": {
        "dark":  {"bg": "#141430", "card_bg": "#1c1c40", "card_border": "#2c2c52", "highlight_bg": "#202048", "text": "#e2e8f0", "text_secondary": "#94a3b8", "heading": "#fbbf24", "accent1": "#fbbf24", "accent2": "#f59e0b", "accent3": "#a78bfa", "accent4": "#f472b6", "border": "#2c2c52", "gradient_start": "#44337a", "gradient_end": "#141430", "badge_bg": "#3b2d6e", "badge_text": "#fbbf24", "success": "#34d399", "warning": "#fbbf24", "error": "#f87171", "kpi_text": "#fde68a", "divider_accent": "#fbbf24", "chart_1": "#fbbf24", "chart_2": "#a78bfa", "chart_3": "#f472b6", "chart_4": "#34d399", "font_heading": "'Playfair Display', Georgia, serif", "font_body": "'Source Sans Pro', 'Segoe UI', sans-serif"},
        "light": {"bg": "#fef9ef", "card_bg": "#ffffff", "card_border": "#ebe1c8", "highlight_bg": "#fef3c7", "text": "#1c1917", "text_secondary": "#78716c", "heading": "#92400e", "accent1": "#b45309", "accent2": "#92400e", "accent3": "#6d28d9", "accent4": "#be185d", "border": "#ebe1c8", "gradient_start": "#b45309", "gradient_end": "#d97706", "badge_bg": "#fef3c7", "badge_text": "#92400e", "success": "#047857", "warning": "#b45309", "error": "#b91c1c", "kpi_text": "#92400e", "divider_accent": "#b45309", "chart_1": "#b45309", "chart_2": "#6d28d9", "chart_3": "#be185d", "chart_4": "#047857", "font_heading": "'Playfair Display', Georgia, serif", "font_body": "'Source Sans Pro', 'Segoe UI', sans-serif"},
    },
    "nord": {
        "dark":  {"bg": "#2e3440", "card_bg": "#3b4252", "card_border": "#434c5e", "highlight_bg": "#353d4b", "text": "#eceff4", "text_secondary": "#d8dee9", "heading": "#88c0d0", "accent1": "#88c0d0", "accent2": "#5e81ac", "accent3": "#a3be8c", "accent4": "#b48ead", "border": "#3b4252", "gradient_start": "#4c566a", "gradient_end": "#2e3440", "badge_bg": "#3b4252", "badge_text": "#88c0d0", "success": "#a3be8c", "warning": "#ebcb8b", "error": "#bf616a", "kpi_text": "#8fbcbb", "divider_accent": "#81a1c1", "chart_1": "#88c0d0", "chart_2": "#a3be8c", "chart_3": "#ebcb8b", "chart_4": "#b48ead", "font_heading": "'IBM Plex Sans', 'Segoe UI', sans-serif", "font_body": "'IBM Plex Sans', 'Segoe UI', sans-serif"},
        "light": {"bg": "#eceff4", "card_bg": "#ffffff", "card_border": "#d8dee9", "highlight_bg": "#e0e8f0", "text": "#2e3440", "text_secondary": "#4c566a", "heading": "#2e5a88", "accent1": "#5e81ac", "accent2": "#4c6e96", "accent3": "#688a50", "accent4": "#8a6498", "border": "#d8dee9", "gradient_start": "#5e81ac", "gradient_end": "#81a1c1", "badge_bg": "#e0e8f0", "badge_text": "#2e5a88", "success": "#688a50", "warning": "#c48a30", "error": "#a0404a", "kpi_text": "#2e5a88", "divider_accent": "#5e81ac", "chart_1": "#5e81ac", "chart_2": "#688a50", "chart_3": "#c48a30", "chart_4": "#8a6498", "font_heading": "'IBM Plex Sans', 'Segoe UI', sans-serif", "font_body": "'IBM Plex Sans', 'Segoe UI', sans-serif"},
    },
    "rosepine": {
        "dark":  {"bg": "#191724", "card_bg": "#1f1d2e", "card_border": "#2c2a3e", "highlight_bg": "#241f35", "text": "#e0def4", "text_secondary": "#908caa", "heading": "#ebbcba", "accent1": "#ebbcba", "accent2": "#c4a7e7", "accent3": "#f6c177", "accent4": "#9ccfd8", "border": "#2c2a3e", "gradient_start": "#3e3558", "gradient_end": "#191724", "badge_bg": "#302a48", "badge_text": "#ebbcba", "success": "#9ccfd8", "warning": "#f6c177", "error": "#eb6f92", "kpi_text": "#ebbcba", "divider_accent": "#c4a7e7", "chart_1": "#ebbcba", "chart_2": "#c4a7e7", "chart_3": "#f6c177", "chart_4": "#9ccfd8", "font_heading": "'Lora', Georgia, serif", "font_body": "'Nunito', 'Segoe UI', sans-serif"},
        "light": {"bg": "#faf4ed", "card_bg": "#fffaf3", "card_border": "#ebe1d7", "highlight_bg": "#f2e9e1", "text": "#3c3a52", "text_secondary": "#575279", "heading": "#9a5070", "accent1": "#b4788c", "accent2": "#907aa9", "accent3": "#c4833e", "accent4": "#568a90", "border": "#ebe1d7", "gradient_start": "#b4788c", "gradient_end": "#d4a0b0", "badge_bg": "#f2e9e1", "badge_text": "#9a5070", "success": "#568a90", "warning": "#c4833e", "error": "#b4394e", "kpi_text": "#9a5070", "divider_accent": "#b4788c", "chart_1": "#b4788c", "chart_2": "#907aa9", "chart_3": "#c4833e", "chart_4": "#568a90", "font_heading": "'Lora', Georgia, serif", "font_body": "'Nunito', 'Segoe UI', sans-serif"},
    },
    "dracula": {
        "dark":  {"bg": "#282a36", "card_bg": "#313341", "card_border": "#44475a", "highlight_bg": "#353748", "text": "#f8f8f2", "text_secondary": "#6272a4", "heading": "#bd93f9", "accent1": "#bd93f9", "accent2": "#ff79c6", "accent3": "#50fa7b", "accent4": "#ffb86c", "border": "#44475a", "gradient_start": "#44475a", "gradient_end": "#282a36", "badge_bg": "#44475a", "badge_text": "#bd93f9", "success": "#50fa7b", "warning": "#f1fa8c", "error": "#ff5555", "kpi_text": "#8be9fd", "divider_accent": "#ff79c6", "chart_1": "#bd93f9", "chart_2": "#50fa7b", "chart_3": "#ffb86c", "chart_4": "#ff79c6", "font_heading": "'Fira Sans', 'Segoe UI', sans-serif", "font_body": "'Fira Sans', 'Segoe UI', sans-serif"},
        "light": {"bg": "#f4f0fa", "card_bg": "#ffffff", "card_border": "#e1daf0", "highlight_bg": "#ede5f8", "text": "#282a36", "text_secondary": "#6272a4", "heading": "#6d28d9", "accent1": "#8c64d6", "accent2": "#d64bab", "accent3": "#2ea050", "accent4": "#d48530", "border": "#e1daf0", "gradient_start": "#8c64d6", "gradient_end": "#a78bdb", "badge_bg": "#ede5f8", "badge_text": "#6d28d9", "success": "#2ea050", "warning": "#c09020", "error": "#c03030", "kpi_text": "#6d28d9", "divider_accent": "#8c64d6", "chart_1": "#8c64d6", "chart_2": "#2ea050", "chart_3": "#d48530", "chart_4": "#d64bab", "font_heading": "'Fira Sans', 'Segoe UI', sans-serif", "font_body": "'Fira Sans', 'Segoe UI', sans-serif"},
    },
    "ocean": {
        "dark":  {"bg": "#0a1e30", "card_bg": "#122a40", "card_border": "#1a3850", "highlight_bg": "#163248", "text": "#e2e8f0", "text_secondary": "#94a3b8", "heading": "#22d3ee", "accent1": "#22d3ee", "accent2": "#06b6d4", "accent3": "#2dd4bf", "accent4": "#818cf8", "border": "#1a3850", "gradient_start": "#164e63", "gradient_end": "#0a1e30", "badge_bg": "#164e63", "badge_text": "#67e8f9", "success": "#2dd4bf", "warning": "#fbbf24", "error": "#f87171", "kpi_text": "#22d3ee", "divider_accent": "#06b6d4", "chart_1": "#22d3ee", "chart_2": "#2dd4bf", "chart_3": "#818cf8", "chart_4": "#fbbf24", "font_heading": "'Montserrat', 'Segoe UI', sans-serif", "font_body": "'Open Sans', 'Segoe UI', sans-serif"},
        "light": {"bg": "#f0fafb", "card_bg": "#ffffff", "card_border": "#d2e6eb", "highlight_bg": "#cffafe", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#0e7490", "accent1": "#0696b4", "accent2": "#057896", "accent3": "#0d9488", "accent4": "#6366f1", "border": "#d2e6eb", "gradient_start": "#0696b4", "gradient_end": "#22d3ee", "badge_bg": "#cffafe", "badge_text": "#0e7490", "success": "#0d9488", "warning": "#b45309", "error": "#b91c1c", "kpi_text": "#0e7490", "divider_accent": "#0696b4", "chart_1": "#0696b4", "chart_2": "#0d9488", "chart_3": "#6366f1", "chart_4": "#b45309", "font_heading": "'Montserrat', 'Segoe UI', sans-serif", "font_body": "'Open Sans', 'Segoe UI', sans-serif"},
    },
    "solarized": {
        "dark":  {"bg": "#002b36", "card_bg": "#073642", "card_border": "#586e75", "highlight_bg": "#0a3d4a", "text": "#839496", "text_secondary": "#586e75", "heading": "#b58900", "accent1": "#b58900", "accent2": "#cb4b16", "accent3": "#268bd2", "accent4": "#6c71c4", "border": "#586e75", "gradient_start": "#073642", "gradient_end": "#002b36", "badge_bg": "#073642", "badge_text": "#b58900", "success": "#859900", "warning": "#b58900", "error": "#dc322f", "kpi_text": "#b58900", "divider_accent": "#268bd2", "chart_1": "#b58900", "chart_2": "#268bd2", "chart_3": "#859900", "chart_4": "#d33682", "font_heading": "'Roboto Slab', Georgia, serif", "font_body": "'Roboto', 'Segoe UI', sans-serif"},
        "light": {"bg": "#fdf6e3", "card_bg": "#fffcf0", "card_border": "#dcd2b9", "highlight_bg": "#f5edc8", "text": "#394b54", "text_secondary": "#586e75", "heading": "#9a7600", "accent1": "#b58900", "accent2": "#cb4b16", "accent3": "#268bd2", "accent4": "#6c71c4", "border": "#dcd2b9", "gradient_start": "#b58900", "gradient_end": "#d4a017", "badge_bg": "#f5edc8", "badge_text": "#9a7600", "success": "#6a8000", "warning": "#9a7600", "error": "#b52020", "kpi_text": "#9a7600", "divider_accent": "#268bd2", "chart_1": "#b58900", "chart_2": "#268bd2", "chart_3": "#6a8000", "chart_4": "#b52080", "font_heading": "'Roboto Slab', Georgia, serif", "font_body": "'Roboto', 'Segoe UI', sans-serif"},
    },
    "futuristic": {
        "dark":  {"bg": "#081c2c", "card_bg": "#0e2840", "card_border": "#0a3a58", "highlight_bg": "#103248", "text": "#e2e8f0", "text_secondary": "#80a0b0", "heading": "#00d2ff", "accent1": "#00d2ff", "accent2": "#00a0cc", "accent3": "#00ffa0", "accent4": "#a855f7", "border": "#0a3a58", "gradient_start": "#0a3a58", "gradient_end": "#081c2c", "badge_bg": "#003250", "badge_text": "#00d2ff", "success": "#00ffa0", "warning": "#fbbf24", "error": "#ff3860", "kpi_text": "#00d2ff", "divider_accent": "#00a0cc", "chart_1": "#00d2ff", "chart_2": "#00ffa0", "chart_3": "#a855f7", "chart_4": "#ff3860", "font_heading": "'Orbitron', 'Rajdhani', sans-serif", "font_body": "'Rajdhani', 'Exo 2', sans-serif"},
        "light": {"bg": "#edf2f7", "card_bg": "#ffffff", "card_border": "#d2dceb", "highlight_bg": "#d0ecf4", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#007a9a", "accent1": "#00a0c8", "accent2": "#0082aa", "accent3": "#00885a", "accent4": "#7c3aed", "border": "#d2dceb", "gradient_start": "#00a0c8", "gradient_end": "#33c3e0", "badge_bg": "#d0ecf4", "badge_text": "#007a9a", "success": "#00885a", "warning": "#b45309", "error": "#c01030", "kpi_text": "#007a9a", "divider_accent": "#00a0c8", "chart_1": "#00a0c8", "chart_2": "#00885a", "chart_3": "#7c3aed", "chart_4": "#c01030", "font_heading": "'Orbitron', 'Rajdhani', sans-serif", "font_body": "'Rajdhani', 'Exo 2', sans-serif"},
    },
    "classic": {
        "dark":  {"bg": "#181838", "card_bg": "#222050", "card_border": "#302e5e", "highlight_bg": "#282660", "text": "#e2e8f0", "text_secondary": "#94a3b8", "heading": "#818cf8", "accent1": "#6366f1", "accent2": "#4338ca", "accent3": "#ec4899", "accent4": "#14b8a6", "border": "#302e5e", "gradient_start": "#3730a3", "gradient_end": "#181838", "badge_bg": "#312e81", "badge_text": "#a5b4fc", "success": "#14b8a6", "warning": "#f59e0b", "error": "#ef4444", "kpi_text": "#818cf8", "divider_accent": "#6366f1", "chart_1": "#6366f1", "chart_2": "#ec4899", "chart_3": "#14b8a6", "chart_4": "#f59e0b", "font_heading": "'Merriweather', Georgia, serif", "font_body": "'Source Sans Pro', 'Segoe UI', sans-serif"},
        "light": {"bg": "#f5f3ff", "card_bg": "#ffffff", "card_border": "#dcd7f0", "highlight_bg": "#ede9fe", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#4338ca", "accent1": "#6366f1", "accent2": "#4338ca", "accent3": "#be185d", "accent4": "#0d9488", "border": "#dcd7f0", "gradient_start": "#6366f1", "gradient_end": "#818cf8", "badge_bg": "#ede9fe", "badge_text": "#4338ca", "success": "#0d9488", "warning": "#d97706", "error": "#dc2626", "kpi_text": "#4338ca", "divider_accent": "#6366f1", "chart_1": "#6366f1", "chart_2": "#be185d", "chart_3": "#0d9488", "chart_4": "#d97706", "font_heading": "'Merriweather', Georgia, serif", "font_body": "'Source Sans Pro', 'Segoe UI', sans-serif"},
    },
    "alexandria": {
        "dark":  {"bg": "#231e1c", "card_bg": "#2e2824", "card_border": "#413a32", "highlight_bg": "#322b25", "text": "#e2d8c8", "text_secondary": "#a09080", "heading": "#d4af37", "accent1": "#d4af37", "accent2": "#b49430", "accent3": "#c07850", "accent4": "#8a9a6a", "border": "#413a32", "gradient_start": "#5a4a28", "gradient_end": "#231e1c", "badge_bg": "#413a32", "badge_text": "#d4af37", "success": "#8a9a6a", "warning": "#d4af37", "error": "#c06040", "kpi_text": "#e8c848", "divider_accent": "#b49430", "chart_1": "#d4af37", "chart_2": "#c07850", "chart_3": "#8a9a6a", "chart_4": "#a08060", "font_heading": "'Cormorant Garamond', Georgia, serif", "font_body": "'EB Garamond', Georgia, serif"},
        "light": {"bg": "#f5f0e8", "card_bg": "#fffcf5", "card_border": "#e1d7c8", "highlight_bg": "#ede4d4", "text": "#1c1917", "text_secondary": "#78716c", "heading": "#7a6018", "accent1": "#aa8828", "accent2": "#8c6e1e", "accent3": "#905838", "accent4": "#607040", "border": "#e1d7c8", "gradient_start": "#aa8828", "gradient_end": "#c8a848", "badge_bg": "#ede4d4", "badge_text": "#7a6018", "success": "#607040", "warning": "#aa8828", "error": "#903828", "kpi_text": "#7a6018", "divider_accent": "#aa8828", "chart_1": "#aa8828", "chart_2": "#905838", "chart_3": "#607040", "chart_4": "#785030", "font_heading": "'Cormorant Garamond', Georgia, serif", "font_body": "'EB Garamond', Georgia, serif"},
    },
    "bauhaus": {
        "dark":  {"bg": "#221420", "card_bg": "#2e1c2a", "card_border": "#3e2838", "highlight_bg": "#342030", "text": "#e2e8f0", "text_secondary": "#94a3b8", "heading": "#e85450", "accent1": "#dc322f", "accent2": "#b4281e", "accent3": "#2563eb", "accent4": "#fbbf24", "border": "#3e2838", "gradient_start": "#5c1a18", "gradient_end": "#221420", "badge_bg": "#4c1510", "badge_text": "#fca5a5", "success": "#4ade80", "warning": "#fbbf24", "error": "#ef4444", "kpi_text": "#fbbf24", "divider_accent": "#dc322f", "chart_1": "#dc322f", "chart_2": "#2563eb", "chart_3": "#fbbf24", "chart_4": "#000000", "font_heading": "'Bebas Neue', 'Impact', sans-serif", "font_body": "'DM Sans', 'Segoe UI', sans-serif"},
        "light": {"bg": "#fff8f7", "card_bg": "#ffffff", "card_border": "#ebdcda", "highlight_bg": "#fee2e2", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#991b1b", "accent1": "#c82d2a", "accent2": "#a02320", "accent3": "#1d4ed8", "accent4": "#ca8a04", "border": "#ebdcda", "gradient_start": "#c82d2a", "gradient_end": "#e85450", "badge_bg": "#fee2e2", "badge_text": "#991b1b", "success": "#16a34a", "warning": "#ca8a04", "error": "#dc2626", "kpi_text": "#991b1b", "divider_accent": "#c82d2a", "chart_1": "#c82d2a", "chart_2": "#1d4ed8", "chart_3": "#ca8a04", "chart_4": "#1e293b", "font_heading": "'Bebas Neue', 'Impact', sans-serif", "font_body": "'DM Sans', 'Segoe UI', sans-serif"},
    },
    "carbon": {
        "dark":  {"bg": "#161618", "card_bg": "#1e1e22", "card_border": "#2a2a30", "highlight_bg": "#222228", "text": "#e2e8f0", "text_secondary": "#6a6a78", "heading": "#00e6aa", "accent1": "#00c896", "accent2": "#00a078", "accent3": "#3b82f6", "accent4": "#a855f7", "border": "#2a2a30", "gradient_start": "#003828", "gradient_end": "#161618", "badge_bg": "#003828", "badge_text": "#00e6aa", "success": "#00e6aa", "warning": "#fbbf24", "error": "#ff4040", "kpi_text": "#00e6aa", "divider_accent": "#00c896", "chart_1": "#00c896", "chart_2": "#3b82f6", "chart_3": "#a855f7", "chart_4": "#fbbf24", "font_heading": "'JetBrains Mono', 'Fira Code', monospace", "font_body": "'IBM Plex Mono', 'Consolas', monospace"},
        "light": {"bg": "#f0f2f4", "card_bg": "#ffffff", "card_border": "#d7dade", "highlight_bg": "#dcfce7", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#047857", "accent1": "#00a078", "accent2": "#008264", "accent3": "#2563eb", "accent4": "#7c3aed", "border": "#d7dade", "gradient_start": "#00a078", "gradient_end": "#34d399", "badge_bg": "#dcfce7", "badge_text": "#047857", "success": "#047857", "warning": "#b45309", "error": "#b91c1c", "kpi_text": "#047857", "divider_accent": "#00a078", "chart_1": "#00a078", "chart_2": "#2563eb", "chart_3": "#7c3aed", "chart_4": "#b45309", "font_heading": "'JetBrains Mono', 'Fira Code', monospace", "font_body": "'IBM Plex Mono', 'Consolas', monospace"},
    },
    "neontokyo": {
        "dark":  {"bg": "#140820", "card_bg": "#1e1030", "card_border": "#301848", "highlight_bg": "#241438", "text": "#e2e8f0", "text_secondary": "#906498", "heading": "#ff50aa", "accent1": "#ff3296", "accent2": "#c81e78", "accent3": "#00d4ff", "accent4": "#ffe14c", "border": "#301848", "gradient_start": "#4a1050", "gradient_end": "#140820", "badge_bg": "#3a0840", "badge_text": "#ff80c8", "success": "#00ffa0", "warning": "#ffe14c", "error": "#ff3860", "kpi_text": "#ff50aa", "divider_accent": "#c81e78", "chart_1": "#ff3296", "chart_2": "#00d4ff", "chart_3": "#ffe14c", "chart_4": "#00ffa0", "font_heading": "'Audiowide', 'Orbitron', sans-serif", "font_body": "'Exo 2', 'Rajdhani', sans-serif"},
        "light": {"bg": "#fdf0f5", "card_bg": "#ffffff", "card_border": "#eedae4", "highlight_bg": "#fce7f3", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#9d174d", "accent1": "#d22878", "accent2": "#b41e64", "accent3": "#0284c7", "accent4": "#ca8a04", "border": "#eedae4", "gradient_start": "#d22878", "gradient_end": "#f472b6", "badge_bg": "#fce7f3", "badge_text": "#9d174d", "success": "#047857", "warning": "#ca8a04", "error": "#b91c1c", "kpi_text": "#9d174d", "divider_accent": "#d22878", "chart_1": "#d22878", "chart_2": "#0284c7", "chart_3": "#ca8a04", "chart_4": "#047857", "font_heading": "'Audiowide', 'Orbitron', sans-serif", "font_body": "'Exo 2', 'Rajdhani', sans-serif"},
    },
    "terra": {
        "dark":  {"bg": "#1a2418", "card_bg": "#243020", "card_border": "#384830", "highlight_bg": "#2c3828", "text": "#d8e8c8", "text_secondary": "#7a8a6a", "heading": "#8cd860", "accent1": "#78c850", "accent2": "#5aa03c", "accent3": "#d4a44c", "accent4": "#60a0b0", "border": "#384830", "gradient_start": "#2d4a1e", "gradient_end": "#1a2418", "badge_bg": "#2d4a1e", "badge_text": "#a8e878", "success": "#78c850", "warning": "#d4a44c", "error": "#d06040", "kpi_text": "#8cd860", "divider_accent": "#5aa03c", "chart_1": "#78c850", "chart_2": "#d4a44c", "chart_3": "#60a0b0", "chart_4": "#d06040", "font_heading": "'Bitter', Georgia, serif", "font_body": "'Cabin', 'Segoe UI', sans-serif"},
        "light": {"bg": "#f2f7ee", "card_bg": "#ffffff", "card_border": "#d7e4cd", "highlight_bg": "#dcfce7", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#2d6a1e", "accent1": "#5aa03c", "accent2": "#46822d", "accent3": "#9a7020", "accent4": "#3a7888", "border": "#d7e4cd", "gradient_start": "#5aa03c", "gradient_end": "#78c850", "badge_bg": "#dcfce7", "badge_text": "#2d6a1e", "success": "#2d6a1e", "warning": "#9a7020", "error": "#a04028", "kpi_text": "#2d6a1e", "divider_accent": "#5aa03c", "chart_1": "#5aa03c", "chart_2": "#9a7020", "chart_3": "#3a7888", "chart_4": "#a04028", "font_heading": "'Bitter', Georgia, serif", "font_body": "'Cabin', 'Segoe UI', sans-serif"},
    },
    "sahara": {
        "dark":  {"bg": "#231c14", "card_bg": "#2e2418", "card_border": "#463828", "highlight_bg": "#352a1c", "text": "#e8d8c0", "text_secondary": "#a08868", "heading": "#f0b050", "accent1": "#f0a032", "accent2": "#c88028", "accent3": "#e06040", "accent4": "#60a890", "border": "#463828", "gradient_start": "#5a3e18", "gradient_end": "#231c14", "badge_bg": "#4a3418", "badge_text": "#f0c878", "success": "#60a890", "warning": "#f0a032", "error": "#e06040", "kpi_text": "#f0b050", "divider_accent": "#c88028", "chart_1": "#f0a032", "chart_2": "#e06040", "chart_3": "#60a890", "chart_4": "#a08060", "font_heading": "'Josefin Sans', 'Segoe UI', sans-serif", "font_body": "'Quicksand', 'Segoe UI', sans-serif"},
        "light": {"bg": "#fbf5ea", "card_bg": "#ffffff", "card_border": "#e6dac6", "highlight_bg": "#fef3c7", "text": "#1e293b", "text_secondary": "#64748b", "heading": "#8a5a18", "accent1": "#c88028", "accent2": "#a86920", "accent3": "#b84428", "accent4": "#3a7868", "border": "#e6dac6", "gradient_start": "#c88028", "gradient_end": "#e8a040", "badge_bg": "#fef3c7", "badge_text": "#8a5a18", "success": "#3a7868", "warning": "#c88028", "error": "#b84428", "kpi_text": "#8a5a18", "divider_accent": "#c88028", "chart_1": "#c88028", "chart_2": "#b84428", "chart_3": "#3a7868", "chart_4": "#786040", "font_heading": "'Josefin Sans', 'Segoe UI', sans-serif", "font_body": "'Quicksand', 'Segoe UI', sans-serif"},
    },
}


def _resolve_palette(opts: dict | Any | None) -> dict[str, str]:
    """Resolve a palette dict from the slide-generation options.

    Accepts either:
      - a dict with optional keys: style_id, style_mode
      - any object exposing those as attributes
      - None → defaults to ('default', 'dark')

    'dim' mode blends dark bg toward light bg ~50% and forces near-black text
    for contrast — distinctly dark but lighter than pure dark mode.
    """
    if opts is None:
        style_id = "default"
        mode = "dark"
    elif isinstance(opts, dict):
        style_id = opts.get("style_id") or "default"
        mode = opts.get("style_mode") or "dark"
    else:
        style_id = getattr(opts, "style_id", None) or "default"
        mode = getattr(opts, "style_mode", None) or "dark"

    if style_id == "auto":
        style_id = "default"
    if mode == "auto":
        mode = "dark"

    is_dim = mode == "dim"
    if is_dim:
        mode = "dark"  # base from dark palette

    palette_set = THEME_PALETTES.get(style_id, THEME_PALETTES["default"])
    palette = dict(palette_set.get(mode, palette_set["dark"]))

    if is_dim:
        dark_palette = palette_set.get("dark", palette)
        light_palette = palette_set.get("light", palette)

        def _hex_to_rgb(h: str) -> tuple[int, int, int]:
            h = h.lstrip("#")
            if len(h) != 6:
                return (128, 128, 128)
            return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

        def _blend(dark_hex: str, light_hex: str, t: float) -> str:
            dr, dg, db = _hex_to_rgb(dark_hex)
            lr, lg, lb = _hex_to_rgb(light_hex)
            r = int(dr + (lr - dr) * t)
            g = int(dg + (lg - dg) * t)
            b = int(db + (lb - db) * t)
            return f"#{r:02x}{g:02x}{b:02x}"

        def _ensure_bright(hex_color: str, min_brightness: int) -> str:
            r, g, b = _hex_to_rgb(hex_color)
            brightness = max(r, g, b)
            if brightness >= min_brightness:
                return hex_color
            if brightness == 0:
                v = min_brightness
                return f"#{v:02x}{v:02x}{v:02x}"
            scale = min_brightness / brightness
            r = min(255, int(r * scale))
            g = min(255, int(g * scale))
            b = min(255, int(b * scale))
            return f"#{r:02x}{g:02x}{b:02x}"

        palette = dict(dark_palette)
        palette["bg"] = _blend(dark_palette["bg"], light_palette["bg"], 0.55)
        palette["card_bg"] = _blend(
            dark_palette.get("card_bg", "#1e1e2e"),
            light_palette.get("card_bg", "#ffffff"), 0.50,
        )
        palette["card_border"] = _blend(
            dark_palette.get("card_border", "#2a2a3a"),
            light_palette.get("card_border", "#e2e8f0"), 0.50,
        )
        palette["highlight_bg"] = _blend(
            dark_palette.get("highlight_bg", "#252535"),
            light_palette.get("highlight_bg", "#f0f0f8"), 0.48,
        )
        palette["border"] = _blend(
            dark_palette.get("border", "#2a2a3a"),
            light_palette.get("border", "#e2e8f0"), 0.50,
        )
        palette["gradient_start"] = _blend(
            dark_palette.get("gradient_start", "#2a2a3a"),
            light_palette.get("gradient_start", "#6366f1"), 0.45,
        )
        palette["gradient_end"] = _blend(
            dark_palette.get("gradient_end", "#141420"),
            light_palette.get("gradient_end", "#818cf8"), 0.45,
        )
        palette["badge_bg"] = _blend(
            dark_palette.get("badge_bg", "#2a2a3a"),
            light_palette.get("badge_bg", "#ede9fe"), 0.45,
        )
        palette["text"] = "#2e3440"
        palette["text_secondary"] = "#4c566a"
        palette["badge_text"] = _ensure_bright(
            dark_palette.get("badge_text", "#93c5fd"), 180,
        )
        palette["heading"] = _ensure_bright(
            dark_palette.get("heading", palette.get("accent1", "#3b82f6")), 160,
        )
        palette["kpi_text"] = _ensure_bright(
            dark_palette.get("kpi_text", palette.get("heading", "#60a5fa")), 160,
        )

    return palette


def available_themes() -> list[str]:
    """Return the list of theme IDs in display order."""
    return list(THEME_PALETTES.keys())
