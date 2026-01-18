import os, re, uuid
from pathlib import Path
from typing import List, Tuple
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import sign_language_translator as slt
from moviepy import VideoFileClip, concatenate_videoclips

# Model Setup

_MODEL = slt.models.ConcatenativeSynthesis(
    text_language="en",
    sign_language="pakistan-sign-language",
    sign_format="video",
)

# Vocabulary Loading (built once at startup)

VOCAB_FILE = "supported_words.txt"

SUPPORTED_TOKENS: set[str] = set()

if os.path.exists(VOCAB_FILE):
    with open(VOCAB_FILE, "r", encoding="utf-8") as f:
        SUPPORTED_TOKENS = {line.strip().lower() for line in f if line.strip()}

# Utility Functions

def clean_token(word: str) -> str:
    """Strip punctuation and lowercase without changing meaning."""
    word = word.strip().lower()
    word = re.sub(r"[^\w\s\-]", "", word)
    return word.strip()


def collect_mp4_paths(sign_obj) -> List[str]:
    """Extract mp4 file paths from translation object."""
    paths: List[str] = []

    def walk(x):
        if isinstance(x, str) and x.lower().endswith(".mp4") and os.path.exists(x):
            paths.append(x)
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, (list, tuple)):
            for v in x:
                walk(v)

    walk(getattr(sign_obj, "__dict__", {}))
    return paths


def letter_token(letter: str) -> str | None:
    """
    Return correct dataset token for a letter using:
    single-handed first, double-handed as fallback.
    """
    single = f"{letter}(single-handed-letter)"
    double = f"{letter}(double-handed-letter)"

    try:
        if collect_mp4_paths(_MODEL.translate(single)):
            return single
    except Exception:
        pass

    try:
        if collect_mp4_paths(_MODEL.translate(double)):
            return double
    except Exception:
        pass

    return None

# Translation Logic

def try_whole_token(token: str) -> Tuple[bool, List[str]]:
    """Try translating a full token (word or phrase)."""
    try:
        sign_obj = _MODEL.translate(token)
        paths = collect_mp4_paths(sign_obj)
        if paths:
            return True, paths
    except Exception:
        pass

    return False, []


def try_spell_word(word: str) -> Tuple[bool, List[str]]:
    """Spell word letter by letter using single-hand preference."""
    all_paths: List[str] = []

    for ch in word:
        if not re.fullmatch(r"[a-z0-9]", ch):
            return False, []

        if ch.isdigit():
            ok, digit_paths = try_whole_token(ch)
            if ok and digit_paths:
                all_paths.extend(digit_paths)
                continue

            # Manually Adding Zero
            if ch == "0":
                local_zero = os.path.join(os.path.dirname(__file__), "0.mp4")
                if os.path.exists(local_zero):
                    all_paths.append(local_zero)
                    continue

            return False, []


        token = letter_token(ch)
        if not token:
            return False, []

        try:
            sign_obj = _MODEL.translate(token)
            paths = collect_mp4_paths(sign_obj)
            if not paths:
                return False, []
            all_paths.extend(paths)
        except Exception:
            return False, []

    return True, all_paths


def max_phrase_match(tokens: List[str], i: int) -> Tuple[str | None, int]:
    """
    Try to match longest phrase (up to 3 words) starting at index i.
    Returns (matched_phrase, words_consumed)
    """
    for size in [3, 2, 1]:
        phrase = " ".join(tokens[i:i + size])
        if phrase in SUPPORTED_TOKENS:
            return phrase, size

    return None, 0

def process_text_to_clips(text: str) -> Tuple[List[str], List[str], List[str]]:
    """
    Core algorithm: phrase matching -> whole word -> spelling.
    Adds Pause.mp4 between words.
    """
    cleaned = clean_token(text)
    tokens = cleaned.split()

    translated_labels: List[str] = []
    skipped: List[str] = []
    mp4_paths: List[str] = []

    PAUSE_PATH = os.path.join(os.path.dirname(__file__), "Pause.mp4")
    USE_PAUSE = os.path.exists(PAUSE_PATH)

    i = 0
    while i < len(tokens):
        phrase, size = max_phrase_match(tokens, i)

        if phrase:
            ok, paths = try_whole_token(phrase)
            if ok:
                mp4_paths.extend(paths)
                if USE_PAUSE:
                    mp4_paths.append(PAUSE_PATH)      # Adding Pause between words
                translated_labels.append(phrase)
                i += size
                continue

        word = tokens[i]

        # If the token is multi-digit number, do digit-by-digit spelling
        if word.isdigit() and len(word) > 1:
            ok, paths = try_spell_word(word)
            if ok:
                mp4_paths.extend(paths)
                if USE_PAUSE:
                    mp4_paths.append(PAUSE_PATH)      # Adding Pause between words
                translated_labels.append("+".join(word))
                i += 1
                continue
            else:
                skipped.append(word)
                i += 1
                continue

        # Otherwise try normal whole-token logic
        ok, paths = try_whole_token(word)
        if ok:
            mp4_paths.extend(paths)
            if USE_PAUSE:
                mp4_paths.append(PAUSE_PATH)      # Adding Pause between words
            translated_labels.append(word)
            i += 1
            continue


        ok, paths = try_spell_word(word)
        if ok:
            mp4_paths.extend(paths)
            if USE_PAUSE:
                mp4_paths.append(PAUSE_PATH)      # Adding Pause between words
            translated_labels.append("+".join(word))
            i += 1
            continue

        skipped.append(word)
        i += 1

    # Remove last pause if present
    if USE_PAUSE and mp4_paths and mp4_paths[-1] == PAUSE_PATH:
        mp4_paths.pop()

    return mp4_paths, translated_labels, skipped


