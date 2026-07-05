const STORAGE_KEY = "pomoflow-state-v2";
const DEFAULT_SPOTIFY_URL =
  "https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS";
const STATE_VERSION = 3;
const DEFAULT_DURATIONS = { focus: 30, shortBreak: 5, longBreak: 20 };
const QUICK_DURATIONS = {
  focus: [30, 45, 60],
  shortBreak: [5, 10, 15],
  longBreak: [20, 25, 30],
};

const modeDetails = {
  focus: {
    title: "Pomodoro zamanı",
    description: "Tek bir işe odaklan, 30 dakikalık sakin bir akışta kal.",
    next: "shortBreak",
    notifyTitle: "Pomodoro tamamlandı!",
    notifyBody: "Harika iş! Şimdi kısa bir mola zamanı.",
  },
  shortBreak: {
    title: "Kısa mola",
    description: "Nefes al, su iç, ekrandan biraz uzaklaş.",
    next: "focus",
    notifyTitle: "Mola bitti",
    notifyBody: "Enerjin tazelendi. Yeni bir pomodoro başlatabilirsin.",
  },
  longBreak: {
    title: "Uzun mola",
    description: "Zihni tazelemek için daha geniş bir ara ver.",
    next: "focus",
    notifyTitle: "Uzun mola bitti",
    notifyBody: "Dinlendin. Yeni bir odak oturumuna hazırsın.",
  },
};

const quotes = [
  "Büyük işler genelde küçük ve görünen bir sonraki adımla başlar.",
  "Zihnin dağıldığında sorun yok. Geri dönmek de pratik sayılır.",
  "Bugün her şeyi bitirmek zorunda değilsin; doğru şeyi başlatman yeter.",
  "Basit tut, başla, sonra iyileştir.",
  "Her pomodoro, hedefe giden küçük bir adımdır.",
  "Odaklanmak bir kas gibi; her tekrarda güçlenir.",
  "Mola da üretkenliğin parçasıdır.",
];

// ─── State ───────────────────────────────────────────────────────────────────

function defaultState() {
  return {
    version: STATE_VERSION,
    mode: "focus",
    running: false,
    focusSessions: 0,
    durations: { ...DEFAULT_DURATIONS },
    spotifyUrl: DEFAULT_SPOTIFY_URL,
    tasks: [
      {
        id: crypto.randomUUID(),
        text: "İlk görevini ekle ve pomodoro oturumunu başlat",
        done: false,
      },
    ],
    settings: {
      theme: "dark",
      notifications: false,
      sound: true,
      soundVolume: 70,
      dailyGoal: 4,
      autoStartBreaks: false,
      autoStartFocus: false,
    },
    stats: {},
    streak: { current: 0, longest: 0, lastActiveDate: null },
  };
}

function loadState() {
  const fallback = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return fallback;
    const isLegacyState = !saved.version || saved.version < STATE_VERSION;

    const durations = {
      ...fallback.durations,
      ...saved.durations,
      shortBreak:
        saved.durations?.shortBreak ??
        saved.durations?.break ??
        fallback.durations.shortBreak,
    };

    if (isLegacyState && durations.focus === 25) {
      durations.focus = DEFAULT_DURATIONS.focus;
    }
    if (isLegacyState && durations.longBreak === 15) {
      durations.longBreak = DEFAULT_DURATIONS.longBreak;
    }

    return {
      ...fallback,
      ...saved,
      version: STATE_VERSION,
      mode: modeDetails[saved.mode] ? saved.mode : "focus",
      durations,
      settings: { ...fallback.settings, ...saved.settings },
      stats: saved.stats ?? {},
      streak: { ...fallback.streak, ...saved.streak },
      running: false,
    };
  } catch {
    return fallback;
  }
}

const state = loadState();
let timerId = null;
let remainingSeconds = state.durations[state.mode] * 60;
let totalSeconds = remainingSeconds;
let supabaseClient = null;
let syncDebounce = null;

