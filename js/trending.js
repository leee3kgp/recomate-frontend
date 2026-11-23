import { requireLogin } from "./api.js";
import { GENRES, loadGenres } from "./genres.js";
import {
    TYPES, SORTS, COUNTRIES, isValidCountry,
    fetchPopular, popularErrorText, createPosterCard
} from "./popular.js";

// =====================================
// RecoMate - 요즘 대세 (recomate-0/trending.html 시안 기준, 로그인 전용)
// GET /api/popular?genre&country&type&sort
//   - 종류 탭(전체/영화/TV 시리즈) → type
//   - 국가 선택 → country (명세의 10개 국가, 시안 4개보다 많음)
//   - 정렬 선택(인기순/평점순/최신순) → sort
//   - 장르 칩 → 여러 개 선택. 고른 장르를 모두 포함한 작품만 (API가 장르를 1개만 받으므로
//     장르마다 조회해 모든 목록에 나온 작품만 남김, popular.js fetchPopular)
//   - 어떤 필터든 최대 20개
//   - 국가는 서버 결과 그대로 (원작 국가가 여러 개인 작품은 다른 국가 필터에도 나올 수 있음)
// 필터는 주소(?type&country&sort&genre=A,B)에 반영해 새로고침·뒤로 가기·공유에도 유지
// 인기순일 때만 상위 3개에 순위 배지 (시안과 동일, 장르 여러 개 선택 시 제외)
// =====================================

const MAX_ITEMS = 20;
const SKELETON_COUNT = 12;
const DEFAULT_SORT = "POPULAR";

const $ = (selector) => document.querySelector(selector);

const typeTabs = $("#type-tabs");
const countrySelect = $("#country");
const sortSelect = $("#sort");
const genreBox = $("#genre-filter");
const resultCount = $("#result-count");
const resetButton = $("#reset-filter");
const body = $("#trend-body");
const status = $("#trend-status");

let genres = GENRES;
let genreNames = {};
let requestId = 0;

const state = { type: "", country: "", sort: DEFAULT_SORT, genres: [] };

const el = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
};

// ---------- 주소 ↔ 상태 ----------

function readUrl() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || "";
    const country = (params.get("country") || "").toUpperCase();
    const sort = (params.get("sort") || "").toUpperCase();
    const genreCodes = params.getAll("genre")
        .flatMap((value) => value.split(","))
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);

    state.type = TYPES.some((t) => t.value === type) ? type : "";
    state.country = isValidCountry(country) ? country : "";
    state.sort = SORTS.some((s) => s.value === sort) ? sort : DEFAULT_SORT;
    // 장르는 장르 목록과 대조해 다시 확인 (setGenres)
    state.genres = [...new Set(genreCodes)];
}

function writeUrl() {
    const params = new URLSearchParams();

    if (state.type) params.set("type", state.type);
    if (state.country) params.set("country", state.country);
    if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort.toLowerCase());
    if (state.genres.length) params.set("genre", state.genres.join(","));

    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;

    if (url !== `${window.location.pathname}${window.location.search}`) {
        history.replaceState(null, "", url);
    }
}

const isFiltered = () => Boolean(state.type || state.country || state.genres.length || state.sort !== DEFAULT_SORT);

// ---------- 컨트롤 ----------

function buildControls() {
    typeTabs.replaceChildren(...TYPES.map((t) => {
        const tab = el("button", "tab", t.label);

        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.dataset.type = t.value;

        return tab;
    }));

    countrySelect.replaceChildren(
        new Option("모든 국가", ""),
        ...COUNTRIES.map((c) => new Option(c.label, c.value))
    );

    sortSelect.replaceChildren(...SORTS.map((s) => new Option(s.label, s.value)));
}

function buildGenreChips() {
    genreBox.replaceChildren(...genres.map((g) => {
        const chip = el("button", "chip", g.name);

        chip.type = "button";
        chip.dataset.genre = g.code;

        return chip;
    }));
}

function syncControls() {
    typeTabs.querySelectorAll(".tab").forEach((tab) => {
        tab.setAttribute("aria-selected", String(tab.dataset.type === state.type));
    });

    countrySelect.value = state.country;
    sortSelect.value = state.sort;

    genreBox.querySelectorAll(".chip").forEach((chip) => {
        chip.setAttribute("aria-pressed", String(state.genres.includes(chip.dataset.genre)));
    });

    resetButton.hidden = !isFiltered();
}

