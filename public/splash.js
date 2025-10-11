// Splash timing (ms)
const SPLASH_MIN_MS = 5000;

let _splashHidden = false;

function showSplash() {
  document.body.classList.add("splashing");
  const el = document.getElementById("splash");
  if (!el) return;
  el.style.display = "block";

  const v = document.getElementById("splashVideo");
  if (v) v.play().catch(() => {});
}

function hideSplash() {
  if (_splashHidden) return;
  _splashHidden = true;

  const el = document.getElementById("splash");
  if (!el) return;

  const v = document.getElementById("splashVideo");
  if (v) {
    v.pause();
    try {
      v.currentTime = 0;
    } catch {}
  }

  el.classList.add("fadeout");
  setTimeout(() => {
    el.classList.remove("fadeout");
    el.style.display = "none";
    document.body.classList.remove("splashing");
  }, 480); // match CSS fade duration
}

// Auto-show / auto-hide splash
document.addEventListener("DOMContentLoaded", async () => {
  const v = document.getElementById("splashVideo");

  if (v) {
    v.addEventListener(
      "loadedmetadata",
      () => {
        const targetSec = SPLASH_MIN_MS / 1000;
        if (isFinite(v.duration) && v.duration > 0) {
          v.playbackRate = v.duration / targetSec;
        }
        v.play().catch(() => {});
      },
      { once: true },
    );
  }

  showSplash();

  // Click to dismiss early
  const splashEl = document.getElementById("splash");
  if (splashEl) {
    splashEl.style.cursor = "pointer";
    splashEl.addEventListener("click", hideSplash, { once: true });
  }

  // Keep visible for at least SPLASH_MIN_MS
  await new Promise((r) => setTimeout(r, SPLASH_MIN_MS));
  hideSplash();
});
