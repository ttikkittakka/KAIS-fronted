"""Compose the wardrobe fit sheets from fit.json and the final WebP sprites."""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
CHARACTERS = ROOT / "../../public/characters"
COMPANIONS = ("plant", "cat", "dog", "pegasus")
ITEMS = (
    "straw-hat", "flower-crown", "knit-beanie", "party-hat",
    "round-glasses", "heart-sunglasses",
    "mint-scarf", "red-bowtie", "bell-collar",
)
OUTFITS = (
    ("straw hat + mint scarf", "", ("straw-hat", "round-glasses", "mint-scarf")),
    ("flower crown + bell collar", "-happy", ("flower-crown", "heart-sunglasses", "bell-collar")),
    ("party hat + red bowtie", "-excited", ("party-hat", "round-glasses", "red-bowtie")),
)
BOX = 512
CELL = 180
ROW_LABEL = 69
HEADER = 26
BACKGROUND = "#E8EFDF"
LABEL_COLOR = "#344232"


def load_rgba(path):
    with Image.open(path) as source:
        return source.convert("RGBA")


def place(sprite, item, anchor):
    """Map the companion box back into the sprite, about its CSS pivot."""
    slot, sink = item["slot"], item["sink"]
    pivot_fraction = {"head": 1 - sink, "face": 0.5, "neck": sink}[slot]
    pivot_x = sprite.width / 2
    pivot_y = sprite.height * pivot_fraction

    target_x = BOX * anchor["x"] / 100
    target_y = BOX * anchor["y"] / 100
    width = BOX * anchor["w"] / 100 * item["scale"]
    inverse_scale = sprite.width / width
    angle = math.radians(anchor["r"])
    cosine = math.cos(angle) * inverse_scale
    sine = math.sin(angle) * inverse_scale

    # Screen coordinates grow downward, so +r rotates clockwise.
    inverse = (
        cosine, sine, pivot_x - cosine * target_x - sine * target_y,
        -sine, cosine, pivot_y + sine * target_x - cosine * target_y,
    )
    return sprite.transform(
        (BOX, BOX), Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC,
    )


def make_sheet(path, columns, fit, characters, sprites):
    sheet = Image.new(
        "RGB", (ROW_LABEL + CELL * len(columns), HEADER + CELL * len(COMPANIONS)),
        BACKGROUND,
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=12)
    for col, (label, _, _) in enumerate(columns):
        draw.text(
            (ROW_LABEL + CELL * col + CELL / 2, HEADER / 2),
            label, fill=LABEL_COLOR, font=font, anchor="mm",
        )

    for row, name in enumerate(COMPANIONS):
        top = HEADER + row * CELL
        draw.text(
            (ROW_LABEL - 9, top + CELL / 2), name,
            fill=LABEL_COLOR, font=font, anchor="rm",
        )
        for col, (_, expression, outfit) in enumerate(columns):
            companion = characters[name, expression].copy()
            for item_id in outfit:
                item = fit["items"][item_id]
                anchor = fit["anchors"][name][item["slot"]]
                companion.alpha_composite(place(sprites[item_id], item, anchor))
            cell = Image.new("RGBA", (BOX, BOX), BACKGROUND)
            cell.alpha_composite(companion)
            sheet.paste(
                cell.convert("RGB").resize((CELL, CELL), Image.Resampling.LANCZOS),
                (ROW_LABEL + col * CELL, top),
            )
    sheet.save(path, optimize=True)


def main():
    with (ROOT / "fit.json").open(encoding="utf-8") as source:
        fit = json.load(source)
    single_items = [(name.replace("-", " "), "", (name,)) for name in ITEMS]
    expressions = {expression for _, expression, _ in (*single_items, *OUTFITS)}
    characters = {
        (name, expression): load_rgba(CHARACTERS / f"{name}{expression}.webp")
        for name in COMPANIONS
        for expression in expressions
    }
    sprites = {name: load_rgba(ROOT / "out" / f"{name}.webp") for name in ITEMS}

    make_sheet(ROOT / "fit-sheet.png", single_items, fit, characters, sprites)
    make_sheet(ROOT / "outfits.png", OUTFITS, fit, characters, sprites)


if __name__ == "__main__":
    main()
