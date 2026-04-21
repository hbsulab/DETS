const DETS_TEXT_CACHE = new Map();
let DETS_PDFJS_PROMISE = null;

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
  initBackToTopButton();
  const resourcePrefix = getResourcePrefix();
  Promise.all([
    loadComponent('#header-placeholder', `${resourcePrefix}components/header.html`),
    loadComponent('#navigator-placeholder', `${resourcePrefix}components/navigator.html`),
    loadComponent('#footer-placeholder', `${resourcePrefix}components/footer.html`)
  ]).then(() => {
    initDropdowns();
    initPageWidgets();
    initReferenceLinks();
    initPdfCanvasRenders();
  });
});

function initReferenceLinks() {
  const headings = Array.from(document.querySelectorAll('h2, h3, h4, h5'));
  const referenceHeadings = headings.filter((heading) => /reference/i.test(heading.textContent || ''));
  const processedScopes = new Set();

  referenceHeadings.forEach((heading) => {
    const scope = heading.parentElement;
    if (!scope || processedScopes.has(scope)) {
      return;
    }
    processedScopes.add(scope);

    scope.querySelectorAll('li').forEach((item) => {
      if (item.querySelector('a')) {
        return;
      }

      const text = (item.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        return;
      }

      const doiMatch = text.match(/\b10\.\d{4,9}\/[\w.()\-;:+/]+/i);
      if (!doiMatch) {
        return;
      }

      const doi = doiMatch[0].replace(/[.,;:]$/, '');

      const link = document.createElement('a');
      link.href = `https://doi.org/${encodeURIComponent(doi)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'reference-auto-link';
      link.textContent = 'DOI';

      item.appendChild(document.createTextNode(' '));
      item.appendChild(link);
    });
  });
}

function loadPdfJsLibrary() {
  if (window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib);
  }
  if (DETS_PDFJS_PROMISE) {
    return DETS_PDFJS_PROMISE;
  }

  DETS_PDFJS_PROMISE = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error('pdfjsLib failed to initialize'));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load pdf.js script'));
    document.head.appendChild(script);
  });

  return DETS_PDFJS_PROMISE;
}

async function renderPdfIntoHost(pdfjsLib, host) {
  const src = host.getAttribute('data-pdf-src');
  if (!src) return;

  try {
    host.classList.add('pdf-render-loading');
    const loadingTask = pdfjsLib.getDocument({ url: src });
    const pdf = await loadingTask.promise;
    host.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const viewportAtOne = page.getViewport({ scale: 1 });
      const targetWidth = Math.max(320, host.clientWidth || viewportAtOne.width);
      const scale = targetWidth / viewportAtOne.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      const context = canvas.getContext('2d', { alpha: false });
      host.appendChild(canvas);

      await page.render({ canvasContext: context, viewport }).promise;
    }
  } catch (error) {
    console.error('PDF render failed:', error);
  } finally {
    host.classList.remove('pdf-render-loading');
  }
}

async function initPdfCanvasRenders() {
  const hosts = Array.from(document.querySelectorAll('[data-pdf-render][data-pdf-src]'));
  if (!hosts.length) return;

  try {
    const pdfjsLib = await loadPdfJsLibrary();
    await Promise.all(hosts.map((host) => renderPdfIntoHost(pdfjsLib, host)));
  } catch (error) {
    console.error('Unable to initialize PDF canvas rendering:', error);
  }
}

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
  const mutationKind = options.kind || 'protein';
  return mutations.map((mutation) => {
    const normalized = String(mutation || '').trim();

    if (clickable) {
      return `<button type="button" class="mutation-pill" aria-pressed="false" data-mutation-kind="${escapeHtml(mutationKind)}" data-mutation-token="${escapeHtml(normalized)}" title="Toggle ${escapeHtml(mutationKind)} filter ${escapeHtml(normalized)}">${escapeHtml(normalized)}</button>`;
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

const DETS_ARRAY_BUFFER_CACHE = new Map();
let DETS_XLSX_PROMISE = null;
let DETS_CORRECTED_WORKBOOK_PROMISE = null;

async function loadXlsxLibrary() {
  if (window.XLSX) {
    return window.XLSX;
  }

  if (DETS_XLSX_PROMISE) {
    return DETS_XLSX_PROMISE;
  }

  DETS_XLSX_PROMISE = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    script.onload = () => {
      if (!window.XLSX) {
        reject(new Error('XLSX failed to initialize'));
        return;
      }
      resolve(window.XLSX);
    };
    script.onerror = () => reject(new Error('Failed to load XLSX library'));
    document.head.appendChild(script);
  });

  return DETS_XLSX_PROMISE;
}

async function fetchArrayBufferCached(path) {
  if (DETS_ARRAY_BUFFER_CACHE.has(path)) {
    return DETS_ARRAY_BUFFER_CACHE.get(path);
  }

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  DETS_ARRAY_BUFFER_CACHE.set(path, arrayBuffer);
  return arrayBuffer;
}

function getVariantWorkbookClassFilters(pageKey) {
  const filterMap = {
    alpha: ['Alpha', 'B.1.1.7(Alpha)'],
    beta: ['Beta', 'B.1.351(Beta)'],
    delta: ['Delta', 'B.1.617.2(Delta)'],
    'omicron-ba2': ['BA.2'],
    'omicron-ba45': ['BA.4/5', 'BA.4&5', 'BA.4', 'BA.5'],
    jn1: ['JN.1'],
    kp2: ['KP.2']
  };

  return filterMap[pageKey] || [pageKey];
}

function normalizeMutationToken(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatWorkbookDate(row) {
  const year = Number(row.year);
  const month = Number(row.month);
  const day = Number(row.day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return '';
  }

  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return `${year}-${monthText}-${dayText}`;
}

function formatDateLabel(value) {
  if (!value) return 'All dates';
  return value;
}

const PDB_TITLE_BY_ID = {
  '7R15': 'Alpha variant SARS-CoV-2 spike with two erect RBDs',
  '7R14': 'Alpha variant SARS-CoV-2 spike with one erect RBD',
  '7R13': 'Alpha variant SARS-CoV-2 spike in closed conformation',
  '7R17': 'Beta variant SARS-CoV-2 spike with two erect RBDs',
  '7R16': 'Beta variant SARS-CoV-2 spike with one erect RBD',
  '7VX1': 'SARS-CoV-2 Beta variant spike protein in open state',
  '8HRI': 'SARS-CoV-2 Delta variant spike protein',
  '7VHH': 'Delta variant SARS-CoV-2 spike protein',
  '7W92': 'Open-state SARS-CoV-2 Delta variant spike protein',
  '7XIW': 'SARS-CoV-2 Omicron BA.2 variant spike (state 1)',
  '7XIX': 'SARS-CoV-2 Omicron BA.2 variant spike (state 2)',
  '7XO7': 'SARS-CoV-2 Omicron BA.2 spike trimer with ACE2 bound',
  '7XNQ': 'SARS-CoV-2 Omicron BA.4 variant spike',
  '8CIN': 'BA.4 spike glycoprotein in complex with BA.4/5-targeting Fab',
  '8XSJ': 'SARS-CoV-2 Omicron BA.4 RBD in ACE2/antibody complex context',
  '8X4H': 'SARS-CoV-2 JN.1 spike structure',
  '9D8I': 'JN.1 SARS-CoV-2 spike in 1-up conformation',
  '9D8H': 'JN.1 SARS-CoV-2 spike in 3-down conformation',
  '9D8L': 'KP.2 SARS-CoV-2 spike in 2-up conformation',
  '9D8K': 'KP.2 SARS-CoV-2 spike in 1-up conformation',
  '9D8J': 'KP.2 SARS-CoV-2 spike in 3-down conformation'
};

function getPdbOptionLabel(pdbId) {
  const key = String(pdbId || '').toUpperCase();
  const title = PDB_TITLE_BY_ID[key];
  return title ? `${key} - ${title}` : key;
}

async function loadCorrectedWorkbookRows() {
  if (DETS_CORRECTED_WORKBOOK_PROMISE) {
    return DETS_CORRECTED_WORKBOOK_PROMISE;
  }

  DETS_CORRECTED_WORKBOOK_PROMISE = (async () => {
    const XLSX = await loadXlsxLibrary();
    const workbookPath = getLocalResourcePath('assets/data/CorrectedData_AfterTimeCorrection.xlsx');
    const arrayBuffer = await fetchArrayBufferCached(workbookPath);
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const headers = (sheetRows.shift() || []).map((header) => String(header || '').trim());

    const rows = sheetRows.map((row, index) => ({
      rowNumber: index + 2,
      epiId: row[0] || '',
      sequence: row[1] || '',
      substitutionInfo: row[2] || '',
      substitutionNumber: row[3] || '',
      monthIndex: row[4] || '',
      classLabel: row[5] || '',
      allFreq: row[6] || '',
      monthlyFreq: row[7] || '',
      year: row[8] || '',
      month: row[9] || '',
      day: row[10] || ''
    }));

    return { headers, rows };
  })();

  return DETS_CORRECTED_WORKBOOK_PROMISE;
}

function mutationTokensFromSelection(selectedMutationMap) {
  return Array.from(selectedMutationMap.values()).flatMap((tokens) => Array.from(tokens));
}

function buildCsvFromRows(rows, selectionLabel) {
  const header = ['Selection', 'EPI_ID', 'Class', 'Date', 'Substitution Info', 'Substitution Number', 'MonthIndex', 'AllFreq', 'MonthlyFreq', 'Sequence'];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    lines.push([
      selectionLabel,
      row.epiId,
      row.classLabel,
      formatWorkbookDate(row),
      row.substitutionInfo,
      row.substitutionNumber,
      row.monthIndex,
      row.allFreq,
      row.monthlyFreq,
      row.sequence
    ].map(escapeCsv).join(','));
  });

  return lines.join('\n');
}

function buildSummaryCsv(pageKey, searchState, matchedRows) {
  const rows = [
    ['Field', 'Value'],
    ['Variant', searchState.variantTitle],
    ['Page Key', pageKey],
    ['Date From', formatDateLabel(searchState.dateFrom)],
    ['Date To', formatDateLabel(searchState.dateTo)],
    ['Mutation Match Mode', searchState.matchMode.toUpperCase()],
    ['Selected RNA Mutations', Array.from(searchState.selectedMutations.rna).join(' | ')],
    ['Selected Spike Mutations', Array.from(searchState.selectedMutations.protein).join(' | ')],
    ['Matched Sequences', String(matchedRows.length)]
  ];

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function buildPreviewTable(headers, row) {
  if (!row) {
    return '<p class="sequence-note">No matching rows to preview.</p>';
  }

  const entries = headers.map((header, index) => {
    let value = '';
    switch (index) {
      case 0: value = row.epiId; break;
      case 1: value = row.sequence; break;
      case 2: value = row.substitutionInfo; break;
      case 3: value = row.substitutionNumber; break;
      case 4: value = row.monthIndex; break;
      case 5: value = row.classLabel; break;
      case 6: value = row.allFreq; break;
      case 7: value = row.monthlyFreq; break;
      case 8: value = row.year; break;
      case 9: value = row.month; break;
      case 10: value = row.day; break;
      default: value = '';
    }

    if (index === 1 && String(value).length > 140) {
      value = `${String(value).slice(0, 137)}...`;
    }

    return `<tr><th>${escapeHtml(header)}</th><td>${escapeHtml(value)}</td></tr>`;
  }).join('');

  return `
    <div class="data-table-wrapper">
      <h3>Preview Entry</h3>
      <table class="data-table">
        <tbody>
          ${entries}
        </tbody>
      </table>
    </div>
  `;
}

function buildSequencePreview(sequence) {
  const formatted = String(sequence || '').match(/.{1,80}/g) || [String(sequence || '')];
  return formatted.join('\n');
}

function rowMatchesMutationSelection(row, selectedMutationMap, matchMode) {
  const selectedTokens = mutationTokensFromSelection(selectedMutationMap);
  if (!selectedTokens.length) {
    return true;
  }

  const haystack = `${row.substitutionInfo} ${row.sequence} ${row.classLabel}`.toLowerCase();
  if (matchMode === 'all') {
    return selectedTokens.every((token) => haystack.includes(token.toLowerCase()));
  }

  return selectedTokens.some((token) => haystack.includes(token.toLowerCase()));
}

function rowMatchesDateRange(row, dateFrom, dateTo) {
  const rowDate = formatWorkbookDate(row);
  if (!rowDate) {
    return false;
  }

  if (dateFrom && rowDate < dateFrom) {
    return false;
  }
  if (dateTo && rowDate > dateTo) {
    return false;
  }
  return true;
}

function getWorkbookDateBounds(rows) {
  const dates = rows.map((row) => formatWorkbookDate(row)).filter(Boolean).sort();
  if (!dates.length) {
    return { min: '', max: '' };
  }

  return {
    min: dates[0],
    max: dates[dates.length - 1]
  };
}

function buildSelectedPills(mutations, kind, selectedMutationMap) {
  return buildMutationPills(mutations, { clickable: true, kind });
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

function normalizeSectionHeading(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSectionHeading(section) {
  if (!section) return '';
  const heading = section.querySelector('h2, h3, h4');
  return normalizeSectionHeading(heading ? heading.textContent : '');
}

function findSectionByHeading(container, matchers) {
  const tests = Array.isArray(matchers) ? matchers : [matchers];
  const contentBlocks = Array.from(container.children).filter((node) =>
    node && node.nodeType === Node.ELEMENT_NODE && (
      node.classList.contains('text-block') ||
      node.classList.contains('visualization-block') ||
      node.classList.contains('data-table-wrapper') ||
      node.classList.contains('footnote-block') ||
      node.classList.contains('feature-panel')
    )
  );

  return contentBlocks.find((block) => {
    const heading = getSectionHeading(block);
    return tests.some((test) => {
      if (typeof test === 'string') {
        return heading === normalizeSectionHeading(test);
      }
      return typeof test === 'function' ? test(heading) : false;
    });
  }) || null;
}

function appendProfileSupplement(profileSection, title, sourceSection) {
  if (!profileSection || !sourceSection) return;

  const segments = [];
  sourceSection.querySelectorAll('p, li').forEach((node) => {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) {
      segments.push(text);
    }
  });

  if (!segments.length) {
    const fallback = (sourceSection.textContent || '').replace(/\s+/g, ' ').trim();
    if (fallback) {
      segments.push(fallback);
    }
  }

  if (!segments.length) return;

  const supplement = document.createElement('p');
  supplement.innerHTML = `<strong>${escapeHtml(title)}:</strong> ${escapeHtml(segments.join(' '))}`;
  profileSection.appendChild(supplement);
}

function applyVariantPageLayout(container) {
  if (!container) return;
  const pageKey = document.body ? document.body.dataset.pageKey : '';

  const referenceSection = findSectionByHeading(container, 'Reference sequence, defining RNA, and spike mutations');
  const cladeSection = findSectionByHeading(container, 'Clade Relationship Overview');
  const omicronFiguresSection = container.querySelector('.omicron-evolution-figures');
  const interactiveSection = findSectionByHeading(container, 'Interactive spike structure and sequence by PDB ID');
  const profileSection = findSectionByHeading(container, ['Variant Introduction', 'Variant Profile']);
  const definingSection = findSectionByHeading(container, 'Defining Mutations');
  const sequenceSection = findSectionByHeading(container, [(heading) => heading.startsWith('sequence examples')]);
  const spikeSection = findSectionByHeading(container, 'Spike Structure');
  const phenotypicSection = findSectionByHeading(container, [
    'Phenotypic and Epidemiological Profile',
    'JN.1 Scientific Summary',
    'KP.2 Scientific Profile'
  ]);
  const referencesSection = findSectionByHeading(container, 'References');

  const variantIdentitySection = findSectionByHeading(container, 'Variant Identity and Lineage Context');
  const comparativeSummarySection = findSectionByHeading(container, 'Comparative Summary');

  if (profileSection) {
    const profileHeading = profileSection.querySelector('h2');
    if (profileHeading) {
      profileHeading.textContent = 'Variant Profile';
    }
    appendProfileSupplement(profileSection, 'Variant identity and lineage context', variantIdentitySection);
    appendProfileSupplement(profileSection, 'Comparative summary', comparativeSummarySection);
  }

  if (phenotypicSection) {
    const phenotypicHeading = phenotypicSection.querySelector('h2, h3, h4');
    if (phenotypicHeading) {
      phenotypicHeading.textContent = 'Phenotypic and Epidemiological Profile';
    }
  }

  if (definingSection) {
    const definingHeading = definingSection.querySelector('h2, h3, h4');
    if (definingHeading) {
      definingHeading.textContent = 'Important Mutations';
    }
  }

  if (sequenceSection) {
    const sequenceHeading = sequenceSection.querySelector('h2, h3, h4');
    if (sequenceHeading) {
      sequenceHeading.textContent = 'Spike Sequences';
    }
  }

  if (spikeSection) {
    const spikeHeading = spikeSection.querySelector('h2, h3, h4');
    if (spikeHeading) {
      spikeHeading.textContent = 'Spike Structures';
    }
  }

  const removeHeadings = new Set([
    'phylogenetic subtree from wuhan',
    'growth and spread timeline',
    'interactive wuhan vs variant sequence compare',
    'variant identity and lineage context',
    'comparative summary',
    'signature mutation set',
    'background',
    'jn.1 mutations',
    'kp.2 mutations',
    'featured mutation: l455s',
    'featured mutations: l455s, f456l',
    'main mutations',
    'l445',
    'l445s',
    'ba.2.86',
    'kp.2 rbd',
    'kp.2 ctd&s2',
    'evolution of omicron subvariants',
    'phylogenetic tree overview'
  ]);

  const legacyHeadingMap = {
    jn1: new Set([
      'background',
      'jn.1 mutations',
      'featured mutation: l455s',
      'l445',
      'l445s',
      'main mutations',
      'ba.2.86'
    ]),
    kp2: new Set([
      'background',
      'evolution of omicron subvariants',
      'kp.2 mutations',
      '2024.03 outlined',
      'featured mutations: l455s, f456l',
      'kp.2 spike conformation',
      'main mutations',
      'kp.2 rbd',
      'kp.2 ctd&s2'
    ])
  };
  const legacyHeadingSet = legacyHeadingMap[pageKey] || null;
  const legacySections = [];
  let legacyNarrativeCaptured = false;

  Array.from(container.children).forEach((child) => {
    if (!child || child.nodeType !== Node.ELEMENT_NODE) return;
    const heading = getSectionHeading(child);

    if (legacyHeadingSet && heading && legacyHeadingSet.has(heading)) {
      legacySections.push(child);
      return;
    }

    if (
      pageKey === 'jn1' &&
      !heading &&
      child.classList.contains('text-block') &&
      !legacyNarrativeCaptured &&
      (child.textContent || '').includes('The L455S mutation occurs within the receptor-binding domain')
    ) {
      legacyNarrativeCaptured = true;
      legacySections.push(child);
      return;
    }

    if (removeHeadings.has(heading)) {
      child.remove();
    }
  });

  let profileMutationRow = container.querySelector('.variant-pair-row-profile-mutations');
  if (!profileMutationRow && profileSection && definingSection) {
    profileMutationRow = document.createElement('div');
    profileMutationRow.className = 'variant-pair-row variant-pair-row-profile-mutations';
    profileMutationRow.appendChild(profileSection);
    profileMutationRow.appendChild(definingSection);
  }

  let sequenceStructureRow = container.querySelector('.variant-pair-row-sequences-structures');
  if (!sequenceStructureRow && sequenceSection && spikeSection) {
    sequenceStructureRow = document.createElement('div');
    sequenceStructureRow.className = 'variant-pair-row variant-pair-row-sequences-structures';
    sequenceStructureRow.appendChild(sequenceSection);
    sequenceStructureRow.appendChild(spikeSection);
  }

  const pageHeader = container.querySelector('.page-header');
  const orderedSections = [
    referenceSection,
    cladeSection,
    omicronFiguresSection,
    interactiveSection,
    profileMutationRow,
    sequenceStructureRow,
    phenotypicSection,
    ...legacySections
  ].filter(Boolean);

  if (referencesSection) {
    orderedSections.forEach((section) => container.insertBefore(section, referencesSection));
    container.appendChild(referencesSection);
  } else {
    orderedSections.forEach((section) => container.appendChild(section));
  }

  const keepNodes = new Set([pageHeader, referencesSection, ...orderedSections].filter(Boolean));
  Array.from(container.children).forEach((child) => {
    if (!child || child.nodeType !== Node.ELEMENT_NODE) return;
    if (keepNodes.has(child)) return;
    if (
      child.classList.contains('text-block') ||
      child.classList.contains('visualization-block') ||
      child.classList.contains('data-table-wrapper') ||
      child.classList.contains('footnote-block') ||
      child.classList.contains('feature-panel')
    ) {
      child.remove();
    }
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
    const targetClassRow = findVariantClassRow(classRows, data);
    const inferredPath = buildVariantPathFromClassRows(classRows, targetClassRow);
    const treeNodes = Array.isArray(data.path) && data.path.length >= 2 ? data.path : (inferredPath.length >= 2 ? inferredPath : ['Wuhan', data.title]);
    const rnaMutationMap = parseVariantRnaTable(variantRnaText);
    const effectiveRnaMutations = pickVariantRnaMutations(rnaMutationMap, data);

    const genomeRecord = parseFasta(fastaText)[0];
    if (!genomeRecord) return;

    const spikeRna = extractSpikeRnaFromGenome(genomeRecord.sequence);
    const referenceProtein = translateRnaSequence(spikeRna);
    const container = document.querySelector('#main_container .container');
    if (!container) return;

    const workbookClassFilters = getVariantWorkbookClassFilters(pageKey).map((value) => String(value || '').toLowerCase());
    const mutationSelection = {
      protein: new Set(),
      rna: new Set()
    };
    let currentSearchResults = [];
    let currentSearchHeaders = [];

    const seqSection = document.createElement('div');
    seqSection.className = 'text-block';
    seqSection.innerHTML = `
      <h2>Reference sequence, defining RNA, and spike mutations</h2>
      <!-- Reference, variant catalogs, and workbook lineage label are intentionally hidden for now. -->
      <div class="comparison-grid">
        <div class="comparison-card">
          <h4>Defining RNA mutations</h4>
          <div class="mutations-list" data-mutation-group="rna">${buildMutationPills(effectiveRnaMutations, { clickable: true, kind: 'rna' })}</div>
        </div>
        <div class="comparison-card">
          <h4>Defining spike mutations</h4>
          <div class="mutations-list" data-mutation-group="protein">${buildMutationPills(data.proteinMutations, { clickable: true, kind: 'protein' })}</div>
        </div>
      </div>
      <div class="download-toolbar">
        <div>
          <label for="dateFrom-${pageKey}">Date from</label>
          <input id="dateFrom-${pageKey}" type="date" lang="en" data-date-locale="en">
        </div>
        <div>
          <label for="dateTo-${pageKey}">Date to</label>
          <input id="dateTo-${pageKey}" type="date" lang="en" data-date-locale="en">
        </div>
        <div>
          <label for="mutationMatch-${pageKey}">Mutation match</label>
          <select id="mutationMatch-${pageKey}">
            <option value="any">ANY selected mutation</option>
            <option value="all">ALL selected mutations</option>
          </select>
        </div>
      </div>
      <div class="button-row">
        <button type="button" id="searchButton-${pageKey}">Search</button>
      </div>
      <p class="sequence-note">Choose a date range, toggle defining RNA/spike mutations, then press Search to preview the first matching Alpha-class sequence from CorrectedData_AfterTimeCorrection.xlsx.</p>
    `;

    const resultsSection = document.createElement('div');
    resultsSection.className = 'visualization-block';
    resultsSection.hidden = true;
    resultsSection.innerHTML = `
      <h3>Search Results</h3>
      <p class="sequence-note" id="searchSummary-${pageKey}"></p>
      <div id="previewTable-${pageKey}"></div>
      <div class="feature-panel">
        <h4>Sequence Preview</h4>
        <pre class="sequence-viewer" id="sequencePreview-${pageKey}" style="white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; text-align: left; width: 100%; max-width: 820px; margin: 0 auto;">Press Search to preview a sequence.</pre>
      </div>
      <div class="button-row">
        <button type="button" data-download="summary" disabled>Download mutation summary</button>
        <button type="button" data-download="fasta" disabled>Download synthetic spike FASTA</button>
        <button type="button" data-download="selected-rna" disabled>Download selected spike RNA (CSV)</button>
        <button type="button" data-download="selected-protein" disabled>Download selected spike protein (CSV)</button>
        <button type="button" data-download="reference-rna" disabled>Download Wuhan spike RNA FASTA</button>
        <button type="button" data-download="reference-protein" disabled>Download Wuhan spike protein FASTA</button>
      </div>
    `;

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
              ${data.pdbIds.map((pdbId) => `<option value="${escapeHtml(pdbId)}">${escapeHtml(getPdbOptionLabel(pdbId))}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="structure-frame structure-frame-fullscreen-default">
          <iframe id="variant-structure-iframe-${pageKey}" src="" title="RCSB 3D Protein Feature View for ${escapeHtml(data.title)}" allowfullscreen></iframe>
        </div>
        <p class="sequence-note">The embedded RCSB 3D Protein Feature View provides sequence, residue clicking, and linked 3D structure highlighting. Open the <a id="variant-structure-link-${pageKey}" href="#" target="_blank" rel="noopener noreferrer">full-page RCSB view</a> if you want more space.</p>
      </div>
    `;

    const introBlock = container.querySelector('.text-block');
    const insertionAnchor = introBlock ? introBlock.nextElementSibling : container.firstElementChild;
    if (insertionAnchor) {
      container.insertBefore(treeSection, insertionAnchor);
      container.insertBefore(structureSection, insertionAnchor);
      container.insertBefore(seqSection, insertionAnchor);
      container.insertBefore(resultsSection, insertionAnchor);
    } else {
      container.appendChild(treeSection);
      container.appendChild(structureSection);
      container.appendChild(seqSection);
      container.appendChild(resultsSection);
    }

    const pdbSelect = structureSection.querySelector(`#pdbSelect-${pageKey}`);
    const variantFrame = structureSection.querySelector(`#variant-structure-iframe-${pageKey}`);
    const variantLink = structureSection.querySelector(`#variant-structure-link-${pageKey}`);
    const loadVariantStructure = (pdbId) => {
      const fullUrl = `https://www.rcsb.org/3d-sequence/${encodeURIComponent(pdbId)}?assemblyId=1`;
      if (variantFrame) {
        variantFrame.src = fullUrl;
      }
      if (variantLink) {
        variantLink.href = fullUrl;
      }
    };

    if (pdbSelect && pdbSelect.value) {
      loadVariantStructure(pdbSelect.value);
      pdbSelect.addEventListener('change', () => loadVariantStructure(pdbSelect.value));
    }

    const dateFromInput = seqSection.querySelector(`#dateFrom-${pageKey}`);
    const dateToInput = seqSection.querySelector(`#dateTo-${pageKey}`);
    const mutationMatchSelect = seqSection.querySelector(`#mutationMatch-${pageKey}`);
    const searchButton = seqSection.querySelector(`#searchButton-${pageKey}`);
    const summaryNote = resultsSection.querySelector(`#searchSummary-${pageKey}`);
    const previewTableHost = resultsSection.querySelector(`#previewTable-${pageKey}`);
    const sequencePreview = resultsSection.querySelector(`#sequencePreview-${pageKey}`);
    const downloadButtons = Array.from(resultsSection.querySelectorAll('[data-download]'));

    loadCorrectedWorkbookRows().then((workbookData) => {
      const bounds = getWorkbookDateBounds(workbookData.rows);
      if (dateFromInput) {
        dateFromInput.min = bounds.min;
        dateFromInput.max = bounds.max;
        if (!dateFromInput.value) {
          dateFromInput.value = bounds.min;
        }
      }
      if (dateToInput) {
        dateToInput.min = bounds.min;
        dateToInput.max = bounds.max;
        if (!dateToInput.value) {
          dateToInput.value = bounds.max;
        }
      }
    }).catch(() => {});

    const updatePillState = () => {
      seqSection.querySelectorAll('[data-mutation-token]').forEach((pill) => {
        const kind = pill.dataset.mutationKind || 'protein';
        const token = normalizeMutationToken(pill.dataset.mutationToken);
        const selectedSet = mutationSelection[kind];
        const isActive = selectedSet.has(token);
        pill.classList.toggle('is-active', isActive);
        pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    };

    seqSection.addEventListener('click', (event) => {
      const pill = event.target.closest('[data-mutation-token]');
      if (!pill) {
        return;
      }

      const kind = pill.dataset.mutationKind || 'protein';
      const token = normalizeMutationToken(pill.dataset.mutationToken);
      const selectedSet = mutationSelection[kind];
      if (selectedSet.has(token)) {
        selectedSet.delete(token);
      } else {
        selectedSet.add(token);
      }
      updatePillState();
    });

    const setDownloadButtonsEnabled = (enabled) => {
      downloadButtons.forEach((button) => {
        button.disabled = !enabled;
      });
    };

    const renderSearchResults = (rows) => {
      resultsSection.hidden = false;
      if (!rows.length) {
        summaryNote.textContent = 'No matching sequences found for the current filters.';
        previewTableHost.innerHTML = '<p class="sequence-note">No preview available.</p>';
        sequencePreview.textContent = 'No sequence available.';
        setDownloadButtonsEnabled(false);
        return;
      }

      const firstRow = rows[0];
      summaryNote.textContent = `${rows.length} matching sequences found. Previewing the first matching entry.`;
      previewTableHost.innerHTML = buildPreviewTable(currentSearchHeaders, firstRow);
      sequencePreview.textContent = buildSequencePreview(firstRow.sequence);
      setDownloadButtonsEnabled(true);
    };

    const runSearch = async () => {
      if (searchButton) {
        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
      }

      try {
        const workbookData = await loadCorrectedWorkbookRows();
        currentSearchHeaders = workbookData.headers;

        const dateFrom = dateFromInput ? dateFromInput.value : '';
        const dateTo = dateToInput ? dateToInput.value : '';
        const matchMode = mutationMatchSelect ? mutationMatchSelect.value : 'any';

        currentSearchResults = workbookData.rows.filter((row) => {
          const classLabel = String(row.classLabel || '').toLowerCase();
          const classMatch = workbookClassFilters.some((token) => classLabel.includes(token));
          if (!classMatch) {
            return false;
          }

          if (!rowMatchesDateRange(row, dateFrom, dateTo)) {
            return false;
          }

          return rowMatchesMutationSelection(row, mutationSelection, matchMode);
        });

        renderSearchResults(currentSearchResults);
      } catch (error) {
        resultsSection.hidden = false;
        summaryNote.textContent = `Unable to load the workbook: ${error.message}`;
        previewTableHost.innerHTML = '<p class="sequence-note">Workbook search failed.</p>';
        sequencePreview.textContent = 'Workbook search failed.';
        setDownloadButtonsEnabled(false);
      } finally {
        if (searchButton) {
          searchButton.disabled = false;
          searchButton.textContent = 'Search';
        }
      }
    };

    if (searchButton) {
      searchButton.addEventListener('click', runSearch);
    }

    downloadButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!currentSearchResults.length && button.dataset.download !== 'reference-rna' && button.dataset.download !== 'reference-protein' && button.dataset.download !== 'fasta') {
          return;
        }

        if (button.dataset.download === 'summary') {
          const summaryCsv = buildSummaryCsv(pageKey, {
            variantTitle: data.title,
            dateFrom: dateFromInput ? dateFromInput.value : '',
            dateTo: dateToInput ? dateToInput.value : '',
            matchMode: mutationMatchSelect ? mutationMatchSelect.value : 'any',
            selectedMutations: mutationSelection
          }, currentSearchResults);
          downloadText(`${pageKey}-mutation-summary.csv`, summaryCsv, 'text/csv;charset=utf-8');
          return;
        }

        if (button.dataset.download === 'fasta') {
          const selectedProteinTokens = mutationTokensFromSelection({ protein: mutationSelection.protein });
          const syntheticProtein = applyMutations(referenceProtein, selectedProteinTokens);
          downloadText(`${pageKey}-synthetic-spike.fasta`, `>${data.title} synthetic spike\n${syntheticProtein}\n`);
          return;
        }

        if (button.dataset.download === 'selected-rna') {
          const csv = buildCsvFromRows(currentSearchResults, 'RNA');
          downloadText(`${pageKey}-selected-spike-rna.csv`, csv, 'text/csv;charset=utf-8');
          return;
        }

        if (button.dataset.download === 'selected-protein') {
          const csv = buildCsvFromRows(currentSearchResults, 'Protein');
          downloadText(`${pageKey}-selected-spike-protein.csv`, csv, 'text/csv;charset=utf-8');
          return;
        }

        if (button.dataset.download === 'reference-rna') {
          downloadText(`${pageKey}-wuhan-spike-rna.fasta`, `>Wuhan-Hu-1 spike RNA\n${spikeRna}\n`);
          return;
        }

        if (button.dataset.download === 'reference-protein') {
          downloadText(`${pageKey}-wuhan-spike-protein.fasta`, `>Wuhan-Hu-1 spike protein\n${referenceProtein}\n`);
        }
      });
    });

    setDownloadButtonsEnabled(false);

    applyVariantPageLayout(container);
  });
}

