# -*- coding: utf-8 -*-
"""build_pdf.py — يُنتج PDF من سجل الأدلة مع دعم عربي صحيح.

يعالج:
  - تشكيل الحروف العربية (arabic_reshaper)
  - اتجاه النص من اليمين لليسار (python-bidi)
  - خط عربي حقيقي (Noto Naskh Arabic)
  - جداول وعناوين
"""
import os, re
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether)
from arabic_reshaper import reshape
from bidi.algorithm import get_display

FONT_CANDIDATES = [
    "/home/okal/.fonts/NotoNaskhArabic.ttf",
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT_PATH = next((f for f in FONT_CANDIDATES if os.path.exists(f)), None)
if not FONT_PATH:
    raise SystemExit("لم أجد خطًا عربيًا. ثبّت fonts-noto-core.")
pdfmetrics.registerFont(TTFont("Arabic", FONT_PATH))
pdfmetrics.registerFont(TTFont("Arabic-Bold", FONT_PATH))

INK = colors.HexColor("#0f1d16")
HERB = colors.HexColor("#2d6a4f")
MUTED = colors.HexColor("#5b6b62")
LINE = colors.HexColor("#d8e2db")
WARN = colors.HexColor("#a4711f")
BAD = colors.HexColor("#a33b2b")
OKC = colors.HexColor("#1f7a45")


def ar(text):
    """تشكيل + عكس الاتجاه لعرض عربي صحيح في PDF."""
    if text is None:
        return ""
    return get_display(reshape(str(text)))


def strip_md(t):
    """يزيل وسوم ماركداون البسيطة قبل الرسم."""
    t = str(t or "")
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)      # عريض
    t = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", t)  # مائل
    t = re.sub(r"`(.+?)`", r"\1", t)               # كود
    t = re.sub(r"^#+\s*", "", t)
    return t.strip()


def safe_paragraph(text, style):
    """يبني Paragraph مع تهريب آمن حتى لا تكسر الرموز وسوم XML."""
    t = strip_md(text)
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(ar(t), STY[style])


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


STY = {
    "title": ParagraphStyle("t", fontName="Arabic-Bold", fontSize=22, leading=30,
                            textColor=INK, alignment=2, spaceAfter=6),
    "sub": ParagraphStyle("s", fontName="Arabic", fontSize=10.5, leading=16,
                          textColor=MUTED, alignment=2, spaceAfter=14),
    "h2": ParagraphStyle("h2", fontName="Arabic-Bold", fontSize=14, leading=22,
                         textColor=HERB, alignment=2, spaceBefore=14, spaceAfter=8),
    "h3": ParagraphStyle("h3", fontName="Arabic-Bold", fontSize=11.5, leading=18,
                         textColor=INK, alignment=2, spaceBefore=8, spaceAfter=4),
    "body": ParagraphStyle("b", fontName="Arabic", fontSize=10, leading=17,
                           textColor=INK, alignment=2, spaceAfter=6),
    "small": ParagraphStyle("sm", fontName="Arabic", fontSize=8.6, leading=14,
                            textColor=MUTED, alignment=2),
    "cell": ParagraphStyle("c", fontName="Arabic", fontSize=8.8, leading=14,
                           textColor=INK, alignment=2),
    "cellb": ParagraphStyle("cb", fontName="Arabic-Bold", fontSize=8.8, leading=14,
                            textColor=INK, alignment=2),
}


def P(text, style="body"):
    return safe_paragraph(text, style)


def verdict_color(label):
    if "✅" in label:
        return OKC
    if "❌" in label:
        return BAD
    return WARN


def parse_audit(path):
    """يستخرج الأقسام من سجل الأدلة."""
    raw = open(path, encoding="utf-8").read()
    lines = raw.split("\n")
    intro, sections, cur = [], [], None

    for ln in lines:
        if ln.startswith("## "):
            if cur:
                sections.append(cur)
            cur = {"title": ln[3:].strip(), "lines": []}
        elif cur is not None:
            cur["lines"].append(ln)
        else:
            intro.append(ln)
    if cur:
        sections.append(cur)
    return intro, sections


