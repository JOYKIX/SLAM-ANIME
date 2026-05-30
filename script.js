const $ = (selector) => document.querySelector(selector);
const wordsInput = $('#words');
const horizontalInput = $('#horizontalCount');
const verticalInput = $('#verticalCount');
const hideLettersInput = $('#hideLetters');
const randomizeInput = $('#randomize');
const statusBox = $('#status');
const resultBox = $('#result');
const saveBtn = $('#saveBtn');
const savedList = $('#savedList');
const clearSavesBtn = $('#clearSavesBtn');

const STORAGE_KEY = 'manga-grid-quest:saves:v1';

const examples = [
  ['ONE PIECE', 'DEMON SLAYER', 'NARUTO', 'SAKURA', 'DRAGON BALL', 'TITAN', 'KAWAII', 'OTAKU', 'COSPLAY', 'STUDIO GHIBLI', 'HERO', 'SHONEN'],
  ['MY HERO ACADEMIA', 'JUJUTSU KAISEN', 'CHAINSAW MAN', 'SPY FAMILY', 'BLEACH', 'HUNTER HUNTER', 'SAILOR MOON', 'AKIRA', 'MANGAKA', 'SENSEI', 'KATANA', 'MECHA'],
  ['ANIME', 'MANGA', 'SEINEN', 'SHOJO', 'SHONEN', 'KODOMO', 'ISEKAI', 'TSUNDERE', 'OPENING', 'ENDING', 'DOUJINSHI', 'FAN ART']
];

let currentPuzzle = null;
let currentRequestedTotal = 0;
let activeSaveId = null;
let activeDirection = 'H';