function renderComponentWidget(pageKey) {
  const container = document.querySelector('#main_container .container');
  if (!container) return;

  if (pageKey === 'spike') {
    return;
  }

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
        <h3>Reference spike sequence (EPI_ISL_402123)</h3>
        <p>The page uses the Wuhan-Hu-1 spike coding region from EPI_ISL_402123 so users can inspect the reference sequence before comparing variants.</p>
        <div class="sequence-viewer">${escapeHtml(spikeProtein.match(/.{1,60}/g).join('\n'))}</div>
        <p class="sequence-note">This sequence is the Wuhan reference used throughout the spike pages and variant comparisons.</p>
      `;

      structureSection.className = 'visualization-block';
      structureSection.innerHTML = `
        <h3>Closed and open spike structures</h3>
        <div class="feature-panel">
          <p>Compare the closed prefusion trimer (6VXX) with the open prefusion trimer (6VYB). Both panels load the full RCSB Protein Feature View so the sequence and structure controls appear by default.</p>
          <div class="comparison-grid spike-structure-grid">
            <div class="comparison-card">
              <h4>Closed state: 6VXX</h4>
              <div class="structure-frame structure-frame-spike-compare">
                <iframe src="https://www.rcsb.org/3d-sequence/6VXX?assemblyId=1" title="RCSB 3D Protein Feature View for closed spike 6VXX" allowfullscreen></iframe>
              </div>
              <p class="sequence-note"><a href="https://www.rcsb.org/3d-sequence/6VXX?assemblyId=1" target="_blank" rel="noopener noreferrer">Open 6VXX in a new tab</a>.</p>
            </div>
            <div class="comparison-card">
              <h4>Open state: 6VYB</h4>
              <div class="structure-frame structure-frame-spike-compare">
                <iframe src="https://www.rcsb.org/3d-sequence/6VYB?assemblyId=1" title="RCSB 3D Protein Feature View for open spike 6VYB" allowfullscreen></iframe>
              </div>
              <p class="sequence-note"><a href="https://www.rcsb.org/3d-sequence/6VYB?assemblyId=1" target="_blank" rel="noopener noreferrer">Open 6VYB in a new tab</a>.</p>
            </div>
          </div>
          <p class="sequence-note">The full RCSB view keeps the controls panel visible and lets you inspect sequence-linked annotations directly in each structural state.</p>
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

function initCladeNavigationLinks() {
  const cladeObjects = Array.from(document.querySelectorAll('object[type="image/svg+xml"][data*="clades.svg"]'));
  if (!cladeObjects.length) {
    return;
  }
  const isTaxonomyPage = Boolean(document.querySelector('.subpage-grid .subpage-card[href]'));
  const isVariantPage = document.body && document.body.dataset.pageKind === 'variant';
  const shouldHighlightLinkedNodes = isTaxonomyPage || isVariantPage;

  const variantLinkMap = [
    { tokens: ['20i (alpha, b.1.1.7)'], href: 'pages/variants/alpha.html' },
    { tokens: ['20h (beta, b.1.351)'], href: 'pages/variants/beta.html' },
    { tokens: ['21a (delta, b.1.617.2)', '21i (delta)', '21j (delta)'], href: 'pages/variants/delta.html' },
    { tokens: ['21l (omicron, ba.2)'], href: 'pages/variants/omicron-ba2.html' },
    { tokens: ['22a (ba.4)', '22b (ba.5)'], href: 'pages/variants/omicron-ba45.html' },
    { tokens: ['24a (jn.1)'], href: 'pages/variants/jn1.html' },
    { tokens: ['24b (jn.1.11.1)', '24g (kp.2.3)'], href: 'pages/variants/kp2.html' }
  ];

  const resolveVariantHref = (labelText) => {
    const label = (labelText || '').toLowerCase();
    const match = variantLinkMap.find((entry) => entry.tokens.some((token) => label.includes(token)));
    if (!match) {
      return null;
    }
    return `${getResourcePrefix()}${match.href}`;
  };

  const bindObjectLinks = (cladeObject) => {
    const svgDoc = cladeObject.contentDocument;
    if (!svgDoc) {
      return;
    }

    const nodes = Array.from(svgDoc.querySelectorAll('g.node'));
    const toKey = (x, y) => `${Number(x).toString()},${Number(y).toString()}`;
    const parseTranslate = (transform) => {
      const match = /translate\(([^,]+),([^)]+)\)/.exec(transform || '');
      if (!match) {
        return null;
      }
      return toKey(match[1], match[2]);
    };
    const parsePathEndpoints = (d) => {
      const values = (d || '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
      if (!values || values.length < 4) {
        return null;
      }
      return {
        startKey: toKey(values[0], values[1]),
        endKey: toKey(values[values.length - 2], values[values.length - 1])
      };
    };

    const allPaths = isTaxonomyPage ? Array.from(svgDoc.querySelectorAll('path')) : [];
    const nodeMeta = new Map();
    const parentByNodeKey = new Map();

    if (isTaxonomyPage) {
      nodes.forEach((node) => {
        const key = parseTranslate(node.getAttribute('transform') || '');
        const textEl = node.querySelector('text');
        const circleEl = node.querySelector('circle');
        if (!key || !textEl || !circleEl) {
          return;
        }
        nodeMeta.set(key, { node, textEl, circleEl });
      });

      allPaths.forEach((path) => {
        const endpoints = parsePathEndpoints(path.getAttribute('d'));
        if (!endpoints || !nodeMeta.has(endpoints.startKey) || !nodeMeta.has(endpoints.endKey)) {
          return;
        }
        // In this SVG, each path starts at the child node and ends at its parent node.
        parentByNodeKey.set(endpoints.startKey, { parentKey: endpoints.endKey, path });
      });
    }

    const applyTaxonomyLinkedDefaults = () => {
      if (!shouldHighlightLinkedNodes) {
        return;
      }

      nodeMeta.forEach(({ textEl, circleEl }) => {
        textEl.style.opacity = '';
        textEl.style.fill = '';
        textEl.style.fontWeight = '';
        circleEl.style.opacity = '';
        circleEl.style.fillOpacity = '';
        circleEl.style.stroke = '';
        circleEl.style.strokeWidth = '';
        circleEl.style.filter = '';
      });

      allPaths.forEach((path) => {
        path.style.opacity = '';
        path.style.stroke = '';
        path.style.strokeWidth = '';
        path.style.filter = '';
      });

      Array.from(svgDoc.querySelectorAll('g.node[data-clade-linked="true"]')).forEach((node) => {
        const textEl = node.querySelector('text');
        const circleEl = node.querySelector('circle');
        if (textEl) {
          textEl.style.fill = '#0f6b8c';
          textEl.style.fontWeight = '800';
          textEl.style.opacity = '1';
        }
        if (circleEl) {
          circleEl.style.stroke = '#0f6b8c';
          circleEl.style.strokeWidth = '4px';
          circleEl.style.opacity = '1';
          circleEl.style.fillOpacity = '1';
          circleEl.style.filter = 'drop-shadow(0 0 5px rgba(15, 107, 140, 0.35))';
        }
      });
    };

    const highlightAncestorsForNode = (node) => {
      if (!isTaxonomyPage) {
        return;
      }

      applyTaxonomyLinkedDefaults();

      const focusKey = parseTranslate(node.getAttribute('transform') || '');
      if (!focusKey || !nodeMeta.has(focusKey)) {
        return;
      }

      const highlightedNodeKeys = new Set();
      const highlightedPaths = new Set();
      let currentKey = focusKey;
      while (currentKey) {
        highlightedNodeKeys.add(currentKey);
        const relation = parentByNodeKey.get(currentKey);
        if (!relation) {
          break;
        }
        highlightedPaths.add(relation.path);
        currentKey = relation.parentKey;
      }

      nodeMeta.forEach((entry, key) => {
        const isHighlighted = highlightedNodeKeys.has(key);
        if (isHighlighted) {
          entry.textEl.style.opacity = '1';
          entry.textEl.style.fill = '#1a2c3e';
          entry.textEl.style.fontWeight = '800';
          entry.circleEl.style.opacity = '1';
          entry.circleEl.style.fillOpacity = '1';
          entry.circleEl.style.stroke = '#d7263d';
          entry.circleEl.style.strokeWidth = '6px';
          entry.circleEl.style.filter = 'drop-shadow(0 0 6px rgba(215, 38, 61, 0.45))';
        } else {
          entry.textEl.style.opacity = '0.48';
          entry.textEl.style.fill = '#8aa0ad';
          entry.textEl.style.fontWeight = '700';
          entry.circleEl.style.opacity = '0.3';
          entry.circleEl.style.fillOpacity = '0.55';
          entry.circleEl.style.stroke = '#d6dde3';
          entry.circleEl.style.strokeWidth = '2px';
          entry.circleEl.style.filter = 'none';
        }
      });

      allPaths.forEach((path) => {
        const isHighlighted = highlightedPaths.has(path);
        if (isHighlighted) {
          path.style.opacity = '1';
          path.style.stroke = '#d7263d';
          path.style.strokeWidth = '6px';
          path.style.filter = 'drop-shadow(0 0 6px rgba(215, 38, 61, 0.25))';
        } else {
          path.style.opacity = '0.2';
          path.style.stroke = '#d5d5d5';
          path.style.strokeWidth = '3px';
          path.style.filter = 'none';
        }
      });
    };

    nodes.forEach((node) => {
      const textEl = node.querySelector('text');
      const circleEl = node.querySelector('circle');
      const href = resolveVariantHref(textEl ? textEl.textContent : '');
      if (!href) {
        return;
      }

      const navigate = (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = href;
      };

      [node, textEl, circleEl].forEach((element) => {
        if (!element) {
          return;
        }
        element.style.cursor = 'pointer';
        element.addEventListener('click', navigate);
      });

      if (textEl) {
        textEl.style.textDecoration = 'underline';
        textEl.style.textDecorationThickness = '2px';
        textEl.style.textUnderlineOffset = '3px';
      }

      node.dataset.cladeLinked = 'true';

      if (isTaxonomyPage) {
        if (!node.dataset.cladeHoverBound) {
          node.dataset.cladeHoverBound = 'true';
          node.addEventListener('mouseenter', () => highlightAncestorsForNode(node));
          node.addEventListener('focus', () => highlightAncestorsForNode(node));
          node.addEventListener('mouseleave', () => applyTaxonomyLinkedDefaults());
          node.addEventListener('blur', () => applyTaxonomyLinkedDefaults());
        }
      }

      node.setAttribute('tabindex', '0');
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          navigate(event);
        }
      });
    });

    applyTaxonomyLinkedDefaults();
  };

  cladeObjects.forEach((cladeObject) => {
    bindObjectLinks(cladeObject);
    cladeObject.addEventListener('load', () => bindObjectLinks(cladeObject));
  });
}

