"""Build French pages under fr/ and add language switch + hreflang to all pages."""
import html, json, os, re, sys
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "https://doubleperspective.github.io/Double-Perspective/"
PAGES = ["index.html", "umbral-purge.html", "zenith-zero-sudoku.html", "support.html", "privacy.html"]
EMAIL = open(os.path.join(HERE, "email.txt")).read().strip()
LEGAL_EN = "Registered in Québec · NEQ 2282699877"

en = {}
for line in open(os.path.join(HERE, "en.tsv")):
    i, s = line.rstrip("\n").split("\t", 1); en[int(i)] = s
fr = {}
for line in open(os.path.join(HERE, "fr.tsv")):
    if not line.strip(): continue
    i, s = line.rstrip("\n").split("\t", 1); fr[int(i)] = s
pairs0 = sorted(((en[i], fr[i]) for i in fr if en[i] != fr[i]), key=lambda p: -len(p[0]))
TOK = {f: "\u2063%d\u2063" % k for k, (e, f) in enumerate(pairs0)}
pairs = [(e, TOK[f]) for e, f in pairs0]   # pass 1: English -> token, pass 2: token -> French

def translate(src):
    out = src
    missing = []
    for e, f in pairs:
        n = 0
        for esc_e, esc_f in ((html.escape(e, quote=False), html.escape(f, quote=False)), (e, f)):
            pat = re.compile(r">(\s*)" + re.escape(esc_e) + r"(\s*)<")
            out, k = pat.subn(lambda m: ">" + m.group(1) + esc_f + m.group(2) + "<", out); n += k
            for q in ('"',):
                ea, fa = html.escape(e, quote=True), html.escape(f, quote=True)
                for a, b in ((ea, fa), (esc_e, fa), (e, fa)):
                    pat = re.compile(r'(\s(?:alt|title|aria-label|content|placeholder)=")' + re.escape(a) + '"')
                    out, k = pat.subn(lambda m: m.group(1) + b + '"', out); n += k
    for e, f in pairs0:
        out = out.replace(html.escape(TOK[f], quote=True), html.escape(f, quote=True)).replace(TOK[f], html.escape(f, quote=False))
    return out

def relink(src):
    def fix(m):
        attr, val = m.group(1), m.group(2)
        if re.match(r"^(https?:|#|mailto:|data:|\.\./|/)", val): return m.group(0)
        base = val.split("#")[0].split("?")[0]
        if base in PAGES: return m.group(0)
        return f'{attr}="../{val}"'
    src = re.sub(r'\b(src|href)="([^"]*)"', fix, src)
    src = re.sub(r'\bsrcset="([^"]*)"', lambda m: 'srcset="' + ", ".join(
        p if re.match(r"^(https?:|\.\./)", p.strip()) else "../" + p.strip() for p in m.group(1).split(",")) + '"', src)
    return src

def head_bits(page, lang):
    enurl, frurl = SITE + page, SITE + "fr/" + page
    script = "lang.js" if lang == "en" else "../lang.js"
    return (f'<link rel="alternate" hreflang="en" href="{enurl}"><link rel="alternate" hreflang="fr" href="{frurl}">'
            f'<link rel="alternate" hreflang="x-default" href="{enurl}"><script src="{script}"></script>')

def switch(page, lang):
    if lang == "en":
        en_href, fr_href = f"{page}?lang=en", f"fr/{page}?lang=fr"
    else:
        en_href, fr_href = f"../{page}?lang=en", f"{page}?lang=fr"
    cur = "EN" if lang == "en" else "FR"
    label = "Language" if lang == "en" else "Langue"
    return (f'<details class="lang-menu"><summary aria-label="{label}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>{cur}</summary>'
            f'<div class="lang-list">'
            f'<a href="{en_href}" hreflang="en" lang="en" data-lang-switch="en"' + (' aria-current="true"' if lang == "en" else "") + '>English</a>'
            f'<a href="{fr_href}" hreflang="fr" lang="fr" data-lang-switch="fr"' + (' aria-current="true"' if lang == "fr" else "") + '>Français</a>'
            '</div></details>')

def add_chrome(src, page, lang):
    src = re.sub(r"<link rel=\"alternate\" hreflang=.*?<script src=\"(?:\.\./)?lang\.js\"></script>", "", src)
    src = re.sub(r'<a class="lang-switch".*?</a>', "", src)
    src = re.sub(r'<details class="lang-menu">.*?</details>', "", src)
    src = re.sub(r'<small class="legal">.*?</small>', "", src)
    src = src.replace("</footer>", f'<small class="legal">{LEGAL_EN}</small></footer>', 1)
    src = src.replace("</head>", head_bits(page, lang) + "</head>", 1)
    src = src.replace("</nav>", switch(page, lang) + "</nav>", 1)
    return src

os.makedirs(os.path.join(ROOT, "fr"), exist_ok=True)
ART = re.compile(r'<article class="content-card">.*?</article>', re.S)
for p in PAGES:
    src = open(os.path.join(ROOT, p)).read()
    if p == "privacy.html":
        src = ART.sub(lambda m: open(os.path.join(HERE, "privacy.en.html")).read().replace("{EMAIL}", EMAIL), src, 1)
    src = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", lambda m: EMAIL if m.group(0).endswith(("gmail.com", ".ca", ".com")) and "noreply" not in m.group(0) else m.group(0), src)
    src = add_chrome(src, p, "en")
    open(os.path.join(ROOT, p), "w").write(src)
    f = src
    if p == "privacy.html":
        f = ART.sub(lambda m: open(os.path.join(HERE, "privacy.fr.html")).read().replace("{EMAIL}", EMAIL), f, 1)
    f = translate(f)
    f = f.replace('<html lang="en">', '<html lang="fr">', 1)
    f = relink(f)
    f = add_chrome(f, p, "fr")
    f = f.replace(LEGAL_EN, "Entreprise immatriculée au Québec · NEQ 2282699877")
    f = f.replace(f'content="{SITE}{p}"', f'content="{SITE}fr/{p}"')
    open(os.path.join(ROOT, "fr", p), "w").write(f)
print("built")