# Public API Function

def text_to_sign_video(text: str, output_dir: str = "outputs") -> dict:
    try:
        mp4s, translated, skipped = process_text_to_clips(text)

        if not mp4s:
            return {
                "success": False,
                "video_path": None,
                "skipped_words": skipped,
                "translated_words": translated,
                "error": "No translatable words found."
            }

        Path(output_dir).mkdir(exist_ok=True)

        filename = f"sign_translation_{uuid.uuid4().hex}.mp4"
        out_path = str(Path(output_dir) / filename)

        clips = [VideoFileClip(p) for p in mp4s]
        final = concatenate_videoclips(clips, method="compose")
        final.write_videofile(out_path, audio=False, fps=30)

        for c in clips:
            c.close()
        final.close()

        return {
            "success": True,
            "video_path": out_path,
            "skipped_words": skipped,
            "translated_words": translated,
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "video_path": None,
            "skipped_words": [],
            "translated_words": [],
            "error": str(e)
        }


# Web API + UI 
# The "/" HTML page is for DEBUG TESTING ONLY.
# The "/translate" API and "/videos" static route are used by the Next.js frontend.

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://silentspeaker.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path("outputs").mkdir(exist_ok=True)
app.mount("/videos", StaticFiles(directory="outputs"), name="videos")

@app.get("/", response_class=HTMLResponse)
def home():
    return """
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Sign Language Translator</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 16px; }
    h1 { margin: 0 0 8px; }
    #status { color: #555; margin: 10px 0 16px; }
    #input { width: 100%; font-size: 18px; padding: 12px; border: 1px solid #ccc; border-radius: 10px; outline: none; }
    .row { margin-top: 14px; }
    .label { font-weight: 700; margin-right: 8px; }
    .pill { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #eee; margin: 4px 6px 0 0; }
    .ok { background: #e8f7e8; }
    .bad { background: #ffe8e8; }
    video { width: 100%; max-height: 420px; background: #000; border-radius: 12px; margin-top: 14px; }
  </style>
</head>
<body>
  <h1>Sign Language Translator</h1>
  <div id="status">Type English text and press Enter.</div>

  <input id="input" placeholder="e.g., hello good morning" autocomplete="off" />

  <div class="row">
    <div><span class="label">Translated words:</span> <span id="translated"></span></div>
    <div style="margin-top:8px;"><span class="label">Skipped words:</span> <span id="skipped"></span></div>
  </div>

  <video id="player" controls playsinline></video>

<script>
  const input = document.getElementById("input");
  const statusEl = document.getElementById("status");
  const translatedEl = document.getElementById("translated");
  const skippedEl = document.getElementById("skipped");
  const player = document.getElementById("player");

  function pills(el, items, cls) {
    el.innerHTML = "";
    if (!items || items.length === 0) {
      const s = document.createElement("span");
      s.className = "pill";
      s.textContent = "None";
      el.appendChild(s);
      return;
    }
    for (const w of items) {
      const s = document.createElement("span");
      s.className = "pill " + cls;
      s.textContent = w;
      el.appendChild(s);
    }
  }

  async function translateText(text) {
    statusEl.textContent = "Translating...";
    pills(translatedEl, [], "ok");
    pills(skippedEl, [], "bad");
    player.removeAttribute("src");
    player.load();

    const res = await fetch("/translate?text=" + encodeURIComponent(text));
    const data = await res.json();

    if (!data.success) {
      statusEl.textContent = "Could not translate. Try different words.";
      pills(translatedEl, data.translated_words || [], "ok");
      pills(skippedEl, data.skipped_words || [], "bad");
      return;
    }

    statusEl.textContent = "Done.";
    pills(translatedEl, data.translated_words || [], "ok");
    pills(skippedEl, data.skipped_words || [], "bad");

    const videoUrl = data.video_url + "?t=" + Date.now();
    player.src = videoUrl;
    player.load();
    player.play().catch(() => {});
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const text = input.value.trim();
      if (text.length > 0) translateText(text);
    }
  });

  input.focus();
</script>
</body>
</html>
"""


@app.get("/translate")
def translate(text: str):
    result = text_to_sign_video(text)

    if result["success"] and result["video_path"]:
        filename = result["video_path"].replace("\\", "/").split("/")[-1]
        result["video_url"] = f"/videos/{filename}"
        result["video_path"] = None

    return result


# CLI Debug Mode

if __name__ == "__main__":
    while True:
        text = input("\nType English (or 'q' to quit): ").strip()
        if text.lower() in ("q", "quit", "exit"):
            break
        print(text_to_sign_video(text))
