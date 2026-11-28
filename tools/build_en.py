# -*- coding: utf-8 -*-
"""build_en.py — Mirath submission document (English), styled after the Safeline format.

Run:  python3 tools/build_en.py
Out:  docs/LLM_Mirath_EN.pdf
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Spacer, PageBreak, Table, TableStyle, Paragraph)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.shapes import (Rect, String, Line, Circle, Polygon, Group)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIFB = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
pdfmetrics.registerFont(TTFont("S", SERIF))
pdfmetrics.registerFont(TTFont("SB", SERIFB))

NAVY = colors.HexColor("#1c3f5e")
INK = colors.HexColor("#1a1a1a")
GREY = colors.HexColor("#5a5a5a")
RULE = colors.HexColor("#c9d6e0")

ST = {
    "title": ParagraphStyle("t", fontName="SB", fontSize=24, leading=32,
                            alignment=TA_CENTER, textColor=INK, spaceAfter=6),
    "sub": ParagraphStyle("s", fontName="S", fontSize=10, leading=16,
                          alignment=TA_CENTER, textColor=GREY, spaceAfter=4),
    "sec": ParagraphStyle("sec", fontName="SB", fontSize=15, leading=22,
                          textColor=NAVY, spaceBefore=18, spaceAfter=8),
    "num": ParagraphStyle("n", fontName="SB", fontSize=11.5, leading=18,
                          textColor=INK, spaceBefore=12, spaceAfter=5),
    "body": ParagraphStyle("b", fontName="S", fontSize=9.6, leading=15.4,
                           textColor=INK, alignment=TA_LEFT, spaceAfter=8),
    "bul": ParagraphStyle("bl", fontName="S", fontSize=9.6, leading=15.4,
                          textColor=INK, leftIndent=16, bulletIndent=4, spaceAfter=4),
    "cell": ParagraphStyle("c", fontName="S", fontSize=8.2, leading=12.4, textColor=INK),
    "cellb": ParagraphStyle("cb", fontName="SB", fontSize=8.2, leading=12.4, textColor=INK),
    "cap": ParagraphStyle("cp", fontName="S", fontSize=8, leading=12,
                          alignment=TA_CENTER, textColor=GREY, spaceBefore=4),
}


def P(t, s="body"):
    return Paragraph(t, ST[s])


def B(t):
    return Paragraph(t, ST["bul"], bulletText="•")


def NUM(n, t):
    return Paragraph("<b>%s</b>&nbsp;&nbsp;%s" % (n, t), ST["num"])


def table(rows, widths):
    data = [[Paragraph(c, ST["cellb"] if i == 0 else ST["cell"]) for c in r]
            for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef3f7")),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t



def workflow_diagram(width=158 * mm, height=30 * mm):
    """مخطط مسار الوكيل — ثلاث طبقات كما في مستند Safeline."""
    d = Drawing(width, height)
    boxes = [
        ("User message\n+ photo", "#e8f1f7"),
        ("Triage\n(danger rules)", "#fdeaea"),
        ("Evidence lookup\n20 remedies", "#eef7ee"),
        ("Writer\nGPT-6 Luna", "#eef2fa"),
        ("Independent\nverifier", "#fdf6e3"),
        ("13 safety gates", "#fdeaea"),
        ("First aid +\nrecommendation +\nwarning", "#eef7ee"),
    ]
    bw, bh, gap = 20 * mm, 13 * mm, 3.2 * mm
    total = len(boxes) * bw + (len(boxes) - 1) * gap
    x0 = (width - total) / 2
    y = height / 2 - bh / 2 + 1 * mm
    prev = None
    for i, (label, col) in enumerate(boxes):
        x = x0 + i * (bw + gap)
        d.add(Rect(x, y, bw, bh, fillColor=colors.HexColor(col),
                   strokeColor=colors.HexColor("#b8c8d4"), strokeWidth=0.7, rx=2, ry=2))
        ty = y + bh - 4.5 * mm
        for line in label.split("\n"):
            d.add(String(x + bw / 2, ty, line, fontName="S", fontSize=6.2,
                         textAnchor="middle", fillColor=INK))
            ty -= 3.2 * mm
        if prev is not None:
            d.add(Line(prev, y + bh / 2, x, y + bh / 2,
                       strokeColor=colors.HexColor("#8fa9bb"), strokeWidth=1.0))
            d.add(Polygon([x - 0, y + bh / 2, x - 2.4, y + bh / 2 + 1.6,
                           x - 2.4, y + bh / 2 - 1.6],
                          fillColor=colors.HexColor("#8fa9bb"), strokeColor=None))
        prev = x + bw
    return d


def build(out, chat_url=None, bot_url=None):
    bot_url = bot_url or "https://mirath-production-a1eae3b5.up.railway.app/"
    doc = SimpleDocTemplate(out, pagesize=A4,
                            rightMargin=22 * mm, leftMargin=22 * mm,
                            topMargin=20 * mm, bottomMargin=20 * mm,
                            title="Mirath — WAICY 2026 Submission")
    f = []
    f.append(P("Mirath", "title"))
    f.append(P("A Safe Wound-Care Advisor", "sub"))
    f.append(P("Track: LLM &amp; AI Agent &nbsp;·&nbsp; WAICY 2026 &nbsp;·&nbsp; Haneen Mohammed", "sub"))
    f.append(Spacer(1, 10 * mm))

    # I
    f.append(P("I. &nbsp;Service", "sec"))
    f.append(P("Description", "num"))
    f.append(P("Mirath is a conversational wound-care advisor for people who cannot reach medical help quickly: remote villages, areas cut off by conflict, and places where the nearest hospital is a risk in itself. For these users a minor wound is not a minor event — an untreated wound becomes infected, and an infection without access to a doctor can end a life."))
    f.append(P("The service is deliberately narrow. Mirath handles wounds only: cuts, grazes, superficial lacerations, minor burns, small boils, and bites. It does not diagnose illness, prescribe medicine, or give dosages. Narrowing the scope is what makes verification possible — a finite set of practices can be checked against named sources, whereas a general health advisor cannot."))
    f.append(P("What Mirath adds is judgement. A person holding a wound already has access to information; what they lack is a way to tell sound practice from unsound. Traditional remedies are familiar and passed down with confidence, yet they mix what science supports with what it does not. Mirath sorts that knowledge and states its verdict on each remedy, with the evidence behind it."))

    f.append(P("Who it is for", "num"))
    f.append(P("Four variables change the substance and ordering of every response: the age of the injured person; the presence of a relevant condition such as diabetes, pregnancy, immune compromise, or advanced age; the distance from medical care; and the nature, site, and bleeding state of the wound. A child with a knee abrasion, a diabetic adult with a foot wound, and a person in a conflict zone with a bleeding hand receive materially different answers, because the same wound carries different risk for each."))
    f.append(P("Mirath does not interrogate its user before helping. It gives guidance first and asks at most one clarifying question afterwards, because a person who is bleeding has neither the time nor the composure for an intake interview."))

    f.append(P("Workflow", "num"))
    f.append(P("Every reply passes through seven stages. The last three are what distinguish Mirath from a first-aid leaflet: a dedicated verifier reads the draft, thirteen automated gates inspect it, and only then is it delivered."))
    f.append(workflow_diagram())
    f.append(P("Figure 1. The agent pipeline. Nothing reaches the user without passing all thirteen gates.", "cap"))

    f.append(P("What Mirath does", "num"))
    for t in [
        "Reads a wound description <b>or a photograph</b>, and states plainly what a photograph cannot establish — depth, contamination, and severity.",
        "<b>Gives first aid first</b>, in two to five direct steps, before anything else.",
        "<b>Recommends traditional practice explicitly</b> — \"I recommend applying approved calendula ointment thinly, twice daily\" — with the evidence for it cited by PMID.",
        "<b>Warns against unproven practice by name</b>, rather than omitting it and leaving the user to guess.",
        "Declares a medical emergency immediately when one is present, and refuses traditional remedies entirely in that case.",
    ]:
        f.append(B(t))

    # II
    f.append(P("II. &nbsp;Motivation", "sec"))
    f.append(P("The project began from an observation that is difficult to ignore once it is made: wounds are common, and the knowledge required to treat them safely is not. Many people are injured and few know what to do, and the consequence is rarely confined to pain."))
    f.append(P("There is a second problem, and it is the one this project is actually about. In places without reliable medical access, traditional remedies are not a curiosity — they are the available medicine. Some of them work. Some do nothing. Some cause harm: applying powder or oil to an open wound traps bacteria and blocks drainage. A person in that position has no way to tell which is which, and the confidence with which a remedy is passed down is not evidence of anything."))
    f.append(P("The principle the project was built on: <i>heritage for context, science for the decision</i>. The formulation recorded in the project's own design notes reads: \"Your goal is to help and protect the person, not to prove that traditional medicine is correct or to defend it.\" This is not a rejection of tradition. It is a refusal to let tradition decide alone."))

    # III
    f.append(P("III. &nbsp;Chat History and Chatbot Link", "sec"))
    f.append(P("Chat history (10+ exchanged messages, final edition):", "body"))
    f.append(P(chat_url or bot_url))
    f.append(P("Live chatbot:", "body"))
    f.append(P(bot_url))
    f.append(P("<i>Note: the hosted instance currently runs an earlier build and exposes ten remedies rather than the full twenty documented here. The repository at github.com/siudro/mirath contains the complete implementation.</i>", "cap"))

    # IV
    f.append(P("IV. &nbsp;Iterative AI Design Process", "sec"))
    f.append(P("Idea", "num"))
    f.append(P("The project began with the observation that knowledge about wound care is widely available but entirely unsorted. An initial concept of a general traditional-medicine advisor was rejected as too broad to be verifiable. The concept was narrowed to wound care, where a finite set of practices could be examined individually."))

    f.append(P("Advisor design", "num"))
    f.append(P("A knowledge base of <b>twenty practices</b> was assembled, each classified by the strength of evidence for the specific injury it is used for, and each traced to a named source with a PMID where one exists."))
    f.append(Spacer(1, 3 * mm))
    f.append(table([
        ["Practice", "Verdict", "Basis"],
        ["Clean water", "Evidenced", "WHO, Community First Aid Response"],
        ["Medical honey", "Evidenced (burns)", "Cochrane 2015; 22-RCT review, PMID 42099328"],
        ["Aloe vera", "Promising (burns)", "RCT meta-analysis, PMID 38605441"],
        ["Turmeric", "Promising", "19 human trials, PMID 41388841"],
        ["Calendula", "Promising", "PMID 41304647, 41199840"],
        ["Propolis", "Promising", "PMID 42943329, 42943312"],
        ["Centella asiatica", "Animal evidence", "Meta-analysis, 16 preclinical studies, PMID 42772613"],
        ["Pomegranate peel", "Animal evidence", "PMID 15298776, 24044494"],
        ["Myrrh", "Limited human", "PMID 32971163, 33473242; EMA/HMPC"],
        ["Warm compress", "Limited", "Small boils only"],
        ["Neem / Thyme / Green tea / Tea tree", "Laboratory only", "Various in-vitro studies"],
        ["Camphor oil", "Not recommended", "DailyMed: do not apply to wounds"],
        ["Oak gall", "No evidence", "PubMed search returned zero results"],
    ], [52 * mm, 34 * mm, 82 * mm]))
    f.append(P("Table 1. The knowledge base, by verdict. Every row is verifiable by its PMID.", "cap"))

    f.append(P("Three principles governed the prompt. Traditional practices are admitted only when evidence exists for the specific injury under discussion, never as a substitute for first aid. Each practice must carry a verdict — naming a remedy without judging it is treated as a failure. And the three evidence phrases are held strictly apart: <i>no adequate human studies</i>, <i>no reliable evidence</i>, and <i>demonstrated ineffective</i> are never interchanged."))
    f.append(P("A further decision concerned classical sources. Ibn Sina and al-Razi are cited to document how physicians of the classical period approached wounds, and the prompt requires that any mention of them be accompanied by the statement that this is historical context on which no treatment decision is based. Ibn Sina recorded cleaning, binding, and covering wounds — which is what the WHO recommends today. That demonstrates some ancient practices were sound and survived scrutiny; it does not make classical authority into evidence."))

    f.append(P("Testing", "num"))
    f.append(P("Testing proceeded in three layers. First, the advisor was exercised operationally against the live model, and its actual responses read and assessed against the prompt's requirements. Second, adversarial cases were constructed — blast injury, deep bleeding wounds, a user who refuses to stop asking for herbs — to find where the design breaks. Third, <b>177 automated tests</b> verified the application's internal behaviour without a network connection."))
    f.append(P("The most important finding came from the live layer, and none of the offline tests could have caught it: <b>the user's message was never being sent to the model at all.</b> The context was built from chat history only. The advisor had been answering a blank conversation."))

    f.append(P("Error analysis", "num"))
    f.append(P("Every failure encountered during development was recorded with its cause and its remedy."))
    f.append(table([
        ["Failure", "How it surfaced", "Correction"],
        ["Advice preceded questions", "Contradicted intended experience", "Order fixed in the prompt"],
        ["Classical practice omitted in some replies", "Discussion ended without a traditional-medicine section", "Mandatory section in every wound response"],
        ["Water named as the only traditional remedy", "Replies read as a first-aid leaflet", "Injury-aware selection; gate rejects water-only"],
        ["Verdicts listed with no instruction attached", "User could not act on \"unproven\"", "Every remedy carries an executable recommendation"],
        ["Clinical recommendation hedged as \"if available\"", "Defeated the purpose of advising", "Gate rejects conditional phrasing"],
        ["Oak gall and pomegranate peel treated as one", "Evidence attributed to the wrong material", "Explicit warning that the two are distinct"],
        ["Astringents described as narrowing blood vessels", "Incorrect physiological justification", "Removed; bleeding is controlled by direct pressure"],
        ["User message never reached the model", "Model replied \"you have not told me my role\"", "Current turn appended to context; regression test added"],
        ["Wrong model identifier", "Live API rejected every request", "Corrected after listing all 99 account models"],
        ["Rejected request parameters", "max_tokens and temperature refused by GPT-6", "max_completion_tokens; default temperature only"],
        ["Empty replies despite success status", "Reasoning tokens consumed the whole budget", "Token budget raised to 6000"],
    ], [52 * mm, 52 * mm, 64 * mm]))
    f.append(P("Table 2. Documented failures and their corrections.", "cap"))

    f.append(P("The message-delivery failure is the most instructive of these. It was invisible on inspection — the interface looked correct, the API returned success, and the prose was fluent. It surfaced only because the test asked what the model actually received, rather than whether the response looked plausible. That is the difference between verification and approval."))

    f.append(P("Improvement", "num"))
    f.append(P("The system prompt grew from roughly 3,500 characters to just over 20,000. Each addition answered a specific observed failure rather than a general sense that more detail would help. After each revision, an automated check confirmed every mandatory clause was still present, since a long prompt is as easy to break as a short one."))
    f.append(P("The design also converged on a structural rule that had not been planned: a reply is delivered only if it passes <b>thirteen automated gates</b> that inspect the text — its opening line, its question count, whether an unproven remedy carries a warning, whether a promising remedy was filed under \"avoid\", whether a citation resolves to a real source. A reply that fails is corrected once, and if it still fails a safety-critical check, it is replaced with a safe emergency response rather than delivered."))
    f.append(P("This last mechanism was added after a live test produced an emergency reply that opened with \"press on the wound\" instead of directing the user to a doctor. The gate caught it; the correction logic then accepted an equally failing rewrite; and the unsafe text was delivered. That sequencing bug is now fixed and covered by two tests."))

    # V
    f.append(P("V. &nbsp;Limitations", "sec"))
    for t in [
        "<b>A photograph cannot establish severity.</b> Mirath states this explicitly in every reply that includes an image, and never judges a wound \"simple\" from a picture.",
        "<b>Most traditional practice lacks adequate clinical evidence.</b> Of twenty entries, two reach \"evidenced\" for a specific injury. The rest are labelled honestly rather than promoted.",
        "<b>No diagnosis, no medicine, no dosage.</b> The advisor will not name a drug or a dose, including over-the-counter analgesics.",
        "<b>Emergency cases are excluded from the traditional layer entirely.</b> Blast injury or severe bleeding means referral, full stop.",
        "<b>Textual attribution to Ibn Sina and al-Razi carries caveats</b> noted here rather than in the advisor's replies: manuscript editions and translations vary, and page citations are not given without a specified edition.",
        "<b>The knowledge base is finite and manually curated.</b> A remedy absent from it is not judged — Mirath says so rather than improvising.",
        "<b>Medical liability.</b> The project is an educational prototype. It does not replace clinical assessment and says so in every interface state.",
    ]:
        f.append(B(t))

    # VI
    f.append(P("VI. &nbsp;Future Development", "sec"))
    for t in [
        "Live literature search per query, so the evidence base extends beyond a curated file.",
        "Offline operation, since the users who most need the advisor often have no connection.",
        "Additional languages beyond Arabic and English.",
        "Expanding the knowledge base only where a verifiable study exists — count follows evidence, not the reverse.",
        "Photograph quality guidance, since image usability is the most common practical failure.",
    ]:
        f.append(B(t))

    # VII
    f.append(P("VII. &nbsp;Conclusion", "sec"))
    f.append(P("Mirath demonstrates that traditional medicine can be presented honestly: a clear recommendation, with its evidence and its limits, and never as a substitute for first aid or clinical care. The value is not in the number of remedies. It is that every recommendation carries its source, and that automated gates prevent an unsafe reply from reaching the person holding the wound."))
    f.append(P("The project's own standard is the one it was designed against: help and protect the person, do not defend the tradition."))

    # VIII
    f.append(P("VIII. &nbsp;References", "sec"))
    refs = [
        "World Health Organization. <i>Community First Aid Response.</i> WHO.",
        "Cochrane Library (2015). <i>Honey for acute and chronic wounds.</i> PMID 25742878.",
        "Nutrients (2024). <i>Honey Dressings in Chronic Wounds: Updated Systematic Review and Meta-Analysis.</i> PMID 39125335.",
        "Cureus (2026). <i>Honey Dressing in Postoperative Wounds, Ulcers and Burns.</i> PMID 42099328.",
        "Journal of Burn Care &amp; Research (2024). <i>Aloe Vera on Burn Injuries: Systematic Review and Meta-Analysis of RCTs.</i> PMID 38605441.",
        "Journal of Ethnopharmacology (2027). <i>Centella Asiatica in Wound Healing: Systematic Review and Meta-Analysis.</i> PMID 42772613.",
        "Plants (2025). <i>Calendula Officinalis in Wound Healing.</i> PMID 41304647.",
        "International Wound Journal (2026). <i>Manuka Honey in Wound Healing.</i> PMID 42117760.",
        "Journal of Tissue Viability (2026). <i>Hypericum Perforatum for Diabetes-Related Wounds.</i> PMID 42994168.",
        "International Journal of Molecular Sciences (2026). <i>Azadirachta Indica (Neem) in Wound Healing.</i> PMID 43027840.",
        "Journal of Cosmetic Dermatology (2025). <i>Turmeric and Wound Healing.</i> PMID 41388841.",
        "European Medicines Agency, HMPC. <i>EMA/164109/2019 — Myrrh.</i>",
        "DailyMed. <i>Eucalyptus Oil Label.</i> \"DO NOT APPLY TO WOUNDS OR DAMAGED SKIN.\"",
        "Ibn Sina. <i>Al-Qanun fi al-Tibb</i>, Bab Hawabis al-Sayalan (historical context only).",
        "Al-Razi. <i>Al-Hawi fi al-Tibb.</i> Dar Ihya al-Turath al-Arabi, ed. Haytham Khalifa al-Taimi.",
    ]
    for i, r in enumerate(refs, 1):
        f.append(Paragraph("[%d]&nbsp;&nbsp;%s" % (i, r), ST["body"]))

    def foot(c, d):
        c.saveState()
        c.setFont("S", 8)
        c.setFillColor(GREY)
        c.drawString(22 * mm, 11 * mm, "Mirath — WAICY 2026")
        c.drawRightString(A4[0] - 22 * mm, 11 * mm, str(d.page))
        c.setStrokeColor(RULE)
        c.line(22 * mm, 15 * mm, A4[0] - 22 * mm, 15 * mm)
        c.restoreState()

    doc.build(f, onFirstPage=foot, onLaterPages=foot)
    return out


if __name__ == "__main__":
    p = build(os.path.join(ROOT, "docs", "LLM_Mirath_EN.pdf"))
    print("built", p, os.path.getsize(p), "bytes")
