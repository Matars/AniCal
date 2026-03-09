const JIKAN_API = "https://api.jikan.moe/v4";
const DAYS_OF_WEEK = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

let isAnimeMode = true;
let showAllBookmarks = false;
let animeData = {};
let mangaData = {};
let bookmarks = new Set();

// Calendar state
let scheduleData = {};       // { monday: [...], tuesday: [...], ... }
let calMonth = new Date().getMonth();
let calYear  = new Date().getFullYear();

// ── API ──────────────────────────────────────────────

async function fetchJikanData(endpoint) {
  const response = await fetch(`${JIKAN_API}${endpoint}`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return await response.json();
}

async function fetchCurrentSeason() {
  const data = await fetchJikanData("/seasons/now");
  const results = data.data.slice(0, 10).map((item) => ({
    id: item.mal_id, title: item.title,
    image: item.images.jpg.image_url, info: item.synopsis, type: "anime",
    score: item.score || 0,
  }));
  return results.sort((a, b) => b.score - a.score);
}

async function fetchTopManga() {
  const data = await fetchJikanData("/top/manga");
  const results = data.data.slice(0, 10).map((item) => ({
    id: item.mal_id, title: item.title,
    image: item.images.jpg.image_url, info: item.synopsis, type: "manga",
    score: item.score || 0,
  }));
  return results.sort((a, b) => b.score - a.score);
}

async function fetchSchedule(day) {
  const data = await fetchJikanData(`/schedules?filter=${day}`);
  const results = data.data.slice(0, 10).map((item) => ({
    id: item.mal_id, title: item.title,
    image: item.images.jpg.image_url, info: item.synopsis, type: "anime",
    score: item.score || 0,
  }));
  return results.sort((a, b) => b.score - a.score);
}

// Fetch all 7 days for calendar (sequential to respect rate limits)
async function fetchAllSchedules() {
  for (const day of DAYS_OF_WEEK) {
    if (scheduleData[day]) continue;
    try {
      const data = await fetchJikanData(`/schedules?filter=${day}`);
      scheduleData[day] = data.data.map((item) => ({
        id: item.mal_id, title: item.title,
        image: item.images.jpg.image_url, info: item.synopsis, type: "anime",
        score: item.score || 0,
      })).sort((a, b) => b.score - a.score);
    } catch (e) {
      scheduleData[day] = [];
    }
    await new Promise((r) => setTimeout(r, 380)); // ~3 req/sec rate limit
  }
}

// ── Feed UI ──────────────────────────────────────────

function createEntryElement(item) {
  const entry = document.createElement("div");
  entry.className = "entry";
  const isBookmarked = bookmarks.has(item.id);
  entry.innerHTML = `
    <div class="entry-buttons">
      <button class="entry-button info-btn">INFO</button>
      <button class="entry-button bookmark-btn ${isBookmarked ? "bookmarked" : ""}">${isBookmarked ? "★" : "☆"}</button>
    </div>
    <img src="${item.image}" alt="${item.title}">
    ${item.score ? `<div class="entry-score">${item.score.toFixed(1)}</div>` : ""}
    <div class="entry-title">${item.title}</div>
  `;
  // Clicking the cover image also opens info
  entry.querySelector("img").addEventListener("click", () => showModal(item));
  entry.querySelector(".info-btn").addEventListener("click", () => showModal(item));
  entry.querySelector(".bookmark-btn").addEventListener("click", () => toggleBookmark(item));
  return entry;
}

function toggleBookmark(item) {
  if (bookmarks.has(item.id)) {
    bookmarks.delete(item.id);
  } else {
    bookmarks.add(item.id);
  }
  chrome.storage.sync.set({ bookmarks: Array.from(bookmarks) });
  updateDisplay();
}

async function updateDisplay() {
  const data = isAnimeMode ? animeData : mangaData;

  setLoading("currentSeasonList", true);
  setLoading("todayReleasesList", true);
  setLoading("tomorrowReleasesList", true);

  try {
    if (isAnimeMode) {
      if (!animeData.currentSeason)
        animeData.currentSeason = await fetchCurrentSeason();
      if (!animeData.todayReleases)
        animeData.todayReleases = await fetchSchedule(
          new Date().toLocaleString("en-us", { weekday: "long" }).toLowerCase()
        );
      if (!animeData.tomorrowReleases) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        animeData.tomorrowReleases = await fetchSchedule(
          tomorrow.toLocaleString("en-us", { weekday: "long" }).toLowerCase()
        );
      }
    } else {
      if (!mangaData.currentSeason)
        mangaData.currentSeason = await fetchTopManga();
    }

    updateSection("currentSeasonList", data.currentSeason);
    updateBookmarks();

    if (isAnimeMode) {
      updateSection("todayReleasesList", data.todayReleases);
      updateSection("tomorrowReleasesList", data.tomorrowReleases);
    } else {
      document.getElementById("todayReleasesList").innerHTML = "<p>Not available for manga</p>";
      document.getElementById("tomorrowReleasesList").innerHTML = "<p>Not available for manga</p>";
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    setError("currentSeasonList");
    setError("todayReleasesList");
    setError("tomorrowReleasesList");
  }
}

function updateSection(sectionId, items) {
  const section = document.getElementById(sectionId);
  section.innerHTML = "";
  items.forEach((item) => section.appendChild(createEntryElement(item)));
}

function updateBookmarks() {
  const bookmarksList = document.getElementById("bookmarksList");
  const bookmarkCount = document.querySelector(".bookmark-count");

  bookmarksList.innerHTML = "";
  const bookmarkedItems = [
    ...(animeData.currentSeason || []),
    ...(animeData.todayReleases || []),
    ...(animeData.tomorrowReleases || []),
    ...(mangaData.currentSeason || []),
  ].filter((item) => bookmarks.has(item.id));

  bookmarkCount.textContent = bookmarkedItems.length;
  bookmarkedItems.length > 0
    ? bookmarkCount.classList.add("visible")
    : bookmarkCount.classList.remove("visible");

  const itemsToShow = showAllBookmarks ? bookmarkedItems : bookmarkedItems.slice(0, 5);

  if (itemsToShow.length === 0) {
    bookmarksList.innerHTML = "<p>No bookmarks yet</p>";
  } else {
    itemsToShow.forEach((item) => bookmarksList.appendChild(createEntryElement(item)));
  }
}

function setLoading(elementId, isLoading) {
  const element = document.getElementById(elementId);
  element.innerHTML = isLoading ? '<div class="loading-wheel"></div>' : "";
}

function setError(elementId) {
  document.getElementById(elementId).innerHTML = "<p>Error loading data</p>";
}

function showModal(item) {
  const modal = document.getElementById("modal");
  document.getElementById("modalContent").innerHTML = `
    <h2>${item.title}</h2>
    <img src="${item.image}" alt="${item.title}">
    <p>${item.info || "No description available."}</p>
    <span class="modal-type">${item.type.toUpperCase()}</span>
    ${item.score ? `<span class="modal-score">${item.score.toFixed(1)}</span>` : ""}
  `;
  modal.classList.add("active");
}

// ── Calendar ─────────────────────────────────────────

function renderCalendarGrid() {
  const today = new Date();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const monthName = new Date(calYear, calMonth, 1)
    .toLocaleString("en-us", { month: "long" });
  document.getElementById("calMonthYear").textContent =
    `${monthName.toUpperCase()} ${calYear}`;

  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day cal-day--empty";
    grid.appendChild(empty);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const date     = new Date(calYear, calMonth, d);
    const dayName  = DAYS_OF_WEEK[date.getDay()];
    const releases = scheduleData[dayName] || [];
    const isToday  =
      d === today.getDate() &&
      calMonth === today.getMonth() &&
      calYear  === today.getFullYear();

    const cell = document.createElement("div");
    cell.className =
      "cal-day" +
      (isToday ? " cal-day--today" : "") +
      (releases.length ? " cal-day--has-releases" : "");

    cell.innerHTML = `
      <span class="cal-day-num">${d}</span>
      ${releases.length ? '<span class="cal-dot"></span>' : ""}
    `;

    cell.addEventListener("mouseenter", () => {
      document.querySelectorAll(".cal-day--active").forEach((el) =>
        el.classList.remove("cal-day--active")
      );
      if (!isToday) cell.classList.add("cal-day--active");
      showCalDayReleases(dayName, d, releases);
    });

    grid.appendChild(cell);
  }
}

