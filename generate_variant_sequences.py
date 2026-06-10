#!/usr/bin/env python3
"""
Generate variant RNA sequences by applying mutations to the Wuhan reference.
"""

import re
from pathlib import Path

# Variant mutation data (from data.html)
VARIANTS = {
    'alpha': {
        'name': 'Alpha (B.1.1.7)',
        'mutations': ["T203-", "A204-", "C205-", "A206-", "T207-", "G208-", "T430-", "A431-", "T432-", 
                     "A1501T", "C1709A", "A1841G", "C2042A", "C2147T", "T2944G", "G3352C"]
    },
    'beta': {
        'name': 'Beta (B.1.351)',
        'mutations': ["C52T", "A239C", "A644G", "T722-", "A723-", "C724-", "T725-", "T726-", "G727-", 
                     "C728-", "T729-", "T730-", "G1251T", "G1450A", "A1501T", "A1841G", "C2102T"]
    },
    'delta': {
        'name': 'Delta (B.1.617.2)',
        'mutations': ["C56G", "G425A", "A467-", "G468-", "T469-", "T470-", "C471-", "A472-", 
                     "T1355G", "C1433A", "A1841G", "C2042G", "G2848A"]
    },
    'ba2': {
        'name': 'Omicron BA.2',
        'mutations': ["C56T", "T71-", "A72-", "C73-", "C74-", "C75-", "C76-", "C77-", "T78-", "G79-", 
                     "G425A", "T638G", "G1016A", "C1112T", "T1117C", "C1124T", "A1126G", "G1213A", "A1224C", 
                     "G1251T", "T1320G", "G1430A", "C1433A", "A1451C", "A1478G", "A1493G", "A1501T", "T1513C", 
                     "A1841G", "C1963T", "T2037G", "C2042A", "C2292A", "G2386T", "A2862T", "T2907A", "C3438T"]
    },
    'ba45': {
        'name': 'Omicron BA.4&5',
        'mutations': ["C56T", "T71-", "A72-", "C73-", "C74-", "C75-", "C76-", "C77-", "T78-", "G79-", 
                     "T203-", "A204-", "C205-", "A206-", "T207-", "G208-", "G425A", "T638G", "G1016A", "C1112T", 
                     "T1117C", "C1124T", "A1126G", "G1213A", "A1224C", "G1251T", "T1320G", "T1355G", "G1430A", 
                     "C1433A", "A1451C", "T1456G", "A1493G", "A1501T", "T1513C", "A1841G", "C1963T", "T2037G", 
                     "C2042A", "C2292A", "G2386T", "A2862T", "T2907A", "C3438T"]
    },
    'jn1': {
        'name': 'JN.1',
        'mutations': ["C56T", "C60T", "G62C", "T71-", "A72-", "C73-", "C74-", "C75-", "C76-", "C77-", "T78-", "G79-", 
                     "C149T", "T203-", "A204-", "C205-", "A206-", "T207-", "G208-", "G379T", "G425A", "T430-", "A431-", 
                     "T432-", "T470C", "C471A", "A472G", "A632-", "T633-", "T634-", "T638G", "C646T", "C733A", "C791A", 
                     "A994G", "G1015C", "G1016A", "A1067C", "C1112T", "T1117C", "C1124T", "A1126G", "G1208A", "G1213A", 
                     "A1224C", "G1251T", "T1320G", "G1333C", "T1334A", "G1336A", "A1348G", "C1354T", "T1355G", "T1364C", 
                     "T1380A", "G1430A", "C1433A", "T1443A", "G1447A", "T1448-", "T1449-", "G1450-", "T1456C", "T1457C", 
                     "A1493G", "A1501T", "T1513C", "G1660A", "C1709T", "A1841G", "C1861T", "C1963T", "T2037G", "C2042G", 
                     "C2292A", "G2386T", "C2816T", "A2862T", "T2907A", "C3428T", "C3645T"]
    },
    'kp2': {
        'name': 'KP.2',
        'mutations': ["C56T", "C60T", "G62C", "T71-", "A72-", "C73-", "C74-", "C75-", "C76-", "C77-", "T78-", "G79-", 
                     "C149T", "T203-", "A204-", "C205-", "A206-", "T207-", "G208-", "G379T", "G425A", "T430-", "A431-", 
                     "T432-", "T470C", "C471A", "A472G", "A632-", "T633-", "T634-", "T638G", "C646T", "C733A", "C791A", 
                     "A994G", "G1015C", "G1016A", "G1037C", "A1067C", "C1112T", "T1117C", "C1124T", "A1126G", "G1208A", 
                     "G1213A", "A1224C", "G1251T", "T1320G", "G1333C", "T1334A", "G1336A", "A1348G", "C1354T", "T1355G", 
                     "T1364C", "T1366C", "T1380A", "G1430A", "C1433A", "T1443A", "G1447A", "T1448-", "T1449-", "G1450-", 
                     "T1456C", "T1457C", "A1493G", "A1501T", "T1513C", "G1660A", "C1709T", "A1841G", "C1861T", "C1963T", 
                     "T2037G", "C2042G", "C2292A", "G2386T", "C2816T", "A2862T", "T2907A", "G3310T", "C3428T", "C3438T", "C3645T"]
    }
}

