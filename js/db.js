/* ==============================
   db.js
   取り込んだ教材（本文と音声）を、端末の中（IndexedDB）に保存する係

   保存場所は2つ
   ・lessons：教材のJSONの中身（キー：Lessonの id）
   ・audio  ：音声ファイルの中身（キー：Lessonの id）
============================== */

const DB = (function () {

  const DB_NAME = "ondoku-db";
  const DB_VERSION = 1;

  let dbPromise = null;

  // データベースを開く（初回は保存場所を作る）
  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      if (!("indexedDB" in window)) {
        reject(new Error("このブラウザでは端末への保存が使えません"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains("lessons")) {
          db.createObjectStore("lessons", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("audio")) {
          db.createObjectStore("audio", { keyPath: "id" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });

    return dbPromise;
  }

  // IndexedDBの「リクエスト」を Promise に変える小さな道具
  function promisify(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // 1つの保存場所に対して処理をする
  async function withStore(storeName, mode, action) {
    const db = await openDb();
    const tx = db.transaction(storeName, mode);
    const result = await promisify(action(tx.objectStore(storeName)));
    await new Promise(function (resolve, reject) {
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
    return result;
  }

  // ---------- 本文 ----------

  // 教材のJSON（中身）を保存する。同じ id があれば上書き
  function saveLesson(lesson, jsonSize) {
    return withStore("lessons", "readwrite", function (store) {
      return store.put({
        id: lesson.id,
        data: lesson,
        size: jsonSize || 0,
        updatedAt: Date.now()
      });
    });
  }

  async function getLesson(id) {
    const item = await withStore("lessons", "readonly", function (store) {
      return store.get(id);
    });
    return item ? item.data : null;
  }

  function getAllLessonItems() {
    return withStore("lessons", "readonly", function (store) {
      return store.getAll();
    });
  }

  // ---------- 音声 ----------

  // 音声ファイルを保存する（Safariでも確実に扱えるよう、中身をデータとして保存）
  async function saveAudio(id, file) {
    const buffer = await file.arrayBuffer();
    return withStore("audio", "readwrite", function (store) {
      return store.put({
        id: id,
        fileName: file.name,
        type: file.type || "audio/mpeg",
        buffer: buffer,
        size: buffer.byteLength
      });
    });
  }

  // 保存した音声を、再生できる形（Blob）で返す
  async function getAudioBlob(id) {
    const item = await withStore("audio", "readonly", function (store) {
      return store.get(id);
    });
    if (!item) return null;
    return new Blob([item.buffer], { type: item.type });
  }

  // 音声の有無と容量だけを知りたいとき用（中身は読み込まない）
  async function getAudioSizes() {
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      const sizes = {};
      const tx = db.transaction("audio", "readonly");
      const request = tx.objectStore("audio").openCursor();
      request.onsuccess = function () {
        const cursor = request.result;
        if (cursor) {
          sizes[cursor.key] = cursor.value.size || 0;
          cursor.continue();
        }
      };
      tx.oncomplete = function () { resolve(sizes); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  // ---------- 一覧・削除 ----------

  // 取り込んだ教材の一覧（番号順）。容量と音声の有無つき
  async function listLessons() {
    const items = await getAllLessonItems();
    const audioSizes = await getAudioSizes();

    return items.map(function (item) {
      const lesson = item.data;
      const audioSize = audioSizes[item.id];
      return {
        id: item.id,
        no: lesson.no,
        title: lesson.title,
        titleJa: lesson.titleJa,
        audioFile: lesson.audioFile,
        hasAudio: audioSize != null,
        size: (item.size || 0) + (audioSize || 0)
      };
    }).sort(function (a, b) {
      const na = a.no != null ? a.no : 9999;
      const nb = b.no != null ? b.no : 9999;
      return na - nb;
    });
  }

  // 本文と音声の両方を削除する（勉強記録は別の場所にあるので残る）
  async function deleteLesson(id) {
    await withStore("lessons", "readwrite", function (store) { return store.delete(id); });
    await withStore("audio", "readwrite", function (store) { return store.delete(id); });
  }

  return {
    saveLesson: saveLesson,
    getLesson: getLesson,
    saveAudio: saveAudio,
    getAudioBlob: getAudioBlob,
    listLessons: listLessons,
    deleteLesson: deleteLesson
  };

})();
