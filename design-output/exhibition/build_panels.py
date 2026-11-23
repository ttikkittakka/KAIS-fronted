"""Build two full-scale exhibition PDFs from the running app's mobile screenshots."""
from argparse import ArgumentParser
from pathlib import Path
from tempfile import TemporaryDirectory
from xml.sax.saxutils import escape

from PIL import Image
from fontTools import subset
from fontTools.ttLib import TTFont as VariableFont
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdf
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT = 1200, 1300
PAPER = (WIDTH * mm, HEIGHT * mm)
TITLE = "AI 기반 고립 회복 체크인 웹·앱 서비스"
TEAM = [("조번호 및 팀명", "어떡하조"), ("팀원", "하소윤, 노준상"), ("멘토", "배재용")]
INK = "#172e2a"
LIGHT = "#fcfaf6"
BODY = "#4a5d57"
GREEN = "#92ce9c"
NAVY = "#111c28"
MIST = "#dce9de"
BLUE = "#5871d8"
LAVENDER = "#b4c2f4"
PHOTO_CREDIT = "서울숲 CartoonChess · 청계천 Basile Morin · CC BY-SA 4.0, 크기 조정   지도 © OpenStreetMap"


def install_fonts(font, temporary):
    if font:
        text = Path(__file__).read_text(encoding="utf-8")
        for name, weight in [("GardenLight", 350), ("GardenText", 500), ("GardenBold", 720), ("GardenDisplay", 820)]:
            var = VariableFont(font)
            collector = subset.Subsetter()
            collector.populate(text=text)
            collector.subset(var)
            target = Path(temporary) / (name + ".ttf")
            instantiateVariableFont(var, {"wght": weight}, inplace=True)
            # ReportLab reuses a face with the same PostScript name. Keep the four weights distinct.
            table = var["name"]
            for record in list(table.names):
                if record.nameID in (1, 3, 4, 6, 16):
                    table.setName("Pretendard-" + name.removeprefix("Garden"), record.nameID,
                                  record.platformID, record.platEncID, record.langID)
            var.save(target)
            pdfmetrics.registerFont(TTFont(name, target))
        return "Pretendard"
    system = Path("C:/Windows/Fonts")
    for family, file_name in [("GardenLight", "NotoSansKR-Regular.ttf"), ("GardenText", "NotoSansKR-Medium.ttf"),
                              ("GardenBold", "NotoSansKR-Bold.ttf"), ("GardenDisplay", "NotoSansKR-Bold.ttf")]:
        pdfmetrics.registerFont(TTFont(family, system / file_name))
    return "Noto Sans KR"


