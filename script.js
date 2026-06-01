const $ = (selector) => document.querySelector(selector);
const escapeSelectorValue = (value) => {
  if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
};
const wordsInput = $('#words');
const wordForm = $('#wordForm');
const wordNameInput = $('#wordName');
const wordDescriptionInput = $('#wordDescription');
const wordBank = $('#wordBank');
const themeLibrary = $('#themeLibrary');
const themeSummary = $('#themeSummary');
const addThemesBtn = $('#addThemesBtn');
const replaceThemesBtn = $('#replaceThemesBtn');
const clearThemesBtn = $('#clearThemesBtn');
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
const PROFILE_KEY = 'manga-grid-quest:profile:v1';
const BASE_ELO = 1000;



const THEME_INDEX_URL = 'data/themes/index.json';
let themeEntries = [];


let selectedThemes = new Set(['Manga', 'Personnage', 'Shonen']);

const examples = [
  [
    ['ONE PIECE', 'Équipage au chapeau de paille'],
    ['DEMON SLAYER', 'Pourfendeurs de démons'],
    ['NARUTO', 'Ninja de Konoha'],
    ['SAKURA', 'Fleur rose japonaise'],
    ['DRAGON BALL', 'Boules de cristal'],
    ['TITAN', 'Géant d’attaque'],
    ['KAWAII', 'Mignon au Japon'],
    ['OTAKU', 'Fan très investi'],
    ['COSPLAY', 'Costume de personnage'],
    ['STUDIO GHIBLI', 'Studio de Miyazaki'],
    ['HERO', 'Personnage principal'],
    ['SHONEN', 'Manga pour jeunes lecteurs']
  ],
  [
    ['MY HERO ACADEMIA', 'Académie de super-héros'],
    ['JUJUTSU KAISEN', 'Exorcistes et fléaux'],
    ['CHAINSAW MAN', 'Démon tronçonneuse'],
    ['SPY FAMILY', 'Famille secrète'],
    ['BLEACH', 'Shinigami remplaçant'],
    ['HUNTER HUNTER', 'Permis de hunter'],
    ['SAILOR MOON', 'Guerrière lunaire'],
    ['AKIRA', 'Classique cyberpunk'],
    ['MANGAKA', 'Auteur de manga'],
    ['SENSEI', 'Maître ou professeur'],
    ['KATANA', 'Sabre japonais'],
    ['MECHA', 'Robot géant']
  ],
  [
    ['ANIME', 'Animation japonaise'],
    ['MANGA', 'BD japonaise'],
    ['SEINEN', 'Manga adulte'],
    ['SHOJO', 'Manga romance'],
    ['SHONEN', 'Manga d’action'],
    ['KODOMO', 'Manga enfant'],
    ['ISEKAI', 'Autre monde'],
    ['TSUNDERE', 'Froid puis tendre'],
    ['OPENING', 'Générique de début'],
    ['ENDING', 'Générique de fin'],
    ['DOUJINSHI', 'Fan manga'],
    ['FAN ART', 'Dessin de fan']
  ]
];

let currentPuzzle = null;
let currentRequestedTotal = 0;
let activeSaveId = null;
let activeDirection = 'H';
let activePage = 'create';
let currentEntries = [];

const MISSION_POOL = [
  { id: 'first-wave', target: 2, title: 'Échauffement', text: 'Trouve 2 mots', reward: 1 },
  { id: 'combo', target: 3, title: 'Combo propre', text: 'Trouve 3 mots', reward: 1 },
  { id: 'half-grid', target: 5, title: 'Œil de sensei', text: 'Trouve 5 mots', reward: 1 },
  { id: 'hunter', target: 7, title: 'Chasseur de cases', text: 'Trouve 7 mots', reward: 2 },
  { id: 'finisher', target: 9, title: 'Arc final', text: 'Trouve 9 mots', reward: 2 }
];


