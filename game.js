const WORDS_API_PATH = "./api/words";
const WORDS_FILE_PATH = "./data/words.csv";
const PAIRS_PER_ROUND = 10;
const FLIP_BACK_DELAY_MS = 950;
const ROUND_RESET_DELAY_MS = 1400;

const boardElement = document.querySelector("#game-board");
const roundLabelElement = document.querySelector("#round-label");
const matchesLabelElement = document.querySelector("#matches-label");
const newGameButton = document.querySelector("#new-game-button");
const loadGamesButton = document.querySelector("#load-games-button");
const editWordlistButton = document.querySelector("#edit-wordlist-button");
const wordlistEditorElement = document.querySelector("#wordlist-editor");
const wordlistEditorTextareaElement = document.querySelector("#wordlist-editor-textarea");
const editorMessageElement = document.querySelector("#editor-message");
const closeEditorButton = document.querySelector("#close-editor-button");
const saveWordlistButton = document.querySelector("#save-wordlist-button");
const gameStatusElement = document.querySelector("#game-status");
const gameSourceLabelElement = document.querySelector("#game-source-label");
const gamesModalElement = document.querySelector("#games-modal");
const gamesListElement = document.querySelector("#games-list");
const closeGamesButton = document.querySelector("#close-games-button");

const GAME_SOURCES = [
  {
    id: "local",
    name: "My Wordlist",
    path: WORDS_FILE_PATH,
    type: "local",
  },
  {
    id: "aseet-ja-ammukset",
    name: "Aseet ja ammukset",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/aseet-ja-ammukset.csv",
    type: "remote",
  },
  {
    id: "kalusto-ja-alustat",
    name: "Kalusto ja alustat",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/kalusto-ja-alustat.csv",
    type: "remote",
  },
  {
    id: "koulutus-ja-tehtavat",
    name: "Koulutus ja tehtavat",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/koulutus-ja-tehtavat.csv",
    type: "remote",
  },
  {
    id: "maasto-ja-linnoitteet",
    name: "Maasto ja linnoitteet",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/maasto-ja-linnoitteet.csv",
    type: "remote",
  },
  {
    id: "organisaatiorakenne",
    name: "Organisaatiorakenne",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/organisaatiorakenne.csv",
    type: "remote",
  },
  {
    id: "sotilasarvot",
    name: "Sotilasarvot",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/sotilasarvot.csv",
    type: "remote",
  },
  {
    id: "taistelu-ja-taktiikka",
    name: "Taistelu ja taktiikka",
    path: "https://raw.githubusercontent.com/datadruidi/sotilasvenajan-villapaitapeli/refs/heads/main/public/data/taistelu-ja-taktiikka.csv",
    type: "remote",
  },
];

const state = {
  cards: [],
  revealedCardIds: [],
  solvedPairIds: new Set(),
  roundNumber: 0,
  isBusy: false,
  hasRoundFinished: false,
  pendingRoundResetId: null,
  isEditorOpen: false,
  isSavingWordlist: false,
  hasBoardError: false,
  isGamesModalOpen: false,
  selectedGameSourceId: "local",
};

document.addEventListener("DOMContentLoaded", () => {
  newGameButton.addEventListener("click", () => {
    void startNewRound({ manual: true });
  });
  loadGamesButton.addEventListener("click", openGamesModal);
  editWordlistButton.addEventListener("click", () => {
    void openWordlistEditor();
  });
  closeEditorButton.addEventListener("click", closeWordlistEditor);
  closeGamesButton.addEventListener("click", closeGamesModal);
  saveWordlistButton.addEventListener("click", () => {
    void saveWordlist();
  });
  gamesModalElement.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeGamesModal === "true") {
      closeGamesModal();
    }
  });

  renderGamesList();
  updateSourceLabel();

  void initializeGame();
});

async function initializeGame() {
  setLoadingState("Loading vocabulary...");
  toggleGameButtons(true);

  try {
    await startNewRound({ manual: false });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unable to load vocabulary.");
    renderBoard([]);
    toggleGameButtons(false);
  }
}

