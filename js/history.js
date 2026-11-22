/* =========================================
   RecoMate - 추천 기록 (마이 페이지 > 추천 기록 탭, recomate-0/history.html 시안 기준)
   - profile-tabs.js가 탭을 처음 열 때 startHistory()를 호출해 그때 API 조회
   - GET    /api/sessions?limit&nextToken : 내 추천 세션 목록 (최신순, 이름·TOP 3 요약 포함)
   - DELETE /api/sessions/{sessionId}     : 추천 기록 삭제 (결과·분석도 함께 삭제)
   - 시안처럼 전체 개수·기간·이름 검색이 모든 기록에 적용되도록 모든 페이지를 이어서 불러옴
   - 목록 응답에 이름·TOP 3가 없으면(백엔드 보강 전 배포본) 상세 API로 채움
   - 항목 삭제: 바로 숨기고 "기록을 지웠어요 · 되돌리기" 토스트 → 토스트가 닫히면 DELETE
   - 전체 삭제: 일괄 삭제 API가 없어 한 건씩 DELETE
========================================= */

import { requireLogin, apiFetch } from "./api.js";
import { showToast } from "./toast.js";
import { clearFlow, patchFlow, isValidCount } from "./flow-state.js";

const PAGE_SIZE = 100;          // 명세 최대값 (요청 수 최소화)
const TMDB_POSTER_BASE_URL = "https://image.tmdb.org/t/p/w185";
const DAY_MS = 24 * 60 * 60 * 1000;
const UNDO_MS = 3600;           // 되돌리기 토스트 표시 시간 (시안과 동일)
const CLEAR_CONCURRENCY = 3;    // 전체 삭제 동시 요청 수

const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>';

const $ = (selector) => document.querySelector(selector);

const listEl = $("#list");
const summaryEl = $("#summary");
const searchInput = $("#q");
const rangeTabs = $("#range-tabs");
const clearAllButton = $("#clear-all");
const clearModal = $("#clear-modal");
const clearGo = $("#clear-go");
const clearCancel = $("#clear-cancel");
const clearStatus = $("#clear-status");
const clearError = $("#clear-error");

// ---------- 상태 ----------

const state = {
    sessions: [],          // 불러온 기록 (서버 순서 = 최신순)
    nextToken: null,       // 다음 페이지 토큰 (null이면 끝)
    seenTokens: new Set(), // 같은 토큰이 반복되면 무한 조회 방지
    loaded: false,         // 첫 페이지를 받았는지
    loading: false,
    error: null,           // 첫 페이지 조회 실패 메시지
    moreError: false,      // 이후 페이지 조회 실패
    range: "all",          // "all" | "7" | "30"
    query: "",
    pending: new Map(),    // 되돌리기 대기 중인 삭제: sessionId → { timer, committing }
    clearing: false        // 전체 삭제 진행 중
};

// 되돌리기 대기 중인 기록은 화면·개수에서 뺌
function activeSessions() {
    return state.sessions.filter((s) => !state.pending.has(s.sessionId));
}

// ---------- 공통 ----------

function el(tag, className = "", text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
}

function participantName(participant) {
    const name = typeof participant?.name === "string" ? participant.name.trim() : "";

    return name || `참여자 ${participant?.index ?? ""}`.trim();
}

// 아바타용 첫 글자 (이모지가 쪼개지지 않게 글자 단위)
function initialOf(name) {
    const text = String(name || "").trim();

    if (!text) return "?";

    if (window.Intl?.Segmenter) {
        return new Intl.Segmenter("ko", { granularity: "grapheme" })
            .segment(text)[Symbol.iterator]().next().value.segment;
    }

    return Array.from(text)[0];
}

// 시안 형식: 2026-11-04 21:30
function formatDate(createdAt) {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) return "날짜 정보 없음";

    const pad = (n) => String(n).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function participantsOf(session) {
    return Array.isArray(session?.participants)
        ? [...session.participants].sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0))
        : [];
}

function recommendationsOf(session) {
    return Array.isArray(session?.recommendations)
        ? [...session.recommendations].sort((a, b) => (a?.rank ?? 0) - (b?.rank ?? 0)).slice(0, 3)
        : [];
}

function resultUrl(session) {
    const params = new URLSearchParams({ sessionId: String(session.sessionId) });

    if (isValidCount(session.participantCount)) {
        params.set("count", String(session.participantCount));
    }

    return `result.html?${params.toString()}`;
}

