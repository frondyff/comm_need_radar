"""Validate the canonical documentation structure and local Markdown links."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = (
    "README.md",
    "docs/v1-frontline.md",
    "docs/v2-planner.md",
    "docs/chatbot.md",
    "docs/archive/index.md",
)
CANONICAL_FILES = REQUIRED_FILES[:4]
STALE_CANONICAL_PATTERNS = {
    "feature/dashboard": re.compile(r"feature/dashboard", re.IGNORECASE),
    "planned target architecture": re.compile(
        r"planned target architecture", re.IGNORECASE
    ),
    "Streamlit production command": re.compile(r"streamlit\s+run", re.IGNORECASE),
}
MARKDOWN_LINK = re.compile(r"!?\[[^\]]*]\(([^)]+)\)")


def tracked_files() -> list[str]:
    output = subprocess.check_output(
        ["git", "ls-files"], cwd=ROOT, text=True
    )
    return [line for line in output.splitlines() if line]


def link_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<") and ">" in target:
        return target[1 : target.index(">")]
    return target.split(maxsplit=1)[0]


def validate() -> list[str]:
    errors: list[str] = []
    tracked = tracked_files()

    for relative_path in REQUIRED_FILES:
        if not (ROOT / relative_path).is_file():
            errors.append(f"missing required documentation: {relative_path}")

    readmes = sorted(
        path for path in tracked if Path(path).name.casefold() == "readme.md"
    )
    if readmes != ["README.md"]:
        errors.append(
            "README.md must be the only tracked README; found: "
            + ", ".join(readmes)
        )

    for relative_path in CANONICAL_FILES:
        path = ROOT / relative_path
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        for label, pattern in STALE_CANONICAL_PATTERNS.items():
            if pattern.search(content):
                errors.append(
                    f"{relative_path} contains stale canonical wording: {label}"
                )

    markdown_files = [
        ROOT / path
        for path in tracked
        if path == "README.md" or path.startswith("docs/") and path.endswith(".md")
    ]
    for source in markdown_files:
        content = source.read_text(encoding="utf-8")
        for match in MARKDOWN_LINK.finditer(content):
            target = link_target(match.group(1))
            if (
                not target
                or target.startswith(("#", "http://", "https://", "mailto:", "tel:"))
            ):
                continue
            path_part = unquote(target.split("#", maxsplit=1)[0])
            resolved = (
                ROOT / path_part.lstrip("/")
                if path_part.startswith("/")
                else source.parent / path_part
            ).resolve()
            if not resolved.exists():
                line = content.count("\n", 0, match.start()) + 1
                errors.append(
                    f"{source.relative_to(ROOT)}:{line} has broken link: {target}"
                )

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(
        "Documentation validation passed: canonical files, single README, "
        "current wording, and relative links."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
