/* ==============================
   list.js
   Lesson一覧と、勉強記録（総カウント・今日のカウント）を表示する係

   ・自分の教材：private/lessons.json に書いたファイルを順に読み込む
   ・サンプル教材：下の SAMPLE_FILES に書いたもの
============================== */

(function () {

  const PRIVATE_FOLDER = "private/";
  const PRIVATE_INDEX = PRIVATE_FOLDER + "lessons.json";
  const SAMPLE_FILES = ["sample/sample-01.json"];

  // HTMLの部品を取得
  const totalEl = document.getElementById("total-count");
  const todayEl = document.getElementById("today-count");
  const privateList = document.getElementById("private-list");
  const privateNote = document.getElementById("private-note");
  const sampleList = document.getElementById("sample-list");

  // 読み込んだLessonを覚えておく（戻ってきたときの再表示用）
  let loaded = { private: [], sample: [] };

  // ---------- 読み込み ----------

  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("見つかりません");
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error("JSONの書き方に誤りがあります");
    }
  }

  // ファイルの一覧から、各LessonのJSONを読み込む
  // 1つ失敗しても、ほかは表示できるようにする
  async function loadLessons(files) {
    const results = await Promise.all(files.map(async function (file) {
      try {
        const lesson = await fetchJson(file);
        return { file: file, lesson: lesson };
      } catch (error) {
        return { file: file, error: error.message };
      }
    }));

    // 番号（no）の順に並べる。番号がないものは後ろへ
    return results.sort(function (a, b) {
      const na = a.lesson && a.lesson.no != null ? a.lesson.no : 9999;
      const nb = b.lesson && b.lesson.no != null ? b.lesson.no : 9999;
      return na - nb;
    });
  }

  // ---------- 表示 ----------

  function makeItem(entry) {
    const li = document.createElement("li");

    // 読み込めなかったLesson
    if (entry.error) {
      li.className = "lesson-error";
      li.textContent = "「" + entry.file + "」を読み込めません（" + entry.error + "）";
      return li;
    }

    const lesson = entry.lesson;
    const record = Progress.getRecord(lesson.id || entry.file);

    const a = document.createElement("a");
    a.className = "lesson-link";
    a.href = "lesson.html?file=" + encodeURIComponent(entry.file);

    const no = document.createElement("span");
    no.className = "lesson-no";
    no.textContent = lesson.no != null ? lesson.no : "";
    a.appendChild(no);

    const text = document.createElement("div");
    text.className = "lesson-text";
    const name = document.createElement("p");
    name.className = "lesson-name";
    name.lang = "en";
    name.textContent = lesson.title || entry.file;
    text.appendChild(name);
    if (lesson.titleJa) {
      const nameJa = document.createElement("p");
      nameJa.className = "lesson-name-ja";
      nameJa.textContent = lesson.titleJa;
      text.appendChild(nameJa);
    }
    a.appendChild(text);

    const count = document.createElement("div");
    count.className = "lesson-count";
    const num = document.createElement("p");
    num.className = "lesson-count-num";
    count.appendChild(num);

    if (record.count === 0) {
      num.classList.add("is-zero");
      num.textContent = "未記録";
    } else {
      num.textContent = record.count + "回";
      const date = document.createElement("p");
      date.className = "lesson-count-date";
      date.textContent = "最終 " + Progress.shortDate(record.lastDate);
      count.appendChild(date);
    }
    a.appendChild(count);

    li.appendChild(a);
    return li;
  }

  function renderList(listEl, entries) {
    listEl.textContent = "";
    entries.forEach(function (entry) {
      listEl.appendChild(makeItem(entry));
    });
  }

  function renderTotals() {
    const totals = Progress.getTotals();
    totalEl.textContent = totals.total;
    todayEl.textContent = totals.today;
  }

  function renderAll() {
    renderTotals();
    renderList(privateList, loaded.private);
    renderList(sampleList, loaded.sample);
  }

  function showPrivateNote(text) {
    privateNote.textContent = text;
    privateNote.hidden = false;
  }

  // ---------- はじめに実行 ----------

  async function init() {
    renderTotals();

    if (location.protocol === "file:") {
      showPrivateNote("ファイルをダブルクリックで開いています。VS Codeの「Live Server」で開き直してください。");
      return;
    }

    // 自分の教材
    try {
      const files = await fetchJson(PRIVATE_INDEX);
      if (!Array.isArray(files) || files.length === 0) {
        showPrivateNote("private/lessons.json に教材のファイル名が書かれていません。");
      } else {
        loaded.private = await loadLessons(files.map(function (name) {
          return PRIVATE_FOLDER + name;
        }));
      }
    } catch (error) {
      showPrivateNote(
        error.message === "見つかりません"
          ? "自分の教材を表示するには、private フォルダに lessons.json（教材ファイル名の一覧）を置いてください。"
          : "private/lessons.json の書き方に誤りがあります。カンマ（,）や \" を確認してください。"
      );
    }

    // サンプル教材
    loaded.sample = await loadLessons(SAMPLE_FILES);

    renderAll();
  }

  // Lesson画面から「戻る」で帰ってきたときも、回数を最新にする
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) renderAll();
  });

  init();

})();
