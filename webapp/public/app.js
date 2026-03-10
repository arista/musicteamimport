// State
let songs = [];
let selectedSong = null;
let currentPreview = null;
let allTags = [];

// Constants
const VALID_KEYS = [
  "A", "Bb", "B", "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab",
  "Am", "Bbm", "Bm", "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "Abm",
  "unknown"
];

const SHEET_TYPES = [
  "Chord",
  "Lead",
  "Vocal",
  "Hymn",
  "Other"
];

// Elements
const songListEl = document.getElementById("song-list");
const detailPanelEl = document.getElementById("detail-panel");
const statsEl = document.getElementById("stats");
const filterStatusEl = document.getElementById("filter-status");
const filterSearchEl = document.getElementById("filter-search");
const filterFlagsOnlyEl = document.getElementById("filter-flags-only");

// Initialize
async function init() {
  await loadSongs();
  await loadTags();
  renderSongList();
  await loadStats();

  // Set up filters
  filterStatusEl.addEventListener("change", renderSongList);
  filterSearchEl.addEventListener("input", debounce(renderSongList, 200));
  filterFlagsOnlyEl.addEventListener("change", renderSongList);
}

// Load all available tags
async function loadTags() {
  const res = await fetch("/api/tags");
  allTags = await res.json();
}

// Load songs from API
async function loadSongs() {
  const res = await fetch("/api/songs");
  const data = await res.json();
  songs = data.songs;
}

// Load stats
async function loadStats() {
  const res = await fetch("/api/stats");
  const stats = await res.json();
  statsEl.innerHTML = `
    <span>Total: ${stats.total}</span>
    <span class="pending">Pending: ${stats.pending}</span>
    <span class="verified">Verified: ${stats.verified}</span>
    <span class="flagged">Flagged: ${stats.flagged}</span>
    <span class="skipped">Skipped: ${stats.skipped}</span>
  `;
}

// Filter songs
function getFilteredSongs() {
  const statusFilter = filterStatusEl.value;
  const searchFilter = filterSearchEl.value.toLowerCase();
  const flagsOnly = filterFlagsOnlyEl.checked;

  return songs.filter(song => {
    if (statusFilter && song.status !== statusFilter) return false;
    if (flagsOnly && song.flags.length === 0) return false;
    if (searchFilter) {
      const searchable = [
        song.title,
        song.folderName,
        ...song.authors,
        ...song.tags,
        song.ccliNumber?.toString() || ""
      ].join(" ").toLowerCase();
      if (!searchable.includes(searchFilter)) return false;
    }
    return true;
  });
}