function normalizeWord(word) {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function splitWordEntry(entry) {
  const [name, ...descriptionParts] = entry.split(/\s(?:\||—|–|:)\s/);
  return {
    word: normalizeWord(name || entry),
    description: descriptionParts.join(' ').trim()
  };
}

function parseWordEntries(raw) {
  const seen = new Set();
  return raw
    .split(/[\n;]+/)
    .map((entry) => splitWordEntry(entry.trim()))
    .filter((entry) => entry.word.replace(/\s/g, '').length >= 2)
    .filter((entry) => {
      if (seen.has(entry.word)) return false;
      seen.add(entry.word);
      return true;
    })
    .sort((a, b) => b.word.length - a.word.length);
}

function parseWords(raw) {
  currentEntries = parseWordEntries(raw);
  return currentEntries.map((entry) => entry.word);
}

function serializeWordEntries(entries) {
  return entries
    .map((entry) => `${entry.word}${entry.description ? ` | ${entry.description}` : ''}`)
    .join('\n');
}

function getDescriptionForWord(word) {
  return currentEntries.find((entry) => entry.word === word)?.description || '';
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
    requestedTotal,
    game: result.game || null
  };
}

function deserializePuzzle(snapshot) {
  return {
    board: new Map(snapshot.board.map(([cellKey, cell]) => [cellKey, { letter: cell.letter, orientations: new Set(cell.orientations) }])),
    placed: snapshot.placed || [],
    missing: snapshot.missing || [],
    requestedTotal: snapshot.requestedTotal || (snapshot.placed?.length ?? 0),
    game: snapshot.game || null
  };
}

function getSavedGames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Impossible de lire les sauvegardes locales.', error);
    return [];
  }
}

function setSavedGames(saves) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    return true;
  } catch (error) {
    console.warn('Impossible de sauvegarder localement.', error);
    setStatus('Le navigateur refuse la sauvegarde locale. La grille reste jouable, mais elle ne sera pas conservée.', 'error');
    return false;
  }
}


function getPlayerProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
    return {
      elo: Number.isFinite(parsed.elo) ? parsed.elo : BASE_ELO,
      points: Number.isFinite(parsed.points) ? parsed.points : 0,
      games: Number.isFinite(parsed.games) ? parsed.games : 0,
      wins: Number.isFinite(parsed.wins) ? parsed.wins : 0
    };
  } catch (error) {
    console.warn('Impossible de lire le profil joueur.', error);
    return { elo: BASE_ELO, points: 0, games: 0, wins: 0 };
  }
}

function setPlayerProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('Impossible de sauvegarder le profil joueur.', error);
  }
}

function chooseGameMissions(totalWords) {
  const candidates = MISSION_POOL
    .filter((mission) => mission.target <= totalWords)
    .sort((a, b) => a.target - b.target);
  const fallback = MISSION_POOL.slice(0, 3);
  const source = candidates.length >= 3 ? candidates : fallback;

  return source.slice(0, 3).map((mission) => ({
    ...mission,
    target: Math.min(mission.target, totalWords),
    claimed: false
  }));
}

function getGameState() {
  if (!currentPuzzle) return null;
  if (!currentPuzzle.game) {
    currentPuzzle.game = {
      missions: chooseGameMissions(currentPuzzle.placed.length),
      hintTokens: 0,
      mistakes: 0,
      abandoned: false,
      completed: false,
      awarded: false,
      score: null
    };
  }
  return currentPuzzle.game;
}

function getUnsolvedWords() {
  if (!currentPuzzle) return [];
  const lookup = buildWordLookup(currentPuzzle.placed);
  return [...lookup.byWord.values()].filter((word) => !isWordSolved(word));
}

function updateMissionRewards(solved) {
  const game = getGameState();
  if (!game || game.abandoned || game.completed) return;

  game.missions.forEach((mission) => {
    if (mission.claimed || solved < mission.target) return;
    mission.claimed = true;
    game.hintTokens += mission.reward;
    setGameStatus(`Mission réussie : ${mission.title}. +${mission.reward} bonus lettre !`);
  });
}