class Panel:
    def __init__(self, file, screens):
        self.screens = screens
        self.c = pdf.Canvas(str(file), pagesize=PAPER, pageCompression=1)
        self.c.setTitle("AI 티키타카 | " + file.stem)
        self.c.setAuthor("어떡하조 · 하소윤, 노준상")
        self.c.setSubject(TITLE)

    def block(self, x, top, w, h, color, radius=0, stroke=None):
        self.c.setFillColor(HexColor(color))
        if stroke:
            self.c.setStrokeColor(HexColor(stroke))
            self.c.setLineWidth(.5 * mm)
        dims = (x * mm, (HEIGHT - top - h) * mm, w * mm, h * mm)
        if radius:
            self.c.roundRect(*dims, radius * mm, fill=1, stroke=int(bool(stroke)))
        else:
            self.c.rect(*dims, fill=1, stroke=int(bool(stroke)))

    def line(self, x, top, x2, top2, color, width=.55):
        self.c.setStrokeColor(HexColor(color))
        self.c.setLineWidth(width * mm)
        self.c.line(x * mm, (HEIGHT - top) * mm, x2 * mm, (HEIGHT - top2) * mm)

    def disc(self, x, top, radius, color, border=None):
        self.c.setFillColor(HexColor(color))
        if border:
            self.c.setStrokeColor(HexColor(border))
            self.c.setLineWidth(1 * mm)
        self.c.circle(x * mm, (HEIGHT - top) * mm, radius * mm, fill=1, stroke=int(bool(border)))

    def text(self, x, top, message, size, color=INK, font="GardenText", right=False):
        self.c.setFillColor(HexColor(color))
        self.c.setFont(font, size * mm)
        draw = self.c.drawRightString if right else self.c.drawString
        draw(x * mm, (HEIGHT - top - size * .83) * mm, message)

    def para(self, x, top, width, message, size=9, color=BODY, font="GardenText"):
        style = ParagraphStyle("panel", fontName=font, fontSize=size * mm, leading=size * 1.52 * mm,
                               textColor=HexColor(color), alignment=TA_LEFT, wordWrap="CJK")
        paragraph = Paragraph("<br/>".join(escape(line) for line in message.split("\n")), style)
        _, height = paragraph.wrap(width * mm, HEIGHT * mm)
        paragraph.drawOn(self.c, x * mm, (HEIGHT - top) * mm - height)
        return height / mm

    def image(self, source, x, top, w, h, alpha=1):
        with Image.open(source) as source_image:
            self.c.saveState()
            self.c.setFillAlpha(alpha)
            self.c.drawImage(ImageReader(source_image.copy()), x * mm, (HEIGHT - top - h) * mm, w * mm, h * mm, mask="auto")
            self.c.restoreState()

    def phone(self, name, x, top, w, h, angle=0, edge="#1d282d"):
        file = self.screens / (name + ".png")
        self.c.saveState()
        self.c.translate((x + w / 2) * mm, (HEIGHT - top - h / 2) * mm)
        self.c.rotate(angle)
        radius = w * .12
        left, bottom = -w / 2, -h / 2
        self.c.setFillAlpha(.14)
        self.c.setFillColor(HexColor("#101820"))
        self.c.roundRect((left + 8) * mm, (bottom - 9) * mm, w * mm, h * mm, radius * mm, fill=1, stroke=0)
        self.c.setFillAlpha(1)
        self.c.setFillColor(HexColor(edge))
        self.c.roundRect(left * mm, bottom * mm, w * mm, h * mm, radius * mm, fill=1, stroke=0)
        inset = max(3.0, w * .027)
        path = self.c.beginPath()
        path.roundRect((left + inset) * mm, (bottom + inset) * mm, (w - inset * 2) * mm, (h - inset * 2) * mm, (radius - inset) * mm)
        self.c.clipPath(path, stroke=0)
        with Image.open(file) as photo:
            self.c.drawImage(ImageReader(photo.copy()), (left + inset) * mm, (bottom + inset) * mm, (w - inset * 2) * mm, (h - inset * 2) * mm)
        self.c.restoreState()

    def footer(self, label, photo_text, background=LIGHT):
        self.block(0, 1269, 1200, 31, background)
        self.line(46, 1271, 1154, 1271, "#cbd7ce")
        self.text(46, 1279, label, 6.3, BODY, "GardenBold")
        self.text(1154, 1279, photo_text, 5.5, BODY, "GardenLight", right=True)

    def save(self):
        self.c.showPage()
        self.c.save()