// Render song list
function renderSongList() {
  const filtered = getFilteredSongs();

  songListEl.innerHTML = filtered.map(song => `
    <div class="song-item ${selectedSong?.id === song.id ? 'selected' : ''}"
         data-id="${song.id}"
         onclick="selectSong('${song.id}')">
      <div class="title">${escapeHtml(song.title)}</div>
      <div class="meta">
        <span class="status-badge ${song.status}">${song.status}</span>
        ${song.ccliNumber ? `<span>CCLI: ${song.ccliNumber}</span>` : ''}
        ${song.sheets.length > 0 ? `<span>${song.sheets.length} sheet${song.sheets.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      ${song.flags.length > 0 ? `<div class="flags">${song.flags.join(", ")}</div>` : ''}
      ${song.tags.length > 0 ? `
        <div class="tags">
          ${song.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join("");
}

// Select a song
function selectSong(id) {
  selectedSong = songs.find(s => s.id === id);
  renderSongList();
  renderDetailPanel();
}

// Render detail panel
function renderDetailPanel() {
  if (!selectedSong) {
    detailPanelEl.innerHTML = '<div class="placeholder">Select a song to view details</div>';
    return;
  }

  const song = selectedSong;

  detailPanelEl.innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(song.title)}</h2>
      <div class="detail-actions">
        <button class="btn-verify" onclick="setStatus('verified')">Verify</button>
        <button class="btn-flag" onclick="setStatus('flagged')">Flag</button>
        <button class="btn-skip" onclick="setStatus('skipped')">Skip</button>
        <button class="btn-pending" onclick="setStatus('pending')">Reset</button>
      </div>
    </div>

    ${song.extractionNotes.length > 0 ? `
      <div class="extraction-notes">
        <strong>Extraction Notes:</strong>
        <ul>
          ${song.extractionNotes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <div class="detail-section">
      <h3>Metadata</h3>
      <div class="field-row">
        <label>Title:</label>
        <input type="text" id="edit-title" value="${escapeHtml(song.title)}" onchange="updateField('title', this.value)">
      </div>
      <div class="field-row">
        <label>Folder:</label>
        <div class="value">${escapeHtml(song.folderName)}</div>
      </div>
      <div class="field-row">
        <label>Authors:</label>
        <input type="text" id="edit-authors" value="${escapeHtml(song.authors.join(' | '))}"
               onchange="updateField('authors', this.value.split('|').map(s => s.trim()).filter(s => s))">
      </div>
      <div class="field-row">
        <label>CCLI #:</label>
        <input type="text" id="edit-ccli" value="${song.ccliNumber || ''}"
               onchange="updateField('ccliNumber', this.value ? parseInt(this.value) : null)">
      </div>
      <div class="field-row">
        <label>Copyright:</label>
        <div class="value">${escapeHtml(song.copyright) || '<em>Not specified</em>'}</div>
      </div>
      <div class="field-row">
        <label>Public Domain:</label>
        <div class="value">${song.isPublicDomain ? 'Yes' : 'No'}</div>
      </div>
      <div class="field-row">
        <label>Verse Order:</label>
        <input type="text" id="edit-verse-order" value="${escapeHtml(song.verseOrder)}"
               onchange="updateField('verseOrder', this.value)">
      </div>
      <div class="field-row">
        <label>Tags:</label>
        <div class="tag-checkboxes">
          ${allTags.map(tag => `
            <label class="tag-checkbox ${song.tags.includes(tag) ? 'checked' : ''}">
              <input type="checkbox"
                     ${song.tags.includes(tag) ? 'checked' : ''}
                     onchange="toggleTag('${escapeHtml(tag)}', this.checked)">
              ${escapeHtml(tag)}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="field-row">
        <label>Notes:</label>
        <textarea id="edit-notes" onchange="updateField('notes', this.value)">${escapeHtml(song.notes)}</textarea>
      </div>
    </div>

    <div class="detail-section">
      <h3>Sheets (${song.sheets.length})</h3>
      <div class="sheets-list">
        ${song.sheets.map((sheet, index) => `
          <div class="sheet-item ${sheet.isPrimary ? 'primary' : ''}">
            <div class="sheet-main">
              <div class="sheet-info">
                <span class="sheet-filename">${escapeHtml(sheet.fileName)}</span>
                <span class="sheet-size">${formatBytes(sheet.fileSize)}</span>
              </div>
              <div class="sheet-controls">
                <label class="sheet-control">
                  <span>Key:</span>
                  <select onchange="updateSheet(${index}, 'key', this.value)">
                    ${VALID_KEYS.map(k => `
                      <option value="${k}" ${sheet.key === k ? 'selected' : ''}>${k}</option>
                    `).join('')}
                  </select>
                </label>
                <label class="sheet-control">
                  <span>Type:</span>
                  <select onchange="updateSheet(${index}, 'type', this.value)">
                    ${SHEET_TYPES.map(t => `
                      <option value="${t}" ${sheet.type === t ? 'selected' : ''}>${t}</option>
                    `).join('')}
                  </select>
                </label>
                ${sheet.type === 'Other' ? `
                  <label class="sheet-control">
                    <input type="text" class="type-other-input"
                           value="${escapeHtml(sheet.typeOther || '')}"
                           placeholder="Specify type..."
                           onchange="updateSheet(${index}, 'typeOther', this.value)">
                  </label>
                ` : ''}
                <label class="sheet-control verse-order-control ${sheet.includesVerseOrder ? 'checked' : ''}">
                  <input type="checkbox"
                         ${sheet.includesVerseOrder ? 'checked' : ''}
                         onchange="updateSheet(${index}, 'includesVerseOrder', this.checked)">
                  <span>Has verse order</span>
                </label>
                <label class="sheet-control primary-control">
                  <input type="radio" name="primary-sheet"
                         ${sheet.isPrimary ? 'checked' : ''}
                         onchange="updateSheet(${index}, 'isPrimary', true)">
                  <span>Primary</span>
                </label>
              </div>
            </div>
            <button onclick="previewPdf('${escapeHtml(song.folderName)}', '${escapeHtml(sheet.fileName)}')">View</button>
          </div>
        `).join('')}
        ${song.sheets.length === 0 ? '<div class="sheet-item">No PDF sheets found</div>' : ''}
      </div>
    </div>

    <div class="detail-section">
      <h3>Preview</h3>
      <div class="preview-tabs">
        <button class="active" onclick="previewLyrics()">Lyrics</button>
        ${song.sheets.length > 0 ? `
          <button onclick="previewPdf('${escapeHtml(song.folderName)}', '${escapeHtml(song.sheets.find(s => s.isPrimary)?.fileName || song.sheets[0]?.fileName)}')">
            Primary PDF
          </button>
        ` : ''}
      </div>
      <div class="preview-content" id="preview-content">
        <pre id="lyrics-preview">Loading...</pre>
      </div>
    </div>
  `;

  // Load lyrics preview
  previewLyrics();
}

// Preview lyrics
async function previewLyrics() {
  if (!selectedSong || !selectedSong.lyricsFile) {
    document.getElementById("preview-content").innerHTML = '<pre>No lyrics file available</pre>';
    return;
  }

  // Update active tab
  document.querySelectorAll('.preview-tabs button').forEach((btn, i) => {
    btn.classList.toggle('active', i === 0);
  });

  const res = await fetch(`/api/lyrics/${encodeURIComponent(selectedSong.folderName)}`);
  const content = await res.text();
  document.getElementById("preview-content").innerHTML = `<pre>${escapeHtml(content)}</pre>`;
}

// Preview PDF
function previewPdf(folderName, fileName) {
  // Update active tab
  document.querySelectorAll('.preview-tabs button').forEach((btn, i) => {
    btn.classList.toggle('active', i === 1);
  });

  const url = `/api/pdf/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`;
  document.getElementById("preview-content").innerHTML = `<iframe src="${url}"></iframe>`;
}

// Update a field
async function updateField(field, value) {
  if (!selectedSong) return;

  const res = await fetch(`/api/songs/${selectedSong.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value })
  });

  if (res.ok) {
    const updated = await res.json();
    const index = songs.findIndex(s => s.id === selectedSong.id);
    songs[index] = updated;
    selectedSong = updated;
    showSaveIndicator();
    renderSongList();
    loadStats();
  }
}

// Set status
async function setStatus(status) {
  await updateField('status', status);
  renderDetailPanel();
}

// Toggle a tag
async function toggleTag(tag, checked) {
  if (!selectedSong) return;

  let newTags;
  if (checked) {
    newTags = [...selectedSong.tags, tag].sort();
  } else {
    newTags = selectedSong.tags.filter(t => t !== tag);
  }

  await updateField('tags', newTags);
  renderDetailPanel();
}

// Update a sheet property
async function updateSheet(sheetIndex, field, value) {
  if (!selectedSong) return;

  const res = await fetch(`/api/songs/${selectedSong.id}/sheets/${sheetIndex}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value })
  });

  if (res.ok) {
    const updated = await res.json();
    const index = songs.findIndex(s => s.id === selectedSong.id);
    songs[index] = updated;
    selectedSong = updated;
    showSaveIndicator();
    renderDetailPanel();
  }
}

// Show save indicator
function showSaveIndicator() {
  let indicator = document.querySelector('.save-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'save-indicator';
    indicator.textContent = 'Saved!';
    document.body.appendChild(indicator);
  }
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 1500);
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!selectedSong) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const filtered = getFilteredSongs();
  const currentIndex = filtered.findIndex(s => s.id === selectedSong.id);

  if (e.key === 'ArrowDown' && currentIndex < filtered.length - 1) {
    e.preventDefault();
    selectSong(filtered[currentIndex + 1].id);
  } else if (e.key === 'ArrowUp' && currentIndex > 0) {
    e.preventDefault();
    selectSong(filtered[currentIndex - 1].id);
  } else if (e.key === 'v') {
    setStatus('verified');
  } else if (e.key === 'f') {
    setStatus('flagged');
  } else if (e.key === 's') {
    setStatus('skipped');
  } else if (e.key === 'r') {
    setStatus('pending');
  }
});

// Start
init();