function renderBonusPanel(solved, total) {
  const panel = resultBox.querySelector('.bonus-panel');
  if (!panel || !currentPuzzle) return;
  const game = getGameState();
  const unsolvedWords = getUnsolvedWords();
  const options = unsolvedWords.map((word) => `<option value="${escapeHtml(word.id)}">${escapeHtml(word.label)} · ${escapeHtml(getDescriptionForWord(word.word) || 'Mot à trouver')}</option>`).join('');
  const disabled = game.hintTokens <= 0 || !unsolvedWords.length || game.abandoned || game.completed ? 'disabled' : '';

  const missed = game.score?.missedWords?.length
    ? `<p class="missed-line">Mots révélés après abandon : ${game.score.missedWords.map((word) => escapeHtml(word)).join(', ')}</p>`
    : '';

  panel.innerHTML = `
    <div class="bonus-head">
      <div>
        <h2>Bonus de quête</h2>
        <p>3 missions par partie. Chaque mission donne des révélations de lettre à utiliser sur le mot de ton choix.</p>
      </div>
      <strong>${game.hintTokens} bonus</strong>
    </div>
    <div class="missions">
      ${game.missions.map((mission) => `
        <article class="mission${mission.claimed ? ' is-done' : ''}">
          <span>${mission.claimed ? '✓' : `${Math.min(solved, mission.target)}/${mission.target}`}</span>
          <div><strong>${escapeHtml(mission.title)}</strong><small>${escapeHtml(mission.text)} · +${mission.reward} lettre${mission.reward > 1 ? 's' : ''}</small></div>
        </article>
      `).join('')}
    </div>
    <div class="bonus-actions">
      <select class="bonus-word" ${disabled} aria-label="Mot à aider">${options || '<option>Aucun mot disponible</option>'}</select>
      <button class="tiny use-bonus" type="button" ${disabled}>Révéler une lettre</button>
      <button class="tiny danger surrender-game" type="button" ${game.abandoned || game.completed ? 'disabled' : ''}>Abandonner</button>
    </div>
    ${game.score ? `<p class="score-line">Score : ${game.score.points} pts · ELO ${game.score.oldElo} → ${game.score.newElo} (${game.score.delta >= 0 ? '+' : ''}${game.score.delta})</p>` : ''}
    ${missed}
  `;
}

function revealLetterInWord(wordId) {
  if (!currentPuzzle) return;
  const game = getGameState();
  if (!game || game.hintTokens <= 0 || game.abandoned || game.completed) return;

  const lookup = buildWordLookup(currentPuzzle.placed);
  const word = lookup.byWord.get(wordId);
  if (!word) return;
  const hiddenCells = word.cells.filter((cellKey) => {
    const input = getInputByCell(cellKey);
    return input && !input.disabled && input.value !== input.dataset.answer;
  });
  if (!hiddenCells.length) {
    setGameStatus('Ce mot est déjà complet : choisis un autre mot pour utiliser le bonus.');
    return;
  }

  const cellKey = hiddenCells[Math.floor(Math.random() * hiddenCells.length)];
  const input = getInputByCell(cellKey);
  input.value = input.dataset.answer;
  input.classList.remove('is-pending', 'is-wrong');
  game.hintTokens -= 1;
  setGameStatus(`Bonus utilisé sur le mot ${word.label} : une lettre est révélée.`);
  refreshSolvedWords();
  savePlayerState();
}

