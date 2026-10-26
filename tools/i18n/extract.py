import json, re, sys
from bs4 import BeautifulSoup, Comment
PAGES = ['index.html','umbral-purge.html','amber-sage.html','support.html']
META = {('name','description'),('property','og:title'),('property','og:description'),('property','og:image:alt'),('name','twitter:title'),('name','twitter:description')}
def skip(t):
    return not re.search(r'[A-Za-z]{2}', t) or t in {'Double Perspective'}
def strings(soup):
    out = []
    for t in soup.find_all(string=True):
        if isinstance(t, Comment) or t.parent.name in ('script','style'): continue
        if t.find_parent('svg') is not None: continue
        s = t.strip()
        if s and not skip(s): out.append(s)
    for el in soup.find_all(True):
        if el.find_parent('svg') is not None: continue
        for a in ('alt','title','aria-label','placeholder'):
            v = el.get(a)
            if v and not skip(v.strip()): out.append(v.strip())
        if el.name == 'meta':
            for k, v in META:
                if el.get(k) == v and el.get('content') and not skip(el['content']): out.append(el['content'].strip())
    seen, res = set(), []
    for s in out:
        if s not in seen: seen.add(s); res.append(s)
    return res
allm = {}
for p in PAGES:
    allm[p] = strings(BeautifulSoup(open(p).read(), 'html.parser'))
json.dump(allm, open(sys.argv[1], 'w'), ensure_ascii=False, indent=0)
uniq = []
for p in PAGES:
    for s in allm[p]:
        if s not in uniq: uniq.append(s)
print(len(uniq), sum(map(len, uniq)))
open(sys.argv[2], 'w').write("\n".join(f"{i}\t{s}" for i, s in enumerate(uniq)))