def read_fasta(filepath):
    """Read a FASTA file and return header and sequence."""
    with open(filepath, 'r') as f:
        header = f.readline().strip()
        sequence = f.read().replace('\n', '').replace('---', '')
    return header, sequence

def apply_mutations(sequence, mutations):
    """Apply mutations to a sequence. Handle both substitutions and deletions."""
    # Convert to list for easier manipulation (1-indexed positions)
    seq_list = list(sequence)
    
    # Sort mutations by position in reverse order to handle deletions correctly
    parsed_mutations = []
    for mut in mutations:
        match = re.match(r'([ATCG])(\d+)([-ATCG])?', mut)
        if not match:
            print(f"Warning: Could not parse mutation {mut}")
            continue
        
        original = match.group(1)
        pos = int(match.group(2))
        change = match.group(3) if match.group(3) else None
        
        parsed_mutations.append({
            'original': original,
            'pos': pos,
            'change': change,
            'raw': mut
        })
    
    # Sort by position descending to handle deletions without affecting earlier positions
    parsed_mutations.sort(key=lambda x: x['pos'], reverse=True)
    
    # Apply mutations
    for mut in parsed_mutations:
        pos = mut['pos']
        original = mut['original']
        change = mut['change']
        
        # Convert to 0-indexed
        idx = pos - 1
        
        if idx < 0 or idx >= len(seq_list):
            print(f"Warning: Position {pos} out of bounds (sequence length: {len(seq_list)})")
            continue
        
        if seq_list[idx] != original:
            print(f"Warning: At position {pos}, expected {original} but found {seq_list[idx]}")
        
        if change == '-':
            # Deletion
            seq_list.pop(idx)
        elif change and change in 'ATCG':
            # Substitution
            seq_list[idx] = change
        else:
            print(f"Warning: Unknown mutation type: {mut['raw']}")
    
    return ''.join(seq_list)

def write_fasta(filepath, header, sequence, width=100):
    """Write a FASTA file with wrapped sequence."""
    with open(filepath, 'w') as f:
        f.write(header + '\n')
        for i in range(0, len(sequence), width):
            f.write(sequence[i:i+width] + '\n')

def main():
    # Paths
    wuhan_path = Path('assets/data/Wuhan.fasta')
    output_dir = Path('assets/data/fasta-exports')
    
    if not wuhan_path.exists():
        print(f"Error: {wuhan_path} not found")
        return
    
    if not output_dir.exists():
        print(f"Error: {output_dir} not found")
        return
    
    # Read Wuhan reference
    print(f"Reading Wuhan reference from {wuhan_path}")
    wuhan_header, wuhan_seq = read_fasta(wuhan_path)
    print(f"Wuhan sequence length: {len(wuhan_seq)} bp")
    print(f"Wuhan header: {wuhan_header}\n")
    
    # Generate variants
    for variant_key, variant_info in VARIANTS.items():
        print(f"Generating {variant_info['name']}...")
        
        # Apply mutations
        mutated_seq = apply_mutations(wuhan_seq, variant_info['mutations'])
        print(f"  Mutated sequence length: {len(mutated_seq)} bp")
        
        # Write FASTA
        output_path = output_dir / f"{variant_key}.fasta"
        header = f">{variant_info['name']} | nucleotide_mutations: {';'.join(variant_info['mutations'])}"
        write_fasta(output_path, header, mutated_seq)
        print(f"  Saved to {output_path}\n")

if __name__ == '__main__':
    main()