def panel_one(file, screens):
    panel = Panel(file, screens)
    panel.block(0, 0, 1200, 1300, LIGHT)
    panel.block(0, 0, 1200, 389, "#182733")
    panel.image(ROOT / "public/places/seoul-forest.webp", 470, 0, 730, 389, alpha=.25)
    panel.block(0, 0, 531, 1155, NAVY)
    panel.block(0, 1045, 531, 224, NAVY, radius=96)
    panel.block(0, 1050, 531, 114, NAVY)
    c = panel.c
    c.saveState()
    hero = c.beginPath()
    hero.rect(0, (HEIGHT - 498) * mm, 531 * mm, 498 * mm)
    c.clipPath(hero, fill=0, stroke=0)
    c.linearGradient(0, HEIGHT * mm, 0, (HEIGHT - 498) * mm, [HexColor("#52616b"), HexColor(NAVY)])
    c.restoreState()
    panel.image(ROOT / "public/app-icon-192.png", 34, 38, 64, 64)
    panel.phone("map", 82, 132, 173, 371, angle=13, edge="#e9f0ed")
    panel.phone("diary", 237, 59, 186, 399, angle=-13, edge="#e9f0ed")

    panel.text(1145, 52, TITLE, 15.2, "#eff6f0", "GardenBold", right=True)
    panel.text(1145, 93, "AI 티키타카", 52, "#fbfcf8", "GardenDisplay", right=True)
    panel.text(1145, 164, "오늘의 정원", 19, "#a4dbab", "GardenBold", right=True)
    for index, (label, value) in enumerate(TEAM):
        panel.text(1145, 202 + index * 22, label + "  " + value, 11, "#f2f7ef", "GardenText", right=True)
    panel.para(716, 274, 428, "매일 한 번 나를 살피고, 지금 할 수 있는 작은 행동을 찾는 디지털 동행 서비스.", 10, "#e2ece7")

    panel.block(531, 330, 669, 944, LIGHT, radius=82)
    panel.block(630, 330, 570, 944, LIGHT)
    panel.block(531, 431, 669, 837, LIGHT)

    panel.text(41, 538, "개발 배경", 18, GREEN, "GardenBold")
    panel.para(41, 570, 444, "고립된 청소년·청년과 혼자 사는 사람은 수면, 식사, 외출, 연락의 일상 리듬을 잃기 쉬워요. 처음 도움을 요청할 때 설명해야 할 것이 많으면 그 한 번도 어려워집니다.", 11, "#eff3f0")
    panel.text(41, 671, "문제에서 접근으로", 17, GREEN, "GardenBold")
    cards = [
        ("말로 설명하기 어려움", "수면·식사·에너지·마음 상태를 선택하고 날짜별로 살펴봅니다."),
        ("밖으로 나가기 어려움", "컨디션에 맞는 1~5분 미션과 서울 산책 장소를 제공합니다."),
        ("연락이 부담스러움", "가볍게 안부를 권하고 사용자가 공유를 허용할 때만 연결합니다."),
    ]
    for index, (name, description) in enumerate(cards):
        top = 710 + index * 73
        panel.block(41, top, 447, 58, "#192633", radius=12, stroke="#3b5358")
        panel.disc(66, top + 29, 13, "#a4d3ac")
        panel.text(61, top + 23, str(index + 1), 10, NAVY, "GardenBold")
        panel.text(91, top + 10, name, 11, "#f8fbf7", "GardenBold")
        panel.para(91, top + 27, 381, description, 8.4, "#d9e5dd")
    panel.text(41, 948, "핵심 흐름", 17, GREEN, "GardenBold")
    for index, (name, caption) in enumerate([("기록", "나를 살피기"), ("회복", "한 걸음 내딛기"), ("연결", "마음을 나누기")]):
        x = 108 + index * 151
        panel.disc(x, 1032, 56, "#172535", "#5c9f78")
        panel.text(x + 38, 1008, name, 21, "#f3faf4", "GardenBold", right=True)
        panel.text(x + 36, 1048, caption, 7.7, "#bcdbca", "GardenText", right=True)
    panel.text(41, 1121, "향후 발전", 17, GREEN, "GardenBold")
    panel.para(41, 1157, 432, "Vercel 배포와 Supabase 공유 연동을 검증하고, 스마트폰 실기기에서 카메라·설치 문자 전달을 점검합니다. 이후 학교 상담실·지역 청년 지원기관과의 연결을 확장합니다.", 10.5, "#e8f0eb")

    steps = [
        (374, "기록하기", "diary", "entry", "한 달의 마음을 한눈에", "일기와 오늘을 하나의 캘린더로 합쳤습니다. 날짜를 누르면 자기보고와 일기를 볼 수 있고, 오른쪽으로 넘겨 올해의 기록을 봅니다."),
        (676, "걸어보기", "mission", "map", "오늘의 상태로 다음 행동 고르기", "API가 짧은 미션을 제안합니다. 지도 카드에서 서울 산책길 사진을 넘겨 보고, 갈 곳과 다녀온 곳을 남길 수 있습니다."),
        (974, "함께 보기", "guardian", "home", "동의한 상태 기록만 공유", "7일간 열리는 보호자 링크에 날짜별 상태를 담습니다. 연락 기록과 일기 원문, 사진은 기기 내에서 관리합니다."),
    ]
    for index, (top, label, a, b, title, detail) in enumerate(steps):
        panel.block(565, top + 2, 5, 18, "#4b9169", radius=2)
        panel.text(579, top, label, 16.5, INK, "GardenBold")
        panel.phone(a, 566, top + 39, 96, 206)
        panel.phone(b, 677, top + 46, 91, 195, edge="#40514c")
        panel.text(793, top + 76, title, 13.4, INK, "GardenBold")
        panel.para(793, top + 107, 351, detail, 10.9, BODY)
        if index < len(steps) - 1:
            panel.line(564, top + 271, 1150, top + 271, "#dae2d9")

    panel.footer("시안 1  |  AI · SW 티키타카 프로젝트  |  실제 앱 체험 화면", PHOTO_CREDIT)
    panel.save()


