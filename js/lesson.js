/* ==============================
   lesson.js
   教材JSONを読み込んで画面に表示し、
   訳の切り替え・勉強記録・熟語一覧を動かす係
============================== */

(function () {

  // どの教材を開くか
  //   lesson.html                                → サンプル教材
  //   lesson.html?id=lesson-01                   → 端末に取り込んだ教材
  //   lesson.html?file=private/lesson-01.json    → PCの private フォルダの教材（確認用）
  // ファイルから開くとき、音声ファイルはJSONと同じフォルダから探す
  const DEFAULT_FILE = "sample/sample-01.json";
  const params = new URLSearchParams(location.search);
  const importedId = params.get("id");
  const lessonFile = params.get("file") || DEFAULT_FILE;
  const lessonFolder = lessonFile.includes("/")
    ? lessonFile.slice(0, lessonFile.lastIndexOf("/") + 1)
    : "";

  let lessonId = importedId || lessonFile; // JSONを読んだら、中の "id" に置き換える

  // HTMLの部品を取得
  const titleEl = document.getElementById("lesson-title");
  const titleJaEl = document.getElementById("lesson-title-ja");
  const listEl = document.getElementById("paragraph-list");
  const messageEl = document.getElementById("message");
  const toggleJaBtn = document.getElementById("toggle-ja");
  const recordBtn = document.getElementById("record-btn");
  const recordStatus = document.getElementById("record-status");
  const recordSummary = document.getElementById("record-summary");
  const undoBtn = document.getElementById("undo-btn");
  const idiomSection = document.getElementById("idiom-section");
  const idiomList = document.getElementById("idiom-list");
  const idiomCount = document.getElementById("idiom-count");
  const sheet = document.getElementById("idiom-sheet");
  const sheetBody = document.getElementById("sheet-body");
  const sheetClose = document.getElementById("sheet-close");

  let idiomsByNo = {}; // 番号 → 熟語データ（タップで意味を出すときに使う）

  // ---------- 表示 ----------

  function showMessage(text) {
    messageEl.textContent = text;
    messageEl.hidden = false;
  }

  // 段落ごとに「英文 → 訳」を並べる
  function renderParagraphs(paragraphs) {
    listEl.textContent = "";

    paragraphs.forEach(function (paragraph) {
      const block = document.createElement("section");
      block.className = "paragraph";

      const en = document.createElement("p");
      en.className = "paragraph-en";
      en.lang = "en";
      Markup.render(en, paragraph.en);
      block.appendChild(en);

      if (paragraph.ja) {
        // 英文の右下に「+」ボタンを置く（押すと訳が開く）
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "paragraph-toggle";
        toggle.innerHTML = '<span class="paragraph-toggle-icon" aria-hidden="true"></span>';
        en.appendChild(toggle);

        const ja = document.createElement("p");
        ja.className = "paragraph-ja";
        Markup.render(ja, paragraph.ja);
        block.appendChild(ja);

        // 「+」ボタンだけでなく、段落の枠のどこをタップしても開閉できる
        // （ボタンを押したときも、ここで1回だけ切り替わる）
        block.classList.add("has-ja");
        block.addEventListener("click", function (event) {
          // 熟語をタップしたときは、訳の開閉ではなく意味を表示する
          const link = event.target.closest(".idiom-link");
          if (link) {
            openSheet(link.dataset.idiom);
            return;
          }
          toggleParagraph(block);
        });
      }

      listEl.appendChild(block);
    });
  }

  // ---------- 熟語一覧 ----------

  // 文字を入れた要素を作る小さな道具
  function makeText(tag, className, text, useMarkup) {
    const el = document.createElement(tag);
    el.className = className;
    if (useMarkup) {
      Markup.render(el, text);
    } else {
      el.textContent = text;
    }
    return el;
  }

  // 1つの熟語の中身（見出し・意味・例文・関連表現）を作る
  // 熟語一覧のカードと、タップで出るパネルの両方で使う
  function buildIdiomContent(container, idiom) {
    const head = document.createElement("div");
    head.className = "idiom-head";
    head.appendChild(makeText("span", "idiom-no", idiom.no != null ? String(idiom.no) : ""));
    const phrase = makeText("span", "idiom-phrase", idiom.phrase || "");
    phrase.lang = "en";
    head.appendChild(phrase);
    container.appendChild(head);

    if (idiom.meaning) container.appendChild(makeText("p", "idiom-meaning", idiom.meaning));

    if (idiom.example) {
      const example = makeText("p", "idiom-example", idiom.example, true);
      example.lang = "en";
      container.appendChild(example);
    }
    if (idiom.exampleJa) container.appendChild(makeText("p", "idiom-example-ja", idiom.exampleJa, true));
    if (idiom.note) container.appendChild(makeText("p", "idiom-note", idiom.note));
  }

  // "idioms" があれば、本文の下に熟語を並べる
  function renderIdioms(idioms) {
    idiomList.textContent = "";
    idiomsByNo = {};
    if (!idioms || idioms.length === 0) {
      idiomSection.hidden = true;
      return;
    }

    idioms.forEach(function (idiom) {
      const li = document.createElement("li");
      li.className = "idiom-card";
      buildIdiomContent(li, idiom);
      idiomList.appendChild(li);

      if (idiom.no != null) idiomsByNo[String(idiom.no)] = idiom;
    });

    idiomCount.textContent = idioms.length + "個";
    idiomSection.hidden = false;
  }

  // 本文の熟語のうち、番号が熟語データと合うものを「タップできる熟語」にする
  function linkIdioms() {
    listEl.querySelectorAll(".paragraph-en .idiom[data-idiom]").forEach(function (span) {
      if (!idiomsByNo[span.dataset.idiom]) return;
      span.classList.add("idiom-link");
      span.setAttribute("role", "button");
      span.setAttribute("tabindex", "0");
      // キーボード操作（Enter / スペース）にも対応
      span.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSheet(span.dataset.idiom);
        }
      });
    });
  }

  // ---------- 熟語の意味パネル ----------

  const SHEET_ANIMATION_MS = 220;
  let lastFocused = null; // パネルを閉じたら、元の場所に戻るため

  function openSheet(no) {
    const idiom = idiomsByNo[no];
    if (!idiom) return;

    sheetBody.textContent = "";
    buildIdiomContent(sheetBody, idiom);

    lastFocused = document.activeElement;
    sheet.hidden = false;
    // 表示してから少し待って、下からスライドさせる
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sheet.classList.add("is-open");
      });
    });
    sheetClose.focus();
  }

  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove("is-open");
    setTimeout(function () {
      sheet.hidden = true;
    }, SHEET_ANIMATION_MS);
    if (lastFocused) lastFocused.focus();
  }

  // 「×」や、パネルの外（暗い部分）を押したら閉じる
  sheet.addEventListener("click", function (event) {
    if (event.target.closest("[data-close]")) closeSheet();
  });

  // Escキーでも閉じる
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeSheet();
  });

  // ---------- 日本語訳の表示／非表示 ----------

  // 訳がある段落をすべて取得
  function getParagraphBlocks() {
    return listEl.querySelectorAll(".paragraph.has-ja");
  }

  // 1つの段落の訳を表示／非表示にする
  function setParagraphJa(block, show) {
    block.classList.toggle("is-ja-hidden", !show);
    const toggle = block.querySelector(".paragraph-toggle");
    toggle.setAttribute("aria-expanded", show ? "true" : "false");
    toggle.setAttribute("aria-label", show ? "この段落の訳を隠す" : "この段落の訳を表示");
  }

  // 段落をタップしたとき
  function toggleParagraph(block) {
    // 文字を選択（コピー）しようとしているときは切り替えない
    if (String(window.getSelection())) return;
    const show = block.classList.contains("is-ja-hidden");
    setParagraphJa(block, show);
    updateToggleButton();
  }

  // 上の「訳を隠す／訳を表示」ボタンの表示を、今の状態に合わせる
  // ・1つでも訳が出ている → 「訳を隠す」（押すと全部隠す）
  // ・全部隠れている     → 「訳を表示」（押すと全部出す）
  function updateToggleButton() {
    const blocks = Array.from(getParagraphBlocks());
    const anyShown = blocks.some(function (block) {
      return !block.classList.contains("is-ja-hidden");
    });
    toggleJaBtn.setAttribute("aria-pressed", anyShown ? "true" : "false");
    toggleJaBtn.textContent = anyShown ? "訳を隠す" : "訳を表示";
  }

  // 全部の訳をまとめて表示／非表示にする
  function applyShowJa(show) {
    document.body.classList.toggle("hide-ja", !show); // タイトルの訳用
    getParagraphBlocks().forEach(function (block) {
      setParagraphJa(block, show);
    });
    toggleJaBtn.setAttribute("aria-pressed", show ? "true" : "false");
    toggleJaBtn.textContent = show ? "訳を隠す" : "訳を表示";
  }

  toggleJaBtn.addEventListener("click", function () {
    const show = toggleJaBtn.getAttribute("aria-pressed") !== "true";
    applyShowJa(show);
    Progress.saveSettings({ showJa: show });
  });

  // ---------- 勉強記録 ----------

  const RECORD_LOCK_MS = 3000; // 記録したあと、ボタンを押せなくする時間（連打防止）

  // タイトル下の「合計○回・最終 9/24」を更新
  function updateRecordSummary(record) {
    if (record.count === 0) {
      recordSummary.textContent = "まだ記録はありません";
      recordSummary.classList.remove("has-record");
    } else {
      recordSummary.textContent =
        "合計 " + record.count + "回・最終 " + Progress.shortDate(record.lastDate);
      recordSummary.classList.add("has-record");
    }
  }

  recordBtn.addEventListener("click", function () {
    const record = Progress.addRecord(lessonId);
    const totals = Progress.getTotals();
    updateRecordSummary(record);

    recordStatus.textContent =
      "記録しました：このLesson " + record.count + "回目（今日の合計 " + totals.today + "回）";
    undoBtn.hidden = false;

    // しばらく押せないようにする
    recordBtn.disabled = true;
    recordBtn.textContent = "記録しました";
    setTimeout(function () {
      recordBtn.disabled = false;
      recordBtn.textContent = "記録する（+1）";
    }, RECORD_LOCK_MS);
  });

  undoBtn.addEventListener("click", function () {
    const record = Progress.undoRecord(lessonId);
    updateRecordSummary(record);
    recordStatus.textContent = "直前の記録を取り消しました";
    undoBtn.hidden = true;
  });

  // ---------- 教材の読み込み ----------

  // 端末に取り込んだ教材を読み込む（本文と音声）
  async function loadImportedLesson() {
    const lesson = await DB.getLesson(importedId);
    if (!lesson) {
      throw new Error("この教材は端末に保存されていません。「教材の管理」から取り込んでください。");
    }
    const blob = await DB.getAudioBlob(importedId);
    return {
      lesson: lesson,
      audioSrc: blob ? URL.createObjectURL(blob) : null
    };
  }

  // ファイル（サンプル・PCの private）から教材を読み込む
  // 失敗の理由ごとに分かりやすいメッセージを出す
  async function loadFileLesson() {
    if (location.protocol === "file:") {
      throw new Error("ファイルをダブルクリックで開いています。VS Codeの「Live Server」で開き直してください。");
    }

    let response;
    try {
      response = await fetch(lessonFile);
    } catch (error) {
      throw new Error("「" + lessonFile + "」を読み込めませんでした。通信状態を確認してください。");
    }

    if (!response.ok) {
      throw new Error("「" + lessonFile + "」が見つかりません。ファイル名と置き場所を確認してください。");
    }

    const text = await response.text();
    let lesson;
    try {
      lesson = JSON.parse(text);
    } catch (error) {
      throw new Error(
        "「" + lessonFile + "」のJSONの書き方に誤りがあります。" +
        "よくある原因：カンマ（,）の付け忘れや付けすぎ、\" の閉じ忘れ。" +
        "（詳細：" + error.message + "）"
      );
    }
    return {
      lesson: lesson,
      audioSrc: lesson.audioFile ? lessonFolder + lesson.audioFile : null
    };
  }

  async function init() {
    const settings = Progress.getSettings();

    try {
      const loaded = importedId ? await loadImportedLesson() : await loadFileLesson();
      const lesson = loaded.lesson;

      lessonId = lesson.id || lessonFile;
      document.title = lesson.title + "｜英語音読";
      titleEl.textContent = lesson.title;
      titleJaEl.textContent = lesson.titleJa || "";

      // 旧形式（sentences）のデータも表示できるようにしておく
      renderParagraphs(lesson.paragraphs || lesson.sentences || []);
      applyShowJa(false); // 開いたときは、訳をすべて閉じておく
      renderIdioms(lesson.idioms);
      linkIdioms();

      if (loaded.audioSrc) {
        Player.load({
          src: loaded.audioSrc,
          speed: settings.speed,
          onSpeedChange: function (speed) {
            Progress.saveSettings({ speed: speed });
          }
        });
      } else {
        showMessage("この教材の音声はまだ保存されていません。「教材の管理」から音声ファイルを取り込んでください。");
      }

      updateRecordSummary(Progress.getRecord(lessonId));
      recordBtn.disabled = false;

    } catch (error) {
      console.error(error);
      titleEl.textContent = "教材を読み込めませんでした";
      showMessage(error.message);
    }
  }

  init();

})();