function awardEndGame(abandoned = false) {
  const game = getGameState();
  if (!game || game.awarded || !currentPuzzle) return;

  const lookup = buildWordLookup(currentPuzzle.placed);
  const words = [...lookup.byWord.values()];
  const solved = words.filter(isWordSolved).length;
  const missedWords = words.filter((word) => !isWordSolved(word)).map((word) => word.word);
  const total = lookup.byWord.size || 1;
  const completion = solved / total;
  const basePoints = Math.round(solved * 100 + completion * 300 - game.mistakes * 12 - (abandoned ? 150 : 0));
  const points = Math.max(0, basePoints);
  const expected = 0.5;
  const resultScore = abandoned ? Math.min(0.45, completion * 0.65) : completion;
  const delta = Math.round(32 * (resultScore - expected));
  const profile = getPlayerProfile();
  const oldElo = profile.elo;
  const newElo = Math.max(100, oldElo + delta);

  profile.elo = newElo;
  profile.points += points;
  profile.games += 1;
  if (!abandoned && solved === total) profile.wins += 1;
  setPlayerProfile(profile);

  game.awarded = true;
  game.completed = !abandoned && solved === total;
  game.abandoned = abandoned;
  game.score = { points, oldElo, newElo, delta, totalPoints: profile.points, games: profile.games, wins: profile.wins, missedWords };
  savePlayerState();
}

function finishGameIfNeeded(solved, total) {
  if (!total || solved !== total) return;
  const game = getGameState();
  if (!game || game.abandoned || game.completed) return;
  awardEndGame(false);
  setGameStatus(`Partie terminée ! +${game.score.points} pts · ELO ${game.score.oldElo} → ${game.score.newElo}.`);
}

function surrenderGame() {
  if (!currentPuzzle) return;
  const game = getGameState();
  if (!game || game.abandoned || game.completed) return;
  const lookup = buildWordLookup(currentPuzzle.placed);
  awardEndGame(true);

  lookup.byWord.forEach((word) => {
    const solvedBeforeReveal = isWordSolved(word);
    word.cells.forEach((cellKey) => {
      const input = getInputByCell(cellKey);
      if (!input) return;
      input.value = input.dataset.answer;
      input.disabled = true;
      input.classList.add('is-correct');
      input.closest('.cell')?.classList.add(solvedBeforeReveal ? 'is-solved' : 'is-revealed');
    });
  });

  updateProgress(lookup.byWord.size, lookup.byWord.size);
  savePlayerState();
  renderBonusPanel(lookup.byWord.size, lookup.byWord.size);
  setGameStatus(`Abandon : la grille est révélée. +${game.score.points} pts · ELO ${game.score.oldElo} → ${game.score.newElo}.`);
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
  return resultBox.querySelector(`.play-input[data-cell="${escapeSelectorValue(cellKey)}"]`);
}

function getActiveWordForInput(input) {
  if (!input) return null;
  const memberships = (input.dataset.words || '').split('|').filter(Boolean);
  if (!memberships.length) return null;

  return memberships.find((id) => id.endsWith(`-${activeDirection}`)) || memberships[0];
}

function focusAdjacentCell(input, direction = 1) {
  const wordKey = getActiveWordForInput(input);
  if (!wordKey || !currentPuzzle) return;

  const lookup = buildWordLookup(currentPuzzle.placed);
  const word = lookup.byWord.get(wordKey);
  if (!word) return;

  const currentIndex = word.cells.indexOf(input.dataset.cell);
  const candidates = direction > 0 ? word.cells.slice(currentIndex + 1) : word.cells.slice(0, currentIndex).reverse();
  const nextCell = candidates.find((cellKey) => {
    const nextInput = getInputByCell(cellKey);
    return nextInput && !nextInput.disabled;
  });

  if (nextCell) getInputByCell(nextCell)?.focus();
}

function focusNextCell(input) {
  focusAdjacentCell(input, 1);
}