async function startNewRound({ manual }) {
  if (state.isBusy && !state.hasRoundFinished) {
    return;
  }

  try {
    cancelPendingRoundReset();
    clearError();
    setLoadingState(manual ? "Starting a fresh round..." : "Preparing round...");
    toggleGameButtons(true);
    state.isBusy = true;
    const vocabulary = await loadVocabulary();
    validateVocabularySize(vocabulary);

    const selectedPairs = chooseRandomPairs(vocabulary, PAIRS_PER_ROUND);
    state.roundNumber += 1;
    state.cards = buildCardsFromPairs(selectedPairs);
    state.revealedCardIds = [];
    state.solvedPairIds = new Set();
    state.hasRoundFinished = false;
    state.isBusy = false;

    updateRoundLabels();
    renderBoard(state.cards);
    toggleGameButtons(false);
  } catch (error) {
    state.isBusy = false;
    showError(error instanceof Error ? error.message : "Unable to start a new round.");
    renderBoard([]);
    toggleGameButtons(false);
  }
}

async function loadVocabulary() {
  const rawText = await loadVocabularyFileText();
  const selectedSource = getSelectedGameSource();
  return parseVocabularyCsv(rawText, { skipFirstRow: selectedSource.type === "remote" });
}

async function loadVocabularyFileText() {
  const selectedSource = getSelectedGameSource();

  if (selectedSource.type === "remote") {
    const remoteResponse = await fetch(selectedSource.path, { cache: "no-store" });

    if (!remoteResponse.ok) {
      throw new Error(`Could not load "${selectedSource.name}" (${remoteResponse.status} ${remoteResponse.statusText}).`);
    }

    return remoteResponse.text();
  }

  const apiResponse = await fetch(WORDS_API_PATH, { cache: "no-store" });

  if (apiResponse.ok) {
    return apiResponse.text();
  }

  const fileResponse = await fetch(WORDS_FILE_PATH, { cache: "no-store" });

  if (fileResponse.ok) {
    return fileResponse.text();
  }

  throw new Error(`Could not load the word file (${apiResponse.status} ${apiResponse.statusText}).`);
}

function validateVocabularySize(vocabulary) {
  if (vocabulary.length < PAIRS_PER_ROUND) {
    throw new Error(
      `The word file needs at least ${PAIRS_PER_ROUND} valid pairs, but only ${vocabulary.length} were found.`
    );
  }
}

function chooseRandomPairs(pairs, count) {
  const shuffledPairs = shuffle([...pairs]);
  return shuffledPairs.slice(0, count);
}

function buildCardsFromPairs(pairs) {
  const cards = pairs.flatMap((pair) => [
    createCard(pair, "languageOne", pair.languageOne),
    createCard(pair, "languageTwo", pair.languageTwo),
  ]);

  return shuffle(cards);
}

function createCard(pair, side, word) {
  return {
    id: `${pair.id}-${side}`,
    pairId: pair.id,
    side,
    word,
    isRevealed: false,
    isMatched: false,
  };
}