function detailUrl(item) {
    const params = new URLSearchParams({
        mediaType: String(item.mediaType),
        tmdbId: String(item.tmdbId)
    });

    return `detail.html?${params.toString()}`;
}

// 포스터가 없을 때 배경 (시안: 작품마다 다른 색 그라데이션)
function posterBackground(seed) {
    let hash = 0;

    for (const ch of String(seed)) {
        hash = (hash * 31 + ch.codePointAt(0)) % 360;
    }

    return `linear-gradient(160deg, hsl(${hash} 60% 32%), hsl(${(hash + 40) % 360} 55% 14%))`;
}

// ---------- 필터 ----------

function withinRange(session) {
    if (state.range === "all") return true;

    const created = new Date(session.createdAt).getTime();

    if (Number.isNaN(created)) return false;

    return Date.now() - created <= Number(state.range) * DAY_MS;
}

function matchesQuery(session) {
    if (!state.query) return true;

    const query = state.query.toLowerCase();

    return participantsOf(session).some((p) =>
        typeof p?.name === "string" && p.name.toLowerCase().includes(query)
    );
}

function visibleSessions() {
    return activeSessions().filter((s) => withinRange(s) && matchesQuery(s));
}

// ---------- 렌더링: 카드 ----------

function renderPoster(item) {
    const title = item.title || "제목 없음";
    const link = el("a", "history-poster");

    link.href = detailUrl(item);
    link.title = title;

    const frame = el("div", "poster");

    frame.style.background = posterBackground(`${item.mediaType}:${item.tmdbId}`);
    frame.append(el("div", "fallback", title));

    if (item.posterPath) {
        const img = el("img");

        img.src = `${TMDB_POSTER_BASE_URL}${item.posterPath}`;
        img.alt = `${title} 포스터`;
        img.loading = "lazy";
        img.addEventListener("error", () => img.remove());
        frame.append(img);
    }

    frame.append(el("span", "badge brand rank", `${item.rank}위`));

    link.append(frame, el("div", "history-poster-title", title));

    return link;
}

function renderCard(session) {
    const people = participantsOf(session);
    const tops = recommendationsOf(session);
    const dateText = formatDate(session.createdAt);
    const count = session.participantCount ?? people.length;

    const card = el("article", "card tight");

    // 날짜·인원 / 참여자 / 삭제
    const head = el("div", "row wrap history-card-head");
    const meta = el("div");

    meta.append(el("div", "muted history-date", `${dateText}, ${count}명`));

    const pills = el("div", "participants");

    people.forEach((p, i) => {
        const name = participantName(p);
        const pill = el("span", "p-pill");
        const avatar = el("span", "p-avatar", initialOf(name));

        avatar.style.background = `var(--p${(i % 6) + 1})`;
        pill.append(avatar, document.createTextNode(name));
        pills.append(pill);
    });

    meta.append(pills);

    const remove = el("button", "icon-btn");

    remove.type = "button";
    remove.dataset.delete = session.sessionId;
    remove.setAttribute("aria-label", `${dateText} 기록 삭제`);
    remove.innerHTML = ICON_CLOSE;

    head.append(meta, remove);
    card.append(head);

    // TOP 3
    if (tops.length) {
        const grid = el("div", "history-posters");

        tops.forEach((item) => grid.append(renderPoster(item)));
        card.append(grid);
    } else {
        card.append(el("p", "muted history-no-result", "아직 추천 결과를 만들지 않은 기록이에요."));
    }

    // 결과 다시 보기 / 같은 사람들과 다시
    const actions = el("div", "row wrap");
    const view = el("a", "btn btn-secondary btn-sm", tops.length ? "결과 다시 보기" : "추천 결과 받기");

    view.href = resultUrl(session);
    actions.append(view);

    if (isValidCount(count)) {
        const again = el("button", "btn btn-ghost btn-sm");

        again.type = "button";
        again.dataset.again = session.sessionId;
        again.innerHTML = `${ICON_REFRESH}같은 사람들과 다시`;
        actions.append(again);
    }

    card.append(actions);

    return card;
}

// ---------- 렌더링: 화면 상태 ----------

