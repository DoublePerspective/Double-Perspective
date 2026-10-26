"""Build French pages under fr/ and add language switch + hreflang to all pages."""
import html, json, os, re, sys
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "https://doubleperspective.github.io/Double-Perspective/"
PAGES = ["index.html", "umbral-purge.html", "amber-sage.html", "support.html"]

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
        if base == "privacy.html":
            return f'{attr}="../privacy.html#fr"'
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
        return f'<a class="lang-switch" href="fr/{page}?lang=fr" hreflang="fr" lang="fr" data-lang-switch="fr" aria-label="Français">FR</a>'
    return f'<a class="lang-switch" href="../{page}?lang=en" hreflang="en" lang="en" data-lang-switch="en" aria-label="English">EN</a>'

def add_chrome(src, page, lang):
    src = re.sub(r"<link rel=\"alternate\" hreflang=.*?<script src=\"(?:\.\./)?lang\.js\"></script>", "", src)
    src = re.sub(r'<a class="lang-switch".*?</a>', "", src)
    src = src.replace("</head>", head_bits(page, lang) + "</head>", 1)
    src = src.replace("</nav>", switch(page, lang) + "</nav>", 1)
    return src

os.makedirs(os.path.join(ROOT, "fr"), exist_ok=True)
for p in PAGES:
    src = open(os.path.join(ROOT, p)).read()
    src = add_chrome(src, p, "en")
    open(os.path.join(ROOT, p), "w").write(src)
    f = translate(src)
    f = f.replace('<html lang="en">', '<html lang="fr">', 1)
    f = f.replace('lang="fr">Two perspectives. One solution.', 'lang="en">Two perspectives. One solution.')
    f = relink(f)
    f = add_chrome(f, p, "fr")
    f = f.replace(f'content="{SITE}{p}"', f'content="{SITE}fr/{p}"')
    open(os.path.join(ROOT, "fr", p), "w").write(f)
# privacy: switch jumps to the French section on the same page
pv = open(os.path.join(ROOT, "privacy.html")).read()
pv = re.sub(r'<a class="lang-switch".*?</a>', "", pv)
pv = pv.replace("</nav>", '<a class="lang-switch" href="#fr" hreflang="fr" lang="fr" aria-label="Français">FR</a></nav>', 1)
open(os.path.join(ROOT, "privacy.html"), "w").write(pv)
print("built")
