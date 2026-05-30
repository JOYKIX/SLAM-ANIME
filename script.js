const $ = (selector) => document.querySelector(selector);
const wordsInput = $('#words');
const horizontalInput = $('#horizontalCount');
const verticalInput = $('#verticalCount');
const hideLettersInput = $('#hideLetters');
const randomizeInput = $('#randomize');
const statusBox = $('#status');
const resultBox = $('#result');

const examples = [
  ['ANIME', 'MANGA', 'NARUTO', 'SAKURA', 'DRAGON', 'ONEPIECE', 'TITAN', 'KAWAII', 'OTAKU', 'COSPLAY', 'STUDIO', 'HERO'],
  ['SLAM', 'GRILLE', 'LETTRE', 'MOT', 'JEU', 'INDICE', 'REPONSE', 'PLATEAU', 'CROISE', 'VERTICAL', 'HORIZONTAL', 'QUESTION'],
  ['PARIS', 'LYON', 'MARSEILLE', 'NANTES', 'LILLE', 'TOULOUSE', 'BORDEAUX', 'NICE', 'ROUEN', 'DIJON', 'REIMS', 'BREST']
];

function normalizeWord(word) {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
}

function parseWords(raw) {
  const seen = new Set();
  return raw
    .split(/[\n,;]+/)
    .map((entry) => normalizeWord(entry.trim()))
    .filter((word) => word.length >= 2)
    .filter((word) => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function key(row, col) { return `${row},${col}`; }
function perpendicular(orientation) { return orientation === 'H' ? 'V' : 'H'; }

function canPlace(board, word, orientation, row, col, requireCrossing) {
  let crossings = 0;
  const dr = orientation === 'V' ? 1 : 0;
  const dc = orientation === 'H' ? 1 : 0;
  const before = board.get(key(row - dr, col - dc));
  const after = board.get(key(row + dr * word.length, col + dc * word.length));

  if (before || after) return null;

  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const current = board.get(key(r, c));

    if (current) {
      if (current.letter !== word[i]) return null;
      if (current.orientations.has(orientation)) return null;
      crossings += 1;
      continue;
    }

    const sideA = orientation === 'H' ? board.get(key(r - 1, c)) : board.get(key(r, c - 1));
    const sideB = orientation === 'H' ? board.get(key(r + 1, c)) : board.get(key(r, c + 1));
    if (sideA || sideB) return null;
  }

  if (requireCrossing && crossings === 0) return null;
  return { row, col, crossings };
}

function placeWord(board, placed, word, orientation, row, col) {
  const dr = orientation === 'V' ? 1 : 0;
  const dc = orientation === 'H' ? 1 : 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cellKey = key(r, c);
    const current = board.get(cellKey) || { letter: word[i], orientations: new Set() };
    current.letter = word[i];
    current.orientations.add(orientation);
    board.set(cellKey, current);
  }
  placed.push({ word, orientation, row, col, number: 0 });
}

