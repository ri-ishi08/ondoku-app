/* ==============================
   manage.js
   教材の取り込み・一覧・削除をする係

   取り込みのルール
   ・JSONの "audioFile" と同じ名前の音声ファイルを組み合わせて保存する
   ・音声だけ選んだ場合は、保存済みのLessonの中から名前が合うものに追加する
============================== */

(function () {

  const fileInput = document.getElementById("file-input");
  const importLabel = document.getElementById("import-label");
  const importLabelText = document.getElementById("import-label-text");
  const resultList = document.getElementById("result-list");
  const savedList = document.getElementById("saved-list");
  const savedEmpty = document.getElementById("saved-empty");
  const usageEl = document.getElementById("usage");

  // ---------- 小さな道具 ----------

  // バイト数を "0.8MB" のような表示にする
  function formatSize(bytes) {
    if (!bytes) return "0KB";
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + "MB";
    return Math.max(1, Math.round(bytes / 1024)) + "KB";
  }

  function isJson(file) {
    return /\.json$/i.test(file.name);
  }

  function isAudio(file) {
    return /\.(mp3|m4a)$/i.test(file.name) || (file.type || "").indexOf("audio/") === 0;
  }

  function lessonLabel(lesson) {
    return lesson.no != null ? "Lesson " + lesson.no : lesson.id;
  }

  // 結果を1行追加する（type：ok / warn / error）
  function addResult(type, text) {
    const li = document.createElement("li");
    li.className = "result-item is-" + type;
    const mark = { ok: "✓", warn: "⚠", error: "✗" }[type];
    li.textContent = mark + " " + text;
    resultList.appendChild(li);
  }

  // 端末の保存データが勝手に消されにくくなるよう、お願いしておく
  function requestPersist() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }
  }

  // ---------- 取り込み ----------

  // JSONファイルを読み、教材として正しい形か確認する
  async function readLessonFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error("JSONの書き方に誤りがあります（カンマや \" を確認してください）");
    }
    if (Array.isArray(data)) {
      throw new Error("これは目次ファイル（lessons.json）です。取り込みは不要です");
    }
    if (!data.id || !data.title || !Array.isArray(data.paragraphs)) {
      throw new Error("教材の形になっていません（id・title・paragraphs が必要です）");
    }
    return { lesson: data, size: file.size };
  }

  async function importFiles(files) {
    const jsonFiles = files.filter(isJson);
    const audioFiles = files.filter(isAudio);
    const usedAudio = new Set();

    // 取り込み前の保存状況（音声が保存済みかを知るため）
    const before = await DB.listLessons();
    const savedById = {};
    before.forEach(function (item) { savedById[item.id] = item; });

    // 1. JSON（本文）を取り込み、同じ名前の音声があれば一緒に保存
    for (const file of jsonFiles) {
      try {
        const read = await readLessonFile(file);
        const lesson = read.lesson;
        await DB.saveLesson(lesson, read.size);

        const audio = audioFiles.find(function (a) { return a.name === lesson.audioFile; });
        if (audio) {
          await DB.saveAudio(lesson.id, audio);
          usedAudio.add(audio);
          addResult("ok", lessonLabel(lesson) + "「" + lesson.title + "」を取り込みました");
        } else if (savedById[lesson.id] && savedById[lesson.id].hasAudio) {
          addResult("ok", lessonLabel(lesson) + "：本文を更新しました（音声は保存済み）");
        } else {
          addResult("warn", lessonLabel(lesson) + "：本文を取り込みました。音声（" +
            (lesson.audioFile || "ファイル名の指定なし") + "）が見つかりません。あとから音声だけ選べば追加できます");
        }
      } catch (error) {
        addResult("error", file.name + "：" + error.message);
      }
    }

    // 2. 組み合わせが見つからなかった音声は、保存済みのLessonに追加できないか探す
    const leftover = audioFiles.filter(function (a) { return !usedAudio.has(a); });
    if (leftover.length) {
      const saved = await DB.listLessons();
      for (const audio of leftover) {
        const match = saved.find(function (item) { return item.audioFile === audio.name; });
        if (match) {
          await DB.saveAudio(match.id, audio);
          addResult("ok", (match.no != null ? "Lesson " + match.no : match.id) + "：音声を追加しました");
        } else {
          addResult("error", audio.name + "：この音声を使うLessonがありません。先にJSONを取り込むか、JSONと一緒に選んでください");
        }
      }
    }

    // 3. JSONでも音声でもないファイル
    files.filter(function (f) { return !isJson(f) && !isAudio(f); }).forEach(function (f) {
      addResult("error", f.name + "：取り込めない種類のファイルです（JSONとmp3のみ）");
    });
  }

  fileInput.addEventListener("change", async function () {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    resultList.textContent = "";
    importLabel.classList.add("is-busy");
    importLabelText.textContent = "取り込み中…";
    fileInput.disabled = true;

    try {
      await importFiles(files);
      requestPersist();
    } catch (error) {
      console.error(error);
      addResult("error", "取り込みに失敗しました（" + error.message + "）");
    }

    fileInput.value = ""; // 同じファイルをもう一度選べるようにする
    fileInput.disabled = false;
    importLabel.classList.remove("is-busy");
    importLabelText.textContent = "ファイルを選ぶ";
    renderSaved();
  });

  // ---------- 保存済みの教材 ----------

  async function renderUsage(lessons) {
    const total = lessons.reduce(function (sum, item) { return sum + item.size; }, 0);
    let text = "教材 " + lessons.length + "件・" + formatSize(total);

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage != null) {
          text += "（アプリ全体で約 " + formatSize(estimate.usage) + " 使用中）";
        }
      } catch (error) { /* 表示できなくても問題なし */ }
    }
    usageEl.textContent = text;
  }

  function makeSavedItem(item) {
    const li = document.createElement("li");
    li.className = "saved-item";

    const text = document.createElement("div");
    text.className = "saved-text";

    const name = document.createElement("p");
    name.className = "saved-name";
    name.textContent = (item.no != null ? item.no + "  " : "") + item.title;
    name.lang = "en";
    text.appendChild(name);

    const meta = document.createElement("p");
    meta.className = "saved-meta";
    meta.textContent = formatSize(item.size) + (item.hasAudio ? "" : "・音声なし");
    if (!item.hasAudio) meta.classList.add("is-warn");
    text.appendChild(meta);

    li.appendChild(text);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-btn";
    del.textContent = "削除";
    del.addEventListener("click", async function () {
      const ok = window.confirm(
        "「" + item.title + "」をこの端末から削除しますか？\n（勉強記録は残ります。使うときはもう一度取り込んでください）"
      );
      if (!ok) return;
      await DB.deleteLesson(item.id);
      renderSaved();
    });
    li.appendChild(del);

    return li;
  }

  async function renderSaved() {
    try {
      const lessons = await DB.listLessons();
      savedList.textContent = "";
      lessons.forEach(function (item) {
        savedList.appendChild(makeSavedItem(item));
      });
      savedEmpty.hidden = lessons.length > 0;
      renderUsage(lessons);
    } catch (error) {
      console.error(error);
      usageEl.textContent = "保存済みの教材を読み込めませんでした（" + error.message + "）";
    }
  }

  renderSaved();

})();
