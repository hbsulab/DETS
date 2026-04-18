const DETS_TEXT_CACHE = new Map();

async function loadComponent(selector, filePath) {
  try {
    const response = await fetch(filePath);
    const html = await response.text();
    const host = document.querySelector(selector);
    host.innerHTML = html;
    rewriteComponentUrls(host);
  } catch (error) {
    console.error(`加载 ${filePath} 失败:`, error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  injectFavicon();
  const resourcePrefix = getResourcePrefix();
  Promise.all([
    loadComponent('#header-placeholder', `${resourcePrefix}components/header.html`),
    loadComponent('#navigator-placeholder', `${resourcePrefix}components/navigator.html`),
    loadComponent('#footer-placeholder', `${resourcePrefix}components/footer.html`)
  ]).then(() => {
    initDropdowns();
    initPageWidgets();
  });
});

function getResourcePrefix() {
  // Check if page is nested under pages/
  // pages/variants/, pages/components/, pages/evolution/, pages/characteristics/ need ../../
  // pages/ needs ../
  const pathname = window.location.pathname;
  if (pathname.includes('/pages/variants/') || 
      pathname.includes('/pages/components/') || 
      pathname.includes('/pages/evolution/') || 
      pathname.includes('/pages/characteristics/')) {
    return '../../';
  } else if (pathname.includes('/pages/')) {
    return '../';
  }
  return '';
}

function injectFavicon() {
  if (document.querySelector('link[rel="icon"]')) return;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = `${getResourcePrefix()}assets/images/logo1.png`;
  document.head.appendChild(link);
}

function rewriteComponentUrls(root) {
  const pathname = window.location.pathname;
  
  // Detect current nesting level
  let nestingLevel = 0;
  if (pathname.includes('/pages/variants/') || 
      pathname.includes('/pages/components/') ||
      pathname.includes('/pages/evolution/') || 
      pathname.includes('/pages/characteristics/')) {
    nestingLevel = 2;  // Two levels deep (e.g., /pages/variants/alpha.html)
  } else if (pathname.includes('/pages/')) {
    nestingLevel = 1;  // One level deep (e.g., /pages/evolution.html)
  }
  
  if (nestingLevel === 0) return;  // Root level, no rewriting needed

  root.querySelectorAll('[href]').forEach((element) => {
    const href = element.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('../') || href.startsWith('./') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return;
    
    // Determine prefix based on nesting level
    // Level 1 (/pages/): prefix is empty (just strip pages/)
    // Level 2 (/pages/subdirs/): prefix is ../ to go back to /pages/
    const prefix = nestingLevel === 2 ? '../' : '';
    
    // Handle pages/* paths (root-relative)
    if (href.startsWith('pages/')) {
      const relativePath = href.substring(6);  // Remove 'pages/' prefix
      element.setAttribute('href', `${prefix}${relativePath}`);
    } else {
      // Handle other relative paths (root-level pages like index.html, links.html)
      const upPrefix = nestingLevel === 2 ? '../../' : '../';
      element.setAttribute('href', `${upPrefix}${href}`);
    }
  });

  root.querySelectorAll('[src]').forEach((element) => {
    const src = element.getAttribute('src');
    if (!src || src.startsWith('../') || src.startsWith('./') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src)) return;
    const upPrefix = nestingLevel === 2 ? '../../' : '../';
    element.setAttribute('src', `${upPrefix}${src}`);
  });
}

function initDropdowns() {
  const dropdownItems = document.querySelectorAll('.dropdown-trigger');
  if (!dropdownItems.length) return;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileView = window.matchMedia('(max-width: 780px)').matches;

  if (isTouchDevice || isMobileView) {
    dropdownItems.forEach((item) => {
      item.addEventListener('click', function (event) {
        if (event.target.closest('.dropdown-menu')) return;
        if (event.target.tagName === 'A' || event.target === item || event.target.parentElement === item) {
          const link = item.querySelector('a');
          const href = link ? link.getAttribute('href') : null;
          
          // If the link has a real href (not javascript:void), navigate
          if (href && !href.startsWith('javascript:')) {
            // Allow natural navigation, just close other dropdowns
            dropdownItems.forEach((other) => {
              if (other !== item) other.classList.remove('active');
            });
            return;
          }
          
          // Otherwise, toggle dropdown
          event.preventDefault();
          dropdownItems.forEach((other) => {
            if (other !== item) other.classList.remove('active');
          });
          item.classList.toggle('active');
        }
      });
    });
  } else {
    // Desktop: Show dropdown on hover
    dropdownItems.forEach((item) => {
      item.addEventListener('mouseenter', function () {
        this.classList.add('active');
      });
      item.addEventListener('mouseleave', function () {
        this.classList.remove('active');
      });
      // Allow click navigation
      const link = item.querySelector('a');
      if (link && !link.getAttribute('href').startsWith('javascript:')) {
        link.addEventListener('click', function (event) {
          // Allow natural navigation
          event.stopPropagation();
        });
      }
    });
  }

  document.addEventListener('click', (event) => {
    dropdownItems.forEach((item) => {
      if (item.classList.contains('active') && !item.contains(event.target)) {
        item.classList.remove('active');
      }
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 780) {
      dropdownItems.forEach((item) => item.classList.remove('active'));
    }
  });
}

async function fetchTextCached(path) {
  if (!DETS_TEXT_CACHE.has(path)) {
    DETS_TEXT_CACHE.set(path, fetch(path).then((response) => response.text()));
  }
  return DETS_TEXT_CACHE.get(path);
}

function getLocalResourcePath(path) {
  if (!path || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return path;
  const normalized = path.replace(/^\.\//, '');
  return `${getResourcePrefix()}${normalized}`;
}

function parseFasta(text) {
  const records = [];
  let current = null;

  text.split(/\r?\n/).forEach((line) => {
    if (!line) return;
    if (line.startsWith('>')) {
      if (current) records.push(current);
      current = { header: line.slice(1).trim(), sequence: '' };
      return;
    }
    if (current) current.sequence += line.trim();
  });

  if (current) records.push(current);
  return records;
}

function normalizeVariantLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
}

function parseVariantClassTable(text) {
  const rows = [];

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^\d+$/.test(trimmed)) return;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3 || !/^\d+$/.test(parts[0])) return;

    let parentIndex = null;
    for (let index = parts.length - 1; index >= 3; index -= 1) {
      if (/^\d+$/.test(parts[index])) {
        parentIndex = Number(parts[index]);
        break;
      }
    }

    rows.push({
      index: Number(parts[0]),
      short: parts[1],
      lineage: parts[2],
      parentIndex
    });
  });

  return rows;
}