function clearGameAnswers() {
  const game = getGameState();
  if (game) {
    game.hintTokens = 0;
    game.mistakes = 0;
    game.abandoned = false;
    game.completed = false;
    game.awarded = false;
    game.score = null;
    game.missions = chooseGameMissions(currentPuzzle?.placed.length || 0);
  }
  resultBox.querySelectorAll('.play-input').forEach((input) => {
    input.value = '';
    input.disabled = false;
    input.classList.remove('is-pending', 'is-correct', 'is-wrong');
  });
  resultBox.querySelectorAll('.cell.is-current, .cell.is-solved, .cell.is-word-wrong').forEach((cell) => {
    cell.classList.remove('is-current', 'is-solved', 'is-word-wrong');
  });
  updateProgress(0, currentPuzzle?.placed.length || 0);
  renderBonusPanel(0, currentPuzzle?.placed.length || 0);
  setGameStatus('Réponses effacées : la quête repart de zéro.');
  savePlayerState();
  resultBox.querySelector('.play-input')?.focus();
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
  updateMissionRewards(solved);
  finishGameIfNeeded(solved, lookup.byWord.size);
  renderBonusPanel(solved, lookup.byWord.size);
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
    const game = getGameState();
    setGameStatus(solved === total && game?.score
      ? `Bravo, tous les mots sont validés ! +${game.score.points} pts · ELO ${game.score.oldElo} → ${game.score.newElo}.`
      : `Mot ${word.label} validé. Continue la quête !`);
    return;
  }

  const game = getGameState();
  if (game && !game.abandoned && !game.completed) game.mistakes += 1;

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
  if (!setSavedGames(saves)) return;
  renderSavedList();
}

function render(result, requestedTotal, playerState = {}) {
  if (!result || !result.placed.length) {
    currentPuzzle = null;
    currentRequestedTotal = 0;
    resultBox.innerHTML = '';
    setStatus('Impossible de créer une grille avec ces mots. Ajoute des mots qui partagent plus de lettres.', 'error');
    return;
  }

  currentPuzzle = result;
  currentRequestedTotal = requestedTotal;
  getGameState();

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
  const listItem = (item) => {
    const description = getDescriptionForWord(item.word);
    const label = hideLetters ? (description || 'Mot à trouver') : `${item.word}${description ? ` — ${description}` : ''}`;
    return `<li><strong>${item.number}.</strong> ${escapeHtml(label)}</li>`;
  };

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
        <div>
          <div class="game-status">Tape un mot en entier : il devient vert seulement s’il est juste, sinon il s’efface.</div>
          <div class="play-actions">
            <button class="tiny reset-game" type="button">Effacer les réponses</button>
          </div>
        </div>
        <div class="game-progress" style="--progress: 0%"><span></span><strong>0/${placed.length}</strong></div>
      </section>
    ` : ''}
    ${hideLetters ? '<section class="bonus-panel" aria-label="Missions et bonus"></section>' : ''}
    <div class="board-wrap">
      <div class="crossword" style="grid-template-columns: repeat(${cols}, var(--cell-size));">${cells}</div>
    </div>
    ${hideLetters ? '<p class="play-hint">Mode jeu : la saisie avance toute seule dans le mot. Double-clique une intersection pour changer de direction.</p>' : ''}
    <div class="word-lists">
      <article class="word-card"><h2>Horizontaux</h2><ol>${horizontal.map(listItem).join('') || '<li>Aucun</li>'}</ol></article>
      <article class="word-card"><h2>Verticaux</h2><ol>${vertical.map(listItem).join('') || '<li>Aucun</li>'}</ol></article>
      ${missing.length ? `<article class="word-card"><h2>Non placés</h2><ul>${missing.map((item) => `<li>${escapeHtml(getDescriptionForWord(item.word) || item.word)} (${item.orientation === 'H' ? 'H' : 'V'})</li>`).join('')}</ul></article>` : ''}
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
  statusBox.innerHTML = `<div class="message ${type}">${escapeHtml(message)}</div>`;
}

function handleGenerate() {
  const words = parseWords(wordsInput.value);
  const horizontalCount = Number(horizontalInput.value);
  const verticalCount = Number(verticalInput.value);
  const requestedTotal = horizontalCount + verticalCount;

  if (!Number.isInteger(horizontalCount) || !Number.isInteger(verticalCount) || horizontalCount < 0 || verticalCount < 0) {
    currentPuzzle = null;
    resultBox.innerHTML = '';
    setStatus('Choisis un nombre horizontal et vertical valide.', 'error');
    return;
  }
  if (requestedTotal === 0) {
    currentPuzzle = null;
    resultBox.innerHTML = '';
    setStatus('Demande au moins un mot horizontal ou vertical.', 'error');
    return;
  }
  if (words.length < requestedTotal) {
    currentPuzzle = null;
    resultBox.innerHTML = '';
    setStatus(`Il faut ${requestedTotal} mots différents, mais seulement ${words.length} sont valides.`, 'error');
    return;
  }

  activeSaveId = null;
  const result = generateCrossword(words, horizontalCount, verticalCount, randomizeInput.checked);
  if (result) {
    result.game = {
      missions: chooseGameMissions(result.placed.length),
      hintTokens: 0,
      mistakes: 0,
      abandoned: false,
      completed: false,
      awarded: false,
      score: null
    };
  }
  render(result, requestedTotal);
  renderSavedList();
  showPage('play');
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
    entries: currentEntries,
    selectedThemes: [...selectedThemes],
    horizontalCount: Number(horizontalInput.value),
    verticalCount: Number(verticalInput.value),
    hideLetters: hideLettersInput.checked,
    randomize: randomizeInput.checked,
    puzzle: serializePuzzle(currentPuzzle, currentRequestedTotal),
    player: collectPlayerState()
  };

  const nextSaves = [save, ...saves.filter((item) => item.id !== save.id)].slice(0, 20);
  activeSaveId = save.id;
  if (!setSavedGames(nextSaves)) return;
  renderSavedList();
  setStatus('Grille sauvegardée.', 'success');
}

function loadSavedGrid(id) {
  const save = getSavedGames().find((item) => item.id === id);
  if (!save) return;
  const puzzle = deserializePuzzle(save.puzzle);
  activeSaveId = save.id;
  wordsInput.value = save.words || serializeWordEntries(save.entries || []);
  currentEntries = parseWordEntries(wordsInput.value);
  if (Array.isArray(save.selectedThemes)) selectedThemes = new Set(save.selectedThemes);
  renderThemeLibrary();
  renderWordBank();
  horizontalInput.value = save.horizontalCount ?? 0;
  verticalInput.value = save.verticalCount ?? 0;
  hideLettersInput.checked = Boolean(save.hideLetters);
  randomizeInput.checked = Boolean(save.randomize);
  render(puzzle, puzzle.requestedTotal, save.player || {});
  renderSavedList();
  showPage('play');
  setStatus('Sauvegarde chargée.', 'success');
}

function deleteSavedGrid(id) {
  const nextSaves = getSavedGames().filter((item) => item.id !== id);
  if (activeSaveId === id) activeSaveId = null;
  if (!setSavedGames(nextSaves)) return;
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
        <button class="tiny load-save" data-id="${save.id}">Jouer</button>
        <button class="tiny danger delete-save" data-id="${save.id}" aria-label="Supprimer ${escapeHtml(save.name)}">×</button>
      </div>
    </article>
  `).join('');
}


