const STORAGE_KEY = "pomoflow-state";
const DEFAULT_SPOTIFY_URL = "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS";

const modeDetails = {
  focus: {
    title: "Pomodoro zamani",
    description: "Tek bir ise 25 dakikalik sakin bir akista kal.",
    next: "shortBreak",
  },
  shortBreak: {
    title: "Kisa mola",
    description: "Nefes al, su ic, ekrandan biraz uzaklas.",
    next: "focus",
  },
  longBreak: {
    title: "Uzun mola",
    description: "Zihni tazelemek icin daha genis bir ara ver.",
    next: "focus",
  },
};

const quotes = [
  "Buyuk isler genelde kucuk ve gorunen bir sonraki adimla baslar.",
  "Zihnin dagildiginda sorun yok. Geri donmek de pratik sayilir.",
  "Bugun her seyi bitirmek zorunda degilsin; dogru seyi baslatman yeter.",
  "Basit tut, basla, sonra iyilestir.",
];

const state = loadState();
let timerId = null;
let remainingSeconds = state.durations[state.mode] * 60;
let totalSeconds = remainingSeconds;

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  backgroundVideo: document.querySelector("#backgroundVideo"),
  modeTitle: document.querySelector("#modeTitle"),
  modeDescription: document.querySelector("#modeDescription"),
  ringProgress: document.querySelector("#ringProgress"),
  timeReadout: document.querySelector("#timeReadout"),
  startPauseButton: document.querySelector("#startPauseButton"),
  resetButton: document.querySelector("#resetButton"),
  skipButton: document.querySelector("#skipButton"),
  durationPills: document.querySelectorAll(".duration-pills button"),
  switchOptions: document.querySelectorAll(".switch-option"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  focusCount: document.querySelector("#focusCount"),
  quoteText: document.querySelector("#quoteText"),
  spotifyPlayer: document.querySelector("#spotifyPlayer"),
  spotifyForm: document.querySelector("#spotifyForm"),
  spotifyUrl: document.querySelector("#spotifyUrl"),
};

const circumference = 2 * Math.PI * 52;
elements.ringProgress.style.strokeDasharray = `${circumference}`;