function setGenres(list) {
    genres = list;
    genreNames = Object.fromEntries(list.map((g) => [g.code, g.name]));

    state.genres = state.genres.filter((code) => genreNames[code]);

    buildGenreChips();
    syncControls();
}

// ---------- 본문 ----------

function showSkeleton() {
    body.setAttribute("aria-busy", "true");
    resultCount.textContent = "불러오는 중…";

    const grid = el("div", "grid posters");

    grid.setAttribute("aria-hidden", "true");
    grid.innerHTML = Array.from({ length: SKELETON_COUNT }, () => `
        <div class="poster-card">
            <div class="poster skeleton"></div>
            <div><div class="line skeleton"></div><div class="line skeleton short"></div></div>
        </div>`).join("");

    body.replaceChildren(grid);
}

function showState({ title, text, actionLabel, onAction, error = false }) {
    body.setAttribute("aria-busy", "false");

    const box = el("div", "empty");

    box.append(el("h3", "", title), el("p", "", text));

    if (actionLabel) {
        const button = el("button", "btn btn-secondary", actionLabel);

        button.type = "button";
        button.addEventListener("click", onAction);
        box.append(button);
    }

    if (error) box.setAttribute("role", "alert");

    body.replaceChildren(box);
    status.textContent = title;
}

function render(items) {
    body.setAttribute("aria-busy", "false");

    const multiGenre = state.genres.length > 1;

    resultCount.textContent = `작품 ${items.length}개`;

    if (!items.length) {
        // 시안 .empty: 제목 + 안내 + 필터 초기화
        showState(multiGenre
            ? {
                title: "고른 장르가 모두 겹치는 작품이 없어요",
                text: `${state.genres.map((code) => genreNames[code] || code).join(", ")}을(를) 모두 포함한 작품이 없어요. 장르를 하나 빼거나 국가를 바꿔보세요.`,
                actionLabel: "필터 초기화",
                onAction: reset
            }
            : {
                title: "조건에 맞는 작품이 없어요",
                text: "장르를 하나 빼거나 국가를 바꿔보세요.",
                actionLabel: "필터 초기화",
                onAction: reset
            });
        return;
    }

    const grid = el("div", "grid posters");
    // 여러 장르 목록을 합친 순서는 실제 인기 순위가 아니므로 순위 배지는 장르 1개 이하일 때만
    const showRank = state.sort === "POPULAR" && !multiGenre;

    grid.append(...items.map((item, i) => createPosterCard(item, {
        rank: showRank && i < 3 ? i + 1 : 0,
        genreNames
    })));

    body.replaceChildren(grid);
    status.textContent = `작품 ${items.length}개를 보여줘요`;
}

async function load() {
    const id = ++requestId;

    writeUrl();
    syncControls();
    showSkeleton();

    try {
        const items = await fetchPopular({ ...state, limit: MAX_ITEMS });

        if (id === requestId) render(items);
    } catch (error) {
        if (id !== requestId) return;

        console.error("인기 목록 API 에러:", error);
        resultCount.textContent = "";
        showState({
            title: "인기 목록을 불러오지 못했어요",
            text: popularErrorText(error),
            actionLabel: "다시 시도",
            onAction: load,
            error: true
        });
    }
}

function reset() {
    state.type = "";
    state.country = "";
    state.sort = DEFAULT_SORT;
    state.genres = [];
    load();
}

// ---------- 이벤트 ----------

typeTabs.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-type]");

    if (!tab || tab.dataset.type === state.type) return;

    state.type = tab.dataset.type;
    load();
});

// 탭 목록 좌우 방향키 이동
typeTabs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

    const tabs = [...typeTabs.querySelectorAll(".tab")];
    const index = tabs.indexOf(document.activeElement);

    if (index < 0) return;

    const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];

    next.focus();
    next.click();
});

countrySelect.addEventListener("change", () => {
    state.country = countrySelect.value;
    load();
});

sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    load();
});

genreBox.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-genre]");

    if (!chip) return;

    const code = chip.dataset.genre;

    state.genres = state.genres.includes(code)
        ? state.genres.filter((c) => c !== code)
        : [...state.genres, code];
    load();
});

resetButton.addEventListener("click", reset);

// ---------- 시작 ----------

await requireLogin();

readUrl();
buildControls();
setGenres(GENRES); // 기본 목록에 없는 장르 코드는 여기서 해제
load();

// 서버 장르 목록으로 칩을 다시 그림 (선택한 장르가 서버 목록에 없으면 필터 없이 다시 조회)
loadGenres().then((list) => {
    const before = state.genres.length;

    setGenres(list);

    if (before !== state.genres.length) load();
});