function shuffle(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function renderBoard(cards) {
  boardElement.innerHTML = "";
  boardElement.classList.toggle("is-loading", cards.length === 0 && !state.hasBoardError);
  boardElement.classList.toggle("is-empty", cards.length === 0);

  if (!cards.length) {
    return;
  }

  state.hasBoardError = false;
  clearError();
  boardElement.classList.remove("is-loading", "is-empty");

  cards.forEach((card) => {
    const cardButton = document.createElement("button");
    cardButton.type = "button";
    cardButton.className = `memory-card${card.isRevealed ? " is-revealed" : ""}${card.isMatched ? " is-matched" : ""}`;
    cardButton.setAttribute("role", "gridcell");
    cardButton.setAttribute("aria-label", card.isRevealed ? card.word : "Hidden card");
    cardButton.disabled = state.isBusy || card.isMatched;
    cardButton.dataset.cardId = card.id;

    cardButton.innerHTML = `
      <span class="memory-card-inner">
        <span class="memory-card-face memory-card-back" aria-hidden="true">?</span>
        <span class="memory-card-face memory-card-front">
          <span class="word-text">${escapeHtml(card.word)}</span>
        </span>
      </span>
    `;

    cardButton.addEventListener("click", () => {
      void handleCardSelection(card.id);
    });

    boardElement.appendChild(cardButton);
  });
}

async function handleCardSelection(cardId) {
  if (state.isBusy) {
    return;
  }

  const selectedCard = state.cards.find((card) => card.id === cardId);

  if (!selectedCard || selectedCard.isMatched || selectedCard.isRevealed) {
    return;
  }

  if (state.revealedCardIds.length === 2) {
    hideUnmatchedRevealedCards();
  }

  selectedCard.isRevealed = true;
  state.revealedCardIds.push(cardId);
  renderBoard(state.cards);

  if (state.revealedCardIds.length === 1) {
    return;
  }

  if (state.revealedCardIds.length !== 2) {
    return;
  }

  state.isBusy = true;
  renderBoard(state.cards);

  const [firstCard, secondCard] = state.revealedCardIds.map((id) =>
    state.cards.find((card) => card.id === id)
  );

  const isMatch =
    firstCard &&
    secondCard &&
    firstCard.pairId === secondCard.pairId &&
    firstCard.side !== secondCard.side;

  if (isMatch) {
    firstCard.isMatched = true;
    secondCard.isMatched = true;
    state.solvedPairIds.add(firstCard.pairId);
    state.revealedCardIds = [];
    state.isBusy = false;
    updateRoundLabels();
    renderBoard(state.cards);

    if (state.solvedPairIds.size === PAIRS_PER_ROUND) {
      await finishRound();
    }

    return;
  }

  state.isBusy = false;
  renderBoard(state.cards);
}

function hideUnmatchedRevealedCards() {
  state.cards.forEach((card) => {
    if (state.revealedCardIds.includes(card.id) && !card.isMatched) {
      card.isRevealed = false;
    }
  });

  state.revealedCardIds = [];
}

async function finishRound() {
  state.hasRoundFinished = true;
  state.isBusy = true;
  toggleGameButtons(true);
  updateRoundLabels();
  renderBoard(state.cards);
  state.pendingRoundResetId = window.setTimeout(() => {
    state.pendingRoundResetId = null;
    state.isBusy = false;
    toggleGameButtons(false);
    void startNewRound({ manual: false });
  }, ROUND_RESET_DELAY_MS);
}

function cancelPendingRoundReset() {
  if (state.pendingRoundResetId !== null) {
    window.clearTimeout(state.pendingRoundResetId);
    state.pendingRoundResetId = null;
  }
}

function updateRoundLabels() {
  roundLabelElement.textContent = `Round ${state.roundNumber}`;
  matchesLabelElement.textContent = `${state.solvedPairIds.size} / ${PAIRS_PER_ROUND} matches`;
}

function setLoadingState(message) {
  state.hasBoardError = false;
  boardElement.innerHTML = "";
  boardElement.classList.add("is-loading");
  setStatus(message);
}

function setStatus(message, isSuccess = false) {
  gameStatusElement.textContent = message;
  gameStatusElement.classList.toggle("is-error", Boolean(message) && !isSuccess);
  gameStatusElement.classList.toggle("is-success", Boolean(message) && isSuccess);
}

function showError(message) {
  console.error(message);
  state.hasBoardError = true;
  setStatus(message);
  boardElement.classList.remove("is-loading");
  boardElement.classList.add("is-empty");
}

function clearError() {
  setStatus("", true);
}

function toggleGameButtons(disabled) {
  newGameButton.disabled = disabled;
  loadGamesButton.disabled = disabled || state.isSavingWordlist;
  editWordlistButton.disabled = disabled || state.isSavingWordlist;
}

function openGamesModal() {
  if (state.isSavingWordlist) {
    return;
  }

  state.isGamesModalOpen = true;
  gamesModalElement.hidden = false;
}

function closeGamesModal() {
  state.isGamesModalOpen = false;
  gamesModalElement.hidden = true;
}

function renderGamesList() {
  gamesListElement.innerHTML = "";

  GAME_SOURCES.filter((source) => source.type === "remote").forEach((source) => {
    const buttonElement = document.createElement("button");
    buttonElement.type = "button";
    buttonElement.className = "game-option-button";
    buttonElement.textContent = source.name;
    buttonElement.addEventListener("click", () => {
      void selectGameSource(source.id);
    });
    gamesListElement.appendChild(buttonElement);
  });
}

async function selectGameSource(sourceId) {
  state.selectedGameSourceId = sourceId;
  updateSourceLabel();
  closeGamesModal();
  await startNewRound({ manual: true });
}

function updateSourceLabel() {
  const selectedSource = getSelectedGameSource();
  gameSourceLabelElement.textContent = `Current list: ${selectedSource.name}`;
}

function getSelectedGameSource() {
  return GAME_SOURCES.find((source) => source.id === state.selectedGameSourceId) || GAME_SOURCES[0];
}

async function openWordlistEditor() {
  if (state.isSavingWordlist) {
    return;
  }

  try {
    editWordlistButton.disabled = true;
    clearError();
    state.selectedGameSourceId = "local";
    updateSourceLabel();
    const csvText = await loadVocabularyFileText();

    state.isEditorOpen = true;
    wordlistEditorElement.hidden = false;
    wordlistEditorTextareaElement.value = csvText;
    setEditorMessage("");
    wordlistEditorElement.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setEditorMessage(error instanceof Error ? error.message : "Unable to open the wordlist editor.", true);
    showError(error instanceof Error ? error.message : "Unable to open the wordlist editor.");
  } finally {
    toggleGameButtons(state.isBusy);
  }
}

function closeWordlistEditor() {
  state.isEditorOpen = false;
  wordlistEditorElement.hidden = true;
  wordlistEditorTextareaElement.value = "";
  setEditorMessage("");
  toggleGameButtons(state.isBusy);
}

async function saveWordlist() {
  const csvText = wordlistEditorTextareaElement.value.replace(/\r\n/g, "\n");
  const parsedRows = parseVocabularyCsv(csvText);

  try {
    state.isSavingWordlist = true;
    toggleGameButtons(true);
    saveWordlistButton.disabled = true;
    closeWordlistButtonState(true);
    setEditorMessage("Saving word file...");

    const response = await fetch(WORDS_API_PATH, {
      method: "PUT",
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
      },
      body: csvText,
    });

    if (!response.ok) {
      if ([404, 405, 501].includes(response.status)) {
        throw new Error(
          "Saving needs the included Node server. Start it with `node server.js` and open http://localhost:8000."
        );
      }
      throw new Error(`Could not save the word file (${response.status} ${response.statusText}).`);
    }

    if (parsedRows.length >= PAIRS_PER_ROUND) {
      setEditorMessage("Word file saved. New games will read it live from disk.");
    } else {
      setEditorMessage(
        `Word file saved. It currently has ${parsedRows.length} valid pairs, so the game needs at least ${PAIRS_PER_ROUND} before a round can start.`,
        true
      );
    }
  } catch (error) {
    setEditorMessage(error instanceof Error ? error.message : "Unable to save the wordlist.", true);
  } finally {
    state.isSavingWordlist = false;
    saveWordlistButton.disabled = false;
    closeWordlistButtonState(false);
    toggleGameButtons(state.isBusy);
  }
}

