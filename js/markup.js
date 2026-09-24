/* ==============================
   markup.js
   本文中の { } の印を読み取り、熟語を色付きにする係

   書き方の例
     I {made up my mind} to …    → made up my mind が色付き
     I {wrote} her tips {down}   → 離れた熟語はそれぞれ囲む
     {1:take care of}            → 番号付きも使える（将来の機能用）
============================== */

const Markup = (function () {

  // { } の中身を探すためのパターン
  // 「{」+（番号:）があってもなくてもよい + 中身 +「}」
  const PATTERN = /\{(?:(\d+):)?([^{}]+)\}/g;

  // text を解釈して、element の中に書き込む
  // （innerHTMLを使わず、文字として安全に入れる）
  function render(element, text) {
    element.textContent = "";
    if (!text) return;

    let lastIndex = 0;
    let match;
    PATTERN.lastIndex = 0;

    while ((match = PATTERN.exec(text)) !== null) {
      // 印の前の普通の文字
      if (match.index > lastIndex) {
        element.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      // 印の中身（熟語）
      const span = document.createElement("span");
      span.className = "idiom";
      if (match[1]) {
        span.dataset.idiom = match[1]; // 番号付きのときだけ番号を持たせる
      }
      span.textContent = match[2];
      element.appendChild(span);

      lastIndex = PATTERN.lastIndex;
    }

    // 最後の印より後ろの普通の文字
    if (lastIndex < text.length) {
      element.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  // 印を取り除いた文字だけを返す（将来、語数を数えるときなどに使う）
  function plain(text) {
    return (text || "").replace(PATTERN, "$2");
  }

  return {
    render: render,
    plain: plain
  };

})();
