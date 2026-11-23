"""Render the live LAN URLs as a two-code image for the phone demo."""
from argparse import ArgumentParser
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.graphics.barcode.qrencoder import QRCode, QRErrorCorrectLevel


def qr(draw, value, x, y, size):
    graph = QRCode(None, QRErrorCorrectLevel.M)
    graph.addData(value)
    graph.make()
    cells = graph.modules
    unit = size // (len(cells) + 8)
    margin = (size - unit * len(cells)) // 2
    draw.rounded_rectangle((x, y, x + size, y + size), radius=19, fill="white")
    for row, line in enumerate(cells):
        for column, filled in enumerate(line):
            if filled:
                left = x + margin + column * unit
                top = y + margin + row * unit
                draw.rectangle((left, top, left + unit - 1, top + unit - 1), fill="#152f26")


cli = ArgumentParser()
cli.add_argument("web")
cli.add_argument("expo")
cli.add_argument("output", type=Path)
args = cli.parse_args()
font = Path("C:/Windows/Fonts")
bold = lambda size: ImageFont.truetype(str(font / "malgunbd.ttf"), size)
regular = lambda size: ImageFont.truetype(str(font / "malgun.ttf"), size)
image = Image.new("RGB", (1280, 880), "#eaf1e8")
draw = ImageDraw.Draw(image)
draw.text((60, 50), "오늘의 정원 모바일 체험", "#24463d", font=bold(53))
draw.text((61, 131), "휴대폰과 이 PC를 같은 Wi-Fi에 연결해 주세요.", "#425d52", font=regular(27))
for x, title, subtitle, value in [
    (60, "웹앱", "기본 카메라로 스캔", args.web),
    (665, "Expo Go", "Expo Go에서 스캔", args.expo),
]:
    draw.rounded_rectangle((x, 198, x + 555, 760), radius=27, fill="#f8fbf6")
    draw.text((x + 35, 220), title, "#24463d", font=bold(36))
    draw.text((x + 35, 277), subtitle, "#425d52", font=regular(23))
    qr(draw, value, x + 113, 325, 329)
    draw.text((x + 35, 691), value, "#385e4f", font=regular(22))
draw.text((60, 809), "이 PC의 웹·Expo 서버가 실행 중일 때 사용할 수 있습니다.", "#425d52", font=regular(26))
args.output.parent.mkdir(parents=True, exist_ok=True)
image.save(args.output)