function normalizeWord(word) {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseWords(raw) {
  const seen = new Set();
  return raw
    .split(/[\n,;]+/)
    .map((entry) => normalizeWord(entry))
    .filter((word) => word.replace(/\s/g, '').length >= 2)
    .filter((word) => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
function isSpaceChar(char) { return char === ' '; }

function canPlace(board, word, orientation, row, col, requireCrossing) {
  let crossings = 0;
  const dr = orientation === 'V' ? 1 : 0;
  const dc = orientation === 'H' ? 1 : 0;
  const before = board.get(key(row - dr, col - dc));
  const after = board.get(key(row + dr * word.length, col + dc * word.length));

  if (before || after) return null;

  for (let i = 0; i < word.length; i++) {
    const letter = word[i];
    const r = row + dr * i;
    const c = col + dc * i;
    const current = board.get(key(r, c));

    if (current) {
      if (isSpaceChar(letter) || isSpaceChar(current.letter)) return null;
      if (current.letter !== letter) return null;
      if (current.orientations.has(orientation)) return null;
      crossings += 1;
      continue;
    }

    if (isSpaceChar(letter)) continue;

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
      if (isSpaceChar(word[i])) continue;
      for (let j = 0; j < existing.word.length; j++) {
        if (isSpaceChar(existing.word[j]) || word[i] !== existing.word[j]) continue;
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

function serializePuzzle(result, requestedTotal) {
  return {
    board: [...result.board.entries()].map(([cellKey, cell]) => [cellKey, { letter: cell.letter, orientations: [...cell.orientations] }]),
    placed: result.placed,
    missing: result.missing,
    requestedTotal
  };
}

function deserializePuzzle(snapshot) {
  return {
    board: new Map(snapshot.board.map(([cellKey, cell]) => [cellKey, { letter: cell.letter, orientations: new Set(cell.orientations) }])),
    placed: snapshot.placed || [],
    missing: snapshot.missing || [],
    requestedTotal: snapshot.requestedTotal || (snapshot.placed?.length ?? 0)
  };
}

function getSavedGames() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (error) {
    console.warn('Impossible de lire les sauvegardes locales.', error);
    return [];
  }
}

function setSavedGames(saves) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
}

function collectPlayerState() {
  const state = {};
  resultBox.querySelectorAll('.play-input').forEach((input) => {
    state[input.dataset.cell] = input.value.toUpperCase();
  });
  return state;
}

function wordId(item) {
  return `${item.number}-${item.orientation}`;
}

function getPlayableCells(item) {
  const dr = item.orientation === 'V' ? 1 : 0;
  const dc = item.orientation === 'H' ? 1 : 0;
  const cells = [];

  for (let index = 0; index < item.word.length; index++) {
    if (isSpaceChar(item.word[index])) continue;
    cells.push(key(item.row + dr * index, item.col + dc * index));
  }

  return cells;
}

function buildWordLookup(placed) {
  const byWord = new Map();
  const byCell = new Map();

  placed.forEach((item) => {
    const id = wordId(item);
    const cells = getPlayableCells(item);
    const entry = {
      id,
      number: item.number,
      orientation: item.orientation,
      label: `${item.number} ${item.orientation === 'H' ? 'horizontal' : 'vertical'}`,
      word: item.word,
      cells
    };

    byWord.set(id, entry);
    cells.forEach((cellKey, index) => {
      const current = byCell.get(cellKey) || [];
      current.push({ id, orientation: item.orientation, index, total: cells.length });
      byCell.set(cellKey, current);
    });
  });

  return { byWord, byCell };
}

function getInputByCell(cellKey) {
  return resultBox.querySelector(`.play-input[data-cell="${CSS.escape(cellKey)}"]`);
}

function getActiveWordForInput(input) {
  if (!input) return null;
  const memberships = (input.dataset.words || '').split('|').filter(Boolean);
  if (!memberships.length) return null;

  return memberships.find((id) => id.endsWith(`-${activeDirection}`)) || memberships[0];
}

function focusNextCell(input) {
  const wordKey = getActiveWordForInput(input);
  if (!wordKey || !currentPuzzle) return;

  const lookup = buildWordLookup(currentPuzzle.placed);
  const word = lookup.byWord.get(wordKey);
  if (!word) return;

  const currentIndex = word.cells.indexOf(input.dataset.cell);
  const nextCell = word.cells.slice(currentIndex + 1).find((cellKey) => {
    const nextInput = getInputByCell(cellKey);
    return nextInput && !nextInput.disabled;
  });

  if (nextCell) getInputByCell(nextCell)?.focus();
}

function clearTransientWordState() {
  resultBox.querySelectorAll('.play-input.is-pending, .play-input.is-wrong').forEach((input) => {
    input.classList.remove('is-pending', 'is-wrong');
  });
  resultBox.querySelectorAll('.cell.is-current, .cell.is-word-wrong').forEach((cell) => {
    cell.classList.remove('is-current', 'is-word-wrong');
  });
}

function markActiveWord(input) {
  resultBox.querySelectorAll('.cell.is-current').forEach((cell) => cell.classList.remove('is-current'));
  const wordKey = getActiveWordForInput(input);
  if (!wordKey || !currentPuzzle) return;

  const lookup = buildWordLookup(currentPuzzle.placed);
  const word = lookup.byWord.get(wordKey);
  if (!word) return;

  word.cells.forEach((cellKey) => getInputByCell(cellKey)?.closest('.cell')?.classList.add('is-current'));
  setGameStatus(`Mot ${word.label} : complète toutes les cases, la validation se fait à la dernière lettre.`);
}

function isWordSolved(word) {
  return word.cells.every((cellKey) => {
    const input = getInputByCell(cellKey);
    return input && input.value === input.dataset.answer;
  });
}

function refreshSolvedWords() {
  if (!currentPuzzle || !hideLettersInput.checked) return { solved: 0, total: 0 };

  const lookup = buildWordLookup(currentPuzzle.placed);
  let solved = 0;

  resultBox.querySelectorAll('.play-input').forEach((input) => {
    input.classList.remove('is-correct');
    input.disabled = false;
  });
  resultBox.querySelectorAll('.cell.is-solved').forEach((cell) => cell.classList.remove('is-solved'));

  lookup.byWord.forEach((word) => {
    if (!isWordSolved(word)) return;
    solved += 1;
    word.cells.forEach((cellKey) => {
      const input = getInputByCell(cellKey);
      if (input) {
        input.classList.add('is-correct');
        input.disabled = true;
      }
      input?.closest('.cell')?.classList.add('is-solved');
    });
  });

  updateProgress(solved, lookup.byWord.size);
  return { solved, total: lookup.byWord.size };
}

function updateProgress(solved, total) {
  const progress = resultBox.querySelector('.game-progress');
  if (!progress || !total) return;
  const percent = Math.round((solved / total) * 100);
  progress.style.setProperty('--progress', `${percent}%`);
  progress.querySelector('strong').textContent = `${solved}/${total}`;
}

function setGameStatus(message) {
  const gameStatus = resultBox.querySelector('.game-status');
  if (gameStatus) gameStatus.textContent = message;
}

function validateWordFromInput(input) {
  const wordKey = getActiveWordForInput(input);
  if (!wordKey || !currentPuzzle) return;

  const lookup = buildWordLookup(currentPuzzle.placed);
  const word = lookup.byWord.get(wordKey);
  if (!word) return;

  const inputs = word.cells.map(getInputByCell).filter(Boolean);
  const isComplete = inputs.every((item) => item.value.length === 1);

  inputs.forEach((item) => item.classList.toggle('is-pending', item.value.length === 1 && !item.classList.contains('is-correct')));
  if (!isComplete) {
    refreshSolvedWords();
    return;
  }

  const isCorrect = inputs.every((item) => item.value === item.dataset.answer);
  if (isCorrect) {
    inputs.forEach((item) => item.classList.remove('is-pending', 'is-wrong'));
    const { solved, total } = refreshSolvedWords();
    setGameStatus(solved === total ? 'Bravo, tous les mots sont validés !' : `Mot ${word.label} validé. Continue la quête !`);
    return;
  }

  inputs.forEach((item) => {
    item.classList.remove('is-pending');
    item.classList.add('is-wrong');
    item.closest('.cell')?.classList.add('is-word-wrong');
  });
  setGameStatus(`Mot ${word.label} incorrect : il est effacé, réessaie.`);

  window.setTimeout(() => {
    inputs.forEach((item) => {
      const otherSolvedWord = (item.dataset.words || '')
        .split('|')
        .filter((id) => id && id !== wordKey)
        .some((id) => {
          const otherWord = lookup.byWord.get(id);
          return otherWord && isWordSolved(otherWord);
        });

      if (!otherSolvedWord) item.value = '';
      item.classList.remove('is-wrong', 'is-pending');
      item.closest('.cell')?.classList.remove('is-word-wrong');
    });
    refreshSolvedWords();
    savePlayerState();
    inputs[0]?.focus();
  }, 420);
}

function savePlayerState() {
  if (!activeSaveId) return;
  const saves = getSavedGames();
  const save = saves.find((item) => item.id === activeSaveId);
  if (!save) return;
  save.player = collectPlayerState();
  save.updatedAt = new Date().toISOString();
  setSavedGames(saves);
  renderSavedList();
}

function render(result, requestedTotal, playerState = {}) {
  if (!result || !result.placed.length) {
    resultBox.innerHTML = '';
    setStatus('Impossible de créer une grille avec ces mots. Ajoute des mots qui partagent plus de lettres.', 'error');
    return;
  }

  currentPuzzle = result;
  currentRequestedTotal = requestedTotal;

  const { board, placed, missing } = result;
  const bounds = boundsFromBoard(board);
  const rows = bounds.maxRow - bounds.minRow + 1;
  const cols = bounds.maxCol - bounds.minCol + 1;
  const starts = new Map(placed.map((item) => [key(item.row, item.col), item.number]));
  const wordLookup = buildWordLookup(placed);
  const hideLetters = hideLettersInput.checked;
  const hiddenClass = hideLetters ? ' hidden-letter' : '';

  let cells = '';
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      const cellKey = key(row, col);
      const cell = board.get(cellKey);
      if (!cell) {
        cells += '<div class="cell empty" aria-hidden="true"></div>';
        continue;
      }
      const number = starts.get(cellKey);
      const numberHtml = number ? `<span class="num">${number}</span>` : '';
      if (isSpaceChar(cell.letter)) {
        cells += `<div class="cell space-cell" title="Espace dans le mot">${numberHtml}<span class="letter" aria-hidden="true">·</span></div>`;
        continue;
      }
      const safeLetter = escapeHtml(cell.letter);
      const playerValue = escapeHtml(playerState[cellKey] || '');
      const memberships = wordLookup.byCell.get(cellKey) || [];
      const wordIds = memberships.map((item) => item.id).join('|');
      const orientations = memberships.map((item) => item.orientation).join('');
      const content = hideLetters
        ? `<input class="play-input" maxlength="1" data-cell="${cellKey}" data-answer="${safeLetter}" data-words="${escapeHtml(wordIds)}" data-orientations="${orientations}" value="${playerValue}" aria-label="Lettre à deviner" />`
        : `<span class="letter">${safeLetter}</span>`;
      cells += `<div class="cell${hiddenClass}" data-cell="${cellKey}">${numberHtml}${content}</div>`;
    }
  }

  const horizontal = placed.filter((item) => item.orientation === 'H');
  const vertical = placed.filter((item) => item.orientation === 'V');
  const listItem = (item) => `<li><strong>${item.number}.</strong> ${escapeHtml(item.word)}</li>`;

  resultBox.innerHTML = `
    <div class="meta">
      <span class="pill">${placed.length}/${requestedTotal} mots placés</span>
      <span class="pill">${horizontal.length} horizontaux</span>
      <span class="pill">${vertical.length} verticaux</span>
      <span class="pill">${rows} × ${cols} cases</span>
      <span class="pill">Espaces gris inclus</span>
    </div>
    ${hideLetters ? `
      <section class="play-panel" aria-label="Progression du mode jeu">
        <div class="game-status">Tape un mot en entier : il devient vert seulement s’il est juste, sinon il s’efface.</div>
        <div class="game-progress" style="--progress: 0%"><span></span><strong>0/${placed.length}</strong></div>
      </section>
    ` : ''}
    <div class="board-wrap">
      <div class="crossword" style="grid-template-columns: repeat(${cols}, var(--cell-size));">${cells}</div>
    </div>
    ${hideLetters ? '<p class="play-hint">Mode jeu : la saisie avance toute seule dans le mot. Double-clique une intersection pour changer de direction.</p>' : ''}
    <div class="word-lists">
      <article class="word-card"><h2>Horizontaux</h2><ol>${horizontal.map(listItem).join('') || '<li>Aucun</li>'}</ol></article>
      <article class="word-card"><h2>Verticaux</h2><ol>${vertical.map(listItem).join('') || '<li>Aucun</li>'}</ol></article>
      ${missing.length ? `<article class="word-card"><h2>Mots non placés</h2><ul>${missing.map((item) => `<li>${escapeHtml(item.word)} (${item.orientation === 'H' ? 'horizontal' : 'vertical'})</li>`).join('')}</ul></article>` : ''}
    </div>
  `;

  setStatus(
    missing.length
      ? 'Grille partielle : certains mots ne partagent pas assez de lettres pour être croisés.'
      : 'Grille prête ! Tu peux masquer les lettres sans régénérer le plateau.',
    missing.length ? 'error' : 'success'
  );

  refreshSolvedWords();
}

function rerenderCurrent(playerState = collectPlayerState()) {
  if (!currentPuzzle) return;
  render(currentPuzzle, currentRequestedTotal, playerState);
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

  activeSaveId = null;
  const result = generateCrossword(words, horizontalCount, verticalCount, randomizeInput.checked);
  render(result, requestedTotal);
  renderSavedList();
}

function saveCurrentGrid() {
  if (!currentPuzzle) {
    setStatus('Génère une grille avant de la sauvegarder.', 'error');
    return;
  }

  const saves = getSavedGames();
  const now = new Date().toISOString();
  const firstWord = currentPuzzle.placed[0]?.word || 'Grille';
  const save = {
    id: activeSaveId || `grid-${Date.now()}`,
    name: `${firstWord} · ${currentPuzzle.placed.length} mots`,
    createdAt: activeSaveId ? saves.find((item) => item.id === activeSaveId)?.createdAt || now : now,
    updatedAt: now,
    words: wordsInput.value,
    horizontalCount: Number(horizontalInput.value),
    verticalCount: Number(verticalInput.value),
    hideLetters: hideLettersInput.checked,
    randomize: randomizeInput.checked,
    puzzle: serializePuzzle(currentPuzzle, currentRequestedTotal),
    player: collectPlayerState()
  };

  const nextSaves = [save, ...saves.filter((item) => item.id !== save.id)].slice(0, 20);
  activeSaveId = save.id;
  setSavedGames(nextSaves);
  renderSavedList();
  setStatus('Grille sauvegardée dans ce navigateur. Tu peux la rouvrir et continuer à jouer dessus.', 'success');
}

function loadSavedGrid(id) {
  const save = getSavedGames().find((item) => item.id === id);
  if (!save) return;
  const puzzle = deserializePuzzle(save.puzzle);
  activeSaveId = save.id;
  wordsInput.value = save.words || '';
  horizontalInput.value = save.horizontalCount ?? 0;
  verticalInput.value = save.verticalCount ?? 0;
  hideLettersInput.checked = Boolean(save.hideLetters);
  randomizeInput.checked = Boolean(save.randomize);
  render(puzzle, puzzle.requestedTotal, save.player || {});
  renderSavedList();
  setStatus('Sauvegarde chargée : la grille est identique, sans nouvelle génération.', 'success');
}

function deleteSavedGrid(id) {
  const nextSaves = getSavedGames().filter((item) => item.id !== id);
  if (activeSaveId === id) activeSaveId = null;
  setSavedGames(nextSaves);
  renderSavedList();
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dateValue));
}