function initTaxonomyCladeHoverHighlight() {
  const cladeObject = document.querySelector('object[type="image/svg+xml"][data*="clades.svg"]');
  const cards = Array.from(document.querySelectorAll('.subpage-grid .subpage-card[href]'));
  if (!cladeObject || !cards.length) {
    return;
  }

  const focusTokensByPage = {
    alpha: ['20i (alpha, b.1.1.7)'],
    beta: ['20h (beta, b.1.351)'],
    delta: ['21a (delta, b.1.617.2)'],
    'omicron-ba2': ['21l (omicron, ba.2)'],
    'omicron-ba45': ['22a (ba.4)', '22b (ba.5)'],
    jn1: ['24a (jn.1)'],
    kp2: ['24b (jn.1.11.1)', '24g (kp.2.3)']
  };

  const pageKeyByHref = {
    'alpha.html': 'alpha',
    'beta.html': 'beta',
    'delta.html': 'delta',
    'omicron-ba2.html': 'omicron-ba2',
    'omicron-ba45.html': 'omicron-ba45',
    'jn1.html': 'jn1',
    'kp2.html': 'kp2'
  };

  const toKey = (x, y) => `${Number(x).toString()},${Number(y).toString()}`;

  const parseTranslate = (transform) => {
    const match = /translate\(([^,]+),([^)]+)\)/.exec(transform || '');
    if (!match) {
      return null;
    }
    return toKey(match[1], match[2]);
  };

  const parsePathEndpoints = (d) => {
    const values = (d || '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if (!values || values.length < 4) {
      return null;
    }
    return {
      startKey: toKey(values[0], values[1]),
      endKey: toKey(values[values.length - 2], values[values.length - 1])
    };
  };

  const applyLinkedNodeHighlight = (svgDoc) => {
    if (!svgDoc) {
      return;
    }

    Array.from(svgDoc.querySelectorAll('g.node[data-clade-linked="true"]')).forEach((node) => {
      const textEl = node.querySelector('text');
      const circleEl = node.querySelector('circle');
      if (textEl) {
        textEl.style.fill = '#0f6b8c';
        textEl.style.fontWeight = '800';
        textEl.style.opacity = '1';
      }
      if (circleEl) {
        circleEl.style.stroke = '#0f6b8c';
        circleEl.style.strokeWidth = '4px';
        circleEl.style.opacity = '1';
        circleEl.style.fillOpacity = '1';
        circleEl.style.filter = 'drop-shadow(0 0 5px rgba(15, 107, 140, 0.35))';
      }
    });
  };

  const clearHighlight = (svgDoc) => {
    if (!svgDoc) {
      return;
    }

    Array.from(svgDoc.querySelectorAll('g.node')).forEach((node) => {
      const textEl = node.querySelector('text');
      const circleEl = node.querySelector('circle');
      if (textEl) {
        textEl.style.opacity = '';
        textEl.style.fill = '';
        textEl.style.fontWeight = '';
      }
      if (circleEl) {
        circleEl.style.opacity = '';
        circleEl.style.fillOpacity = '';
        circleEl.style.stroke = '';
        circleEl.style.strokeWidth = '';
        circleEl.style.filter = '';
      }
    });

    Array.from(svgDoc.querySelectorAll('path')).forEach((path) => {
      path.style.opacity = '';
      path.style.stroke = '';
      path.style.strokeWidth = '';
      path.style.filter = '';
    });

    applyLinkedNodeHighlight(svgDoc);
  };

  const applyHighlightForPage = (pageKey) => {
    const svgDoc = cladeObject.contentDocument;
    if (!svgDoc) {
      return;
    }

    const focusTokens = (focusTokensByPage[pageKey] || []).map((token) => token.toLowerCase());
    if (!focusTokens.length) {
      clearHighlight(svgDoc);
      return;
    }

    const nodes = Array.from(svgDoc.querySelectorAll('g.node'));
    const paths = Array.from(svgDoc.querySelectorAll('path'));
    const nodeMeta = new Map();
    const parentByNodeKey = new Map();
    const highlightedNodeKeys = new Set();
    const highlightedPaths = new Set();

    nodes.forEach((node) => {
      const key = parseTranslate(node.getAttribute('transform') || '');
      const textEl = node.querySelector('text');
      const circleEl = node.querySelector('circle');
      if (!key || !textEl || !circleEl) {
        return;
      }

      nodeMeta.set(key, {
        node,
        textEl,
        circleEl,
        label: (textEl.textContent || '').toLowerCase()
      });
    });

    paths.forEach((path) => {
      const endpoints = parsePathEndpoints(path.getAttribute('d'));
      if (!endpoints || !nodeMeta.has(endpoints.startKey) || !nodeMeta.has(endpoints.endKey)) {
        return;
      }

      // In this SVG, each path starts at the child node and ends at its parent node.
      parentByNodeKey.set(endpoints.startKey, { parentKey: endpoints.endKey, path });
    });

    const focusKeys = Array.from(nodeMeta.entries())
      .filter(([, entry]) => focusTokens.some((token) => entry.label.includes(token)))
      .map(([key]) => key);

    focusKeys.forEach((focusKey) => {
      let currentKey = focusKey;
      while (currentKey) {
        highlightedNodeKeys.add(currentKey);
        const relation = parentByNodeKey.get(currentKey);
        if (!relation) {
          break;
        }
        highlightedPaths.add(relation.path);
        currentKey = relation.parentKey;
      }
    });

    nodeMeta.forEach((entry, key) => {
      const isHighlighted = highlightedNodeKeys.has(key);
      if (isHighlighted) {
        entry.textEl.style.opacity = '1';
        entry.textEl.style.fill = '#1a2c3e';
        entry.textEl.style.fontWeight = '800';
        entry.circleEl.style.opacity = '1';
        entry.circleEl.style.fillOpacity = '1';
        entry.circleEl.style.stroke = '#d7263d';
        entry.circleEl.style.strokeWidth = '6px';
        entry.circleEl.style.filter = 'drop-shadow(0 0 6px rgba(215, 38, 61, 0.45))';
      } else {
        entry.textEl.style.opacity = '0.48';
        entry.textEl.style.fill = '#8aa0ad';
        entry.textEl.style.fontWeight = '700';
        entry.circleEl.style.opacity = '0.3';
        entry.circleEl.style.fillOpacity = '0.55';
        entry.circleEl.style.stroke = '#d6dde3';
        entry.circleEl.style.strokeWidth = '2px';
        entry.circleEl.style.filter = 'none';
      }
    });

    paths.forEach((path) => {
      const isHighlighted = highlightedPaths.has(path);
      if (isHighlighted) {
        path.style.opacity = '1';
        path.style.stroke = '#d7263d';
        path.style.strokeWidth = '6px';
        path.style.filter = 'drop-shadow(0 0 6px rgba(215, 38, 61, 0.25))';
      } else {
        path.style.opacity = '0.2';
        path.style.stroke = '#d5d5d5';
        path.style.strokeWidth = '3px';
        path.style.filter = 'none';
      }
    });
  };

  const getPageKeyFromHref = (href) => {
    const fileName = (href || '').split('/').pop();
    return pageKeyByHref[fileName] || null;
  };

  cards.forEach((card) => {
    const pageKey = getPageKeyFromHref(card.getAttribute('href'));
    if (!pageKey) {
      return;
    }

    const highlight = () => applyHighlightForPage(pageKey);
    const clear = () => {
      const svgDoc = cladeObject.contentDocument;
      clearHighlight(svgDoc);
    };

    card.addEventListener('mouseenter', highlight);
    card.addEventListener('focus', highlight);
    card.addEventListener('mouseleave', clear);
    card.addEventListener('blur', clear);
  });

  cladeObject.addEventListener('load', () => {
    const hoveredCard = document.querySelector('.subpage-grid .subpage-card[href]:hover');
    if (!hoveredCard) {
      clearHighlight(cladeObject.contentDocument);
      return;
    }

    const pageKey = getPageKeyFromHref(hoveredCard.getAttribute('href'));
    if (pageKey) {
      applyHighlightForPage(pageKey);
    }
  });

  clearHighlight(cladeObject.contentDocument);
}

