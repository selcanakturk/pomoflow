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

function getGuestStorageKey(date = todayKey()) {
  return `${STORAGE_KEY}-guest-${date}`;
}

function getUserStorageKey(userId) {
  return `${STORAGE_KEY}-user-${userId}`;
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultState(owner = {}) {
  return {
    version: STATE_VERSION,
    clientId: createId(),
    owner: {
      type: owner.type ?? "guest",
      userId: owner.userId ?? null,
      email: owner.email ?? "",
    },
    mode: "focus",
    running: false,
    focusSessions: 0,
    durations: { ...DEFAULT_DURATIONS },
    spotifyUrl: DEFAULT_SPOTIFY_URL,
    tasks: [
      {
        id: createId(),
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
    profile: {
      firstName: "",
      lastName: "",
      displayName: "",
      role: "",
      avatar: "🍅",
      createdAt: new Date().toISOString(),
      updatedAt: null,
    },
    stats: {},
    streak: { current: 0, longest: 0, lastActiveDate: null },
    sync: {
      localUpdatedAt: null,
      lastPulledAt: null,
      lastPushedAt: null,
      remoteUpdatedAt: null,
      activeEmail: owner.email ?? "",
    },
  };
}

function loadState(storageKey = getGuestStorageKey(), owner = {}) {
  const fallback = defaultState(owner);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
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
      owner: { ...fallback.owner, ...saved.owner },
      version: STATE_VERSION,
      mode: modeDetails[saved.mode] ? saved.mode : "focus",
      durations,
      settings: { ...fallback.settings, ...saved.settings },
      profile: { ...fallback.profile, ...saved.profile },
      stats: saved.stats ?? {},
      streak: { ...fallback.streak, ...saved.streak },
      sync: { ...fallback.sync, ...saved.sync },
      clientId: saved.clientId ?? fallback.clientId,
      running: false,
    };
  } catch {
    return fallback;
  }
}

let currentStorageKey = getGuestStorageKey();
let state = loadState(currentStorageKey, { type: "guest" });
let timerId = null;
let remainingSeconds = state.durations[state.mode] * 60;
let totalSeconds = remainingSeconds;
let supabaseClient = null;
let syncDebounce = null;
let authMode = "login";
let mobileView = "focus";
let spotifyExpanded = false;
let quoteExpanded = false;
let authBusy = false;

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
  activeTaskLabel: document.querySelector("#activeTaskLabel"),
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
  quoteToggle: document.querySelector("#quoteToggle"),
  homeProfileAvatar: document.querySelector("#homeProfileAvatar"),
  homeProfileName: document.querySelector("#homeProfileName"),
  homeProfileMeta: document.querySelector("#homeProfileMeta"),
  topbarProfileButton: document.querySelector("#authButton"),
  streakBadge: document.querySelector("#streakBadge"),
  streakCount: document.querySelector("#streakCount"),
  spotifyPlayer: document.querySelector("#spotifyPlayer"),
  spotifyToggle: document.querySelector("#spotifyToggle"),
  spotifyContent: document.querySelector("#spotifyContent"),
  spotifyForm: document.querySelector("#spotifyForm"),
  spotifyUrl: document.querySelector("#spotifyUrl"),
  themeToggle: document.querySelector("#themeToggle"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  settingsClose: document.querySelector("#settingsClose"),
  authOverlay: document.querySelector("#authOverlay"),
  authClose: document.querySelector("#authClose"),
  authTitle: document.querySelector("#authTitle"),
  authLoginPanel: document.querySelector("#authLoginPanel"),
  authRegisterPanel: document.querySelector("#authRegisterPanel"),
  authAccountPanel: document.querySelector("#authAccountPanel"),
  authProfilePreview: document.querySelector("#authProfilePreview"),
  showRegister: document.querySelector("#showRegister"),
  showLogin: document.querySelector("#showLogin"),
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
  syncMeta: document.querySelector("#syncMeta"),
  syncEmail: document.querySelector("#syncEmail"),
  syncPassword: document.querySelector("#syncPassword"),
  registerEmail: document.querySelector("#registerEmail"),
  registerPassword: document.querySelector("#registerPassword"),
  syncSignIn: document.querySelector("#syncSignIn"),
  syncSignUp: document.querySelector("#syncSignUp"),
  syncNow: document.querySelector("#syncNow"),
  syncSignOut: document.querySelector("#syncSignOut"),
  saveProfile: document.querySelector("#saveProfile"),
  profileFirstName: document.querySelector("#profileFirstName"),
  profileLastName: document.querySelector("#profileLastName"),
  accountFirstName: document.querySelector("#accountFirstName"),
  accountLastName: document.querySelector("#accountLastName"),
  profileRole: document.querySelector("#profileRole"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileAvatarPreview: document.querySelector("#profileAvatarPreview"),
  profileNamePreview: document.querySelector("#profileNamePreview"),
  profileMetaPreview: document.querySelector("#profileMetaPreview"),
  toastContainer: document.querySelector("#toastContainer"),
  mobileNavItems: document.querySelectorAll(".mobile-nav-item"),
};

const circumference = 2 * Math.PI * 52;
const goalCircumference = 2 * Math.PI * 46;
elements.ringProgress.style.strokeDasharray = `${circumference}`;
elements.goalRing.style.strokeDasharray = `${goalCircumference}`;

// ─── Utilities ───────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function saveState(options = {}) {
  if (options.markDirty !== false) {
    state.sync.localUpdatedAt = new Date().toISOString();
  }
  localStorage.setItem(
    currentStorageKey,
    JSON.stringify({ ...state, running: false }),
  );
  if (options.sync !== false) scheduleSync();
}

function setActiveState(nextState, storageKey, options = {}) {
  stopTimer();
  currentStorageKey = storageKey;
  state = nextState;
  remainingSeconds = state.durations[state.mode] * 60;
  totalSeconds = remainingSeconds;
  saveState({ markDirty: false, sync: false });
  if (options.render !== false) render();
}

function resetToGuestState() {
  const guestKey = getGuestStorageKey();
  setActiveState(defaultState({ type: "guest" }), guestKey);
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
  navigator.vibrate?.([120, 80, 120]);
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
  state.tasks.unshift({ id: createId(), text, done: false });
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

function getActiveTask() {
  return state.tasks.find((task) => !task.done) ?? null;
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

function formatSyncTime(value) {
  if (!value) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getFriendlyError(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (message.includes("invalid login") || message.includes("invalid credentials")) {
    return "E-posta ya da şifre hatalı.";
  }
  if (message.includes("email not confirmed")) {
    return "Giriş yapmadan önce e-postanı doğrulaman gerekiyor.";
  }
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "Senkronizasyon izni eksik. Supabase SQL kurulumunu tekrar çalıştır.";
  }
  if (message.includes("network") || message.includes("failed to fetch")) {
    return "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.";
  }
  if (message.includes("password")) {
    return "Şifre geçersiz ya da çok kısa.";
  }
  return "İşlem tamamlanamadı. Biraz sonra tekrar dene.";
}

function setAuthBusy(isBusy) {
  authBusy = isBusy;
  [
    elements.syncSignIn,
    elements.syncSignUp,
    elements.syncSignOut,
    elements.syncNow,
    elements.saveProfile,
  ].forEach((button) => {
    if (!button) return;
    button.disabled = isBusy;
    button.classList.toggle("is-loading", isBusy);
  });
}

// ─── Theme ───────────────────────────────────────────────────────────────────

function applyTheme(theme, options = {}) {
  state.settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#101417" : "#f5f0e8";
  saveState(options);
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

function setAuthMode(mode) {
  const isSignedIn = Boolean(state.sync.activeEmail);
  authMode = isSignedIn ? "account" : mode;
  elements.authLoginPanel.hidden = authMode !== "login";
  elements.authRegisterPanel.hidden = authMode !== "register";
  elements.authAccountPanel.hidden = authMode !== "account";
  elements.authTitle.textContent = {
    login: "Giriş yap",
    register: "Kayıt ol",
    account: "Hesabım",
  }[authMode];
}

function openAuth() {
  setAuthMode(state.sync.activeEmail ? "account" : authMode);
  elements.authOverlay.hidden = false;
  document.body.classList.add("modal-open");
  const focusTarget = {
    login: elements.syncEmail,
    register: elements.profileFirstName,
    account: elements.accountFirstName,
  }[authMode];
  focusTarget?.focus();
}

function closeAuth() {
  elements.authOverlay.hidden = true;
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
  if (!supabaseClient) return false;
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) return false;
  if (state.owner.type !== "user" || state.owner.userId !== session.user.id) {
    return false;
  }

  const payload = {
    user_id: session.user.id,
    data: {
      version: state.version,
      clientId: state.clientId,
      profile: state.profile,
      focusSessions: state.focusSessions,
      durations: state.durations,
      tasks: state.tasks,
      settings: state.settings,
      stats: state.stats,
      streak: state.streak,
      spotifyUrl: state.spotifyUrl,
      localUpdatedAt: state.sync.localUpdatedAt,
    },
    client_id: state.clientId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient.from("pomoflow_data").upsert(payload, {
    onConflict: "user_id",
  });

  if (error) {
    showToast("Senkron tamamlanamadı", getFriendlyError(error));
    return false;
  }

  await upsertProfile(session.user);
  const pushedAt = new Date().toISOString();
  state.sync.lastPushedAt = pushedAt;
  state.sync.remoteUpdatedAt = pushedAt;
  saveState({ markDirty: false, sync: false });
  renderSyncMeta();
  return true;
}

async function upsertProfile(user) {
  if (!supabaseClient || !user) return false;
  const { error } = await supabaseClient.from("pomoflow_profiles").upsert(
    {
      user_id: user.id,
      display_name: getProfileDisplayName() || user.email?.split("@")[0] || "PomoFlow kullanıcısı",
      role: state.profile.role,
      avatar: state.profile.avatar,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    showToast("Profil senkronize edilemedi", getFriendlyError(error));
    return false;
  }
  return true;
}

function applyUserMetadataProfile(user) {
  const metadata = user?.user_metadata ?? {};
  const fullName = metadata.display_name || metadata.full_name || metadata.name || "";
  const [firstName = "", ...lastNameParts] = fullName.split(" ").filter(Boolean);
  if (!state.profile.firstName) {
    state.profile.firstName = metadata.first_name || firstName || "";
  }
  if (!state.profile.lastName) {
    state.profile.lastName = metadata.last_name || lastNameParts.join(" ") || "";
  }
  if (!state.profile.displayName) {
    state.profile.displayName =
      [state.profile.firstName, state.profile.lastName].filter(Boolean).join(" ").trim() ||
      fullName;
  }
  if (!state.profile.avatar && metadata.avatar) {
    state.profile.avatar = metadata.avatar;
  }
}

async function pullFromCloud(options = {}) {
  if (!supabaseClient) return;
  let session = options.session;
  if (!session) {
    const {
      data: { session: activeSession },
    } = await supabaseClient.auth.getSession();
    session = activeSession;
  }
  if (!session) return;

  const userOwner = {
    type: "user",
    userId: session.user.id,
    email: session.user.email,
  };
  const userStorageKey = getUserStorageKey(session.user.id);
  const savedUserState = localStorage.getItem(userStorageKey);
  const hasSavedUserState = Boolean(savedUserState);
  setActiveState(loadState(userStorageKey, userOwner), userStorageKey, {
    render: false,
  });
  applyUserMetadataProfile(session.user);

  const { data, error } = await supabaseClient
    .from("pomoflow_data")
    .select("data, updated_at, client_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    showToast("Senkron tamamlanamadı", getFriendlyError(error));
    state.sync.activeEmail = session.user.email;
    saveState({ markDirty: false, sync: false });
    render();
    return;
  }

  if (!data?.data && hasSavedUserState) {
    state.owner = userOwner;
    state.sync.activeEmail = session.user.email;
    state.sync.lastPulledAt = new Date().toISOString();
    saveState({ markDirty: false, sync: false });
    await pushToCloud();
    render();
    return;
  }

  if (!data?.data && options.cleanWhenRemoteMissing) {
    const cleanState = defaultState(userOwner);
    setActiveState(cleanState, userStorageKey, {
      render: false,
    });
    applyUserMetadataProfile(session.user);
    state.sync.activeEmail = session.user.email;
    state.sync.lastPulledAt = new Date().toISOString();
    saveState({ markDirty: false, sync: false });
    render();
    return;
  }

  if (!data?.data) {
    const cleanState = defaultState(userOwner);
    setActiveState(cleanState, userStorageKey, {
      render: false,
    });
    state.sync.activeEmail = session.user.email;
    state.sync.lastPulledAt = new Date().toISOString();
    saveState({ markDirty: false, sync: false });
    render();
    return;
  }

  const localUpdatedAt = new Date(state.sync.localUpdatedAt ?? 0).getTime();
  const remoteUpdatedAt = new Date(data.updated_at ?? 0).getTime();
  if (hasSavedUserState && localUpdatedAt > remoteUpdatedAt) {
    state.owner = userOwner;
    state.sync.activeEmail = session.user.email;
    state.sync.remoteUpdatedAt = data.updated_at;
    state.sync.lastPulledAt = new Date().toISOString();
    saveState({ markDirty: false, sync: false });
    await pushToCloud();
    render();
    return;
  }

  const cloud = data.data;
  const userState = defaultState(userOwner);
  setActiveState(userState, userStorageKey, {
    render: false,
  });
  state.version = cloud.version ?? state.version;
  state.profile = { ...state.profile, ...cloud.profile };
  applyUserMetadataProfile(session.user);
  state.focusSessions = cloud.focusSessions ?? state.focusSessions;
  state.durations = { ...state.durations, ...cloud.durations };
  state.tasks = cloud.tasks ?? state.tasks;
  state.settings = { ...state.settings, ...cloud.settings };
  state.stats = cloud.stats ?? state.stats;
  state.streak = { ...state.streak, ...cloud.streak };
  state.spotifyUrl = cloud.spotifyUrl ?? state.spotifyUrl;
  state.owner = {
    type: "user",
    userId: session.user.id,
    email: session.user.email,
  };
  state.sync.activeEmail = session.user.email;
  state.sync.remoteUpdatedAt = data.updated_at;
  state.sync.lastPulledAt = new Date().toISOString();

  remainingSeconds = state.durations[state.mode] * 60;
  totalSeconds = remainingSeconds;
  saveState({ markDirty: false, sync: false });
  applyTheme(state.settings.theme, { markDirty: false, sync: false });
  render();
}

function updateSyncUI(session) {
  state.sync.activeEmail = session?.user?.email ?? "";
  if (session) {
    applyUserMetadataProfile(session.user);
    const name = getProfileDisplayName() || session.user.email;
    elements.syncStatus.textContent = `Senkronize: ${name}`;
    elements.syncNow.hidden = false;
    elements.syncSignOut.hidden = false;
  } else {
    elements.syncStatus.textContent = supabaseClient
      ? "Giriş yaparak verilerini senkronize et"
      : "Yerel kayıt kullanılıyor (config.js yapılandır)";
    elements.syncNow.hidden = true;
    elements.syncSignOut.hidden = true;
  }
  setAuthMode(session ? "account" : authMode === "register" ? "register" : "login");
  renderSyncMeta();
  renderProfile();
}

async function signIn() {
  if (authBusy) return;
  if (!supabaseClient) {
    showToast("Senkron kapalı", "Bulut senkronizasyonu için config.js ayarlarını ekle.");
    return;
  }
  setAuthBusy(true);
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: elements.syncEmail.value.trim(),
      password: elements.syncPassword.value,
    });
    if (error) {
      showToast("Giriş yapılamadı", getFriendlyError(error));
      return;
    }
    const session = data.session;
    if (!session) {
      showToast("Giriş beklemede", "Oturum oluşmadı. E-posta doğrulaması gerekebilir.");
      return;
    }
    await pullFromCloud({ session, cleanWhenRemoteMissing: true });
    updateSyncUI(session);
    closeAuth();
    showToast("Giriş başarılı", "Verilerin senkronize edildi.");
  } catch (error) {
    showToast("Giriş yapılamadı", getFriendlyError(error));
    return;
  } finally {
    setAuthBusy(false);
  }
}

async function signUp() {
  if (authBusy) return;
  if (!supabaseClient) {
    showToast("Senkron kapalı", "Bulut senkronizasyonu için config.js ayarlarını ekle.");
    return;
  }
  setAuthBusy(true);
  try {
    const pendingProfile = {
      ...defaultState({ type: "user" }).profile,
      ...getRegisterProfileFromInputs(),
    };
    const { data, error } = await supabaseClient.auth.signUp({
      email: elements.registerEmail.value.trim(),
      password: elements.registerPassword.value,
      options: {
        data: {
          display_name: pendingProfile.displayName,
          first_name: pendingProfile.firstName,
          last_name: pendingProfile.lastName,
          avatar: pendingProfile.avatar,
        },
      },
    });
    if (error) {
      showToast("Kayıt oluşturulamadı", getFriendlyError(error));
      return;
    }
    if (data.session?.user) {
      const cleanUserState = defaultState({
        type: "user",
        userId: data.session.user.id,
        email: data.session.user.email,
      });
      cleanUserState.profile = { ...cleanUserState.profile, ...pendingProfile };
      setActiveState(cleanUserState, getUserStorageKey(data.session.user.id), {
        render: false,
      });
      await upsertProfile(data.session.user);
      updateSyncUI(data.session);
      render();
    }
    showToast("Kayıt başarılı", "E-postanı doğruladıktan sonra giriş yap.");
  } catch (error) {
    showToast("Kayıt oluşturulamadı", getFriendlyError(error));
  } finally {
    setAuthBusy(false);
  }
}

async function saveProfile() {
  if (authBusy) return;
  if (!supabaseClient) {
    showToast("Senkron kapalı", "Bulut senkronizasyonu için config.js ayarlarını ekle.");
    return;
  }
  setAuthBusy(true);
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) {
      showToast("Giriş gerekli", "Profilini kaydetmek için giriş yap.");
      setAuthMode("login");
      return;
    }
    syncProfileFromInputs();
    await upsertProfile(session.user);
    await pushToCloud();
    updateSyncUI(session);
    render();
    showToast("Profil kaydedildi", "Hesap bilgilerin güncellendi.");
  } catch (error) {
    showToast("Profil kaydedilemedi", getFriendlyError(error));
  } finally {
    setAuthBusy(false);
  }
}