function renderSavedList() {
  const saves = getSavedGames();
  if (!saves.length) {
    savedList.innerHTML = '<p class="empty-save">Aucune grille sauvegardée pour le moment.</p>';
    clearSavesBtn.disabled = true;
    return;
  }

  clearSavesBtn.disabled = false;
  savedList.innerHTML = saves.map((save) => `
    <article class="save-card${save.id === activeSaveId ? ' is-active' : ''}">
      <div>
        <strong>${escapeHtml(save.name)}</strong>
        <span>${formatDate(save.updatedAt)}</span>
      </div>
      <div class="save-actions">
        <button class="tiny load-save" data-id="${save.id}">Ouvrir</button>
        <button class="tiny danger delete-save" data-id="${save.id}" aria-label="Supprimer ${escapeHtml(save.name)}">×</button>
      </div>
    </article>
  `).join('');
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
hideLettersInput.addEventListener('change', () => rerenderCurrent());
saveBtn.addEventListener('click', saveCurrentGrid);
clearSavesBtn.addEventListener('click', () => {
  setSavedGames([]);
  activeSaveId = null;
  renderSavedList();
});
savedList.addEventListener('click', (event) => {
  const loadButton = event.target.closest('.load-save');
  const deleteButton = event.target.closest('.delete-save');
  if (loadButton) loadSavedGrid(loadButton.dataset.id);
  if (deleteButton) deleteSavedGrid(deleteButton.dataset.id);
});
resultBox.addEventListener('focusin', (event) => {
  if (!event.target.matches('.play-input')) return;
  if (!event.target.dataset.orientations.includes(activeDirection)) {
    activeDirection = event.target.dataset.orientations[0] || 'H';
  }
  markActiveWord(event.target);
});

resultBox.addEventListener('dblclick', (event) => {
  const input = event.target.closest('.play-input');
  if (!input || input.dataset.orientations.length < 2) return;
  activeDirection = activeDirection === 'H' ? 'V' : 'H';
  markActiveWord(input);
});

resultBox.addEventListener('keydown', (event) => {
  if (!event.target.matches('.play-input')) return;

  if (event.key === 'ArrowRight') activeDirection = 'H';
  if (event.key === 'ArrowDown') activeDirection = 'V';
  if (['ArrowRight', 'ArrowDown'].includes(event.key)) markActiveWord(event.target);

  if (event.key === 'Backspace' && !event.target.value) {
    const wordKey = getActiveWordForInput(event.target);
    const lookup = currentPuzzle ? buildWordLookup(currentPuzzle.placed) : null;
    const word = lookup?.byWord.get(wordKey);
    const currentIndex = word?.cells.indexOf(event.target.dataset.cell) ?? -1;
    const previous = currentIndex > 0 ? getInputByCell(word.cells[currentIndex - 1]) : null;
    if (previous) {
      event.preventDefault();
      previous.value = '';
      previous.focus();
      validateWordFromInput(previous);
      savePlayerState();
    }
  }
});

resultBox.addEventListener('input', (event) => {
  if (!event.target.matches('.play-input')) return;
  clearTransientWordState();
  event.target.value = normalizeWord(event.target.value).slice(0, 1);
  markActiveWord(event.target);
  validateWordFromInput(event.target);
  if (event.target.value) focusNextCell(event.target);
  savePlayerState();
});

renderSavedList();
handleGenerate();