def wave(panel, color, first, middle, end, close_at):
    c = panel.c
    path = c.beginPath()
    path.moveTo(first[0] * mm, (HEIGHT - first[1]) * mm)
    for segment in [middle, end]:
        path.curveTo(*(coord * mm if i % 2 == 0 else (HEIGHT - coord) * mm for i, coord in enumerate(segment)))
    path.lineTo(1200 * mm, (HEIGHT - close_at) * mm)
    path.lineTo(0, (HEIGHT - close_at) * mm)
    path.close()
    c.setFillColor(HexColor(color))
    c.drawPath(path, fill=1, stroke=0)


def panel_three(file, screens, typeface):
    panel = Panel(file, screens)
    panel.block(0, 0, 1200, 1300, "#fffefe")
    wave(panel, LAVENDER, (0, 401), (239, 431, 387, 376, 590, 383),
         (850, 384, 1020, 455, 1200, 446), 0)
    wave(panel, BLUE, (0, 330), (260, 412, 429, 324, 636, 331),
         (839, 336, 1018, 453, 1200, 384), 0)
    for x, y, radius in [(126, 370, 25), (507, 341, 11), (1120, 62, 15), (1154, 88, 10), (1060, 262, 15)]:
        panel.disc(x, y, radius, "#a7dec7")
    panel.image(ROOT / "public/app-icon-192.png", 57, 36, 62, 62)
    panel.text(57, 117, "AI 티키타카", 52, "#ffffff", "GardenDisplay")
    panel.text(59, 184, TITLE, 17, "#ffffff", "GardenBold")
    panel.para(59, 220, 453, "오늘의 정원에서 나를 살피고, 부담 없는 미션을 고르고, 내가 원하는 사람과 마음을 나눠요.", 11.5, "#f0f2ff")
    for index, (label, value) in enumerate(TEAM):
        panel.text(59, 277 + index * 21, label + "  " + value, 11, "#ffffff", "GardenBold")
    panel.phone("home", 576, 53, 181, 389, angle=17, edge="#f2f3f7")
    panel.phone("diary", 742, 29, 183, 393, angle=12, edge="#f2f3f7")
    panel.image(ROOT / "public/characters/plant-happy.webp", 952, 137, 227, 227)

    overview = [
        (57, "Background", "왜 시작했나요?", [
            "사회적 관계나 외부 활동이 줄어든 사람은 가벼운 연락이나 외출을 시작하는 일도 어려울 수 있습니다.",
            "첫 시도는 집에서 할 수 있는 짧은 체크인으로 설계했습니다.",
        ]),
        (427, "Pain Point", "무엇이 어렵나요?", [
            "01  긴 문항은 돌아오기를 어렵게 합니다.",
            "02  한 번에 많은 행동은 부담을 키웁니다.",
            "03  기록을 공유하기 전에 범위를 분명히 알아야 합니다.",
        ]),
        (800, "Solution", "어떻게 풀었나요?", [
            "일기 캘린더에서 선택한 날의 상태를 확인합니다.",
            "현재 응답과 선호를 반영한 미션을 가볍게 실행합니다.",
            "사진 지도, 카메라 확인, 보호자 공유로 필요한 순간에만 연결합니다.",
        ]),
    ]
    for x, english, title, paragraphs in overview:
        panel.text(x, 467, english, 11, "#172030", "GardenBold")
        panel.text(x, 493, title, 20, INK, "GardenDisplay")
        top = 535
        for item in paragraphs:
            height = panel.para(x, top, 328, item, 11.1)
            top += height + 12

    panel.block(0, 726, 1200, 539, "#f2f4f9")
    panel.text(57, 756, "사용자 여정", 20, INK, "GardenDisplay")
    journey = [
        ("1", "일기 쓰기", "오늘의 상태를 고르고 마음 단어를 남겨요."),
        ("2", "미션 하기", "가벼운 행동을 고르고 원하면 카메라로 확인해요."),
        ("3", "연결하기", "가 볼 곳을 저장하거나 상태를 보호자에게 공유해요."),
    ]
    for index, (number, name, detail) in enumerate(journey):
        y = 808 + index * 66
        panel.disc(73, y + 19, 16, BLUE)
        panel.text(69, y + 13, number, 11, "#ffffff", "GardenBold")
        panel.text(99, y + 1, name, 13, INK, "GardenBold")
        panel.para(99, y + 25, 435, detail, 9.8)
    panel.text(57, 1017, "서비스 원칙", 18, INK, "GardenBold")
    for index, (title, desc) in enumerate([("선택권", "기록·미션을 내 속도로"), ("최소 수집", "원본은 기기에"), ("사람 연결", "동의한 상태만 공유")]):
        x = 138 + index * 166
        panel.disc(x, 1118, 59, BLUE)
        panel.disc(x, 1118, 44, "#f2f4f9")
        panel.text(x + 31, 1110, title, 11.2, BLUE, "GardenBold", right=True)
        panel.text(x + 63, 1194, desc, 8.2, BODY, "GardenText", right=True)

    panel.line(586, 760, 586, 1239, "#d4dcea")
    panel.text(632, 756, "서비스 구조", 20, INK, "GardenDisplay")
    panel.phone("map", 636, 813, 86, 184)
    panel.phone("guardian", 736, 813, 86, 184, edge="#40514c")
    panel.text(853, 813, "웹과 모바일", 13, INK, "GardenBold")
    panel.para(853, 836, 295, "Next.js 웹 화면을 Expo에서 열고 카메라와 주소록 선택을 이어줍니다.", 9.8)
    panel.text(853, 909, "동의와 보호", 13, INK, "GardenBold")
    panel.para(853, 933, 295, "보호자 공유 범위를 고르고 필요할 때 링크를 중단합니다.", 9.8)
    panel.text(632, 1030, "색과 글꼴", 13.5, INK, "GardenBold")
    for i, color in enumerate([BLUE, LAVENDER, "#a7dec7", "#24463d"]):
        panel.disc(645 + i * 44, 1080, 15.2, color)
    panel.text(844, 1068, typeface + " Light · Medium · Bold", 10.4, BLUE, "GardenBold")
    panel.text(632, 1125, "향후 발전", 16.5, INK, "GardenBold")
    panel.para(632, 1163, 510, "공개 웹 배포와 Supabase 인증·공유를 연결하고, 모바일 기기에서 카메라와 설치 문자 흐름을 검증합니다. 장기적으로 지역 지원 기관과 연계합니다.", 10.7)

    panel.footer("시안 3  |  AI · SW 티키타카 프로젝트  |  실제 앱 체험 화면", PHOTO_CREDIT, "#f2f4f9")
    panel.save()


def main():
    cli = ArgumentParser()
    cli.add_argument("--screens", type=Path, required=True)
    cli.add_argument("--font", type=Path)
    cli.add_argument("--out", type=Path, default=Path(__file__).resolve().parent)
    args = cli.parse_args()
    args.out.mkdir(exist_ok=True, parents=True)
    with TemporaryDirectory(prefix="tikitaka-font-") as temp:
        typeface = install_fonts(args.font, temp)
        panel_one(args.out / "AI_Tikitaka_Panel_Option1.pdf", args.screens)
        panel_three(args.out / "AI_Tikitaka_Panel_Option3.pdf", args.screens, typeface)
    print("Two panels created at 1200 x 1300 mm")


if __name__ == "__main__":
    main()