function showCalDayReleases(dayName, dateNum, releases) {
  document.getElementById("calDayLabel").textContent =
    `${dayName.toUpperCase()} ${dateNum}`;
  document.getElementById("calReleaseCount").textContent =
    releases.length ? `${releases.length} RELEASES` : "NONE SCHEDULED";

  const list = document.getElementById("calReleaseList");
  list.innerHTML = "";

  if (!releases.length) {
    const p = document.createElement("p");
    p.className = "cal-placeholder";
    p.textContent = "No scheduled releases";
    list.appendChild(p);
    return;
  }

  releases.forEach((item) => {
    const card = document.createElement("div");
    card.className = "cal-release-card";
    card.innerHTML = `
      <div class="cal-release-img-wrap">
        <img src="${item.image}" alt="${item.title}">
        ${item.score ? `<div class="cal-release-score">${item.score.toFixed(1)}</div>` : ""}
      </div>
      <span>${item.title}</span>
    `;
    card.addEventListener("click", () => showModal(item));
    list.appendChild(card);
  });
}

async function openCalendarView() {
  document.getElementById("feedView").classList.remove("active");
  document.getElementById("calendarView").classList.add("active");
  document.getElementById("modeToggleContainer").style.display = "none";
  document.getElementById("feedTab").classList.remove("active");
  document.getElementById("calTab").classList.add("active");

  // Render grid immediately (may have empty dots until data loads)
  renderCalendarGrid();

  // Show today's data or a loading state in the panel
  const todayDayName = DAYS_OF_WEEK[new Date().getDay()];
  if (scheduleData[todayDayName]) {
    showCalDayReleases(todayDayName, new Date().getDate(), scheduleData[todayDayName]);
  } else {
    document.getElementById("calDayLabel").textContent = "LOADING SCHEDULE...";
    document.getElementById("calReleaseCount").textContent = "";
    document.getElementById("calReleaseList").innerHTML =
      '<div class="cal-loading"></div>';
  }

  // Fetch all 7 days in background; re-render when done
  await fetchAllSchedules();
  renderCalendarGrid();
  showCalDayReleases(todayDayName, new Date().getDate(), scheduleData[todayDayName] || []);
}

