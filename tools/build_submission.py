# -*- coding: utf-8 -*-
"""build_submission.py — WAICY 2026 submission document (LLM_Mirath.pdf)."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak)
from arabic_reshaper import reshape
from bidi.algorithm import get_display

FONT = next((f for f in [
    "/home/okal/.fonts/NotoNaskhArabic.ttf",
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
] if os.path.exists(f)), None)
pdfmetrics.registerFont(TTFont("Ar", FONT))
pdfmetrics.registerFont(TTFont("ArB", FONT))

INK = colors.HexColor("#10201a")
GREEN = colors.HexColor("#2d6a4f")
MUTED = colors.HexColor("#5b6b62")
LINE = colors.HexColor("#cfdcd4")


def ar(t):
    return get_display(reshape(str(t or "")))


def esc(t):
    return str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


STY = {
    "t": ParagraphStyle("t", fontName="ArB", fontSize=22, leading=32,
                        textColor=INK, alignment=2, spaceAfter=4),
    "sub": ParagraphStyle("s", fontName="Ar", fontSize=10.5, leading=17,
                          textColor=MUTED, alignment=2, spaceAfter=18),
    "h": ParagraphStyle("h", fontName="ArB", fontSize=14, leading=24,
                        textColor=GREEN, alignment=2, spaceBefore=15, spaceAfter=7),
    "b": ParagraphStyle("b", fontName="Ar", fontSize=10.4, leading=19,
                        textColor=INK, alignment=2, spaceAfter=7),
    "li": ParagraphStyle("l", fontName="Ar", fontSize=10.4, leading=19,
                         textColor=INK, alignment=2, spaceAfter=3, rightIndent=12),
    "sm": ParagraphStyle("m", fontName="Ar", fontSize=8.8, leading=15,
                         textColor=MUTED, alignment=2, spaceAfter=6),
}


def P(t, s="b"):
    return Paragraph(ar(esc(t)), STY[s])


def H(t):
    return Paragraph(ar(esc(t)), STY["h"])


def LI(t):
    return Paragraph(ar("• " + esc(t)), STY["li"])


SECTIONS = [
    ("١. الخدمة التي يقدّمها الذكاء الاصطناعي", [
        ("p", "مِيراث مساعد ذكي للعناية الأولية بالجروح، مخصّص للأشخاص الذين لا يصلون بسرعة إلى رعاية صحية: المناطق النائية، ومناطق النزاعات، والأماكن التي لا يوجد فيها مستشفى قريب."),
        ("p", "الخدمة محدّدة بدقة: الجروح فقط — الخدوش، والجروح السطحية، والحروق الخفيفة، والدمامل الصغيرة، والعضّات. لا تشخيص أمراض، ولا وصف دواء، ولا جرعات."),
        ("p", "القيمة المضافة: يكتب المستخدم وصفًا أو يرفع صورة للجرح، فيحصل على ثلاث طبقات بالترتيب: إسعاف أولي مباشر، ثم توصية من الطب القديم مع دليلها العلمي، ثم تحذير صريح من الممارسات غير المثبتة. وهذا ما لا يقدّمه دليل إسعاف عادي ولا بحث إنترنت عام."),
    ]),
    ("٢. الدافع", [
        ("p", "بُنِي مِيراث لأن المصاب في منطقة نائية لا يجد من يسأله. الجرح بسيط، لكن الخوف من التلوث والالتهاب يدفع صاحبه إلى أي شيء يفعله — وقد يضع مسحوقًا أو زيتًا في جرح مفتوح، فيزيد الضرر بدلًا من أن يمنعه."),
        ("p", "المبدأ الذي بُني عليه المشروع: التراث للسياق، والعلم للقرار. والصيغة التي كُتبت في المشروع: «هدفك مساعدة الإنسان وحمايته، وليس إثبات صحة الطب القديم أو الدفاع عنه»."),
    ]),
    ("٣. رابط سجل المحادثة", [
        ("sm", "يُضاف هنا رابط محادثة من ١٠ رسائل على الأقل مع النسخة النهائية من المساعد."),
    ]),
    ("٤. رابط الشات بوت", [
        ("sm", "يُضاف هنا رابط الموقع المنشور بعد النشر."),
    ]),
    ("٥. عملية التصميم التكراري", [
        ("p", "مرّ المشروع بأربع مراحل موثّقة:"),
        ("li", "الفكرة: مساعد للجروح يحترم الطب القديم دون أن يدافع عنه."),
        ("li", "التصميم: نص نظام من ١٢ قسمًا، وقاعدة معرفة من ٢٠ مادة، كل واحدة بحكمها ومصدرها ورقم PMID."),
        ("li", "الاختبار: ١٧٤ اختبارًا آليًا، بالإضافة إلى اختبارات حيّة على الموديل الحقيقي."),
        ("li", "تحليل الأخطاء: اكتُشفت ثلاثة أخطاء خطيرة في الاختبار الحيّ وأُصلحت — اسم الموديل الخاطئ، وصيغة الطلب التي يرفضها النموذج، وعدم إرسال رسالة المستخدم إلى النموذج إطلاقًا."),
        ("p", "التفاصيل الكاملة لكل مادة ودليلها في ملف سجل الأدلة داخل المستودع."),
    ]),
    ("٦. الحدود والاعتبارات الأخلاقية", [
        ("li", "الصورة لا تكشف عمق الجرح ولا تُثبت خلوّه من التلوث، والمساعد يقول ذلك صراحةً في كل ردّ يحتوي صورة."),
        ("li", "معظم مواد الطب القديم لا يزال دليلها السريري غير كافٍ، ولذلك تُصنَّف كل مادة بصدق: مثبتة، أو واعدة، أو غير مثبتة."),
        ("li", "المساعد لا يشخّص، ولا يصف دواءً، ولا يعطي جرعة."),
        ("li", "الحدّ الصلب: النزيف الشديد أو إصابة الانفجار تعني طبيبًا فورًا، بلا أي عشب."),
        ("li", "تحفّظات نسبة النصوص إلى ابن سينا والرازي مُدرجة في هذا القسم، ولا تُذكر في ردود المساعد."),
    ]),
    ("٧. التطور المستقبلي", [
        ("li", "توسيع قاعدة الأدلة إلى مواد أخرى بشرط وجود دراسة قابلة للتحقق."),
        ("li", "إضافة بحث علمي حيّ من PubMed عند كل سؤال، بدل الاعتماد على قاعدة ثابتة."),
        ("li", "دعم لغات إضافية بجانب العربية والإنجليزية."),
        ("li", "تشغيل المساعد بدون إنترنت لخدمة المناطق التي ينقطع فيها الاتصال."),
    ]),
    ("٨. الخاتمة", [
        ("p", "يُظهر مِيراث أن الطب القديم يمكن تقديمه بصدق: توصية واضحة، مع دليلها وحدودها، ودون أن تُقدَّم بديلًا عن الإسعاف الأولي أو الرعاية الطبية. القيمة ليست في كثرة المواد، بل في أن كل توصية تحمل مصدرها، وأن البوابات الآلية تمنع أي ردّ غير آمن من الوصول إلى المستخدم."),
    ]),
]

REFERENCES = [
    "WHO. Community First Aid Response. World Health Organization.",
    "Cochrane Library 2015. Honey for acute and chronic wounds (PMID 25742878).",
    "Nutrients 2024. Honey Dressings in Chronic Wounds: Updated Systematic Review and Meta-Analysis (PMID 39125335).",
    "Cureus 2026. Honey Dressing in Postoperative Wounds, Ulcers and Burns: Systematic Review (PMID 42099328).",
    "J Burn Care Res 2024. Aloe Vera on Burn Injuries: Systematic Review and Meta-Analysis of RCTs (PMID 38605441).",
    "J Ethnopharmacol 2027. Centella Asiatica in Wound Healing: Systematic Review and Meta-Analysis (PMID 42772613).",
    "Plants 2025. Calendula Officinalis in Wound Healing (PMID 41304647).",
    "Int Wound J 2026. Manuka Honey in Wound Healing (PMID 42117760).",
    "J Tissue Viability 2026. Hypericum Perforatum for Diabetes-Related Wounds (PMID 42994168).",
    "Int J Mol Sci 2026. Azadirachta Indica (Neem) in Wound Healing (PMID 43027840).",
    "J Cosmet Dermatol 2025. Turmeric and Wound Healing (PMID 41388841).",
    "Clin Microbiol Rev. Antiseptics and wound management (reference review).",
    "EMA/HMPC. EMA/164109/2019 — Myrrh. European Medicines Agency.",
    "DailyMed. Eucalyptus Oil Label: «DO NOT APPLY TO WOUNDS OR DAMAGED SKIN».",
    "Ibn Sina. Al-Qanun fi al-Tibb, Bab Hawabis al-Sayalan (historical context only).",
    "Al-Razi. Al-Hawi fi al-Tibb. Dar Ihya al-Turath al-Arabi, ed. Haytham Khalifa al-Taimi.",
]


def build(out):
    doc = SimpleDocTemplate(out, pagesize=A4,
                            rightMargin=20 * mm, leftMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=20 * mm,
                            title="Mirath — WAICY 2026 Submission")
    story = [
        P("مِيراث — مستند التسليم", "t"),
        P("WAICY 2026 · مسار LLM & AI Agent · فئة المدرسة الثانوية", "sub"),
    ]

    for heading, items in SECTIONS:
        story.append(H(heading))
        for kind, text in items:
            if kind == "li":
                story.append(LI(text))
            elif kind == "sm":
                story.append(P(text, "sm"))
            else:
                story.append(P(text, "b"))

    story.append(PageBreak())
    story.append(H("٩. المراجع"))
    for r in REFERENCES:
        story.append(Paragraph(ar("• " + r), STY["li"]))

    def footer(canv, doc_):
        canv.saveState()
        canv.setFont("Ar", 8)
        canv.setFillColor(MUTED)
        canv.drawRightString(A4[0] - 20 * mm, 11 * mm, ar("مِيراث — WAICY 2026"))
        canv.drawString(20 * mm, 11 * mm, str(doc_.page))
        canv.setStrokeColor(LINE)
        canv.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)
        canv.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return out


if __name__ == "__main__":
    path = build("/tmp/okal-task-2903413260/w/docs/LLM_Mirath.pdf")
    print("built", path, os.path.getsize(path), "bytes")
