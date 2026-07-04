const STORAGE_KEY = "pomoflow-state";

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
  modeTitle: document.querySelector("#modeTitle"),
  modeDescription: document.querySelector("#modeDescription"),
  ringProgress: document.querySelector("#ringProgress"),
  timeReadout: document.querySelector("#timeReadout"),
  startPauseButton: document.querySelector("#startPauseButton"),
  resetButton: document.querySelector("#resetButton"),
  switchOptions: document.querySelectorAll(".switch-option"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  focusCount: document.querySelector("#focusCount"),
  quoteText: document.querySelector("#quoteText"),
  focusMinutes: document.querySelector("#focusMinutes"),
  focusMinutesLabel: document.querySelector("#focusMinutesLabel"),
  breakMinutes: document.querySelector("#breakMinutes"),
  breakMinutesLabel: document.querySelector("#breakMinutesLabel"),
};

const circumference = 2 * Math.PI * 52;
elements.ringProgress.style.strokeDasharray = `${circumference}`;

function loadState() {
  const fallback = {
    mode: "focus",
    running: false,
    focusSessions: 0,
    durations: { focus: 25, break: 5 },
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
    return saved ? { ...fallback, ...saved, running: false } : fallback;
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
      setMode("break");
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
  const isFocus = state.mode === "focus";
  elements.todayLabel.textContent = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  elements.modeTitle.textContent = isFocus ? "Pomodoro zamani" : "Mola zamani";
  elements.modeDescription.textContent = isFocus
    ? "Tek bir ise 25 dakikalik sakin bir akista kal."
    : "Kalk, su ic, gozlerini dinlendir.";

  elements.switchOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  elements.focusCount.textContent = state.focusSessions;
  elements.quoteText.textContent = quotes[new Date().getDate() % quotes.length];
  elements.focusMinutes.value = state.durations.focus;
  elements.focusMinutesLabel.textContent = `${state.durations.focus} dk`;
  elements.breakMinutes.value = state.durations.break;
  elements.breakMinutesLabel.textContent = `${state.durations.break} dk`;

  renderTimer();
  renderTasks();
}

elements.startPauseButton.addEventListener("click", toggleTimer);
elements.resetButton.addEventListener("click", resetTimer);

elements.switchOptions.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.taskInput.value.trim();
  if (!text) return;

  addTask(text);
  elements.taskInput.value = "";
  elements.taskInput.focus();
});

elements.focusMinutes.addEventListener("input", (event) => {
  updateDuration("focus", event.target.value);
});

elements.breakMinutes.addEventListener("input", (event) => {
  updateDuration("break", event.target.value);
});

render();
