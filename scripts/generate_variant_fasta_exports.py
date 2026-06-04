from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WUHAN_FASTA = ROOT / "assets" / "data" / "Wuhan.fasta"
VARIANTS_RNA = ROOT / "assets" / "data" / "VariantsRNA.txt"
OUT_DIR = ROOT / "assets" / "data" / "fasta-exports"

SPIKE_START = 21563
SPIKE_END = 25384

VARIANT_KEYS = ["alpha", "beta", "delta", "ba2", "ba45", "jn1", "kp2"]

VARIANT_NAMES = {
    "alpha": "Alpha (B.1.1.7)",
    "beta": "Beta (B.1.351)",
    "delta": "Delta (B.1.617.2)",
    "ba2": "Omicron BA.2",
    "ba45": "Omicron BA.4&5",
    "jn1": "JN.1",
    "kp2": "KP.2",
}

VARIANT_RNA_LABELS = {
    "alpha": "Alpha",
    "beta": "Beta",
    "delta": "Delta",
    "ba2": "BA.2",
    "ba45": "BA.4&5",
    "jn1": "JN.1",
    "kp2": "KP.2",
}


def read_fasta_sequence(path: Path) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    return "".join(line.strip() for line in lines if line and not line.startswith(">"))


def parse_variant_rna(path: Path) -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split(maxsplit=2)
        if len(parts) < 3:
            continue
        _, name, mutations = parts
        key = name.lower().replace(".", "").replace("&", "").replace("-", "").replace(" ", "")
        mapping[key] = [token.strip() for token in mutations.split(";") if token.strip()]
    return mapping


def parse_token(token: str) -> tuple[int, str]:
    token = token.strip().upper()
    if len(token) < 3:
        raise ValueError(f"Invalid mutation token: {token}")
    pos = ""
    for char in token[1:-1]:
        if not char.isdigit():
            raise ValueError(f"Invalid mutation token: {token}")
        pos += char
    return int(pos), token[-1]


def apply_mutations(sequence: str, tokens: list[str]) -> str:
    chars = list(sequence)
    parsed: list[tuple[int, str, str]] = []
    for token in tokens:
        token = token.strip().upper()
        if not token:
            continue
        ref = token[0]
        alt = token[-1]
        pos, _ = parse_token(token)
        parsed.append((pos, ref, alt))

    # Apply in descending order so deletions don't shift later positions.
    for pos, ref, alt in sorted(parsed, key=lambda item: item[0], reverse=True):
        idx = pos - 1
        if idx < 0 or idx >= len(chars):
            continue
        if alt == "-":
            del chars[idx]
        else:
            chars[idx] = alt
    return "".join(chars)


def wrap_sequence(sequence: str, width: int = 60) -> str:
    return "\n".join(sequence[i : i + width] for i in range(0, len(sequence), width))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    full_genome = read_fasta_sequence(WUHAN_FASTA)
    spike_wuhan = full_genome[SPIKE_START - 1 : SPIKE_END]
    variants = parse_variant_rna(VARIANTS_RNA)

    for key in VARIANT_KEYS:
        variant_name = VARIANT_NAMES[key]
        lookup_label = VARIANT_RNA_LABELS[key]
        lookup_key = lookup_label.lower().replace(".", "").replace("&", "").replace("-", "").replace(" ", "")
        tokens = variants.get(lookup_key)
        if not tokens:
            print(f"{key}: no RNA mutations found, skipping")
            continue

        mutated = apply_mutations(spike_wuhan, tokens)
        header = f">{variant_name} | nucleotide_mutations: {';'.join(tokens)}"
        out_path = OUT_DIR / f"{key}.fasta"
        out_path.write_text(f"{header}\n{wrap_sequence(mutated)}\n", encoding="utf-8")
        print(f"{key}: wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