function renderSkeleton() {
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 3; i += 1) {
        const card = el("div", "card tight history-skeleton");

        card.setAttribute("aria-hidden", "true");
        card.innerHTML = `
            <span class="sk sk-line" style="width: 40%"></span>
            <span class="sk sk-line" style="width: 60%"></span>
            <div class="history-posters">
                <span class="sk sk-poster"></span><span class="sk sk-poster"></span><span class="sk sk-poster"></span>
            </div>`;
        frag.append(card);
    }

    return frag;
}

function renderEmpty() {
    const box = el("div", "card empty");
    const start = el("a", "btn btn-primary", "추천 시작하기");

    start.href = "start.html";
    box.append(
        el("h3", "", "아직 추천 기록이 없어요"),
        el("p", "", "친구나 가족과 함께 첫 추천을 받아보세요."),
        start
    );

    return box;
}

function renderNoMatch() {
    const box = el("div", "card empty");

    box.append(el("p", "history-flush", "조건에 맞는 기록이 없어요."));

    return box;
}

function renderRetry(title, message, onRetry) {
    const box = el("div", "card empty");
    const retry = el("button", "btn btn-secondary", "다시 시도");

    box.setAttribute("role", "alert");
    retry.type = "button";
    retry.addEventListener("click", onRetry);

    if (title) box.append(el("h3", "", title));
    box.append(el("p", "", message), retry);

    return box;
}

function renderSummary() {
    if (!state.loaded) {
        summaryEl.textContent = state.error ? "" : "추천 기록을 불러오는 중이에요.";
        return;
    }

    const total = activeSessions().length;

    // 아직 다 못 불러왔으면 전체 횟수 대신 불러온 개수
    summaryEl.textContent = state.nextToken
        ? `최근 기록 ${total}개를 보여드려요`
        : `지금까지 ${total}번 함께 골랐어요`;

    // 다 불러왔을 때만 마이 페이지 상단 개수·탈퇴 안내 개수에 반영 (profile.js)
    if (!state.nextToken) {
        document.dispatchEvent(new CustomEvent("history:count", { detail: { total } }));
    }
}

function render() {
    renderSummary();
    listEl.setAttribute("aria-busy", String(state.loading));
    listEl.replaceChildren();

    clearAllButton.disabled =
        !state.loaded || state.clearing || (!activeSessions().length && !state.nextToken);

    // 첫 페이지 전
    if (!state.loaded) {
        listEl.append(state.error
            ? renderRetry("추천 기록을 불러오지 못했어요", state.error, () => {
                state.error = null;
                loadAll();
            })
            : renderSkeleton());
        return;
    }

    const hasAny = activeSessions().length > 0;

    if (!hasAny && state.nextToken && state.loading) {
        listEl.append(renderSkeleton());
        return;
    }

    if (!hasAny && !state.nextToken) {
        listEl.append(renderEmpty());
        return;
    }

    const shown = visibleSessions();

    if (shown.length) {
        shown.forEach((s) => listEl.append(renderCard(s)));
    } else if (!state.loading) {
        listEl.append(renderNoMatch());
    }

    if (state.moreError) {
        listEl.append(renderRetry("", "이전 기록을 다 불러오지 못했어요.", () => {
            state.moreError = false;
            loadAll();
        }));
    }
}

// ---------- 데이터 ----------

// 목록 응답에 이름·TOP 3가 빠져 있으면 상세 API(GET /api/sessions/{id})로 채움
function needsDetail(session) {
    return !Array.isArray(session.participants)
        || !Array.isArray(session.recommendations);
}

async function enrichSessions(sessions) {
    await Promise.all(sessions.filter(needsDetail).map(async (session) => {
        try {
            const detail = await apiFetch(`/api/sessions/${encodeURIComponent(session.sessionId)}`);

            if (!Array.isArray(session.participants) && Array.isArray(detail?.participants)) {
                session.participants = detail.participants.map((p) => ({ index: p?.index, name: p?.name ?? null }));
            }

            if (!Array.isArray(session.recommendations) && Array.isArray(detail?.recommendations)) {
                session.recommendations = detail.recommendations.map((r) => ({
                    rank: r?.rank,
                    tmdbId: r?.tmdbId,
                    mediaType: r?.mediaType,
                    title: r?.title,
                    posterPath: r?.posterPath
                }));
            }
        } catch (error) {
            console.error("추천 기록 상세 조회 실패:", session.sessionId, error);
        }
    }));
}

