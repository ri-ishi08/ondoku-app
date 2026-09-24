/* ==============================
   progress.js
   勉強記録と設定を localStorage に保存・読み出しする係

   保存の形（キー：ondoku-progress）
   {
     "lesson-01": { "history": ["2026-09-24", "2026-09-24", "2026-09-25"] }
   }
   ・「記録する」を押すたびに、その日の日付を1つ追加する
   ・回数 = history の数、最終日 = history の最後
============================== */

const Progress = (function () {

  // localStorage に保存するときの名前（キー）
  const PROGRESS_KEY = "ondoku-progress";
  const SETTINGS_KEY = "ondoku-settings";

  // 設定の初期値
  const DEFAULT_SETTINGS = {
    speed: 1,
    showJa: true
  };

  // localStorage から読み出して、JSONをオブジェクトに戻す
  // （プライベートブラウズなどで失敗しても止まらないようにする）
  function load(key, fallback) {
    try {
      const text = localStorage.getItem(key);
      return text ? JSON.parse(text) : fallback;
    } catch (error) {
      console.warn("読み込みに失敗しました:", key, error);
      return fallback;
    }
  }

  // オブジェクトをJSONの文字列にして localStorage に保存する
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("保存に失敗しました:", key, error);
    }
  }

  // 今日の日付を "2026-09-24" の形で返す
  function today() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + month + "-" + day;
  }

  // "2026-09-24" を "9/24" の形にする（画面表示用）
  function shortDate(dateText) {
    if (!dateText) return "";
    const parts = dateText.split("-");
    return Number(parts[1]) + "/" + Number(parts[2]);
  }

  // 全Lessonの記録を読み出す
  // 以前の「学習済み」形式のデータは、1回分の記録として引き継ぐ
  function loadAll() {
    const all = load(PROGRESS_KEY, {});
    let changed = false;

    Object.keys(all).forEach(function (id) {
      const item = all[id];
      if (!Array.isArray(item.history)) {
        all[id] = { history: item.done ? [item.lastDate || today()] : [] };
        changed = true;
      }
    });

    if (changed) save(PROGRESS_KEY, all);
    return all;
  }

  // 1つのLessonの記録を、画面で使いやすい形にして返す
  function summarize(history) {
    const list = history || [];
    const todayText = today();
    return {
      count: list.length,
      todayCount: list.filter(function (d) { return d === todayText; }).length,
      lastDate: list.length ? list[list.length - 1] : null
    };
  }

  // ---------- 勉強記録 ----------

  // 1つのLessonの記録を取得
  function getRecord(lessonId) {
    const all = loadAll();
    return summarize(all[lessonId] && all[lessonId].history);
  }

  // 記録を1回追加する
  function addRecord(lessonId) {
    const all = loadAll();
    const item = all[lessonId] || { history: [] };
    item.history.push(today());
    all[lessonId] = item;
    save(PROGRESS_KEY, all);
    return summarize(item.history);
  }

  // 直前の記録を1回取り消す
  function undoRecord(lessonId) {
    const all = loadAll();
    const item = all[lessonId];
    if (item && item.history.length) {
      item.history.pop();
      save(PROGRESS_KEY, all);
    }
    return summarize(item ? item.history : []);
  }

  // 全Lessonの合計（総カウントと今日のカウント）
  function getTotals() {
    const all = loadAll();
    let total = 0;
    let todayTotal = 0;
    Object.keys(all).forEach(function (id) {
      const s = summarize(all[id].history);
      total += s.count;
      todayTotal += s.todayCount;
    });
    return { total: total, today: todayTotal };
  }

  // ---------- 設定（再生速度・訳の表示） ----------

  function getSettings() {
    const saved = load(SETTINGS_KEY, {});
    return Object.assign({}, DEFAULT_SETTINGS, saved);
  }

  // 変えたい項目だけ渡せばOK　例：Progress.saveSettings({ speed: 1.25 })
  function saveSettings(changes) {
    const next = Object.assign(getSettings(), changes);
    save(SETTINGS_KEY, next);
  }

  // 外から使える関数だけを公開する
  return {
    getRecord: getRecord,
    addRecord: addRecord,
    undoRecord: undoRecord,
    getTotals: getTotals,
    shortDate: shortDate,
    getSettings: getSettings,
    saveSettings: saveSettings
  };

})();