async function signOut() {
  if (authBusy) return;
  if (!supabaseClient) return;
  setAuthBusy(true);
  try {
    await pushToCloud();
    await supabaseClient.auth.signOut();
    resetToGuestState();
    updateSyncUI(null);
    closeAuth();
    showToast("Çıkış yapıldı", "Guest moda geçildi.");
  } catch (error) {
    showToast("Çıkış tamamlanamadı", getFriendlyError(error));
  } finally {
    setAuthBusy(false);
  }
}

async function syncNow() {
  if (authBusy) return;
  if (!supabaseClient) {
    showToast("Senkron kapalı", "Bulut senkronizasyonu için config.js ayarlarını ekle.");
    return;
  }
  setAuthBusy(true);
  try {
    syncProfileFromInputs();
    const pushed = await pushToCloud();
    await pullFromCloud();
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    updateSyncUI(session);
    showToast(
      pushed ? "Senkron tamam" : "Yerel kayıt korundu",
      pushed ? "Profil ve çalışma verileri güncellendi." : "Bulut güncellenemedi, yerel verilerin korunuyor.",
    );
  } catch (error) {
    showToast("Senkron tamamlanamadı", getFriendlyError(error));
  } finally {
    setAuthBusy(false);
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderTimer() {
  const progress = totalSeconds === 0 ? 0 : remainingSeconds / totalSeconds;
  elements.ringProgress.style.strokeDashoffset = `${circumference * (1 - progress)}`;
  elements.timeReadout.textContent = formatTime(remainingSeconds);
  const activeTask = getActiveTask();
  elements.activeTaskLabel.textContent = `Şu an: ${activeTask?.text ?? "Serbest odak"}`;
  elements.startPauseButton.textContent = state.running ? "Duraklat" : "Başlat";
  document.title = state.running
    ? `${formatTime(remainingSeconds)} — PomoFlow`
    : "PomoFlow";
}

function renderTasks() {
  elements.taskList.innerHTML = "";

  if (state.tasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-empty";
    empty.textContent = "Bugün için görev yok. Küçük bir adım ekleyerek başlayabilirsin.";
    elements.taskList.append(empty);
  }

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
  const activeTask = getActiveTask();
  elements.activeTaskLabel.textContent = `Şu an: ${activeTask?.text ?? "Serbest odak"}`;
}

function renderStats() {
  const today = getTodayStats();
  const weekTotal = getWeekTotal();
  const goal = state.settings.dailyGoal;
  const goalProgress = Math.min(today.pomodoros / goal, 1);
  const goalPercent = Math.round(goalProgress * 100);

  elements.todayPomos.textContent = today.pomodoros;
  elements.weekPomos.textContent = weekTotal;
  elements.focusCount.textContent = state.focusSessions;
  elements.streakCount.textContent = state.streak.current;
  elements.streakBadge.classList.toggle(
    "streak-badge--active",
    state.streak.current > 0,
  );

  elements.goalLabel.textContent = `${today.pomodoros} / ${goal} pomo · %${goalPercent}`;
  elements.goalProgressFill.style.width = `${goalProgress * 100}%`;
  elements.goalProgressText.textContent =
    goalProgress >= 1
      ? `🎉 Günlük hedef tamamlandı! ${today.pomodoros} / ${goal} pomo · %${goalPercent}`
      : `Günlük hedef: ${today.pomodoros} / ${goal} pomo · %${goalPercent}`;

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
  elements.profileFirstName.value = state.profile.firstName;
  elements.profileLastName.value = state.profile.lastName;
  elements.accountFirstName.value = state.profile.firstName;
  elements.accountLastName.value = state.profile.lastName;
  elements.profileRole.value = state.profile.role;
  elements.profileAvatar.value = state.profile.avatar;
  renderProfile();
  renderSyncMeta();
}

function getProfileDisplayName() {
  return [state.profile.firstName, state.profile.lastName].filter(Boolean).join(" ").trim() || state.profile.displayName;
}

function getProfileShortName() {
  return state.profile.firstName || getProfileDisplayName().split(" ")[0] || "Hesabım";
}

function syncProfileFromInputs() {
  state.profile.firstName = elements.accountFirstName.value.trim();
  state.profile.lastName = elements.accountLastName.value.trim();
  state.profile.displayName = [state.profile.firstName, state.profile.lastName].filter(Boolean).join(" ").trim();
  state.profile.role = elements.profileRole.value.trim();
  state.profile.avatar = elements.profileAvatar.value;
  state.profile.updatedAt = new Date().toISOString();
  saveState();
}

function getRegisterProfileFromInputs() {
  const firstName = elements.profileFirstName.value.trim();
  const lastName = elements.profileLastName.value.trim();
  return {
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(" ").trim(),
    updatedAt: new Date().toISOString(),
  };
}

function renderProfile() {
  const isSignedIn = Boolean(state.sync.activeEmail);
  const name = getProfileDisplayName() || state.sync.activeEmail || "PomoFlow kullanıcısı";
  const topbarName = getProfileShortName();
  const meta = state.profile.role || state.sync.activeEmail || "Senkronize hesap";
  elements.profileAvatarPreview.textContent = state.profile.avatar;
  elements.profileNamePreview.textContent = name;
  elements.profileMetaPreview.textContent = meta;
  elements.homeProfileAvatar.textContent = isSignedIn ? state.profile.avatar : "👤";
  elements.homeProfileName.textContent = isSignedIn ? topbarName : "Misafir";
  elements.homeProfileMeta.textContent = isSignedIn ? meta : "Giriş yap";
  elements.topbarProfileButton.setAttribute("aria-label", isSignedIn ? "Hesabı aç" : "Giriş yap");
}

function renderSyncMeta() {
  elements.syncMeta.textContent = `Son senkron: ${formatSyncTime(
    state.sync.lastPushedAt || state.sync.lastPulledAt,
  )}`;
}

function renderMobileView() {
  document.body.dataset.mobileView = mobileView;
  document.body.classList.toggle("spotify-expanded", spotifyExpanded);
  document.body.classList.toggle("quote-expanded", quoteExpanded);

  elements.mobileNavItems.forEach((item) => {
    const active = item.dataset.mobileView === mobileView;
    item.classList.toggle("active", active);
    item.setAttribute("aria-current", active ? "page" : "false");
  });

  elements.spotifyToggle.textContent = spotifyExpanded ? "Spotify'ı kapat" : "Spotify'ı aç";
  elements.spotifyToggle.setAttribute("aria-expanded", String(spotifyExpanded));
  elements.quoteToggle.textContent = quoteExpanded ? "Kapat" : "Aç";
  elements.quoteToggle.setAttribute("aria-expanded", String(quoteExpanded));
}

function syncBackgroundVideoSource() {
  if (!elements.backgroundVideo) return;
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const nextSrc = isMobile
    ? elements.backgroundVideo.dataset.mobileSrc
    : elements.backgroundVideo.dataset.desktopSrc;
  const nextUrl = new URL(nextSrc, window.location.href).href;

  if (elements.backgroundVideo.currentSrc === nextUrl || elements.backgroundVideo.src === nextUrl) {
    return;
  }

  elements.backgroundVideo.src = nextSrc;
  elements.backgroundVideo.load();
  elements.backgroundVideo.play().catch(() => {});
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
  renderMobileView();
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
elements.topbarProfileButton.addEventListener("click", openAuth);
elements.settingsClose.addEventListener("click", closeSettings);
elements.authClose.addEventListener("click", closeAuth);
elements.mobileNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    const view = item.dataset.mobileView;
    if (view === "account") {
      openAuth();
      return;
    }
    mobileView = view;
    renderMobileView();
  });
});
elements.spotifyToggle.addEventListener("click", () => {
  spotifyExpanded = !spotifyExpanded;
  renderMobileView();
});
elements.quoteToggle.addEventListener("click", () => {
  quoteExpanded = !quoteExpanded;
  renderMobileView();
});
elements.showRegister.addEventListener("click", () => setAuthMode("register"));
elements.showLogin.addEventListener("click", () => setAuthMode("login"));
elements.settingsOverlay.addEventListener("click", (e) => {
  if (e.target === elements.settingsOverlay) closeSettings();
});
elements.authOverlay.addEventListener("click", (e) => {
  if (e.target === elements.authOverlay) closeAuth();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !elements.settingsOverlay.hidden) closeSettings();
  if (e.key === "Escape" && !elements.authOverlay.hidden) closeAuth();
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
elements.syncNow.addEventListener("click", syncNow);
elements.saveProfile.addEventListener("click", saveProfile);

[elements.accountFirstName, elements.accountLastName, elements.profileRole, elements.profileAvatar].forEach((input) => {
  input.addEventListener("change", () => {
    syncProfileFromInputs();
    renderProfile();
  });
});

// ─── Init ────────────────────────────────────────────────────────────────────

applyTheme(state.settings.theme, { markDirty: false, sync: false });
render();

supabaseClient = initSupabase();
if (supabaseClient) {
  supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      await pullFromCloud();
    }
    updateSyncUI(session);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      setTimeout(async () => {
        await pullFromCloud({ session });
        updateSyncUI(session);
      }, 0);
      return;
    }
    updateSyncUI(session);
  });
} else {
  updateSyncUI(null);
}

if (elements.backgroundVideo) {
  elements.backgroundVideo.muted = true;
  syncBackgroundVideoSource();
  window
    .matchMedia("(max-width: 640px)")
    .addEventListener("change", syncBackgroundVideoSource);
}
