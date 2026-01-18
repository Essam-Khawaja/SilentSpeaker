---

# sign_service.py — Notes / README

This file (`sign_service.py`) runs a **FastAPI** backend that converts English text into a **Sign Language Video** using the `sign-language-translator` library and `moviepy`.

It exposes an HTTP API (used by the Next.js `SpeechToSign.tsx` frontend) and also includes:

* a **debug web page** at `/` (simple input box + video player)
* an optional **CLI debug mode** (run file directly)

---

## 1) Setup (Windows)

### Install Python 3.12

Install **Python 3.12** first (required for the environment described here).

---

## 2) Create the Virtual Environment + Install Dependencies

You can either run your `setup.bat`, or run these manually:

```
py -3.12 -m venv .venv
.venv\Scripts\activate

python -m pip install --upgrade pip
python -m pip install fastapi uvicorn moviepy sign-language-translator
```

(Optional) deactivate at this stage:

```
.venv\Scripts\deactivate
```

---

## 3) Run the Backend

From your repo root (or wherever `.venv` lives), move to the backend folder:

```
cd backend\Ahmad-Library
.venv\Scripts\activate
python -m uvicorn sign_service:app --reload --port 8000
```

Now the backend should be available at:

- Debug web page: `http://localhost:8000/`
- API endpoint: `http://localhost:8000/translate?text=...`
- Served video files: `http://localhost:8000/videos/<filename>.mp4`

---

## Required Local Files

This service expects these files to exist in **backend/Ahmad-Library/**:

1. **supported_words.txt**
   A vocabulary list (lowercased) of supported tokens/phrases from the PSL dataset mapping.

2. **Pause.mp4**
   Used to insert a short pause **between words** (NOT between letters).

3. **0.mp4**
   Used as the dataset does not include a sign video for `0` (zero).
   This allows numbers like `2025` to still render correctly.

---

# What It Does

### Input

English text (example: `"good morning bus stop"`)

### Output

A single stitched `.mp4` file saved into `outputs/` and served as a URL under `/videos/`.

Also returns metadata:

- translated_words: what was successfully rendered
- skipped_words: what could not be translated
- error message if any

---

# How It Works (Logic Summary)

The service uses a `ConcatenativeSynthesis` model:

- Text language: English (`en`)
- Sign language: `pakistan-sign-language`
- Output format: video

The pipeline processes text using several stages.

---

## Step A — Token Cleanup

`clean_token()`:

- trims whitespace
- lowercases
- strips punctuation (keeps letters, digits, spaces, underscores, hyphens)

No synonym replacement or meaning change occurs.

---

## Step B — Phrase Matching

The service first tries to match multi-word phrases (up to 3 words) using `supported_words.txt`.

Example:

Input: `bus stop`
It checks `"bus stop"` before checking `"bus"` and `"stop"` separately.

---

## Step C — Whole Word Translation

If a phrase or word is supported, it is translated directly using:

- `try_whole_token(token)`

Video paths are extracted from the library response using:

- `collect_mp4_paths(sign_obj)`

---

## Step D — Spelling Fallback

If a word is not available as a whole sign, the system attempts to spell it letter-by-letter:

- Only characters `[a-z, 0-9]` are allowed
- For letters:
  - Prefer `letter(single-handed-letter)`
  - Fallback to `letter(double-handed-letter)`

- If any letter is missing, the word is skipped

---

## Step E — Number Handling

For multi-digit numbers (e.g. `"2025"`):

- Each digit is processed separately
- If digit exists as a sign video → used
- If digit is `"0"` → fallback to local `0.mp4`

---

## Step F — Word Pauses

If `Pause.mp4` exists, it is inserted **between words**, not between letters.

Example:

Input: `"good morning"`

Output sequence:

- good.mp4
- Pause.mp4
- morning.mp4

---

# Output Generation

All collected video clips are stitched together using MoviePy:

- Loaded via `VideoFileClip`
- Combined using `concatenate_videoclips`
- Saved to:

```
outputs/sign_translation_<uuid>.mp4
```

The API hides filesystem paths and only returns a public URL.

---

# API Usage (used by SpeechToSign.tsx)

### Endpoint

```
GET /translate?text=<your_text>
```

Example:

```
http://localhost:8000/translate?text=good%20morning
```

Response example:

```
{
  "success": true,
  "video_url": "/videos/sign_translation_xxxxx.mp4",
  "translated_words": ["good", "morning"],
  "skipped_words": [],
  "error": null
}
```

The frontend usually loads it as:

```
const url = API_BASE + data.video_url + "?t=" + Date.now()
```

to avoid caching issues.

---

# Debug Website vs API

- `GET /` → simple HTML debug page
- Meant for quick testing only
- Real integration uses:
  - `/translate` API
  - `/videos` static file hosting

---

# CLI Debug Mode

Running the file directly:

```
python sign_service.py
```

Allows interactive terminal testing of translations.

---

# Dependencies Used

Backend / API:

- fastapi
- uvicorn

Translation:

- sign-language-translator

Video Processing:

- moviepy

Utilities:

- os, re, uuid
- pathlib
- typing

---

# Credits

This project builds upon the Sign Language Translator framework:

```
@software{mdsr2023slt,
  author       = {Mudassar Iqbal},
  title        = {Sign Language Translator: Python Library and AI Framework},
  year         = {2023},
  publisher    = {GitHub},
  howpublished = {\url{https://github.com/sign-language-translator/sign-language-translator}},
}
```

Integration, service design, and additional logic by **Muhammad Ahmad**.

---
