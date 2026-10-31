(() => {
  'use strict';
  if (!/^https?:$/.test(location.protocol) || window.AndroidBridge) return;
  const games = ['solitaire', 'sudoku', 'wordsearch', 'crossword', 'mahjong', 'cribbage'];
  const current = document.body.dataset.zzGame || location.pathname.split('/').slice(-2, -1)[0];
  const next = (games.indexOf(current) + 1) % games.length;
  const names = ['Solitaire', 'Sudoku', 'Word Search', 'Crossword', 'Mahjong', 'Cribbage'];
  const copy = {
    en: ['Advertisement placeholder', 'Discover another puzzle', 'Play'],
    fr: ['Espace publicitaire réservé', 'Découvrez un autre jeu', 'Jouer'],
    de: ['Werbeplatzhalter', 'Ein anderes Rätsel entdecken', 'Spielen'],
    es: ['Espacio publicitario reservado', 'Prueba otro juego', 'Jugar'],
    it: ['Spazio pubblicitario riservato', 'Prova un altro gioco', 'Gioca'],
    pt: ['Espaço publicitário reservado', 'Experimente outro jogo', 'Jogar'],
    ru: ['Место для рекламы', 'Попробуйте другую головоломку', 'Играть'],
    zh: ['广告预留位', '试试其他益智游戏', '开始'],
    ja: ['広告掲載予定スペース', '別のパズルもどうぞ', 'プレイ'],
    ko: ['광고 준비 공간', '다른 퍼즐도 즐겨보세요', '플레이']
  };
  const banner = document.createElement('aside');
  banner.id = 'zz-web-banner';
  banner.setAttribute('translate', 'no');
  const label = document.createElement('small');
  const text = document.createElement('span');
  const title = document.createElement('strong');
  const subtitle = document.createElement('span');
  text.append(title, subtitle);
  const link = document.createElement('a');
  link.href = '../' + games[next] + '/index.html';
  banner.append(label, text, link);
  document.body.append(banner);
  document.documentElement.classList.add('zz-web-demo');
  function render() {
    const lang = (document.documentElement.lang || 'en').split(/[-_]/)[0];
    const words = copy[lang] || copy.en;
    label.textContent = words[0];
    banner.setAttribute('aria-label', words[0]);
    title.textContent = 'Zenith & Zero ' + names[next];
    subtitle.textContent = words[1];
    link.textContent = words[2] + ' →';
  }
  render();
  new MutationObserver(render).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
})();