function findPlacements(board, placed, word, orientation) {
  if (placed.length === 0) return [{ row: 0, col: 0, crossings: 0 }];

  const candidates = [];
  for (const existing of placed.filter((item) => item.orientation === perpendicular(orientation))) {
    for (let i = 0; i < word.length; i++) {
      for (let j = 0; j < existing.word.length; j++) {
        if (word[i] !== existing.word[j]) continue;
        const crossingRow = existing.row + (existing.orientation === 'V' ? j : 0);
        const crossingCol = existing.col + (existing.orientation === 'H' ? j : 0);
        const row = crossingRow - (orientation === 'V' ? i : 0);
        const col = crossingCol - (orientation === 'H' ? i : 0);
        const candidate = canPlace(board, word, orientation, row, col, true);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return candidates.sort((a, b) => b.crossings - a.crossings || Math.abs(a.row) + Math.abs(a.col) - Math.abs(b.row) - Math.abs(b.col));
}

function assignNumbers(placed) {
  return [...placed]
    .sort((a, b) => a.row - b.row || a.col - b.col || a.orientation.localeCompare(b.orientation))
    .map((item, index) => ({ ...item, number: index + 1 }));
}

function boardMetrics(board) {
  if (!board.size) return { rows: Infinity, cols: Infinity, area: Infinity, squareness: Infinity };
  const bounds = boundsFromBoard(board);
  const rows = bounds.maxRow - bounds.minRow + 1;
  const cols = bounds.maxCol - bounds.minCol + 1;
  return { rows, cols, area: rows * cols, squareness: Math.abs(rows - cols) };
}

function buildAttempt(words, horizontalCount, verticalCount, randomize) {
  const total = horizontalCount + verticalCount;
  const pool = (randomize ? shuffled(words) : [...words]).slice(0, total);
  const horizontalWords = pool.slice(0, horizontalCount);
  const verticalWords = pool.slice(horizontalCount, total);
  const horizontalQueue = horizontalWords.map((word) => ({ word, orientation: 'H' }));
  const verticalQueue = verticalWords.map((word) => ({ word, orientation: 'V' }));
  const pending = [];
  const longestFirst = (a, b) => b.word.length - a.word.length;

  horizontalQueue.sort(longestFirst);
  verticalQueue.sort(longestFirst);
  while (horizontalQueue.length || verticalQueue.length) {
    if (horizontalQueue.length) pending.push(horizontalQueue.shift());
    if (verticalQueue.length) pending.push(verticalQueue.shift());
  }
  const board = new Map();
  const placed = [];

  while (pending.length) {
    let best = null;
    for (let index = 0; index < pending.length; index++) {
      const item = pending[index];
      const candidates = findPlacements(board, placed, item.word, item.orientation);
      if (!candidates.length) continue;
      const candidate = candidates[0];
      if (
        !best ||
        candidate.crossings > best.candidate.crossings ||
        (candidate.crossings === best.candidate.crossings && item.word.length > best.item.word.length)
      ) {
        best = { index, item, candidate };
      }
    }

    if (!best) break;
    placeWord(board, placed, best.item.word, best.item.orientation, best.candidate.row, best.candidate.col);
    pending.splice(best.index, 1);
  }

  return { board, placed: assignNumbers(placed), missing: pending };
}

function isBetterResult(candidate, current) {
  if (!current) return true;
  if (candidate.placed.length !== current.placed.length) return candidate.placed.length > current.placed.length;
  if (candidate.missing.length !== current.missing.length) return candidate.missing.length < current.missing.length;

  const candidateMetrics = boardMetrics(candidate.board);
  const currentMetrics = boardMetrics(current.board);
  if (candidateMetrics.squareness !== currentMetrics.squareness) {
    return candidateMetrics.squareness < currentMetrics.squareness;
  }
  return candidateMetrics.area < currentMetrics.area;
}

function generateCrossword(words, horizontalCount, verticalCount, randomize) {
  let best = null;
  const tries = randomize ? 900 : 1;
  for (let attempt = 0; attempt < tries; attempt++) {
    const result = buildAttempt(words, horizontalCount, verticalCount, randomize);
    if (isBetterResult(result, best)) best = result;
  }
  return best;
}

function boundsFromBoard(board) {
  const coords = [...board.keys()].map((cellKey) => cellKey.split(',').map(Number));
  return coords.reduce((acc, [row, col]) => ({
    minRow: Math.min(acc.minRow, row),
    maxRow: Math.max(acc.maxRow, row),
    minCol: Math.min(acc.minCol, col),
    maxCol: Math.max(acc.maxCol, col)
  }), { minRow: Infinity, maxRow: -Infinity, minCol: Infinity, maxCol: -Infinity });
}

function render(result, requestedTotal) {
  if (!result || !result.placed.length) {
    resultBox.innerHTML = '';
    setStatus('Impossible de créer une grille avec ces mots. Ajoute des mots qui partagent plus de lettres.', 'error');
    return;
  }

  const { board, placed, missing } = result;
  const bounds = boundsFromBoard(board);
  const rows = bounds.maxRow - bounds.minRow + 1;
  const cols = bounds.maxCol - bounds.minCol + 1;
  const starts = new Map(placed.map((item) => [key(item.row, item.col), item.number]));
  const hiddenClass = hideLettersInput.checked ? ' hidden-letter' : '';

  let cells = '';
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      const cell = board.get(key(row, col));
      if (!cell) {
        cells += '<div class="cell empty" aria-hidden="true"></div>';
        continue;
      }
      const number = starts.get(key(row, col));
      cells += `<div class="cell${hiddenClass}">${number ? `<span class="num">${number}</span>` : ''}<span class="letter">${cell.letter}</span></div>`;
    }
  }

  const horizontal = placed.filter((item) => item.orientation === 'H');
  const vertical = placed.filter((item) => item.orientation === 'V');
  const listItem = (item) => `<li><strong>${item.number}.</strong> ${item.word}</li>`;

  resultBox.innerHTML = `
    <div class="meta">
      <span class="pill">${placed.length}/${requestedTotal} mots placés</span>
      <span class="pill">${horizontal.length} horizontaux</span>
      <span class="pill">${vertical.length} verticaux</span>
      <span class="pill">${rows} × ${cols} cases</span>
    </div>
    <div class="board-wrap">
      <div class="crossword" style="grid-template-columns: repeat(${cols}, var(--cell-size));">${cells}</div>
    </div>
    <div class="word-lists">
      <article class="word-card"><h2>Horizontaux</h2><ol>${horizontal.map(listItem).join('') || '<li>Aucun</li>'}</ol></article>
      <article class="word-card"><h2>Verticaux</h2><ol>${vertical.map(listItem).join('') || '<li>Aucun</li>'}</ol></article>
      ${missing.length ? `<article class="word-card"><h2>Mots non placés</h2><ul>${missing.map((item) => `<li>${item.word} (${item.orientation === 'H' ? 'horizontal' : 'vertical'})</li>`).join('')}</ul></article>` : ''}
    </div>
  `;

  setStatus(
    missing.length
      ? 'Grille partielle : certains mots ne partagent pas assez de lettres pour être croisés.'
      : 'Grille générée avec succès !',
    missing.length ? 'error' : 'success'
  );
}

function setStatus(message, type = '') {
  statusBox.innerHTML = `<div class="message ${type}">${message}</div>`;
}

function handleGenerate() {
  const words = parseWords(wordsInput.value);
  const horizontalCount = Number(horizontalInput.value);
  const verticalCount = Number(verticalInput.value);
  const requestedTotal = horizontalCount + verticalCount;

  if (!Number.isInteger(horizontalCount) || !Number.isInteger(verticalCount) || horizontalCount < 0 || verticalCount < 0) {
    setStatus('Choisis un nombre horizontal et vertical valide.', 'error');
    return;
  }
  if (requestedTotal === 0) {
    setStatus('Demande au moins un mot horizontal ou vertical.', 'error');
    return;
  }
  if (words.length < requestedTotal) {
    setStatus(`Il faut ${requestedTotal} mots différents, mais seulement ${words.length} sont valides.`, 'error');
    return;
  }

  const result = generateCrossword(words, horizontalCount, verticalCount, randomizeInput.checked);
  render(result, requestedTotal);
}

$('#generateBtn').addEventListener('click', handleGenerate);
$('#printBtn').addEventListener('click', () => window.print());
$('#exampleBtn').addEventListener('click', () => {
  const example = examples[Math.floor(Math.random() * examples.length)];
  wordsInput.value = example.join('\n');
  horizontalInput.value = 5;
  verticalInput.value = 5;
  handleGenerate();
});
hideLettersInput.addEventListener('change', handleGenerate);

handleGenerate();
