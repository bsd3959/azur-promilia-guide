import inspect
import re
import sys
import tempfile
from pathlib import Path

import gdown
from PIL import Image, ImageOps

DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1BeJ30hW_U_yVjL-tpQ9k11DVX-uNjJII"
SUPPORTED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
TARGET_SIZE = (512, 512)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "assets" / "characters"


def slugify_stem(stem: str) -> str:
    cleaned = stem.strip().lower()
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = re.sub(r"[^a-z0-9가-힣_\-]", "", cleaned)
    return cleaned or "character"


def convert_to_square_webp(src_path: Path, dst_path: Path) -> None:
    with Image.open(src_path) as im:
        im = ImageOps.exif_transpose(im).convert("RGBA")
        w, h = im.size
        side = min(w, h)
        left = (w - side) // 2
        # Face-centered top-bias crop (15% from top for vertical portraits)
        top = int((h - side) * 0.15) if h > w else 0
        cropped = im.crop((left, top, left + side, top + side))
        resized = cropped.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        resized.save(dst_path, format="WEBP", quality=90, method=6)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[sync] Google Drive 공개 폴더 동기화 시작: {DRIVE_FOLDER_URL}")

    with tempfile.TemporaryDirectory(prefix="ap_drive_sync_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        try:
            kwargs = {
                "url": DRIVE_FOLDER_URL,
                "output": str(tmp_path),
                "quiet": False,
                "use_cookies": False,
            }
            if "remaining_ok" in inspect.signature(gdown.download_folder).parameters:
                kwargs["remaining_ok"] = True
            gdown.download_folder(**kwargs)
        except Exception as exc:
            print(
                f"[WARN] 드라이브 폴더가 비어 있거나 접근 오류({exc}) — "
                "기존 assets/characters/ 파일을 보존하고 안전 종료합니다."
            )
            return 0

        image_files = [
            p
            for p in tmp_path.rglob("*")
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS
        ]

        if not image_files:
            print("[sync] 드라이브 폴더에 변환할 이미지가 없습니다. 기존 assets/characters/ 파일을 유지합니다.")
            return 0

        converted = 0
        for src in sorted(image_files):
            slug = slugify_stem(src.stem)
            dst = OUTPUT_DIR / f"{slug}.webp"
            try:
                convert_to_square_webp(src, dst)
                converted += 1
                print(f"[sync] 변환 완료: {src.name} -> {dst.relative_to(REPO_ROOT)}")
            except Exception as exc:
                print(f"[WARN] 이미지 변환 실패 ({src.name}): {exc}")

        print(f"[sync] 총 {converted}건 변환 완료.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