// ─── DOM ─────────────────────────────────────────────────────────────────────

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  backgroundVideo: document.querySelector("#backgroundVideo"),
  modeTitle: document.querySelector("#modeTitle"),
  modeDescription: document.querySelector("#modeDescription"),
  ringProgress: document.querySelector("#ringProgress"),
  goalRing: document.querySelector("#goalRing"),
  timeReadout: document.querySelector("#timeReadout"),
  goalLabel: document.querySelector("#goalLabel"),
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
  todayPomos: document.querySelector("#todayPomos"),
  weekPomos: document.querySelector("#weekPomos"),
  goalProgressFill: document.querySelector("#goalProgressFill"),
  goalProgressText: document.querySelector("#goalProgressText"),
  weekChart: document.querySelector("#weekChart"),
  chartSummary: document.querySelector("#chartSummary"),
  quoteText: document.querySelector("#quoteText"),
  streakBadge: document.querySelector("#streakBadge"),
  streakCount: document.querySelector("#streakCount"),
  spotifyPlayer: document.querySelector("#spotifyPlayer"),
  spotifyForm: document.querySelector("#spotifyForm"),
  spotifyUrl: document.querySelector("#spotifyUrl"),
  themeToggle: document.querySelector("#themeToggle"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  settingsClose: document.querySelector("#settingsClose"),
  modalTabs: document.querySelectorAll(".modal-tab"),
  modalPanels: document.querySelectorAll(".modal-panel"),
  focusMinutes: document.querySelector("#focusMinutes"),
  focusMinutesLabel: document.querySelector("#focusMinutesLabel"),
  shortBreakMinutes: document.querySelector("#shortBreakMinutes"),
  shortBreakMinutesLabel: document.querySelector("#shortBreakMinutesLabel"),
  longBreakMinutes: document.querySelector("#longBreakMinutes"),
  longBreakMinutesLabel: document.querySelector("#longBreakMinutesLabel"),
  autoStartBreaks: document.querySelector("#autoStartBreaks"),
  autoStartFocus: document.querySelector("#autoStartFocus"),
  notificationsEnabled: document.querySelector("#notificationsEnabled"),
  soundEnabled: document.querySelector("#soundEnabled"),
  soundVolume: document.querySelector("#soundVolume"),
  soundVolumeLabel: document.querySelector("#soundVolumeLabel"),
  dailyGoal: document.querySelector("#dailyGoal"),
  dailyGoalLabel: document.querySelector("#dailyGoalLabel"),
  settingsStreakCurrent: document.querySelector("#settingsStreakCurrent"),
  settingsStreakLongest: document.querySelector("#settingsStreakLongest"),
  testNotification: document.querySelector("#testNotification"),
  testSound: document.querySelector("#testSound"),
  syncStatus: document.querySelector("#syncStatus"),
  syncEmail: document.querySelector("#syncEmail"),
  syncPassword: document.querySelector("#syncPassword"),
  syncSignIn: document.querySelector("#syncSignIn"),
  syncSignUp: document.querySelector("#syncSignUp"),
  syncSignOut: document.querySelector("#syncSignOut"),
  toastContainer: document.querySelector("#toastContainer"),
};

const circumference = 2 * Math.PI * 52;
const goalCircumference = 2 * Math.PI * 46;
elements.ringProgress.style.strokeDasharray = `${circumference}`;
elements.goalRing.style.strokeDasharray = `${goalCircumference}`;

// ─── Utilities ───────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, running: false }),
  );
  scheduleSync();
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function getTodayStats() {
  return state.stats[todayKey()] ?? { pomodoros: 0, focusMinutes: 0 };
}

function getWeekStats() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      label: new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(d),
      pomodoros: state.stats[key]?.pomodoros ?? 0,
    });
  }
  return days;
}

function getWeekTotal() {
  return getWeekStats().reduce((sum, d) => sum + d.pomodoros, 0);
}

// ─── Stats & Streak ──────────────────────────────────────────────────────────

