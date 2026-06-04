#!/usr/bin/env python3
"""Remove the 'sequence' column from CSV files in assets/data/aa-exports.

This script rewrites each .csv in place, dropping the column named 'sequence'
if present. It preserves other columns and quoting.
"""
import csv
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / 'assets' / 'data' / 'aa-exports'

def process_file(path: Path):
    tmp = path.with_suffix('.tmp')
    with path.open('r', newline='') as rf, tmp.open('w', newline='') as wf:
        reader = csv.reader(rf)
        writer = csv.writer(wf)
        try:
            header = next(reader)
        except StopIteration:
            return
        # find sequence column
        seq_idx = None
        for i, col in enumerate(header):
            if col.strip().lower() == 'sequence':
                seq_idx = i
                break
        if seq_idx is None:
            # nothing to do; copy file back
            rf.seek(0)
            wf.write(rf.read())
            tmp.replace(path)
            return

        # write header without sequence
        new_header = [c for i, c in enumerate(header) if i != seq_idx]
        writer.writerow(new_header)

        for row in reader:
            # if row shorter than header, pad
            if len(row) < len(header):
                row += [''] * (len(header) - len(row))
            new_row = [v for i, v in enumerate(row) if i != seq_idx]
            writer.writerow(new_row)

    tmp.replace(path)

def main():
    if not DATA_DIR.exists():
        print('Directory not found:', DATA_DIR)
        return
    for p in sorted(DATA_DIR.glob('*.csv')):
        print('Processing', p.name)
        process_file(p)

if __name__ == '__main__':
    main()
