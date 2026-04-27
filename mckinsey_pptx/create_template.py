"""
Creates the base McKinsey master .pptx template with custom slide layouts.
Run this once to generate templates/mckinsey_master.pptx.
"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

from .config import LAYOUT


def create_master_template(output_dir: Path | str = None) -> Path:
    """Create and save the McKinsey master template."""
    if output_dir is None:
        output_dir = Path(__file__).parent / "templates"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    prs = Presentation()
    prs.slide_width = LAYOUT.WIDTH
    prs.slide_height = LAYOUT.HEIGHT

    output_path = output_dir / "mckinsey_master.pptx"
    prs.save(str(output_path))
    print(f"Template saved to: {output_path}")
    return output_path


if __name__ == "__main__":
    create_master_template()