function closeWordlistButtonState(disabled) {
  closeEditorButton.disabled = disabled;
}

function setEditorMessage(message, isError = false) {
  editorMessageElement.textContent = message;
  editorMessageElement.classList.toggle("is-error", isError);
  editorMessageElement.classList.toggle("is-success", Boolean(message) && !isError);
}

function parseVocabularyCsv(rawText, options = {}) {
  const { skipFirstRow = false } = options;
  const rows = parseCsvRows(rawText);
  const firstRowFirstCell = (rows[0]?.[0] || "").replace(/^\uFEFF/, "").trim().toLowerCase();
  const firstRowSecondCell = (rows[0]?.[1] || "").trim().toLowerCase();
  const hasHeaderRow = firstRowFirstCell === "language1" && firstRowSecondCell === "language2";
  const dataRows = skipFirstRow ? rows.slice(1) : hasHeaderRow ? rows.slice(1) : rows;

  return dataRows
    .map((columns, index) => {
      const languageOne = (columns[0] || "").trim();
      const languageTwo = (columns[1] || "").trim();

      if (!languageOne || !languageTwo || columns.length !== 2) {
        return null;
      }

      return {
        id: `pair-${index}-${languageOne}-${languageTwo}`.toLowerCase().replace(/\s+/g, "-"),
        languageOne,
        languageTwo,
      };
    })
    .filter(Boolean);
}

function parseCsvRows(rawText) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let isInsideQuotes = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index];
    const nextCharacter = rawText[index + 1];

    if (character === '"') {
      if (isInsideQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        isInsideQuotes = !isInsideQuotes;
      }
      continue;
    }

    if (!isInsideQuotes && character === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (!isInsideQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      if (currentRow.some((field) => field.trim() !== "")) {
        rows.push(currentRow);
      }
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += character;
  }

  currentRow.push(currentField);
  if (currentRow.some((field) => field.trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