function openFeedView() {
  document.getElementById("calendarView").classList.remove("active");
  document.getElementById("feedView").classList.add("active");
  document.getElementById("modeToggleContainer").style.display = "";
  document.getElementById("calTab").classList.remove("active");
  document.getElementById("feedTab").classList.add("active");
}

// ── Init ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const modeToggle         = document.getElementById("modeToggle");
  const showAllBookmarksBtn= document.getElementById("showAllBookmarks");
  const modal              = document.getElementById("modal");
  const modalClose         = document.querySelector(".modal-close");
  const modalBackdrop      = document.querySelector(".modal-backdrop");
  const toggleBookmarksBtn = document.getElementById("toggleBookmarks");
  const closeBookmarksBtn  = document.getElementById("closeBookmarks");
  const bookmarksSection   = document.querySelector(".bookmarks");
  const content            = document.querySelector(".content");

  chrome.storage.sync.get(["bookmarks"], (result) => {
    bookmarks = new Set(result.bookmarks || []);
    updateDisplay();
  });

  // View tabs
  document.getElementById("feedTab").addEventListener("click", openFeedView);
  document.getElementById("calTab").addEventListener("click", openCalendarView);

  // Calendar month navigation
  document.getElementById("calPrev").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendarGrid();
  });

  document.getElementById("calNext").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendarGrid();
  });

  // Anime / manga toggle
  modeToggle.addEventListener("click", () => {
    isAnimeMode = !isAnimeMode;
    modeToggle.classList.toggle("manga");
    updateDisplay();
  });

  // Show all bookmarks
  showAllBookmarksBtn.addEventListener("click", () => {
    showAllBookmarks = !showAllBookmarks;
    showAllBookmarksBtn.textContent = showAllBookmarks ? "Show Less" : "Show All";
    updateBookmarks();
  });

  // Modal close
  const closeModal = () => modal.classList.remove("active");
  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);

  // Bookmarks sidebar
  const openBookmarks  = () => { bookmarksSection.classList.add("open");    content.style.marginRight = "290px"; };
  const closeBookmarks = () => { bookmarksSection.classList.remove("open"); content.style.marginRight = "0"; };

  toggleBookmarksBtn.addEventListener("click", () =>
    bookmarksSection.classList.contains("open") ? closeBookmarks() : openBookmarks()
  );
  closeBookmarksBtn.addEventListener("click", closeBookmarks);

  updateDisplay();
});
