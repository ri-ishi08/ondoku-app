/* ==============================
   sw.js（サービスワーカー）
   アプリ本体のファイルを端末に保存して、通信がなくても起動できるようにする係

   ・通信できるときは、いつも最新のファイルを取りに行く（そして保存し直す）
   ・通信できない／遅いときは、保存しておいたファイルを使う
   ・ファイルを追加・削除したら、下の CACHE_NAME の数字を1つ上げる
============================== */

const CACHE_NAME = "ondoku-v2";

// 端末に保存しておくファイルの一覧
const APP_FILES = [
  "./",
  "./index.html",
  "./lesson.html",
  "./manage.html",
  "./manifest.json",
  "./css/style.css",
  "./js/progress.js",
  "./js/markup.js",
  "./js/player.js",
  "./js/lesson.js",
  "./js/list.js",
  "./js/db.js",
  "./js/manage.js",
  "./sample/sample-01.json",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 通信を待つ最長時間（これを過ぎたら保存済みのファイルを使う）
const NETWORK_TIMEOUT_MS = 3000;

// インストール時：ファイルをまとめて保存
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_FILES);
    })
  );
  self.skipWaiting();
});

// 有効化時：古いバージョンの保存データを削除
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME) return caches.delete(name);
      }));
    })
  );
  self.clients.claim();
});

// ファイルを取りに行くとき
self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);

  // 対象外：ほかのサイト、GET以外、音声の部分読み込み（Safariの音声再生で使われる）
  if (url.origin !== location.origin) return;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  event.respondWith(networkFirst(request));
});

// 通信を優先し、ダメなら保存済みのファイルを使う
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error("timeout"));
    }, ms);
    promise.then(function (value) {
      clearTimeout(timer);
      resolve(value);
    }, function (error) {
      clearTimeout(timer);
      reject(error);
    });
  });
}