function recordPomodoro() {
  const key = todayKey();
  const day = state.stats[key] ?? { pomodoros: 0, focusMinutes: 0 };
  day.pomodoros += 1;
  day.focusMinutes += state.durations.focus;
  state.stats[key] = day;
  updateStreak();
}

function updateStreak() {
  const today = todayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const todayHasPomo = (state.stats[today]?.pomodoros ?? 0) > 0;

  if (!todayHasPomo) return;

  if (state.streak.lastActiveDate === today) return;

  if (
    state.streak.lastActiveDate === yesterdayKey ||
    !state.streak.lastActiveDate
  ) {
    state.streak.current += 1;
  } else {
    state.streak.current = 1;
  }

  state.streak.lastActiveDate = today;
  state.streak.longest = Math.max(state.streak.longest, state.streak.current);
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function setMode(mode, options = {}) {
  if (!modeDetails[mode]) return;
  state.mode = mode;
  stopTimer();
  remainingSeconds = state.durations[mode] * 60;
  totalSeconds = remainingSeconds;
  saveState();
  render();

  if (options.autoStart) {
    toggleTimer(true);
  }
}

function stopTimer() {
  state.running = false;
  clearInterval(timerId);
  timerId = null;
}

function onSessionComplete() {
  const completedMode = state.mode;
  const detail = modeDetails[completedMode];

  if (completedMode === "focus") {
    state.focusSessions += 1;
    recordPomodoro();
    saveState();
  }

  showNotification(detail.notifyTitle, detail.notifyBody);
  playSound("complete");
  showToast(detail.notifyTitle, detail.notifyBody);

  if (completedMode === "focus") {
    const next =
      state.focusSessions % 4 === 0 ? "longBreak" : "shortBreak";
    setMode(next, { autoStart: state.settings.autoStartBreaks });
  } else {
    setMode("focus", { autoStart: state.settings.autoStartFocus });
  }
}

function tick() {
  remainingSeconds -= 1;

  if (remainingSeconds <= 0) {
    onSessionComplete();
    return;
  }

  renderTimer();
}

function toggleTimer(forceStart) {
  const shouldStart = forceStart === true ? true : !state.running;
  state.running = shouldStart;

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
    recordPomodoro();
    saveState();
  }
  setMode(modeDetails[state.mode].next);
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

function addTask(text) {
  state.tasks.unshift({ id: crypto.randomUUID(), text, done: false });
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

function renderDurationPills() {
  const options = QUICK_DURATIONS[state.mode] ?? QUICK_DURATIONS.focus;
  elements.durationPills.forEach((button, index) => {
    const minutes = options[index];
    button.dataset.minutes = minutes;
    button.textContent = `${minutes} dk`;
  });
}

// ─── Spotify ─────────────────────────────────────────────────────────────────

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
  if (!embedUrl) {
    showToast("Geçersiz Spotify linki", "Lütfen geçerli bir Spotify URL'si gir.");
    return;
  }

  state.spotifyUrl = url;
  elements.spotifyPlayer.src = embedUrl;
  elements.spotifyUrl.value = url;
  saveState();
}

// ─── Notifications & Sound ───────────────────────────────────────────────────

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function showNotification(title, body) {
  if (!state.settings.notifications) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  new Notification(title, {
    body,
    icon: "./icons/icon-192.svg",
    badge: "./icons/icon-192.svg",
    tag: "pomoflow-timer",
  });
}

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playSound(type = "complete") {
  if (!state.settings.sound) return;

  try {
    const ctx = getAudioContext();
    const volume = state.settings.soundVolume / 100;
    const now = ctx.currentTime;

    const notes =
      type === "complete"
        ? [523.25, 659.25, 783.99]
        : [440, 554.37];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(volume * 0.3, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.5);
    });
  } catch {
    /* ses desteklenmiyorsa sessizce geç */
  }
}

function showToast(title, message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  elements.toastContainer.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Theme ───────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  state.settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#101417" : "#f5f0e8";
  saveState();
}

function toggleTheme() {
  applyTheme(state.settings.theme === "dark" ? "light" : "dark");
}

