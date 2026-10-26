/* Double Perspective: open each page in the visitor's language (English or French).
   An explicit choice (the FR/EN switch, or ?lang=) is remembered; otherwise the
   browser's preferred language decides, defaulting to English. */
(function () {
  var KEY = "dp-lang";
  var cur = (document.documentElement.lang || "en").slice(0, 2) === "fr" ? "fr" : "en";
  var pref = null;
  try {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "fr" || q === "en") { pref = q; localStorage.setItem(KEY, q); }
  } catch (e) {}
  if (!pref) { try { pref = localStorage.getItem(KEY); } catch (e) {} }
  if (pref !== "fr" && pref !== "en") {
    pref = "en";
    var ls = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "en"];
    for (var i = 0; i < ls.length; i++) {
      var l = String(ls[i] || "").slice(0, 2).toLowerCase();
      if (l === "fr" || l === "en") { pref = l; break; }
    }
  }
  if (pref !== cur) {
    var alt = document.querySelector('link[rel="alternate"][hreflang="' + pref + '"]');
    if (alt) {
      // build the twin page's address from this one, so it works on any host
      var path = location.pathname, file = path.slice(path.lastIndexOf("/") + 1) || "index.html";
      var dir = path.slice(0, path.lastIndexOf("/") + 1);
      var target = pref === "fr" ? dir + "fr/" + file : dir.replace(/fr\/$/, "") + file;
      location.replace(target + location.hash);
      return;
    }
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-lang-switch]");
    if (a) { try { localStorage.setItem(KEY, a.getAttribute("data-lang-switch")); } catch (err) {} }
  });
})();
