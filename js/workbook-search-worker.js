let searchIndexCache = null;

function asIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return '';
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return '';
  }
  return `${String(y)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function rowMatchesDate(rowDate, dateFrom, dateTo) {
  if (!rowDate) return false;
  if (dateFrom && rowDate < dateFrom) return false;
  if (dateTo && rowDate > dateTo) return false;
  return true;
}

function rowMatchesTokens(searchText, selectedTokensLower, matchMode) {
  if (!selectedTokensLower.length) {
    return true;
  }
  if (matchMode === 'all') {
    return selectedTokensLower.every((token) => searchText.includes(token));
  }
  return selectedTokensLower.some((token) => searchText.includes(token));
}

async function loadSearchIndex(indexPath) {
  if (searchIndexCache) {
    return searchIndexCache;
  }

  const response = await fetch(indexPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch search index: ${response.status}`);
  }

  const payload = await response.json();
  searchIndexCache = {
    headers: payload.headers || [],
    rows: payload.rows || [],
    dateBounds: payload.dateBounds || { min: '', max: '' }
  };

  return searchIndexCache;
}

async function runSearch(requestId, payload) {
  const searchIndex = await loadSearchIndex(payload.indexPath);
  const rows = searchIndex.rows;
  const classFilters = Array.isArray(payload.classFilters) ? payload.classFilters : [];
  const selectedTokensLower = Array.isArray(payload.selectedTokensLower) ? payload.selectedTokensLower : [];
  const dateFrom = String(payload.dateFrom || '');
  const dateTo = String(payload.dateTo || '');
  const matchMode = payload.matchMode === 'all' ? 'all' : 'any';
  const maxResults = Number(payload.maxResults) > 0 ? Number(payload.maxResults) : 5000;

  const matched = [];
  let scanned = 0;
  let truncated = false;
  const total = rows.length;
  const progressEvery = 10000;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    scanned += 1;

    if (scanned % progressEvery === 0) {
      self.postMessage({
        id: requestId,
        progress: {
          scanned,
          total,
          matched: matched.length
        }
      });
    }

    const classMatch = classFilters.some((token) => row.classLabelLower.includes(token));
    if (!classMatch) {
      continue;
    }

    if (!rowMatchesDate(row.rowDate, dateFrom, dateTo)) {
      continue;
    }

    if (!rowMatchesTokens(row.searchTextLower, selectedTokensLower, matchMode)) {
      continue;
    }

    matched.push(row);
    if (matched.length >= maxResults) {
      truncated = true;
      break;
    }
  }

  self.postMessage({
    id: requestId,
    progress: {
      scanned,
      total,
      matched: matched.length
    }
  });

  return {
    headers: searchIndex.headers,
    rows: matched,
    dateBounds: searchIndex.dateBounds,
    scanned,
    truncated
  };
}

self.onmessage = async (event) => {
  const message = event.data || {};
  const id = message.id;
  const type = message.type;
  const payload = message.payload || {};

  try {
    if (type === 'search') {
      const result = await runSearch(id, payload);
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'bounds') {
      const searchIndex = await loadSearchIndex(payload.indexPath);
      self.postMessage({ id, ok: true, result: { dateBounds: searchIndex.dateBounds } });
      return;
    }

    throw new Error(`Unknown worker message type: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : 'Search index worker failed'
    });
  }
};