// ─── Settings Modal ──────────────────────────────────────────────────────────

function openSettings() {
  elements.settingsOverlay.hidden = false;
  document.body.classList.add("modal-open");
  elements.settingsClose.focus();
}

function closeSettings() {
  elements.settingsOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

function switchTab(tabName) {
  elements.modalTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  elements.modalPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

// ─── Supabase Sync ───────────────────────────────────────────────────────────

function initSupabase() {
  const config = window.POMOFLOW_CONFIG ?? {};
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  if (typeof supabase === "undefined") return null;
  return supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
}

function scheduleSync() {
  if (!supabaseClient) return;
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(pushToCloud, 2000);
}

async function pushToCloud() {
  if (!supabaseClient) return;
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) return;

  const payload = {
    user_id: session.user.id,
    data: {
      focusSessions: state.focusSessions,
      durations: state.durations,
      tasks: state.tasks,
      settings: state.settings,
      stats: state.stats,
      streak: state.streak,
      spotifyUrl: state.spotifyUrl,
    },
    updated_at: new Date().toISOString(),
  };

  await supabaseClient.from("pomoflow_data").upsert(payload, {
    onConflict: "user_id",
  });
}

async function pullFromCloud() {
  if (!supabaseClient) return;
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) return;

  const { data, error } = await supabaseClient
    .from("pomoflow_data")
    .select("data, updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !data?.data) return;

  const cloud = data.data;
  state.focusSessions = cloud.focusSessions ?? state.focusSessions;
  state.durations = { ...state.durations, ...cloud.durations };
  state.tasks = cloud.tasks ?? state.tasks;
  state.settings = { ...state.settings, ...cloud.settings };
  state.stats = cloud.stats ?? state.stats;
  state.streak = { ...state.streak, ...cloud.streak };
  state.spotifyUrl = cloud.spotifyUrl ?? state.spotifyUrl;

  remainingSeconds = state.durations[state.mode] * 60;
  totalSeconds = remainingSeconds;
  saveState();
  applyTheme(state.settings.theme);
  render();
}

function updateSyncUI(session) {
  if (session) {
    elements.syncStatus.textContent = `Senkronize: ${session.user.email}`;
    elements.syncSignOut.hidden = false;
    elements.syncSignIn.hidden = true;
    elements.syncSignUp.hidden = true;
  } else {
    elements.syncStatus.textContent = supabaseClient
      ? "Giriş yaparak verilerini senkronize et"
      : "Yerel kayıt kullanılıyor (config.js yapılandır)";
    elements.syncSignOut.hidden = true;
    elements.syncSignIn.hidden = false;
    elements.syncSignUp.hidden = false;
  }
}

async function signIn() {
  if (!supabaseClient) {
    showToast("Senkron devre dışı", "config.js dosyasını yapılandır.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: elements.syncEmail.value.trim(),
    password: elements.syncPassword.value,
  });
  if (error) {
    showToast("Giriş başarısız", error.message);
    return;
  }
  await pullFromCloud();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  updateSyncUI(session);
  showToast("Giriş başarılı", "Verilerin senkronize edildi.");
}

async function signUp() {
  if (!supabaseClient) {
    showToast("Senkron devre dışı", "config.js dosyasını yapılandır.");
    return;
  }
  const { error } = await supabaseClient.auth.signUp({
    email: elements.syncEmail.value.trim(),
    password: elements.syncPassword.value,
  });
  if (error) {
    showToast("Kayıt başarısız", error.message);
    return;
  }
  showToast("Kayıt başarılı", "E-postanı doğruladıktan sonra giriş yap.");
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  updateSyncUI(null);
  showToast("Çıkış yapıldı", "Veriler yerelde saklanmaya devam ediyor.");
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderTimer() {
  const progress = totalSeconds === 0 ? 0 : remainingSeconds / totalSeconds;
  elements.ringProgress.style.strokeDashoffset = `${circumference * (1 - progress)}`;
  elements.timeReadout.textContent = formatTime(remainingSeconds);
  elements.startPauseButton.textContent = state.running ? "Duraklat" : "Başlat";
  document.title = state.running
    ? `${formatTime(remainingSeconds)} — PomoFlow`
    : "PomoFlow";
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  state.tasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item ${task.done ? "done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", `${task.text} tamamlandı`);
    checkbox.addEventListener("change", () => toggleTask(task.id));

    const text = document.createElement("span");
    text.textContent = task.text;

    const remove = document.createElement("button");
    remove.className = "delete-task";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `${task.text} görevini sil`);
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(checkbox, text, remove);
    elements.taskList.append(item);
  });

  const doneCount = state.tasks.filter((t) => t.done).length;
  elements.taskCount.textContent = `${doneCount}/${state.tasks.length}`;
}