function findVariantClassRow(classRows, data) {
  const lookup = new Map();
  classRows.forEach((row) => {
    lookup.set(normalizeVariantLabel(row.short), row);
    lookup.set(normalizeVariantLabel(row.lineage), row);
  });

  const keys = [data.workbookClass, data.pageKey, data.title]
    .map((value) => normalizeVariantLabel(value))
    .filter(Boolean);

  for (const key of keys) {
    if (lookup.has(key)) return lookup.get(key);
  }

  for (const key of keys) {
    const fuzzy = classRows.find((row) => {
      const shortKey = normalizeVariantLabel(row.short);
      const lineageKey = normalizeVariantLabel(row.lineage);
      return shortKey.includes(key) || key.includes(shortKey) || lineageKey.includes(key) || key.includes(lineageKey);
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}

function buildVariantPathFromClassRows(classRows, targetRow) {
  if (!targetRow) return [];

  const byIndex = new Map(classRows.map((row) => [row.index, row]));
  const visited = new Set();
  const chain = [];
  let current = targetRow;

  while (current && !visited.has(current.index)) {
    visited.add(current.index);
    chain.push(current);
    if (!Number.isInteger(current.parentIndex)) break;
    current = byIndex.get(current.parentIndex) || null;
  }

  const labels = chain
    .reverse()
    .map((row) => (normalizeVariantLabel(row.short) === 'original' ? 'Wuhan' : row.short));

  if (!labels.length || labels[0] !== 'Wuhan') labels.unshift('Wuhan');
  return labels;
}

function buildPhyloResourceLinks(targetRow, data) {
  const nextstrainUrl = 'https://nextstrain.org/ncov/gisaid/global/6m';
  const covariantsToken = String((targetRow && targetRow.short) || data.pageKey || data.title || '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
  const covariantsUrl = `https://covariants.org/variants/${encodeURIComponent(covariantsToken)}`;
  const lineageLabel = targetRow ? `${targetRow.short} (${targetRow.lineage})` : data.title;

  return `
    <p class="sequence-note">Live phylogenetic context: <a href="${nextstrainUrl}" target="_blank" rel="noopener noreferrer">Nextstrain global tree</a> and <a href="${covariantsUrl}" target="_blank" rel="noopener noreferrer">CoVariants lineage page</a>.</p>
    <p class="sequence-note">Suggested query lineage: <strong>${escapeHtml(lineageLabel)}</strong>. The subtree chain above follows curated Wuhan-to-lineage transitions used in this page, aligned with Nextstrain/CoVariants-style VOC/VOI/VUM progression.</p>
  `;
}

function parseVariantRnaTable(text) {
  const map = new Map();

  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*\d+\s+(\S+)\s+(.*)$/);
    if (!match) return;

    const lineage = match[1].trim();
    const mutationText = match[2].trim().replace(/^"|"$/g, '');
    if (!lineage || !mutationText || mutationText === '""') {
      map.set(normalizeVariantLabel(lineage), []);
      return;
    }

    const mutations = mutationText.split(';').map((mutation) => mutation.trim()).filter(Boolean);
    map.set(normalizeVariantLabel(lineage), mutations);
  });

  return map;
}

function pickVariantRnaMutations(rnaMutationMap, data) {
  const keys = [
    data.workbookClass,
    data.pageKey,
    data.title
  ].map((key) => normalizeVariantLabel(key));

  for (const key of keys) {
    if (rnaMutationMap.has(key)) {
      return rnaMutationMap.get(key);
    }
  }

  return data.rnaMutations;
}

function extractSpikeRnaFromGenome(genomeSequence) {
  return genomeSequence.slice(21562, 25384);
}

function translateRnaSequence(rnaSequence) {
  const codonTable = {
    TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
    TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
    TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
    TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
    CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
    CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
    CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
    CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
    ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
    ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
    AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
    AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
    GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
    GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
    GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
    GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
  };

  let protein = '';
  for (let index = 0; index + 3 <= rnaSequence.length; index += 3) {
    const codon = rnaSequence.slice(index, index + 3).replace(/U/g, 'T');
    const aminoAcid = codonTable[codon] || 'X';
    if (aminoAcid === '*') break;
    protein += aminoAcid;
  }
  return protein;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMutationMap(mutations) {
  const map = new Map();
  const deletionRanges = [];

  mutations.forEach((mutation) => {
    const normalized = mutation.trim();
    if (!normalized) return;
    const rangeMatch = normalized.match(/^(?:del)?([A-Z]?)(\d+)-([A-Z]?)(\d+)$/i);
    if (rangeMatch && (normalized.includes('del') || normalized.includes('-'))) {
      const start = Number(rangeMatch[2]);
      const end = Number(rangeMatch[4]);
      deletionRanges.push([Math.min(start, end), Math.max(start, end)]);
      return;
    }

    const substitutionMatch = normalized.match(/^([A-Z])?(\d+)([A-Z-])$/i);
    if (substitutionMatch) {
      const position = Number(substitutionMatch[2]);
      map.set(position, substitutionMatch[3] === '-' ? '-' : substitutionMatch[3]);
    }
  });

  return { map, deletionRanges };
}

function applyMutations(sequence, mutations) {
  const characters = sequence.split('');
  const { map, deletionRanges } = buildMutationMap(mutations);

  map.forEach((residue, position) => {
    if (position >= 1 && position <= characters.length) {
      characters[position - 1] = residue;
    }
  });

  deletionRanges.forEach(([start, end]) => {
    for (let position = start; position <= end; position += 1) {
      if (position >= 1 && position <= characters.length) {
        characters[position - 1] = '-';
      }
    }
  });

  return characters.join('');
}

function getMutationPositions(referenceSequence, variantSequence) {
  const positions = [];
  const length = Math.min(referenceSequence.length, variantSequence.length);
  for (let index = 0; index < length; index += 1) {
    if (referenceSequence[index] !== variantSequence[index]) {
      positions.push(index + 1);
    }
  }
  return positions;
}

function renderSequenceComparison(referenceSequence, variantSequence, options = {}) {
  const mutationsOnly = Boolean(options.mutationsOnly);
  const focusPosition = Number(options.focusPosition) || null;
  const chunkSize = 60;
  const rows = [];

  for (let index = 0; index < referenceSequence.length; index += chunkSize) {
    const referenceChunk = referenceSequence.slice(index, index + chunkSize);
    const variantChunk = variantSequence.slice(index, index + chunkSize);
    const chunkStart = index + 1;
    const chunkEnd = index + referenceChunk.length;
    const chunkHasMutation = Array.from(referenceChunk).some((residue, chunkIndex) => residue !== (variantChunk[chunkIndex] || ''));
    const chunkHasFocus = Boolean(focusPosition && focusPosition >= chunkStart && focusPosition <= chunkEnd);

    if (mutationsOnly && !chunkHasMutation && !chunkHasFocus) continue;

    const refHtml = Array.from(referenceChunk).map((residue, chunkIndex) => {
      const variantResidue = variantChunk[chunkIndex] || '';
      const mutated = residue !== variantResidue;
      const position = index + chunkIndex + 1;
      const focused = focusPosition === position;
      if (mutated && focused) {
        return `<span class="mutation-highlight" style="outline:2px solid #cc7a00;border-radius:2px;" data-seq-pos="${position}">${escapeHtml(residue)}</span>`;
      }
      if (mutated) {
        return `<span class="mutation-highlight" data-seq-pos="${position}">${escapeHtml(residue)}</span>`;
      }
      if (focused) {
        return `<span style="outline:2px solid #cc7a00;border-radius:2px;" data-seq-pos="${position}">${escapeHtml(residue)}</span>`;
      }
      return escapeHtml(residue);
    }).join('');

    const varHtml = Array.from(variantChunk).map((residue, chunkIndex) => {
      const referenceResidue = referenceChunk[chunkIndex] || '';
      const mutated = residue !== referenceResidue;
      const position = index + chunkIndex + 1;
      const focused = focusPosition === position;
      if (mutated && focused) {
        return `<span class="mutation-highlight" style="outline:2px solid #cc7a00;border-radius:2px;" data-seq-pos="${position}">${escapeHtml(residue)}</span>`;
      }
      if (mutated) {
        return `<span class="mutation-highlight" data-seq-pos="${position}">${escapeHtml(residue)}</span>`;
      }
      if (focused) {
        return `<span style="outline:2px solid #cc7a00;border-radius:2px;" data-seq-pos="${position}">${escapeHtml(residue)}</span>`;
      }
      return escapeHtml(residue);
    }).join('');

    rows.push(`<div class="sequence-row" ${chunkHasFocus ? 'data-focus-chunk="true"' : ''}><div class="sequence-label">Wuhan ${chunkStart}-${chunkEnd}</div><div>${refHtml}</div></div>`);
    rows.push(`<div class="sequence-row" ${chunkHasFocus ? 'data-focus-chunk="true"' : ''}><div class="sequence-label">Variant ${chunkStart}-${chunkEnd}</div><div>${varHtml}</div></div>`);
  }

  if (!rows.length) {
    return '<p class="sequence-note">No differences in the current view/filter.</p>';
  }

  return rows.join('');
}

function buildMutationPills(mutations, options = {}) {
  const clickable = Boolean(options.clickable);
  return mutations.map((mutation) => {
    const normalized = String(mutation || '').trim();
    const match = normalized.match(/^(?:[A-Z]|del)?(\d+)(?:[A-Z-]|-\d+.*)?$/i) || normalized.match(/^[A-Z-]?(\d+)[A-Z-]?$/i);
    const position = match ? Number(match[1]) : null;

    if (clickable && position) {
      return `<button type="button" class="mutation-pill" data-aa-pos="${position}" title="Jump to amino-acid position ${position}">${escapeHtml(normalized)}</button>`;
    }

    return `<span class="mutation-pill">${escapeHtml(normalized)}</span>`;
  }).join('');
}

function downloadText(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createTreeSvg(nodes, title) {
  const spacing = 180;
  const width = Math.max(720, nodes.length * spacing);
  const height = 220;
  const y = 110;

  const lineMarkup = nodes.slice(1).map((_, index) => {
    const x1 = 80 + index * spacing + 20;
    const x2 = 80 + (index + 1) * spacing - 20;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#6faec4" stroke-width="4" stroke-linecap="round"/>`;
  }).join('');

  const nodeMarkup = nodes.map((node, index) => {
    const x = 80 + index * spacing;
    const circleColor = index === 0 ? '#0f6b8c' : index === nodes.length - 1 ? '#d94b4b' : '#2f9bbb';
    const labelY = index % 2 === 0 ? 44 : 184;
    return `
      <g transform="translate(${x},${y})">
        <circle r="20" fill="${circleColor}"/>
        <text x="0" y="${labelY}" text-anchor="middle" fill="#1e3a4d" font-size="15" font-weight="600">${escapeHtml(node)}</text>
      </g>
    `;
  }).join('');

  return `
    <div class="feature-panel">
      <h3>${escapeHtml(title)}</h3>
      <svg class="tree-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
        <rect width="100%" height="100%" rx="18" fill="#f7fbfd"></rect>
        ${lineMarkup}
        ${nodeMarkup}
      </svg>
    </div>
  `;
}

function ensure3Dmol(callback) {
  if (window.$3Dmol) {
    callback();
    return;
  }

  if (document.querySelector('script[data-dets-3dmol]')) {
    const timer = window.setInterval(() => {
      if (window.$3Dmol) {
        window.clearInterval(timer);
        callback();
      }
    }, 50);
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://unpkg.com/3dmol@2.4.2/build/3Dmol-min.js';
  script.async = true;
  script.dataset.dets3dmol = 'true';
  script.onload = callback;
  document.head.appendChild(script);
}

function renderStructureViewer(targetId, source, sourceType, style = {}) {
  ensure3Dmol(() => {
    const target = document.getElementById(targetId);
    if (!target || !window.$3Dmol) return;
    
    // Set explicit dimensions for 3Dmol container
    target.style.width = '100%';
    target.style.height = '460px';
    target.style.display = 'block';
    target.innerHTML = '';
    
    const viewer = $3Dmol.createViewer(target, {
      backgroundColor: '#f6fbfe',
      disableFog: true,
      defaultcolors: $3Dmol.rasmolElementColors
    });

    viewer.addModel(source, sourceType);
    viewer.zoomTo();
    // Use cartoon as the default biomolecular representation.
    const cartoonSpec = style.cartoon || { color: 'spectrum' };
    viewer.setStyle({}, { cartoon: cartoonSpec });
    if (style.sidechains) {
      viewer.addStyle({ hetflag: false, atom: 'CA' }, style.sidechains);
    }
    if (style.surface) {
      viewer.addSurface($3Dmol.SurfaceType.VDW, style.surface, {});
    }
    viewer.render();
  });
}

function renderVariantWidget(pageKey) {
  const configNode = document.getElementById('variant-widget-data');
  if (!configNode) return;

  let data = null;
  try {
    data = JSON.parse(configNode.textContent);
  } catch (error) {
    console.error('Invalid variant-widget-data JSON:', error);
    return;
  }

  if (data.pageKey && data.pageKey !== pageKey) return;
  data = {
    title: data.title || pageKey,
    path: Array.isArray(data.path) ? data.path : ['Wuhan', pageKey],
    proteinMutations: Array.isArray(data.proteinMutations) ? data.proteinMutations : [],
    rnaMutations: Array.isArray(data.rnaMutations) ? data.rnaMutations : [],
    workbookClass: data.workbookClass || pageKey,
    pdbIds: Array.isArray(data.pdbIds) && data.pdbIds.length ? data.pdbIds : ['6VSB'],
    epiIds: Array.isArray(data.epiIds) && data.epiIds.length ? data.epiIds : ['N/A']
  };

  if (!data) return;

  Promise.all([
    fetchTextCached(getLocalResourcePath('assets/data/Wuhan.fasta')),
    fetchTextCached(getLocalResourcePath('assets/data/Variants.txt')),
    fetchTextCached(getLocalResourcePath('assets/data/VariantsRNA.txt'))
  ]).then(([fastaText, variantClassText, variantRnaText]) => {
    const classRows = parseVariantClassTable(variantClassText);
    const variantOptions = classRows.map((row) => ({
      value: row.lineage,
      label: `${row.short} (${row.lineage})`
    }));
    const targetClassRow = findVariantClassRow(classRows, data);
    const inferredPath = buildVariantPathFromClassRows(classRows, targetClassRow);
    const treeNodes = Array.isArray(data.path) && data.path.length >= 2 ? data.path : (inferredPath.length >= 2 ? inferredPath : ['Wuhan', data.title]);
    const rnaMutationMap = parseVariantRnaTable(variantRnaText);
    const effectiveRnaMutations = pickVariantRnaMutations(rnaMutationMap, data);

    const genomeRecord = parseFasta(fastaText)[0];
    if (!genomeRecord) return;

    const spikeRna = extractSpikeRnaFromGenome(genomeRecord.sequence);
    const referenceProtein = translateRnaSequence(spikeRna);
    const variantProtein = applyMutations(referenceProtein, data.proteinMutations);
    const container = document.querySelector('#main_container .container');
    if (!container) return;

    const treeSection = document.createElement('div');
    treeSection.className = 'visualization-block';
    treeSection.innerHTML = `
      <h3>Phylogenetic Subtree from Wuhan</h3>
      <div class="viz-placeholder">${createTreeSvg(treeNodes, `${data.title}: Wuhan to lineage subset`)}</div>
      ${buildPhyloResourceLinks(targetClassRow, data)}
    `;

    const structureSection = document.createElement('div');
    structureSection.className = 'visualization-block';
    structureSection.innerHTML = `
      <h3>Interactive spike structure and sequence by PDB ID</h3>
      <div class="feature-panel">
        <div class="download-toolbar">
          <div>
            <label for="pdbSelect-${pageKey}">PDB ID</label>
            <select id="pdbSelect-${pageKey}">
              ${data.pdbIds.map((pdbId) => `<option value="${pdbId}">${pdbId}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="structure-frame" style="height: 780px; min-height: 780px;">
          <iframe id="variant-structure-iframe-${pageKey}" src="" title="RCSB 3D Protein Feature View for ${escapeHtml(data.title)}"></iframe>
        </div>
        <p class="sequence-note">The embedded RCSB 3D Protein Feature View provides sequence, residue clicking, and linked 3D structure highlighting. Open the <a id="variant-structure-link-${pageKey}" href="#" target="_blank" rel="noopener noreferrer">full-page RCSB view</a> if you want more space.</p>
      </div>
    `;

    const seqSection = document.createElement('div');
    seqSection.className = 'text-block';
    seqSection.innerHTML = `
      <h2>Reference sequence, defining RNA, and spike mutations</h2>
      <p><strong>Reference:</strong> Wuhan-Hu-1 spike region extracted from <a href="../../assets/data/Wuhan.fasta" target="_blank" rel="noopener noreferrer">Wuhan.fasta</a> and cross-referenced with <a href="../../assets/data/CorrectedData_AfterTimeCorrection.xlsx" target="_blank" rel="noopener noreferrer">CorrectedData_AfterTimeCorrection.xlsx</a>.</p>
      <p><strong>Variant catalogs:</strong> <a href="../../assets/data/Variants.txt" target="_blank" rel="noopener noreferrer">Variants.txt</a> and <a href="../../assets/data/VariantsRNA.txt" target="_blank" rel="noopener noreferrer">VariantsRNA.txt</a> for lineage labels and defining RNA mutations.</p>
      <p><strong>Workbook lineage label:</strong> ${escapeHtml(data.workbookClass)}</p>
      <div class="comparison-grid">
        <div class="comparison-card">
          <h4>Defining RNA mutations</h4>
          <div class="mutations-list">${buildMutationPills(effectiveRnaMutations)}</div>
        </div>
        <div class="comparison-card">
          <h4>Defining spike mutations</h4>
          <div class="mutations-list">${buildMutationPills(data.proteinMutations, { clickable: true })}</div>
        </div>
      </div>
      <div class="download-toolbar">
        <div>
          <label for="monthSelect-${pageKey}">Month</label>
          <select id="monthSelect-${pageKey}">
            <option value="all">All months</option>
            <option value="2020-01">2020-01</option>
            <option value="2021-01">2021-01</option>
            <option value="2022-01">2022-01</option>
            <option value="2023-01">2023-01</option>
            <option value="2024-01">2024-01</option>
            <option value="2025-01">2025-01</option>
          </select>
        </div>
        <div>
          <label for="epiSelect-${pageKey}">EPI_ID</label>
          <select id="epiSelect-${pageKey}">
            <option value="all">All representative IDs</option>
            ${data.epiIds.map((epiId) => `<option value="${epiId}">${epiId}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="mutationSelect-${pageKey}">Mutation set</label>
          <select id="mutationSelect-${pageKey}">
            <option value="all">All defining mutations</option>
            <option value="protein">Spike mutations only</option>
            <option value="rna">RNA mutations only</option>
          </select>
        </div>
      </div>
      <div class="button-row">
        <button type="button" data-download="summary">Download mutation summary</button>
        <button type="button" data-download="fasta">Download synthetic spike FASTA</button>
        <button type="button" data-download="reference-rna">Download Wuhan spike RNA FASTA</button>
        <button type="button" data-download="reference-protein">Download Wuhan spike protein FASTA</button>
        <button type="button" data-download="selection">Download selected records (TSV)</button>
        <a href="../../assets/data/CorrectedData_AfterTimeCorrection.xlsx" target="_blank" rel="noopener noreferrer">Download corrected workbook</a>
        <a href="../../assets/data/InputVariantsLMCM_20260118.xlsx" target="_blank" rel="noopener noreferrer">Download input workbook</a>
      </div>
      <p class="sequence-note">Filters include month, variant label, and EPI_ID. Downloads are generated from the same reference files and variant tables used by this page.</p>
    `;

    const compareSection = document.createElement('div');
    compareSection.className = 'visualization-block';
    compareSection.innerHTML = `
      <h3>Interactive Wuhan vs variant sequence compare</h3>
      <div class="download-toolbar">
        <div>
          <label for="comparePosition-${pageKey}">Amino-acid position</label>
          <input id="comparePosition-${pageKey}" type="number" min="1" max="${referenceProtein.length}" value="" placeholder="e.g. 452">
        </div>
        <div>
          <label for="compareMutOnly-${pageKey}">View filter</label>
          <div style="padding-top:10px;">
            <input id="compareMutOnly-${pageKey}" type="checkbox">
            <label for="compareMutOnly-${pageKey}">Show mutation chunks only</label>
          </div>
        </div>
      </div>
      <div class="button-row">
        <button type="button" id="compareGo-${pageKey}">Go to position</button>
        <button type="button" id="compareReset-${pageKey}">Reset compare view</button>
      </div>
      <div class="viz-placeholder">
        <div class="sequence-viewer" id="sequenceViewer-${pageKey}">${renderSequenceComparison(referenceProtein, variantProtein)}</div>
      </div>
      <p class="sequence-note" id="compareStatus-${pageKey}"></p>
      <p class="sequence-note">Mutated positions are highlighted in both rows. The view is generated from the Wuhan spike reference and the lineage-defining mutation list.</p>
    `;

    const introBlock = container.querySelector('.text-block');
    const insertionAnchor = introBlock ? introBlock.nextElementSibling : container.firstElementChild;
    if (insertionAnchor) {
      container.insertBefore(treeSection, insertionAnchor);
      container.insertBefore(structureSection, insertionAnchor);
      container.insertBefore(seqSection, insertionAnchor);
      container.insertBefore(compareSection, insertionAnchor);
    } else {
      container.appendChild(treeSection);
      container.appendChild(structureSection);
      container.appendChild(seqSection);
      container.appendChild(compareSection);
    }

    const pdbSelect = structureSection.querySelector(`#pdbSelect-${pageKey}`);
    const variantFrame = structureSection.querySelector(`#variant-structure-iframe-${pageKey}`);
    const variantLink = structureSection.querySelector(`#variant-structure-link-${pageKey}`);
    const loadVariantStructure = (pdbId) => {
      const embedUrl = `https://www.rcsb.org/3d-sequence/${encodeURIComponent(pdbId)}?assemblyId=1&embedded=1`;
      const fullUrl = `https://www.rcsb.org/3d-sequence/${encodeURIComponent(pdbId)}?assemblyId=1`;
      if (variantFrame) {
        variantFrame.src = embedUrl;
      }
      if (variantLink) {
        variantLink.href = fullUrl;
      }
    };

    if (pdbSelect && pdbSelect.value) {
      loadVariantStructure(pdbSelect.value);
      pdbSelect.addEventListener('change', () => loadVariantStructure(pdbSelect.value));
    }

    const mutationModeSelect = seqSection.querySelector(`#mutationSelect-${pageKey}`);
    const sequenceViewer = compareSection.querySelector(`#sequenceViewer-${pageKey}`);
    const compareStatus = compareSection.querySelector(`#compareStatus-${pageKey}`);
    const comparePositionInput = compareSection.querySelector(`#comparePosition-${pageKey}`);
    const compareMutOnlyToggle = compareSection.querySelector(`#compareMutOnly-${pageKey}`);
    const compareGoButton = compareSection.querySelector(`#compareGo-${pageKey}`);
    const compareResetButton = compareSection.querySelector(`#compareReset-${pageKey}`);
    let compareFocusPosition = null;

    const getCompareProteinMutations = () => {
      if (!mutationModeSelect) return data.proteinMutations;
      const mode = mutationModeSelect.value;
      if (mode === 'rna') return [];
      return data.proteinMutations;
    };

    const updateSequenceComparison = () => {
      const compareVariantProtein = applyMutations(referenceProtein, getCompareProteinMutations());
      const mutationPositions = getMutationPositions(referenceProtein, compareVariantProtein);
      const mode = mutationModeSelect ? mutationModeSelect.value : 'all';
      const focusPosition = compareFocusPosition && compareFocusPosition >= 1 && compareFocusPosition <= referenceProtein.length ? compareFocusPosition : null;

      sequenceViewer.innerHTML = renderSequenceComparison(referenceProtein, compareVariantProtein, {
        mutationsOnly: compareMutOnlyToggle ? compareMutOnlyToggle.checked : false,
        focusPosition
      });

      if (compareStatus) {
        if (mode === 'rna') {
          compareStatus.textContent = 'RNA-only mode selected: spike amino-acid sequence remains unchanged.';
        } else {
          compareStatus.textContent = `Detected ${mutationPositions.length} amino-acid differences${focusPosition ? `; focused position: ${focusPosition}` : ''}.`;
        }
      }

      if (focusPosition) {
        const focusChunk = sequenceViewer.querySelector('[data-focus-chunk="true"]');
        if (focusChunk) {
          focusChunk.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };

    if (mutationModeSelect) {
      mutationModeSelect.addEventListener('change', updateSequenceComparison);
    }

    if (compareMutOnlyToggle) {
      compareMutOnlyToggle.addEventListener('change', updateSequenceComparison);
    }

    if (compareGoButton) {
      compareGoButton.addEventListener('click', () => {
        const value = Number(comparePositionInput ? comparePositionInput.value : 0);
        compareFocusPosition = Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
        updateSequenceComparison();
      });
    }

    if (comparePositionInput) {
      comparePositionInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const value = Number(comparePositionInput.value);
          compareFocusPosition = Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
          updateSequenceComparison();
        }
      });
    }

    if (compareResetButton) {
      compareResetButton.addEventListener('click', () => {
        compareFocusPosition = null;
        if (comparePositionInput) comparePositionInput.value = '';
        if (compareMutOnlyToggle) compareMutOnlyToggle.checked = false;
        updateSequenceComparison();
      });
    }

    seqSection.querySelectorAll('[data-aa-pos]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const value = Number(pill.getAttribute('data-aa-pos'));
        if (!Number.isFinite(value) || value < 1) return;
        compareFocusPosition = Math.floor(value);
        if (comparePositionInput) comparePositionInput.value = String(compareFocusPosition);
        if (mutationModeSelect && mutationModeSelect.value === 'rna') {
          mutationModeSelect.value = 'protein';
        }
        updateSequenceComparison();
      });
    });

    updateSequenceComparison();

    seqSection.querySelectorAll('[data-download]').forEach((button) => {
      button.addEventListener('click', () => {
        const month = seqSection.querySelector(`#monthSelect-${pageKey}`).value;
        const epiId = seqSection.querySelector(`#epiSelect-${pageKey}`).value;
        const selectedVariant = data.workbookClass;
        const mutationMode = seqSection.querySelector(`#mutationSelect-${pageKey}`).value;
        const selectedMutations = mutationMode === 'protein' ? data.proteinMutations : mutationMode === 'rna' ? effectiveRnaMutations : data.proteinMutations.concat(effectiveRnaMutations);

        const summary = [
          `Variant\t${data.title}`,
          `Variant filter\t${selectedVariant}`,
          `Month\t${month}`,
          `EPI_ID\t${epiId}`,
          `Mutation mode\t${mutationMode}`,
          `Protein mutations\t${data.proteinMutations.join('; ')}`,
          `RNA mutations\t${effectiveRnaMutations.join('; ')}`,
          `Selected mutation count\t${selectedMutations.length}`
        ].join('\n');

        if (button.dataset.download === 'summary') {
          downloadText(`${pageKey}-${month}-mutation-summary.tsv`, summary, 'text/tab-separated-values;charset=utf-8');
          return;
        }

        if (button.dataset.download === 'reference-rna') {
          downloadText(`wuhan-spike-rna.fasta`, `>Wuhan-Hu-1 spike RNA\n${spikeRna}\n`);
          return;
        }

        if (button.dataset.download === 'reference-protein') {
          downloadText(`wuhan-spike-protein.fasta`, `>Wuhan-Hu-1 spike protein\n${referenceProtein}\n`);
          return;
        }

        if (button.dataset.download === 'selection') {
          const selectedIds = epiId === 'all' ? data.epiIds.join('; ') : epiId;
          const tsv = [
            'Variant\tVariantFilter\tMonth\tEPI_ID\tWorkbookClass\tMutationMode\tMutationCount',
            `${data.title}\t${selectedVariant}\t${month}\t${selectedIds}\t${data.workbookClass}\t${mutationMode}\t${selectedMutations.length}`
          ].join('\n');
          downloadText(`${pageKey}-${month}-selection.tsv`, tsv, 'text/tab-separated-values;charset=utf-8');
          return;
        }

        const filteredProteinMutations = selectedMutations.filter((mutation) => mutation.match(/^[A-Z]?\d+[A-Z-]$/i) || mutation.startsWith('del'));
        const variantProteinSequence = applyMutations(referenceProtein, filteredProteinMutations);
        downloadText(`${pageKey}-${month}-spike.fasta`, `>${data.title} | ${month}\n${variantProteinSequence}\n`);
      });
    });
  });
}

function renderComponentWidget(pageKey) {
  const container = document.querySelector('#main_container .container');
  if (!container) return;

  fetchTextCached(getLocalResourcePath('assets/data/Wuhan.fasta')).then((fastaText) => {
    const genomeRecord = parseFasta(fastaText)[0];
    if (!genomeRecord) return;

    const spikeRna = extractSpikeRnaFromGenome(genomeRecord.sequence);
    const spikeProtein = translateRnaSequence(spikeRna);
    const rnaSection = document.createElement('div');
    const spikeSection = document.createElement('div');
    const structureSection = document.createElement('div');

    if (pageKey === 'rna') {
      rnaSection.className = 'feature-panel';
      rnaSection.innerHTML = `
        <h3>Spike RNA sequence</h3>
        <p>The spike coding region is extracted directly from <a href="../../assets/data/Wuhan.fasta" target="_blank" rel="noopener noreferrer">Wuhan.fasta</a> so the page stays synchronized with the reference genome.</p>
        <div class="sequence-viewer">${escapeHtml(spikeRna.match(/.{1,60}/g).join('\n'))}</div>
        <p class="sequence-note">Suggested interactive RNA-structure tools: <a href="https://rna.tbi.univie.ac.at/forna/" target="_blank" rel="noopener noreferrer">forna</a>, <a href="https://rna.urmc.rochester.edu/RNAstructureWeb/" target="_blank" rel="noopener noreferrer">RNAstructure</a>, <a href="https://r2dt.bioinf.uni-leipzig.de/" target="_blank" rel="noopener noreferrer">R2DT</a>, and <a href="https://varna.lri.fr/" target="_blank" rel="noopener noreferrer">VARNA</a>.</p>
      `;

      spikeSection.className = 'visualization-block';
      spikeSection.innerHTML = `
        <h3>RNA secondary structure</h3>
        <div class="feature-panel">
          <p><strong>Citation:</strong> Manfredonia, I., Nithin, C., Ponce-Salvatierra, A., <em>et al.</em> (2021). In vivo structural characterization of the SARS-CoV-2 RNA genome identifies host proteins vulnerable to repurposed drugs. <em>Cell</em>, 184(7), 1865-1883.e20. <a href="https://doi.org/10.1016/j.cell.2021.02.008" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.cell.2021.02.008</a></p>
          <p>This section highlights RNA secondary-structure organization in the spike transcript and points to the cited Cell paper for experimentally supported in vivo structure context.</p>
          <svg viewBox="0 0 900 260" class="tree-svg" role="img" aria-label="RNA secondary structure schematic">
            <rect width="900" height="260" rx="20" fill="#f7fbfd"></rect>
            <path d="M60 160 C130 60, 230 60, 300 160" stroke="#2d90b3" stroke-width="4" fill="none"></path>
            <path d="M310 160 C370 90, 450 90, 510 160" stroke="#2d90b3" stroke-width="4" fill="none"></path>
            <path d="M520 160 C580 50, 700 50, 760 160" stroke="#2d90b3" stroke-width="4" fill="none"></path>
            <line x1="40" y1="190" x2="860" y2="190" stroke="#5ea8c2" stroke-width="5" stroke-linecap="round"></line>
            <text x="50" y="225" font-size="16" fill="#195f79">5' UTR</text>
            <text x="345" y="225" font-size="16" fill="#195f79">S coding region</text>
            <text x="760" y="225" font-size="16" fill="#195f79">3' UTR</text>
            <text x="160" y="120" font-size="14" fill="#0f5b73">Stem-loop cluster</text>
            <text x="392" y="120" font-size="14" fill="#0f5b73">Local hairpins</text>
            <text x="620" y="105" font-size="14" fill="#0f5b73">Long-range pairing</text>
          </svg>
          <p class="sequence-note">Structure schematic for quick orientation. For publication figures and full experimental maps, open the Cell article via DOI.</p>
          <p><strong>Interactive RNA structure tools:</strong></p>
          <div class="structure-frame">
            <iframe src="https://rna.tbi.univie.ac.at/forna/" title="Interactive RNA structure viewer (forna)"></iframe>
          </div>
          <p class="sequence-note">Recommended tools: <a href="https://rna.tbi.univie.ac.at/forna/" target="_blank">forna</a>, <a href="https://r2dt.bioinf.uni-leipzig.de/" target="_blank">R2DT</a>, <a href="https://rna.urmc.rochester.edu/RNAstructureWeb/" target="_blank">RNAstructure</a>, or <a href="https://varna.lri.fr/" target="_blank">VARNA</a>.</p>
        </div>
      `;

      structureSection.className = 'footnote-block';
      structureSection.innerHTML = `
        <h4>Interpretation notes</h4>
        <ul>
          <li>RNA-level structure is most useful when paired with the translated spike sequence and lineage-specific mutation context.</li>
          <li>Interactive RNA tools can show base pairing, stem-loops, and motif accessibility better than a static image alone.</li>
        </ul>
      `;
    }

    if (pageKey === 'spike') {
      spikeSection.className = 'feature-panel';
      spikeSection.innerHTML = `
        <h3>Wuhan spike sequence</h3>
        <p>The page uses the Wuhan spike coding region and its translated protein so users can inspect the reference sequence before comparing variants.</p>
        <div class="sequence-viewer">${escapeHtml(spikeProtein.match(/.{1,60}/g).join('\n'))}</div>
      `;

      structureSection.className = 'visualization-block';
      structureSection.innerHTML = `
        <h3>Interactive Wuhan spike structure and sequence</h3>
        <div class="feature-panel">
          <div class="structure-frame" style="height: 760px; min-height: 760px;">
            <iframe src="https://www.rcsb.org/3d-sequence/6VSB?assemblyId=1&embedded=1" title="RCSB 3D Protein Feature View for spike"></iframe>
          </div>
          <p class="sequence-note">The embedded RCSB viewer provides the sequence panel, residue clicking, and linked structure highlighting. Use the <a href="https://www.rcsb.org/3d-sequence/6VSB?assemblyId=1" target="_blank" rel="noopener noreferrer">full RCSB 3D Protein Feature View</a> if the embed is constrained by your browser.</p>
        </div>
      `;
    }

    if (pageKey === 'rdrp') {
      spikeSection.className = 'feature-panel';
      spikeSection.innerHTML = `
        <h3>RdRp sequence from 7UO7</h3>
        <p>The catalytic nsp12 sequence is taken from <a href="../../assets/data/7UO7_seq-holo.fasta" target="_blank" rel="noopener noreferrer">7UO7_seq-holo.fasta</a> and paired with the holo-structure below.</p>
        <div class="sequence-viewer" id="rdrp-sequence-viewer">Loading 7UO7 sequence...</div>
        <div class="button-row">
          <a href="../../assets/data/7UO7_seq-holo.fasta" download>Download RdRp FASTA</a>
          <a href="../../assets/data/7uo7-holo.pdb" download>Download 7UO7 PDB</a>
        </div>
      `;

      fetchTextCached(getLocalResourcePath('assets/data/7UO7_seq-holo.fasta')).then((rdrpFastaText) => {
        const rdrpRecord = parseFasta(rdrpFastaText)[0];
        const target = spikeSection.querySelector('#rdrp-sequence-viewer');
        if (target && rdrpRecord) {
          target.textContent = (rdrpRecord.sequence.match(/.{1,60}/g) || [rdrpRecord.sequence]).join('\n');
          target.style.whiteSpace = 'pre-wrap';
          target.style.overflowWrap = 'anywhere';
          target.style.wordBreak = 'break-word';
          target.style.textAlign = 'left';
          target.style.width = '100%';
          target.style.maxWidth = '820px';
          target.style.margin = '0 auto';
        }
      });

      structureSection.className = 'visualization-block';
      structureSection.innerHTML = `
        <h3>Interactive RdRp structure and sequence</h3>
        <div class="feature-panel">
          <div class="structure-frame" style="height: 760px; min-height: 760px;">
            <iframe src="https://www.rcsb.org/3d-sequence/7UO7?assemblyId=1&embedded=1" title="RCSB 3D Protein Feature View for RdRp"></iframe>
          </div>
          <p class="sequence-note">The embedded RCSB viewer provides sequence-residue interaction and the linked 3D structure view for 7UO7. Use the <a href="https://www.rcsb.org/3d-sequence/7UO7?assemblyId=1" target="_blank" rel="noopener noreferrer">full RCSB 3D Protein Feature View</a> if you need the full-page experience.</p>
        </div>
      `;
    }

    const introBlock = container.querySelector('.text-block');
    const insertionAnchor = introBlock ? introBlock.nextElementSibling : container.firstElementChild;
    if (insertionAnchor) {
      if (pageKey === 'rna') {
        container.insertBefore(spikeSection, insertionAnchor);
        container.insertBefore(rnaSection, insertionAnchor);
        container.insertBefore(structureSection, insertionAnchor);
      } else {
        container.insertBefore(structureSection, insertionAnchor);
        container.insertBefore(spikeSection, insertionAnchor);
      }
    } else {
      if (pageKey === 'rna') {
        container.appendChild(spikeSection);
        container.appendChild(rnaSection);
        container.appendChild(structureSection);
      } else {
        container.appendChild(structureSection);
        container.appendChild(spikeSection);
      }
    }
  });
}

function renderEvolutionWidget(pageKey) {
  if (pageKey !== 'delemus') return;

  const configNode = document.getElementById('evolution-widget-data');
  if (!configNode) return;

  let data;
  try {
    data = JSON.parse(configNode.textContent || '{}');
  } catch (error) {
    console.error('Invalid evolution-widget-data JSON:', error);
    return;
  }

  const updatesData = Array.isArray(data.updatesData) ? data.updatesData : [];
  const timeCourseData = Array.isArray(data.timeCourseData) ? data.timeCourseData : [];
  if (!updatesData.length || !timeCourseData.length) return;

  function renderUpdates(key) {
    const target = document.getElementById('updatesPanel');
    const title = document.getElementById('updatesTitle');
    const item = updatesData.find((entry) => entry.key === key);
    if (!item || !target || !title) return;

    title.textContent = `Outlined Mutations in ${item.key}`;
    target.innerHTML = '';

    const main = document.createElement('img');
    main.src = item.main;
    main.alt = `Outlined mutations ${item.key}`;
    main.style.maxWidth = '100%';
    main.style.height = 'auto';
    main.style.display = 'block';
    main.style.margin = '0 auto';
    target.appendChild(main);

    if (item.confirm) {
      const confirmHeading = document.createElement('p');
      confirmHeading.textContent = 'Confirmed Mutations';
      confirmHeading.style.fontWeight = '600';
      confirmHeading.style.margin = '8px 0';
      target.appendChild(confirmHeading);

      const confirm = document.createElement('img');
      confirm.src = item.confirm;
      confirm.alt = `Confirmed mutations ${item.key}`;
      confirm.style.maxWidth = '100%';
      confirm.style.height = 'auto';
      confirm.style.display = 'block';
      confirm.style.margin = '0 auto';
      target.appendChild(confirm);
    }

    if (item.extra) {
      const extra = document.createElement('img');
      extra.src = item.extra;
      extra.alt = `Additional panel ${item.key}`;
      extra.style.maxWidth = '100%';
      extra.style.height = 'auto';
      extra.style.display = 'block';
      extra.style.margin = '14px auto 0';
      target.appendChild(extra);
    }
  }

  function renderTimeCourse(key) {
    const target = document.getElementById('timeCoursePanel');
    const title = document.getElementById('timeCourseTitle');
    const item = timeCourseData.find((entry) => entry.key === key);
    if (!item || !target || !title) return;

    title.textContent = `Time Course ${item.key}`;
    target.innerHTML = '';

    item.images.forEach((src, index) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `Time course ${item.key} panel ${index + 1}`;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      img.style.margin = '0 auto 12px';
      target.appendChild(img);
    });
  }

  const updatesSelect = document.getElementById('updatesSelect');
  const timeCourseSelect = document.getElementById('timeCourseSelect');

  if (updatesSelect) {
    updatesData.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.key;
      updatesSelect.appendChild(option);
    });

    updatesSelect.value = updatesData[0].key;
    renderUpdates(updatesSelect.value);
    updatesSelect.addEventListener('change', (event) => renderUpdates(event.target.value));
  }

  if (timeCourseSelect) {
    timeCourseData.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.key;
      timeCourseSelect.appendChild(option);
    });

    timeCourseSelect.value = timeCourseData[0].key;
    renderTimeCourse(timeCourseSelect.value);
    timeCourseSelect.addEventListener('change', (event) => renderTimeCourse(event.target.value));
  }
}

function initPageWidgets() {
  const pageKind = document.body.dataset.pageKind;
  const pageKey = document.body.dataset.pageKey;

  if (pageKind === 'variant') {
    renderVariantWidget(pageKey);
  } else if (pageKind === 'component' && pageKey !== 'rna') {
    renderComponentWidget(pageKey);
  } else if (pageKind === 'evolution') {
    renderEvolutionWidget(pageKey);
  }
}
