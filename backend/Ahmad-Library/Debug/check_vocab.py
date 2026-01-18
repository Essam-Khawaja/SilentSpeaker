import json, os, re
from sign_language_translator.config.assets import Assets

def norm(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s

path = os.path.join(Assets.ROOT_DIR, "pk-dictionary-mapping.json")

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

english = set()

for block in data:
    for row in block.get("mapping", []):
        token = row.get("token", {})
        en_list = token.get("en", [])
        if isinstance(en_list, list):
            for t in en_list:
                if isinstance(t, str) and t.strip():
                    english.add(norm(t))

english_list = sorted(english)

print("Total unique English tokens:", len(english_list))
print("First 100:", english_list[:100])

# Optional: save to a file
with open("pk_english_vocab.txt", "w", encoding="utf-8") as out:
    out.write("\n".join(english_list))
print("Saved to pk_english_vocab.txt")