function renderStats() {
  const today = getTodayStats();
  const weekTotal = getWeekTotal();
  const goal = state.settings.dailyGoal;
  const goalProgress = Math.min(today.pomodoros / goal, 1);

  elements.todayPomos.textContent = today.pomodoros;
  elements.weekPomos.textContent = weekTotal;
  elements.focusCount.textContent = state.focusSessions;
  elements.streakCount.textContent = state.streak.current;
  elements.streakBadge.classList.toggle(
    "streak-badge--active",
    state.streak.current > 0,
  );

  elements.goalLabel.textContent = `${today.pomodoros} / ${goal} pomo`;
  elements.goalProgressFill.style.width = `${goalProgress * 100}%`;
  elements.goalProgressText.textContent =
    goalProgress >= 1
      ? `🎉 Günlük hedef tamamlandı! (${today.pomodoros}/${goal})`
      : `Günlük hedef: ${today.pomodoros} / ${goal}`;

  elements.goalRing.style.strokeDashoffset = `${goalCircumference * (1 - goalProgress)}`;

  const weekDays = getWeekStats();
  const maxPomos = Math.max(...weekDays.map((d) => d.pomodoros), 1);

  elements.weekChart.innerHTML = weekDays
    .map(
      (d) => `
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="height: ${(d.pomodoros / maxPomos) * 100}%" title="${d.pomodoros} pomo">
          <span class="chart-bar-value">${d.pomodoros || ""}</span>
        </div>
        <span class="chart-bar-label">${d.label}</span>
      </div>`,
    )
    .join("");

  const avg = (weekTotal / 7).toFixed(1);
  elements.chartSummary.textContent = `Haftalık ortalama: ${avg} pomodoro/gün · ${today.focusMinutes} dk odak (bugün)`;

  elements.settingsStreakCurrent.textContent = state.streak.current;
  elements.settingsStreakLongest.textContent = state.streak.longest;
}

