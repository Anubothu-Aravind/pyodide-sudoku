"""Package sudoku runtime core into frontend/public/py/sudoku.zip and copy pyodide assets."""

import os
from pathlib import Path
import shutil
import zipfile

ROOT_DIR = Path(__file__).resolve().parent.parent
SUDOKU_DIR = ROOT_DIR / "sudoku"
FRONTEND_DIR = ROOT_DIR / "frontend"
PUBLIC_PY_DIR = FRONTEND_DIR / "public" / "py"
PUBLIC_PYODIDE_DIR = FRONTEND_DIR / "public" / "pyodide"
NODE_PYODIDE_DIR = FRONTEND_DIR / "node_modules" / "pyodide"


def package_sudoku_zip() -> None:
    """Zip the runtime sudoku/ directory into frontend/public/py/sudoku.zip."""
    PUBLIC_PY_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = PUBLIC_PY_DIR / "sudoku.zip"

    files_added = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(SUDOKU_DIR):
            # Ignore __pycache__
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for file in files:
                if file.endswith((".py", ".pyi")):
                    full_path = Path(root) / file
                    arcname = full_path.relative_to(ROOT_DIR)
                    zf.write(full_path, arcname)
                    files_added += 1

    print(f"Packaged {files_added} files into {zip_path} ({zip_path.stat().st_size} bytes)")


def copy_pyodide_assets() -> None:
    """Copy self-hosted Pyodide assets to frontend/public/pyodide/."""
    if not NODE_PYODIDE_DIR.exists():
        print(f"Warning: {NODE_PYODIDE_DIR} does not exist. Run npm install in frontend first.")
        return

    PUBLIC_PYODIDE_DIR.mkdir(parents=True, exist_ok=True)
    required_files = [
        "pyodide.js",
        "pyodide.mjs",
        "pyodide.asm.js",
        "pyodide.asm.wasm",
        "python_stdlib.zip",
        "pyodide-lock.json",
    ]

    copied = 0
    for filename in required_files:
        src = NODE_PYODIDE_DIR / filename
        dst = PUBLIC_PYODIDE_DIR / filename
        if src.exists():
            if not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime or src.stat().st_size != dst.stat().st_size:
                shutil.copy2(src, dst)
                copied += 1

    print(f"Copied {copied} Pyodide assets to {PUBLIC_PYODIDE_DIR}")


if __name__ == "__main__":
    package_sudoku_zip()
    copy_pyodide_assets()