// 한 페이지를 받아 state에 붙임 (실패하면 throw)
async function fetchPage() {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });

    if (state.nextToken) {
        query.set("nextToken", state.nextToken);
    }

    const page = await apiFetch(`/api/sessions?${query.toString()}`);
    const token = page?.nextToken || null;

    const known = new Set(state.sessions.map((s) => s.sessionId));
    const sessions = (Array.isArray(page?.sessions) ? page.sessions : [])
        .filter((s) => s?.sessionId && !known.has(s.sessionId));

    await enrichSessions(sessions);

    state.sessions.push(...sessions);

    if (token && state.seenTokens.has(token)) {
        console.error("추천 기록 페이지가 반복되어 조회를 중단했어요.");
        state.nextToken = null;
    } else {
        if (token) state.seenTokens.add(token);
        state.nextToken = token;
    }

    state.loaded = true;
    state.error = null;
}

// 첫 페이지를 그린 뒤 남은 페이지를 이어서 불러옴
async function loadAll() {
    if (state.loading) return;

    state.loading = true;
    render();

    try {
        do {
            await fetchPage();
            render();
        } while (state.nextToken);
    } catch (error) {
        console.error("추천 기록 조회 실패:", error);

        if (state.loaded) {
            state.moreError = true;
        } else {
            state.error = error?.message || "잠시 후 다시 시도해주세요.";
        }
    } finally {
        state.loading = false;
        render();
    }
}

// ---------- 항목 삭제 (되돌리기) ----------

function removeFromState(sessionId) {
    state.sessions = state.sessions.filter((s) => s.sessionId !== sessionId);
}

// 실제 DELETE 요청. 성공(이미 지워진 404 포함)이면 true
async function deleteSession(sessionId, options = {}) {
    try {
        await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", ...options });
        return true;
    } catch (error) {
        if (error?.status === 404) return true;

        console.error("추천 기록 삭제 실패:", sessionId, error);
        return false;
    }
}

async function commitDelete(sessionId, options) {
    const entry = state.pending.get(sessionId);

    if (!entry || entry.committing) return;

    clearTimeout(entry.timer);
    entry.committing = true;

    const ok = await deleteSession(sessionId, options);

    state.pending.delete(sessionId);

    if (ok) {
        removeFromState(sessionId);
    } else {
        showToast("기록을 지우지 못해 다시 표시했어요. 잠시 후 다시 시도해주세요.", "error");
    }

    render();
}

function undoDelete(sessionId) {
    const entry = state.pending.get(sessionId);

    // 이미 서버에 요청을 보냈으면 되돌릴 수 없음
    if (!entry || entry.committing) return;

    clearTimeout(entry.timer);
    state.pending.delete(sessionId);
    render();
}

// 시안: 바로 목록에서 빼고 "기록을 지웠어요 · 되돌리기"
function requestDelete(sessionId) {
    if (state.pending.has(sessionId) || state.clearing) return;

    const timer = setTimeout(() => commitDelete(sessionId), UNDO_MS);

    state.pending.set(sessionId, { timer, committing: false });
    render();

    showToast("기록을 지웠어요", "info", UNDO_MS, {
        action: {
            label: "되돌리기",
            onClick: () => undoDelete(sessionId)
        }
    });

    // 지운 카드에 있던 초점은 검색창으로
    if (!listEl.contains(document.activeElement)) {
        searchInput.focus();
    }
}

// 되돌리기 대기 중에 페이지를 떠나면 바로 삭제 요청 (keepalive로 이동 중에도 전송)
function flushPendingDeletes(options) {
    return Promise.all(
        [...state.pending.keys()].map((id) => commitDelete(id, options))
    );
}

window.addEventListener("pagehide", () => {
    flushPendingDeletes({ keepalive: true });
});

// ---------- 전체 삭제 ----------
// 일괄 삭제 API가 없어 DELETE /api/sessions/{id}를 기록마다 반복

let previousFocus = null;

function openClearModal() {
    previousFocus = clearAllButton;
    clearStatus.textContent = "";
    clearError.textContent = "";
    clearGo.disabled = false;

    clearModal.classList.add("open");
    clearModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    clearCancel.focus();
}

function closeClearModal() {
    if (!clearModal.classList.contains("open") || state.clearing) return;

    clearModal.classList.remove("open");
    clearModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");

    (previousFocus && !previousFocus.disabled ? previousFocus : searchInput).focus();
    previousFocus = null;
}