function showPage(page) {
  activePage = page;
  document.querySelectorAll('[data-page]').forEach((section) => {
    section.classList.toggle('is-active', section.dataset.page === page);
  });
  document.querySelectorAll('[data-page-link]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.pageLink === page);
  });
  if (window.location.hash !== `#${page}`) window.history.replaceState(null, '', `#${page}`);
}


async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Chargement impossible (${response.status}) pour ${url}`);
  return response.json();
}

function resolveThemeFileUrl(fileName) {
  return new URL(fileName, new URL(THEME_INDEX_URL, window.location.href)).toString();
}

async function loadThemeEntries() {
  try {
    const index = await fetchJson(THEME_INDEX_URL);
    const themes = Array.isArray(index.themes) ? index.themes : [];
    const themeFiles = await Promise.all(themes.map(async (themeInfo) => {
      const themeName = typeof themeInfo === 'string' ? themeInfo : themeInfo.name;
      const fileName = typeof themeInfo === 'string' ? `${themeInfo}.json` : themeInfo.file;
      const data = await fetchJson(resolveThemeFileUrl(fileName));
      return {
        theme: data.theme || themeName,
        words: Array.isArray(data.words) ? data.words : []
      };
    }));

    const byWord = new Map();
    themeFiles.forEach(({ theme, words }) => {
      words.forEach((entry) => {
        const normalized = normalizeWord(entry.word);
        if (normalized.replace(/\s/g, '').length < 2) return;
        const existing = byWord.get(normalized) || {
          word: normalized,
          description: entry.description || '',
          themes: []
        };
        if (!existing.description && entry.description) existing.description = entry.description;
        if (!existing.themes.includes(theme)) existing.themes.push(theme);
        byWord.set(normalized, existing);
      });
    });

    themeEntries = [...byWord.values()].sort((a, b) => a.word.localeCompare(b.word, 'fr'));
  } catch (error) {
    console.warn('Impossible de charger les thèmes.', error);
    themeEntries = [];
    setStatus('La bibliothèque de thèmes est indisponible. Lance un serveur local pour charger les fichiers JSON.', 'error');
  }
}

function getThemeNames() {
  return [...new Set(themeEntries.flatMap((entry) => entry.themes))].sort((a, b) => a.localeCompare(b, 'fr'));
}

function getEntriesForThemes(themes) {
  const selected = new Set(themes);
  const byWord = new Map();

  themeEntries.forEach((entry) => {
    if (!entry.themes.some((theme) => selected.has(theme))) return;
    const normalized = normalizeWord(entry.word);
    const previous = byWord.get(normalized);
    const themeList = entry.themes.filter((theme) => selected.has(theme));
    const description = `${entry.description} [${themeList.join(', ')}]`;

    byWord.set(normalized, {
      word: normalized,
      description: previous ? previous.description : description
    });
  });

  return [...byWord.values()].sort((a, b) => a.word.localeCompare(b.word, 'fr'));
}

function mergeWordEntries(existingEntries, incomingEntries) {
  const byWord = new Map(existingEntries.map((entry) => [entry.word, entry]));

  incomingEntries.forEach((entry) => {
    const normalized = normalizeWord(entry.word);
    const existing = byWord.get(normalized);
    byWord.set(normalized, {
      word: normalized,
      description: existing?.description || entry.description
    });
  });

  return [...byWord.values()].sort((a, b) => a.word.localeCompare(b.word, 'fr'));
}

function updateThemeSummary() {
  const entries = getEntriesForThemes(selectedThemes);
  const themeLabel = selectedThemes.size > 1 ? 'thèmes' : 'thème';
  const wordLabel = entries.length > 1 ? 'mots uniques' : 'mot unique';
  themeSummary.textContent = `${selectedThemes.size} ${themeLabel} · ${entries.length} ${wordLabel}`;
  addThemesBtn.disabled = selectedThemes.size === 0 || themeEntries.length === 0;
  replaceThemesBtn.disabled = selectedThemes.size === 0 || themeEntries.length === 0;
  clearThemesBtn.disabled = selectedThemes.size === 0;
}

function renderThemeLibrary() {
  const names = getThemeNames();
  if (!names.length) {
    themeLibrary.innerHTML = '<p class="empty-save">Aucun thème chargé.</p>';
    updateThemeSummary();
    return;
  }

  themeLibrary.innerHTML = names.map((theme) => {
    const count = themeEntries.filter((entry) => entry.themes.includes(theme)).length;
    const checked = selectedThemes.has(theme) ? ' checked' : '';
    return `
      <label class="theme-card">
        <input type="checkbox" value="${escapeHtml(theme)}"${checked} />
        <span>
          <strong>${escapeHtml(theme)}</strong>
          <small>${count} mot${count > 1 ? 's' : ''}</small>
        </span>
      </label>
    `;
  }).join('');
  updateThemeSummary();
}

function applySelectedThemes({ replace = false } = {}) {
  const incoming = getEntriesForThemes(selectedThemes);
  if (!incoming.length) {
    setStatus('Choisis au moins un thème à ajouter.', 'error');
    return;
  }

  const entries = replace ? incoming : mergeWordEntries(parseWordEntries(wordsInput.value), incoming);
  wordsInput.value = serializeWordEntries(entries);
  renderWordBank();
  setStatus(`${incoming.length} mots de thème ${replace ? 'chargés' : 'ajoutés'} dans la grille.`, 'success');
}

function renderWordBank() {
  currentEntries = parseWordEntries(wordsInput.value);
  wordsInput.value = serializeWordEntries(currentEntries);

  if (!currentEntries.length) {
    wordBank.innerHTML = '<p class="empty-save">Aucun mot.</p>';
    return;
  }

  wordBank.innerHTML = currentEntries.map((entry) => `
    <article class="word-chip">
      <div>
        <strong>${escapeHtml(entry.word)}</strong>
        <span>${escapeHtml(entry.description || 'Sans description')}</span>
      </div>
      <button class="tiny danger remove-word" type="button" data-word="${escapeHtml(entry.word)}" aria-label="Supprimer ${escapeHtml(entry.word)}">×</button>
    </article>
  `).join('');
}

function addWordEntry(word, description) {
  const normalized = normalizeWord(word);
  if (normalized.replace(/\s/g, '').length < 2) {
    setStatus('Mot invalide.', 'error');
    return;
  }

  const entries = parseWordEntries(wordsInput.value).filter((entry) => entry.word !== normalized);
  entries.push({ word: normalized, description: description.trim() });
  wordsInput.value = serializeWordEntries(entries);
  renderWordBank();
  wordNameInput.value = '';
  wordDescriptionInput.value = '';
  wordNameInput.focus();
}

function removeWordEntry(word) {
  const entries = parseWordEntries(wordsInput.value).filter((entry) => entry.word !== word);
  wordsInput.value = serializeWordEntries(entries);
  renderWordBank();
}

document.querySelectorAll('[data-page-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    showPage(link.dataset.pageLink);
  });
});

wordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addWordEntry(wordNameInput.value, wordDescriptionInput.value);
});

themeLibrary.addEventListener('change', (event) => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  if (event.target.checked) selectedThemes.add(event.target.value);
  else selectedThemes.delete(event.target.value);
  updateThemeSummary();
});

addThemesBtn.addEventListener('click', () => applySelectedThemes());
replaceThemesBtn.addEventListener('click', () => applySelectedThemes({ replace: true }));
clearThemesBtn.addEventListener('click', () => {
  selectedThemes.clear();
  renderThemeLibrary();
});

wordBank.addEventListener('click', (event) => {
  const removeButton = event.target.closest('.remove-word');
  if (removeButton) removeWordEntry(removeButton.dataset.word);
});

$('#generateBtn').addEventListener('click', handleGenerate);
$('#printBtn').addEventListener('click', () => window.print());
$('#exampleBtn').addEventListener('click', () => {
  const example = examples[Math.floor(Math.random() * examples.length)];
  wordsInput.value = serializeWordEntries(example.map(([word, description]) => ({ word, description })));
  renderWordBank();
  horizontalInput.value = 5;
  verticalInput.value = 5;
  handleGenerate();
});
hideLettersInput.addEventListener('change', () => rerenderCurrent());
saveBtn.addEventListener('click', saveCurrentGrid);
clearSavesBtn.addEventListener('click', () => {
  if (!setSavedGames([])) return;
  activeSaveId = null;
  renderSavedList();
});
resultBox.addEventListener('click', (event) => {
  if (event.target.closest('.reset-game')) clearGameAnswers();
  if (event.target.closest('.use-bonus')) {
    const selectedWord = resultBox.querySelector('.bonus-word')?.value;
    if (selectedWord) revealLetterInWord(selectedWord);
  }
  if (event.target.closest('.surrender-game')) surrenderGame();
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

  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') activeDirection = 'H';
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') activeDirection = 'V';
  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    markActiveWord(event.target);
    focusAdjacentCell(event.target, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
  }

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

async function initializeApp() {
  await loadThemeEntries();
  renderThemeLibrary();
  renderWordBank();
  renderSavedList();
  handleGenerate();
  showPage((window.location.hash || '#create').replace('#', '') || 'create');
}

initializeApp();