def section_table(sec):
    """يبني جدولاً من أسطر الجدول داخل القسم."""
    rows = [l for l in sec["lines"] if l.strip().startswith("|")]
    if not rows:
        return None
    parsed = []
    for r in rows:
        cells = [c.strip() for c in r.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue
        parsed.append(cells)
    if len(parsed) < 2:
        return None
    data = []
    for i, row in enumerate(parsed):
        data.append([safe_paragraph(c, "cellb" if i == 0 else "cell") for c in row])
    # عرض الأعمدة يتكيّف مع عددها (بعض الجداول ٢ وأخرى ٣)
    ncols = max(len(r) for r in parsed)
    total = 160*mm
    if ncols == 2:
        widths = [42*mm, total - 42*mm]
    else:
        widths = [total / ncols] * ncols
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef5f0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), HERB),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafcfb")]),
    ]))
    return t


def build(out_path, title, subtitle, intro_text, sections, footer_note):
    doc = SimpleDocTemplate(out_path, pagesize=A4,
                            rightMargin=18*mm, leftMargin=18*mm,
                            topMargin=18*mm, bottomMargin=18*mm,
                            title="Mirath — Evidence Audit")

    flow = [P(title, "title"), P(subtitle, "sub")]
    for para in intro_text:
        t = para.strip()
        if not t:
            continue
        if t.startswith(">"):
            t = t.lstrip("> ").strip()
        t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
        flow.append(P(t, "body"))
    flow.append(Spacer(1, 6*mm))

    for sec in sections:
        block = [P(sec["title"], "h2")]
        body_lines = [l for l in sec["lines"] if l.strip() and not l.strip().startswith("|")]
        for ln in body_lines:
            txt = ln.strip()
            if txt.startswith("---"):
                continue
            txt = re.sub(r"\*\*(.+?)\*\*", r"\1", txt)
            txt = re.sub(r"`(.+?)`", r"\1", txt)
            if txt.startswith("- ") or txt.startswith("* "):
                block.append(P("• " + txt[2:], "body"))
            else:
                block.append(P(txt, "body"))
        tbl = section_table(sec)
        if tbl:
            block.append(Spacer(1, 2*mm))
            block.append(tbl)
        block.append(Spacer(1, 4*mm))
        flow.append(KeepTogether(block))

    if footer_note:
        flow.append(Spacer(1, 6*mm))
        flow.append(P(footer_note, "small"))

    def on_page(canv, doc_):
        canv.saveState()
        canv.setFont("Arabic", 7.5)
        canv.setFillColor(MUTED)
        txt = ar("مِيراث — سجل الأدلة · WAICY 2026")
        canv.drawRightString(A4[0] - 18*mm, 10*mm, txt)
        canv.drawString(18*mm, 10*mm, str(doc_.page))
        canv.setStrokeColor(LINE)
        canv.line(18*mm, 14*mm, A4[0] - 18*mm, 14*mm)
        canv.restoreState()

    doc.build(flow, onFirstPage=on_page, onLaterPages=on_page)
    return out_path


if __name__ == "__main__":
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = os.path.join(ROOT, "docs", "EVIDENCE-AUDIT.md")
    intro, sections = parse_audit(src)

    # حمّل المقدمة فقط (قبل أول قسم)
    intro_text = []
    for ln in intro:
        t = ln.strip()
        if not t or t.startswith("# "):
            continue
        if t.startswith("---"):
            continue
        intro_text.append(t)

    out = build(
        os.path.join(ROOT, "docs", "Mirath-Evidence-Audit.pdf"),
        "مِيراث — سجل البحث عن الأدلة",
        "كل مادة في القاعدة: الاستعلام، وعدد النتائج، والدليل برقم PMID، والحكم",
        intro_text[:6],
        sections,
        "مِيراث مساعد أولي وليس طبيبًا. لا يشخّص ولا يصف دواءً. في النزيف الشديد أو إصابة الانفجار: اطلب إسعافًا فورًا."
    )
    print("built:", out, os.path.getsize(out), "bytes")