async function runPool(items, limit, worker) {
    let next = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next];

            next += 1;
            await worker(item);
        }
    });

    await Promise.all(runners);
}

async function clearAll() {
    if (state.clearing) return;

    state.clearing = true;
    clearGo.disabled = true;
    clearCancel.disabled = true;
    clearError.textContent = "";

    try {
        // 되돌리기 대기 중인 삭제를 먼저 처리
        await flushPendingDeletes();

        // 아직 못 불러온 기록이 있으면 마저 받음
        if (state.nextToken) {
            clearStatus.textContent = "지울 기록을 확인하는 중이에요.";

            while (state.nextToken) {
                await fetchPage();
            }
        }

        const ids = state.sessions.map((s) => s.sessionId);
        const failed = [];
        let done = 0;

        clearStatus.textContent = `지우는 중 (0/${ids.length})`;

        await runPool(ids, CLEAR_CONCURRENCY, async (id) => {
            if (await deleteSession(id)) {
                removeFromState(id);
            } else {
                failed.push(id);
            }

            done += 1;
            clearStatus.textContent = `지우는 중 (${done}/${ids.length})`;
        });

        if (failed.length) {
            clearStatus.textContent = "";
            clearError.textContent = `${ids.length}개 중 ${failed.length}개를 지우지 못했어요. 다시 시도해주세요.`;
            return;
        }

        state.moreError = false;
        state.clearing = false;
        closeClearModal();
        showToast("추천 기록을 모두 지웠어요", "success");
    } catch (error) {
        console.error("추천 기록 전체 삭제 실패:", error);
        clearStatus.textContent = "";
        clearError.textContent = error?.message || "기록을 지우지 못했어요. 잠시 후 다시 시도해주세요.";
    } finally {
        state.clearing = false;
        clearGo.disabled = false;
        clearCancel.disabled = false;
        render();
    }
}

// ---------- 같은 사람들과 다시 ----------

function startAgain(sessionId) {
    const session = state.sessions.find((s) => s.sessionId === sessionId);

    if (!session) return;

    const count = session.participantCount;
    const people = participantsOf(session);
    const names = Array.from({ length: count }, (_, i) => {
        const name = people.find((p) => p?.index === i + 1)?.name;

        return typeof name === "string" ? name.trim() : "";
    });

    // 이전 추천 흐름의 장르 선택이 섞이지 않도록 비운 뒤 인원·이름만 채움
    clearFlow();
    patchFlow({ count, names });

    window.location.href = `start.html?count=${encodeURIComponent(count)}`;
}

// ---------- 이벤트 ----------

listEl.addEventListener("click", (event) => {
    const del = event.target.closest("[data-delete]");

    if (del) {
        requestDelete(del.dataset.delete);
        return;
    }

    const again = event.target.closest("[data-again]");

    if (again) {
        startAgain(again.dataset.again);
    }
});

searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
});

function selectRange(tab, focus = false) {
    rangeTabs.querySelectorAll("[data-range]").forEach((t) => {
        const selected = t === tab;

        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
    });

    if (focus) tab.focus();

    state.range = tab.dataset.range;
    render();
}

rangeTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-range]");

    if (tab && tab.dataset.range !== state.range) {
        selectRange(tab);
    }
});

rangeTabs.addEventListener("keydown", (event) => {
    const tabs = [...rangeTabs.querySelectorAll("[data-range]")];
    const current = tabs.indexOf(document.activeElement);

    if (current < 0) return;

    const next = {
        ArrowRight: (current + 1) % tabs.length,
        ArrowLeft: (current - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1
    }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    selectRange(tabs[next], true);
});

clearAllButton.addEventListener("click", openClearModal);
clearGo.addEventListener("click", clearAll);
clearCancel.addEventListener("click", closeClearModal);

clearModal.addEventListener("click", (event) => {
    if (event.target === clearModal) closeClearModal();
});

document.addEventListener("keydown", (event) => {
    if (!clearModal.classList.contains("open")) return;

    if (event.key === "Escape") {
        closeClearModal();
        return;
    }

    // 모달 안에서만 Tab 이동
    if (event.key === "Tab") {
        const focusable = [...clearModal.querySelectorAll("button:not([disabled])")];

        if (!focusable.length) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});

// ---------- 시작 ----------

let started = false;

export async function startHistory() {
    if (started) return;

    started = true;
    render();
    await requireLogin();
    loadAll();
}