function initPageWidgets() {
  initCladeNavigationLinks();
  initTaxonomyCladeHoverHighlight();

  const pageKind = document.body.dataset.pageKind;
  const pageKey = document.body.dataset.pageKey;

  if (pageKind === 'variant') {
    renderVariantWidget(pageKey);
    initVariantCladeFigureHighlight(pageKey);
  } else if (pageKind === 'component' && pageKey !== 'rna') {
    renderComponentWidget(pageKey);
  } else if (pageKind === 'evolution') {
    renderEvolutionWidget(pageKey);
  }
}

function initVariantCladeFigureHighlight(pageKey) {
  const cladeObject = document.getElementById('clades-tree-object');
  if (!cladeObject) {
    return;
  }

  const cladePathConfigByPage = {
    alpha: {
      focusTokens: ['20i (alpha, b.1.1.7)']
    },
    beta: {
      focusTokens: ['20h (beta, b.1.351)']
    },
    delta: {
      focusTokens: ['21a (delta, b.1.617.2)']
    },
    'omicron-ba2': {
      focusTokens: ['21l (omicron, ba.2)']
    },
    'omicron-ba45': {
      focusTokens: ['22a (ba.4)', '22b (ba.5)']
    },
    jn1: {
      focusTokens: ['24a (jn.1)']
    },
    kp2: {
      focusTokens: ['24b (jn.1.11.1)', '24g (kp.2.3)']
    }
  };

  const pageConfig = cladePathConfigByPage[pageKey];
  if (!pageConfig) {
    return;
  }

  const controlsId = 'clade-controls-row';
  const originalCladeSrc = cladeObject.getAttribute('data') || '';
  let activeMode = 'ancestors';
  let hasInteracted = false;

  const toKey = (x, y) => `${Number(x).toString()},${Number(y).toString()}`;

  const parseTranslate = (transform) => {
    const match = /translate\(([^,]+),([^)]+)\)/.exec(transform || '');
    if (!match) {
      return null;
    }
    return toKey(match[1], match[2]);
  };

  const parsePathEndpoints = (d) => {
    const values = (d || '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if (!values || values.length < 4) {
      return;
    }
    return {
      startKey: toKey(values[0], values[1]),
      endKey: toKey(values[values.length - 2], values[values.length - 1])
    };
  };

  const covariantsCitationHtml = 'Source: <a href="https://covariants.org/" target="_blank" rel="noopener noreferrer">CoVariants</a>';

  const setNote = (text) => {
    const noteHost = cladeObject.closest('.visualization-block');
    const note = noteHost ? noteHost.querySelector('.clade-note') : document.querySelector('.clade-note');
    if (note) {
      note.innerHTML = text;
    }
  };

  const setActiveButton = (mode) => {
    const controls = document.getElementById(controlsId);
    if (!controls) {
      return;
    }

    controls.querySelectorAll('button[data-clade-mode]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.cladeMode === mode);
    });
  };

  const resetCladeView = () => {
    activeMode = 'ancestors';
    hasInteracted = false;
    setActiveButton(null);
    setNote(covariantsCitationHtml);
    if (originalCladeSrc) {
      cladeObject.setAttribute('data', `${originalCladeSrc}${originalCladeSrc.includes('?') ? '&' : '?'}reset=${Date.now()}`);
    }
    applyHighlight();
  };

  const applyHighlight = () => {
    if (!hasInteracted) {
      return;
    }

    const svgDoc = cladeObject.contentDocument;
    if (!svgDoc) {
      return;
    }

    const nodes = Array.from(svgDoc.querySelectorAll('g.node'));
    const paths = Array.from(svgDoc.querySelectorAll('path'));
    const nodeMeta = new Map();
    const parentByNodeKey = new Map();
    const childrenByNodeKey = new Map();
    const highlightedNodeKeys = new Set();
    const highlightedPaths = new Set();

    nodes.forEach((node) => {
      const key = parseTranslate(node.getAttribute('transform') || '');
      const textEl = node.querySelector('text');
      const circleEl = node.querySelector('circle');
      if (!key || !textEl || !circleEl) {
        return;
      }

      nodeMeta.set(key, {
        node,
        textEl,
        circleEl,
        label: (textEl.textContent || '').toLowerCase()
      });
    });

    paths.forEach((path) => {
      const endpoints = parsePathEndpoints(path.getAttribute('d'));
      if (!endpoints || !nodeMeta.has(endpoints.startKey) || !nodeMeta.has(endpoints.endKey)) {
        return;
      }

      // In this SVG, each path starts at the child node and ends at its parent node.
      parentByNodeKey.set(endpoints.startKey, { parentKey: endpoints.endKey, path });

      if (!childrenByNodeKey.has(endpoints.endKey)) {
        childrenByNodeKey.set(endpoints.endKey, []);
      }
      childrenByNodeKey.get(endpoints.endKey).push({ childKey: endpoints.startKey, path });
    });

    const focusTokens = (pageConfig.focusTokens || []).map((token) => token.toLowerCase());
    const focusKeys = Array.from(nodeMeta.entries())
      .filter(([, entry]) => focusTokens.some((token) => entry.label.includes(token)))
      .map(([key]) => key);

    if (focusKeys.length === 0) {
      setNote('Unable to determine the clade path for this variant.');
      return;
    }

    const addAncestors = (nodeKey) => {
      let currentKey = nodeKey;
      while (currentKey) {
        highlightedNodeKeys.add(currentKey);
        const relation = parentByNodeKey.get(currentKey);
        if (!relation) {
          break;
        }
        highlightedPaths.add(relation.path);
        currentKey = relation.parentKey;
      }
    };

    const addDescendants = (nodeKey) => {
      const children = childrenByNodeKey.get(nodeKey) || [];
      children.forEach(({ childKey, path }) => {
        highlightedNodeKeys.add(childKey);
        highlightedPaths.add(path);
        addDescendants(childKey);
      });
    };

    focusKeys.forEach((key) => {
      highlightedNodeKeys.add(key);
      if (activeMode === 'ancestors') {
        addAncestors(key);
      } else {
        addDescendants(key);
      }
    });

    nodeMeta.forEach((entry, key) => {
      const isHighlighted = highlightedNodeKeys.has(key);
      if (isHighlighted) {
        entry.textEl.style.opacity = '1';
        entry.textEl.style.fill = '#1a2c3e';
        entry.textEl.style.fontWeight = '800';
        entry.circleEl.style.opacity = '1';
        entry.circleEl.style.fillOpacity = '1';
        entry.circleEl.style.stroke = '#d7263d';
        entry.circleEl.style.strokeWidth = '6px';
        entry.circleEl.style.filter = 'drop-shadow(0 0 6px rgba(215, 38, 61, 0.45))';
      } else {
        entry.textEl.style.opacity = '0.48';
        entry.textEl.style.fill = '#8aa0ad';
        entry.textEl.style.fontWeight = '700';
        entry.circleEl.style.opacity = '0.3';
        entry.circleEl.style.fillOpacity = '0.55';
        entry.circleEl.style.stroke = '#d6dde3';
        entry.circleEl.style.strokeWidth = '2px';
        entry.circleEl.style.filter = 'none';
      }
    });

    paths.forEach((path) => {
      const isHighlighted = highlightedPaths.has(path);
      if (isHighlighted) {
        path.style.opacity = '1';
        path.style.stroke = '#d7263d';
        path.style.strokeWidth = '6px';
        path.style.filter = 'drop-shadow(0 0 6px rgba(215, 38, 61, 0.25))';
      } else {
        path.style.opacity = '0.2';
        path.style.stroke = '#d5d5d5';
        path.style.strokeWidth = '3px';
        path.style.filter = 'none';
      }
    });

    if (activeMode === 'ancestors') {
      setNote(`Tracing ancestors. ${covariantsCitationHtml}`);
    } else {
      setNote(`Tracing descendants. ${covariantsCitationHtml}`);
    }
  };

  const ensureControls = () => {
    if (document.getElementById(controlsId)) {
      return;
    }

    const controls = document.createElement('div');
    controls.id = controlsId;
    controls.className = 'button-row clade-controls';
    controls.innerHTML = `
      <button type="button" data-clade-mode="ancestors">Trace ancestors</button>
      <button type="button" data-clade-mode="descendants">Trace descendants</button>
      <button type="button" data-clade-action="reset">Reset</button>
    `;

    const figureWrap = cladeObject.closest('.clade-figure-wrap');
    if (figureWrap && figureWrap.parentNode) {
      figureWrap.parentNode.insertBefore(controls, figureWrap);
    }

    controls.addEventListener('click', (event) => {
      const resetButton = event.target.closest('button[data-clade-action="reset"]');
      if (resetButton) {
        resetCladeView();
        return;
      }

      const button = event.target.closest('button[data-clade-mode]');
      if (!button) return;
      activeMode = button.dataset.cladeMode || 'ancestors';
      hasInteracted = true;
      setActiveButton(activeMode);
      applyHighlight();
    });
  };

  if (cladeObject.contentDocument) {
    ensureControls();
    setActiveButton(null);
    setNote(covariantsCitationHtml);
    applyHighlight();
  } else {
    cladeObject.addEventListener('load', () => {
      ensureControls();
      setActiveButton(null);
      setNote(covariantsCitationHtml);
      applyHighlight();
    }, { once: true });
  }
}

// ========= Back to Top Button =========
function initBackToTopButton() {
  const backToTopButton = document.createElement('button');
  backToTopButton.id = 'back-to-top';
  backToTopButton.innerHTML = '↑';
  backToTopButton.title = 'Back to top';
  document.body.appendChild(backToTopButton);

  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
      backToTopButton.classList.add('show');
    } else {
      backToTopButton.classList.remove('show');
    }
  });

  backToTopButton.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}