function loadState() {
  const fallback = {
    mode: "focus",
    running: false,
    focusSessions: 0,
    durations: { focus: 25, shortBreak: 5, longBreak: 15 },
    spotifyUrl: DEFAULT_SPOTIFY_URL,
    tasks: [
      {
        id: crypto.randomUUID(),
        text: "Ilk gorevini ekle ve pomodoro oturumunu baslat",
        done: false,
      },
    ],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return fallback;

    const durations = {
      ...fallback.durations,
      ...saved.durations,
      shortBreak: saved.durations?.shortBreak ?? saved.durations?.break ?? fallback.durations.shortBreak,
    };

    return {
      ...fallback,
      ...saved,
      mode: modeDetails[saved.mode] ? saved.mode : "focus",
      durations,
      running: false,
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, running: false }),
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function setMode(mode) {
  if (!modeDetails[mode]) return;
  state.mode = mode;
  stopTimer();
  remainingSeconds = state.durations[mode] * 60;
  totalSeconds = remainingSeconds;
  saveState();
  render();
}

function stopTimer() {
  state.running = false;
  clearInterval(timerId);
  timerId = null;
}

function tick() {
  remainingSeconds -= 1;

  if (remainingSeconds <= 0) {
    if (state.mode === "focus") {
      state.focusSessions += 1;
      setMode(state.focusSessions % 4 === 0 ? "longBreak" : "shortBreak");
    } else {
      setMode("focus");
    }
    return;
  }

  renderTimer();
}

function toggleTimer() {
  state.running = !state.running;

  if (state.running) {
    timerId = setInterval(tick, 1000);
  } else {
    clearInterval(timerId);
  }

  renderTimer();
}

function resetTimer() {
  stopTimer();
  remainingSeconds = state.durations[state.mode] * 60;
  totalSeconds = remainingSeconds;
  renderTimer();
}

function skipSession() {
  if (state.mode === "focus") {
    state.focusSessions += 1;
  }
  setMode(modeDetails[state.mode].next);
}

function addTask(text) {
  state.tasks.unshift({
    id: crypto.randomUUID(),
    text,
    done: false,
  });
  saveState();
  renderTasks();
}

function toggleTask(id) {
  state.tasks = state.tasks.map((task) =>
    task.id === id ? { ...task, done: !task.done } : task,
  );
  saveState();
  renderTasks();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  saveState();
  renderTasks();
}

function updateDuration(mode, minutes) {
  state.durations[mode] = Number(minutes);
  if (state.mode === mode && !state.running) {
    remainingSeconds = state.durations[mode] * 60;
    totalSeconds = remainingSeconds;
  }
  saveState();
  render();
}

function applyQuickDuration(minutes) {
  updateDuration(state.mode, minutes);
}

function toSpotifyEmbedUrl(url) {
  try {
    const spotifyUrl = new URL(url);
    if (!spotifyUrl.hostname.includes("spotify.com")) return null;

    const parts = spotifyUrl.pathname.split("/").filter(Boolean);
    const embedIndex = parts[0] === "embed" ? 1 : 0;
    const type = parts[embedIndex];
    const id = parts[embedIndex + 1];
    const allowedTypes = ["track", "album", "playlist", "episode", "show"];

    if (!allowedTypes.includes(type) || !id) return null;
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`;
  } catch {
    return null;
  }
}

function updateSpotify(url) {
  const embedUrl = toSpotifyEmbedUrl(url);
  if (!embedUrl) return;

  state.spotifyUrl = url;
  elements.spotifyPlayer.src = embedUrl;
  elements.spotifyUrl.value = url;
  saveState();
}

function renderTimer() {
  const progress = totalSeconds === 0 ? 0 : remainingSeconds / totalSeconds;
  const offset = circumference * (1 - progress);
  elements.ringProgress.style.strokeDashoffset = `${offset}`;
  elements.timeReadout.textContent = formatTime(remainingSeconds);
  elements.startPauseButton.textContent = state.running ? "Duraklat" : "Baslat";
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  state.tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item ${task.done ? "done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", `${task.text} tamamlandi`);
    checkbox.addEventListener("change", () => toggleTask(task.id));

    const text = document.createElement("span");
    text.textContent = task.text;

    const remove = document.createElement("button");
    remove.className = "delete-task";
    remove.type = "button";
    remove.textContent = "x";
    remove.setAttribute("aria-label", `${task.text} gorevini sil`);
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(checkbox, text, remove);
    elements.taskList.append(item);
  });

  const doneCount = state.tasks.filter((task) => task.done).length;
  elements.taskCount.textContent = `${doneCount}/${state.tasks.length}`;
}

function render() {
  const currentMode = modeDetails[state.mode];
  elements.todayLabel.textContent = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  elements.modeTitle.textContent = currentMode.title;
  elements.modeDescription.textContent = currentMode.description;

  elements.switchOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  elements.focusCount.textContent = state.focusSessions;
  elements.quoteText.textContent = quotes[new Date().getDate() % quotes.length];
  elements.spotifyPlayer.src = toSpotifyEmbedUrl(state.spotifyUrl) || toSpotifyEmbedUrl(DEFAULT_SPOTIFY_URL);
  elements.spotifyUrl.value = state.spotifyUrl;

  renderTimer();
  renderTasks();
}

elements.startPauseButton.addEventListener("click", toggleTimer);
elements.resetButton.addEventListener("click", resetTimer);
elements.skipButton.addEventListener("click", skipSession);

elements.switchOptions.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.durationPills.forEach((button) => {
  button.addEventListener("click", () => applyQuickDuration(button.dataset.minutes));
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.taskInput.value.trim();
  if (!text) return;

  addTask(text);
  elements.taskInput.value = "";
  elements.taskInput.focus();
});

elements.spotifyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateSpotify(elements.spotifyUrl.value.trim());
});

render();

if (elements.backgroundVideo) {
  elements.backgroundVideo.muted = true;
  elements.backgroundVideo.play().catch(() => {});
}
