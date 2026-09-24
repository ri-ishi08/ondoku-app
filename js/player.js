/* ==============================
   player.js
   音声の再生・一時停止、10秒戻る／進む、速度変更、再生位置バーを担当する係
============================== */

const Player = (function () {

  const SKIP_SECONDS = 10;

  // HTMLの部品を取得
  const audio = document.getElementById("audio");
  const playBtn = document.getElementById("play-btn");
  const backBtn = document.getElementById("back-btn");
  const forwardBtn = document.getElementById("forward-btn");
  const seek = document.getElementById("seek");
  const timeCurrent = document.getElementById("time-current");
  const timeTotal = document.getElementById("time-total");
  const speedButtons = document.querySelectorAll(".speed-btn");

  let currentSpeed = 1;
  let isSeeking = false;      // バーを指で動かしている最中かどうか
  let onSpeedChange = null;   // 速度が変わったときに呼ぶ関数（lesson.jsから渡す）

  // 秒数を "1:05" の形にする
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  // 再生ボタンの見た目を、再生中／停止中に合わせる
  function updatePlayButton() {
    const playing = !audio.paused;
    playBtn.classList.toggle("is-playing", playing);
    playBtn.setAttribute("aria-label", playing ? "一時停止" : "再生");
  }

  // 速度ボタンの見た目を合わせる
  function updateSpeedButtons() {
    speedButtons.forEach(function (btn) {
      const selected = Number(btn.dataset.speed) === currentSpeed;
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  // ---------- 操作 ----------

  function togglePlay() {
    if (audio.paused) {
      audio.play().catch(function (error) {
        console.warn("再生できませんでした:", error);
      });
    } else {
      audio.pause();
    }
  }

  // 指定した秒数だけ移動（マイナスなら戻る）
  function skip(seconds) {
    const duration = isFinite(audio.duration) ? audio.duration : 0;
    let next = audio.currentTime + seconds;
    if (next < 0) next = 0;
    if (duration && next > duration) next = duration;
    audio.currentTime = next;
  }

  function setSpeed(speed) {
    currentSpeed = speed;
    audio.playbackRate = speed;
    updateSpeedButtons();
    if (onSpeedChange) onSpeedChange(speed);
  }

  // ---------- イベント（ボタンを押したときなど） ----------

  playBtn.addEventListener("click", togglePlay);
  backBtn.addEventListener("click", function () { skip(-SKIP_SECONDS); });
  forwardBtn.addEventListener("click", function () { skip(SKIP_SECONDS); });

  speedButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setSpeed(Number(btn.dataset.speed));
    });
  });

  // 音声の長さが分かったらバーと合計時間を設定
  audio.addEventListener("loadedmetadata", function () {
    seek.max = audio.duration;
    timeTotal.textContent = formatTime(audio.duration);
    audio.playbackRate = currentSpeed; // 読み込み直後は速度が戻ることがあるので再設定
  });

  // 再生が進むたびに、バーと現在時間を更新
  audio.addEventListener("timeupdate", function () {
    if (isSeeking) return;
    seek.value = audio.currentTime;
    timeCurrent.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener("play", updatePlayButton);
  audio.addEventListener("pause", updatePlayButton);
  audio.addEventListener("ended", updatePlayButton);

  // バーを動かしている間は時間表示だけ変える
  seek.addEventListener("input", function () {
    isSeeking = true;
    timeCurrent.textContent = formatTime(Number(seek.value));
  });

  // 指を離したら、その位置に移動
  seek.addEventListener("change", function () {
    audio.currentTime = Number(seek.value);
    isSeeking = false;
  });

  // ---------- 外から使う関数 ----------

  // 音声ファイルと初期速度をセットする
  function load(options) {
    currentSpeed = options.speed || 1;
    onSpeedChange = options.onSpeedChange || null;
    audio.src = options.src;
    audio.playbackRate = currentSpeed;
    updateSpeedButtons();
    updatePlayButton();
  }

  return {
    load: load
  };

})();