function renderSettings() {
  elements.focusMinutes.value = state.durations.focus;
  elements.focusMinutesLabel.textContent = `${state.durations.focus} dk`;
  elements.shortBreakMinutes.value = state.durations.shortBreak;
  elements.shortBreakMinutesLabel.textContent = `${state.durations.shortBreak} dk`;
  elements.longBreakMinutes.value = state.durations.longBreak;
  elements.longBreakMinutesLabel.textContent = `${state.durations.longBreak} dk`;
  elements.autoStartBreaks.checked = state.settings.autoStartBreaks;
  elements.autoStartFocus.checked = state.settings.autoStartFocus;
  elements.notificationsEnabled.checked = state.settings.notifications;
  elements.soundEnabled.checked = state.settings.sound;
  elements.soundVolume.value = state.settings.soundVolume;
  elements.soundVolumeLabel.textContent = `${state.settings.soundVolume}%`;
  elements.dailyGoal.value = state.settings.dailyGoal;
  elements.dailyGoalLabel.textContent = `${state.settings.dailyGoal} pomo`;
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

  renderDurationPills();

  elements.quoteText.textContent =
    quotes[new Date().getDate() % quotes.length];

  elements.spotifyPlayer.src =
    toSpotifyEmbedUrl(state.spotifyUrl) ||
    toSpotifyEmbedUrl(DEFAULT_SPOTIFY_URL);
  elements.spotifyUrl.value = state.spotifyUrl;

  renderTimer();
  renderTasks();
  renderStats();
  renderSettings();
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

elements.startPauseButton.addEventListener("click", () => toggleTimer());
elements.resetButton.addEventListener("click", resetTimer);
elements.skipButton.addEventListener("click", skipSession);

elements.switchOptions.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.durationPills.forEach((button) => {
  button.addEventListener("click", () =>
    updateDuration(state.mode, button.dataset.minutes),
  );
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

elements.themeToggle.addEventListener("click", toggleTheme);
elements.settingsButton.addEventListener("click", openSettings);
elements.settingsClose.addEventListener("click", closeSettings);
elements.settingsOverlay.addEventListener("click", (e) => {
  if (e.target === elements.settingsOverlay) closeSettings();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !elements.settingsOverlay.hidden) closeSettings();
});

elements.modalTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

elements.focusMinutes.addEventListener("input", (e) =>
  updateDuration("focus", e.target.value),
);
elements.shortBreakMinutes.addEventListener("input", (e) =>
  updateDuration("shortBreak", e.target.value),
);
elements.longBreakMinutes.addEventListener("input", (e) =>
  updateDuration("longBreak", e.target.value),
);

elements.autoStartBreaks.addEventListener("change", (e) => {
  state.settings.autoStartBreaks = e.target.checked;
  saveState();
});
elements.autoStartFocus.addEventListener("change", (e) => {
  state.settings.autoStartFocus = e.target.checked;
  saveState();
});

elements.notificationsEnabled.addEventListener("change", async (e) => {
  if (e.target.checked) {
    const granted = await requestNotificationPermission();
    state.settings.notifications = granted;
    e.target.checked = granted;
    if (!granted) showToast("Bildirim izni reddedildi", "Tarayıcı ayarlarından izin ver.");
  } else {
    state.settings.notifications = false;
  }
  saveState();
});

elements.soundEnabled.addEventListener("change", (e) => {
  state.settings.sound = e.target.checked;
  saveState();
});

elements.soundVolume.addEventListener("input", (e) => {
  state.settings.soundVolume = Number(e.target.value);
  elements.soundVolumeLabel.textContent = `${state.settings.soundVolume}%`;
  saveState();
});

elements.dailyGoal.addEventListener("input", (e) => {
  state.settings.dailyGoal = Number(e.target.value);
  elements.dailyGoalLabel.textContent = `${state.settings.dailyGoal} pomo`;
  saveState();
  renderStats();
});

elements.testNotification.addEventListener("click", async () => {
  const granted = await requestNotificationPermission();
  if (granted) {
    state.settings.notifications = true;
    elements.notificationsEnabled.checked = true;
    saveState();
    showNotification("PomoFlow", "Bildirimler çalışıyor!");
    showToast("Test başarılı", "Bildirim gönderildi.");
  }
});

elements.testSound.addEventListener("click", () => {
  state.settings.sound = true;
  elements.soundEnabled.checked = true;
  playSound("complete");
});

elements.syncSignIn.addEventListener("click", signIn);
elements.syncSignUp.addEventListener("click", signUp);
elements.syncSignOut.addEventListener("click", signOut);

// ─── Init ────────────────────────────────────────────────────────────────────

applyTheme(state.settings.theme);
render();

supabaseClient = initSupabase();
if (supabaseClient) {
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    updateSyncUI(session);
    if (session) pullFromCloud();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateSyncUI(session);
  });
}

if (elements.backgroundVideo) {
  elements.backgroundVideo.muted = true;
  elements.backgroundVideo.play().catch(() => {});
}

// Migrate old storage key
try {
  const old = localStorage.getItem("pomoflow-state");
  if (old && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, old);
    localStorage.removeItem("pomoflow-state");
    location.reload();
  }
} catch {
  /* ignore */
}
