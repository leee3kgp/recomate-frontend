// =====================================
// 추천 흐름 화면 전환
//   홈 → 이용방법 → 인원 선택 → (참여자별) 차례 안내 → 장르 선택 → 로딩
// - 시안처럼 페이지 이동 없이 #app 안의 화면만 교체
// - 주소 해시(#guide, #count, #turn, #pick, #loading)로 단계를 표시
// - 결과 화면(result.html)은 별도 페이지: 세션 생성 성공 후 이동
//   (비회원은 세션 없이 result.html?guest=1 로 이동해 비회원 추천 API 사용)
// =====================================

import { isLoggedIn, apiFetch, ApiError } from "./api.js";
import { GENRES, loadGenres } from "./genres.js";
import { GUEST_REQUEST_KEY, GUEST_RESULT_KEY, GUEST_EXCLUDED_KEY } from "./guest-storage.js";
import {
    MIN_PARTICIPANTS,
    MAX_PARTICIPANTS,
    getFlowCount,
    setFlowCount,
    getFlowPicks,
    setFlowPicks,
    clearFlowPicks
} from "./flow-state.js";

const app = document.getElementById("app");

// 콘텐츠 종류 (시안 TYPES). code 는 추천 결과의 mediaType 값("movie" | "tv")과 동일
const TYPES = [
    { code: "movie", name: "영화" },
    { code: "tv", name: "드라마" }
];

// 콘텐츠 종류 선호(시청하고 싶은 / 별로 안 끌리는)를 세션 생성 요청에 포함할지 여부
// (명세에 없는 필드를 서버가 거부하면 세션 생성이 실패할 수 있음)
// TODO: 백엔드 업데이트 후 수정 필요. 선택하지 않은 경우에는 필드를 보내지 않음
const SEND_MEDIA_PREFERENCE = false;
const PAYLOAD_LIKE_FIELD = "likeMediaTypes";
const PAYLOAD_DISLIKE_FIELD = "dislikeMediaTypes";

let count = getFlowCount();
let genresList = GENRES;

// 장르 선택 진행 상태 (새로고침 대비 sessionStorage 와 동기화)
let idx = 0;
let picks = [];

// 세션 생성 상태
let submitting = false;
let submitError = "";
let starting = false;

// ---------- 화면 템플릿 (시안 views.home / guide / count / turn / pick / loading) ----------

const views = {
    home: () => `
        <section class="stage hero">
            <div class="view">
                <h2 class="title" tabindex="-1">함께 볼 콘텐츠, 고민하지 말고 골라보세요</h2>
                <p class="desc">참여자별 선호 장르를 모아 모두가 즐길 수 있는 영화, 드라마 TOP 3를 추천합니다.</p>
                <button type="button" class="link-btn" data-act="start" style="margin-top:96px">같이 볼 콘텐츠 추천받기</button>
            </div>
        </section>
        <div class="home-rest"></div>`,

    guide: () => `
        <section class="stage top">
            <div class="view">
                <div class="panel">
                    <h3 tabindex="-1">이용방법</h3>
                    <div class="step-card" style="--i:0"><b>1. 인원 선택</b><span>함께 볼 인원을 2~6명으로 정합니다.</span></div>
                    <div class="step-card" style="--i:1"><b>2. 장르 선택</b><span>참여자별로 좋아하는 장르를 고릅니다.</span></div>
                    <div class="step-card" style="--i:2"><b>3. TOP 3 확인</b><span>추천 콘텐츠와 취향 분석을 확인합니다.</span></div>
                    <div class="foot"><button type="button" class="link-btn guide-next" data-act="guide-next">다음</button></div>
                </div>
            </div>
        </section>`,

    count: () => `
        <section class="stage">
            <div class="view">
                <h2 class="title" tabindex="-1">몇 명이서 함께 시청하시나요?</h2>
                <div class="counter">
                    <button type="button" class="round" data-act="minus" aria-label="인원 줄이기">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
                    </button>
                    <output id="count-output" aria-live="polite"></output>
                    <button type="button" class="round" data-act="plus" aria-label="인원 늘리기">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>
                    </button>
                </div>
                <button type="button" class="link-btn" data-act="count-next" style="margin-top:80px">다음</button>
            </div>
        </section>`,

    // 화면 전체가 하나의 버튼: 다음 참여자에게 기기를 넘긴 뒤 눌러서 시작
    turn: () => `
        <section class="stage">
            <button type="button" class="turn view" data-act="turn-go">
                <h2 class="title">${idx + 1}번님의 장르 선택 차례입니다</h2>
                <small>준비되면 화면을 눌러 시작하세요 · ${idx + 1} / ${picks.length}</small>
            </button>
        </section>`,

    pick: () => {
        const last = idx === picks.length - 1;

        return `
        <section class="stage top">
            <div class="view">
                <h2 class="title" tabindex="-1">${idx + 1}번님의 장르 선택 차례입니다</h2>
                <p class="desc" style="margin-top:12px">선호하는 장르를 선택해주세요.</p>
                <div class="panel" style="margin-top:44px">
                    <div class="group">
                        <h4>선호하는 장르</h4>
                        <p>여러 개 선택할 수 있어요 (1개 이상)</p>
                        <div class="chips" id="genre-chips"></div>
                    </div>
                    <div class="group">
                        <h4>오늘 시청하고 싶은 콘텐츠</h4>
                        <p>선택하지 않으면 영화·드라마 모두 추천돼요</p>
                        <div class="chips" id="like-chips"></div>
                    </div>
                    <div class="group">
                        <h4>별로 안 끌리는 콘텐츠</h4>
                        <p>선택한 종류는 추천에서 뒤로 밀려요</p>
                        <div class="chips" id="dislike-chips"></div>
                    </div>
                    <div class="foot">
                        <button type="button" class="link-btn" id="pick-next" data-act="pick-next" style="margin-top:12px">${last ? "추천받기" : "다음"}</button>
                    </div>
                </div>
            </div>
        </section>`;
    },

    loading: () => submitError
        ? `
        <section class="stage">
            <div class="view">
                <h2 class="title" tabindex="-1">추천을 만들지 못했어요</h2>
                <p class="desc" id="submit-error" role="alert"></p>
                <div class="actions">
                    <button type="button" class="link-btn" data-act="retry">다시 시도</button>
                    <button type="button" class="link-btn" data-act="back-to-pick">장르 다시 선택</button>
                </div>
            </div>
        </section>`
        : `
        <section class="stage">
            <div class="view">
                <h2 class="title" tabindex="-1" role="status">데이터를 취합중입니다<span class="dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span></span></h2>
                <p class="desc">잠시만 기다려주세요</p>
            </div>
        </section>`
};

const TITLES = {
    home: "RecoMate | 함께 고르는 콘텐츠",
    guide: "RecoMate | 이용방법",
    count: "RecoMate | 인원 선택",
    turn: "RecoMate | 차례 안내",
    pick: "RecoMate | 장르 선택",
    loading: "RecoMate | 추천 생성 중"
};

// ---------- 상태 ----------

const persistPicks = () => setFlowPicks(idx, picks);

// 저장된 선택 진행 상태를 불러옴 (인원 선택을 거치지 않은 직접 접근이면 false)
function restorePicks() {
    const saved = getFlowPicks();
    const valid = saved && saved.picks[saved.idx];

    if (!valid) return false;

    idx = saved.idx;
    picks = saved.picks.map((p) => ({
        ...p,
        genres: p.genres || [],
        like: p.like || [],
        dislike: p.dislike || []
    }));
    return true;
}

const currentStep = () => {
    const step = window.location.hash.replace("#", "");
    return views[step] ? step : "home";
};

// 화면 이동
// - 기본: 해시를 바꿔 기록을 남김 (hashchange 에서 렌더링)
// - replace: 진행 중인 단계(차례/선택/로딩)는 뒤로가기로 되돌아오지 않도록
//   기록을 덮어쓰고 바로 렌더링 (replaceState 는 hashchange 를 발생시키지 않음)
function go(step, { replace = false } = {}) {
    const hash = step === "home" ? "" : step;

    if (replace) {
        history.replaceState(null, "", `#${hash}`);
        render();
    } else {
        window.location.hash = hash;
    }
}

// ---------- 렌더링 ----------

// 인원 수 표시와 +/- 버튼 활성 상태만 갱신 (화면 전체를 다시 그리지 않음)
function updateCount() {
    const output = document.getElementById("count-output");
    const minus = app.querySelector('[data-act="minus"]');
    const plus = app.querySelector('[data-act="plus"]');

    if (!output || !minus || !plus) return;

    output.textContent = `${count}명`;
    minus.disabled = count <= MIN_PARTICIPANTS;
    plus.disabled = count >= MAX_PARTICIPANTS;
}

// 칩 한 묶음 그리기 (서버에서 받은 이름은 textContent 로만 넣음)
function renderChipGroup(boxId, group, items, extraClass = "") {
    const box = document.getElementById(boxId);
    if (!box) return;

    box.replaceChildren(...items.map((item) => {
        const chip = document.createElement("button");

        chip.type = "button";
        chip.className = `chip ${extraClass}`.trim();
        chip.dataset.act = "toggle";
        chip.dataset.group = group;
        chip.dataset.val = item.code;
        chip.textContent = item.name;

        return chip;
    }));
}

// 장르 · 시청하고 싶은 종류 · 별로인 종류 칩 전체 그리기
function renderPickChips() {
    renderChipGroup("genre-chips", "genres", genresList);
    renderChipGroup("like-chips", "like", TYPES);
    renderChipGroup("dislike-chips", "dislike", TYPES, "neg");

    updatePick();
}

// 선택 상태 반영 + "다음/추천받기" 활성화 (장르 1개 이상 필요)
function updatePick() {
    const pick = picks[idx];
    if (!pick) return;

    app.querySelectorAll(".chip[data-group]").forEach((chip) => {
        const group = chip.dataset.group;
        const value = chip.dataset.val;

        chip.setAttribute("aria-pressed", String(pick[group].includes(value)));

        // 같은 콘텐츠 종류는 '시청하고 싶은'과 '별로'에 동시에 선택할 수 없음
        const other = group === "like" ? "dislike" : group === "dislike" ? "like" : null;

        chip.disabled = Boolean(other) && pick[other].includes(value);
    });

    const next = document.getElementById("pick-next");

    if (next) next.disabled = pick.genres.length === 0;
}

function render() {
    const step = currentStep();

    // 차례/선택/로딩은 인원 선택을 거친 상태에서만 접근 가능
    if (["turn", "pick", "loading"].includes(step)) {
        if (!restorePicks()) {
            go("count", { replace: true });
            return;
        }

        // 로딩 화면에서 새로고침하면 요청이 끊겼으므로 마지막 참여자 선택으로 되돌림
        if (step === "loading" && !submitting && !submitError) {
            idx = picks.length - 1;
            persistPicks();
            go("pick", { replace: true });
            return;
        }
    }

    // 홈만 배경이 한 톤 어둡고, 나머지 단계는 선명한 배경 (시안 data-mode)
    document.body.dataset.mode = step === "home" ? "home" : "flow";
    document.title = TITLES[step];

    app.innerHTML = views[step]();

    if (step === "count") updateCount();
    if (step === "pick") renderPickChips();

    if (step === "loading" && submitError) {
        document.getElementById("submit-error").textContent = submitError;
    }

    // 화면이 바뀌면 포커스를 옮겨 스크린리더/키보드 사용자가 새 화면을 인식하게 함
    // (차례 안내는 화면 전체가 버튼이라 버튼에 포커스 → Enter/Space 로 시작)
    app.querySelector(".turn, h2, h3")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
}

// ---------- 세션 생성 (기존 select.js 로직 유지, 비회원은 결과 화면으로 바로 이동) ----------

async function submitSession() {
    if (submitting) return; // 이중 제출 방지

    submitting = true;
    submitError = "";

    go("loading", { replace: true });

    // 기본은 명세 그대로 { index, genres }. 종류 선호는 SEND_MEDIA_PREFERENCE 가 켜져 있고, 선택한 경우에만 추가
    const requestPayload = {
        participantCount: picks.length,
        participants: picks.map(({ index, genres, like, dislike }) => ({
            index,
            genres,
            ...(SEND_MEDIA_PREFERENCE && like.length && { [PAYLOAD_LIKE_FIELD]: like }),
            ...(SEND_MEDIA_PREFERENCE && dislike.length && { [PAYLOAD_DISLIKE_FIELD]: dislike })
        }))
    };

    let redirecting = false;

    try {
        // 비회원: 세션을 만들지 않고 선택 내용만 이 탭에 저장, 결과 화면이 비회원 추천 API 호출
        if (!(await isLoggedIn())) {
            try {
                sessionStorage.setItem(GUEST_REQUEST_KEY, JSON.stringify(requestPayload));
                sessionStorage.removeItem(GUEST_RESULT_KEY);
                sessionStorage.removeItem(GUEST_EXCLUDED_KEY);
            } catch {
                submitError = "브라우저 저장소를 사용할 수 없어 추천을 진행할 수 없습니다. 로그인 후 이용해주세요.";
                return;
            }

            redirecting = true;
            const participantCount = picks.length;

            clearFlowPicks();
            window.location.href = `result.html?guest=1&count=${participantCount}`;
            return;
        }

        // POST /api/sessions → 201 { sessionId, ... }
        const data = await apiFetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload)
        });

        // 성공 시 결과 페이지로 이동 (선택 내용은 더 이상 필요 없으므로 삭제)
        redirecting = true;
        const participantCount = picks.length;

        clearFlowPicks();
        window.location.href =
            `result.html?sessionId=${encodeURIComponent(data.sessionId)}&count=${participantCount}`;

    } catch (error) {
        console.error("세션 생성 API 에러:", error);

        if (error instanceof ApiError && error.code === "NICKNAME_REQUIRED") {
            submitError = "닉네임 설정이 필요합니다. 프로필에서 닉네임을 저장한 뒤 다시 시도해주세요.";
        } else {
            submitError = error.message || "세션 생성에 실패했습니다.";
        }
    } finally {
        // 이동 중이면 로딩 화면을 그대로 둠
        if (!redirecting) {
            submitting = false;
            if (currentStep() === "loading") render();
        }
    }
}

// 인원 선택 완료 → 첫 번째 참여자 차례로 (비회원도 진행 가능)
async function startSelection() {
    if (starting) return;
    starting = true;

    try {
        setFlowCount(count);
        idx = 0;
        picks = Array.from({ length: count }, (_, i) => ({ index: i + 1, genres: [], like: [], dislike: [] }));
        persistPicks();

        // 기본 목록으로 바로 시작하고, 서버 목록이 오면 교체
        loadGenres().then((genres) => {
            genresList = genres;

            const codes = new Set(genres.map((genre) => genre.code));
            picks.forEach((p) => {
                p.genres = p.genres.filter((code) => codes.has(code));
            });
            persistPicks();

            if (currentStep() === "pick") renderPickChips();
        });

        go("turn");
    } finally {
        starting = false;
    }
}

// ---------- 이벤트 ----------

app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;

    switch (el.dataset.act) {
        case "start":
            go("guide");
            break;
        case "guide-next":
            go("count");
            break;
        case "minus":
            count = Math.max(MIN_PARTICIPANTS, count - 1);
            setFlowCount(count);
            updateCount();
            break;
        case "plus":
            count = Math.min(MAX_PARTICIPANTS, count + 1);
            setFlowCount(count);
            updateCount();
            break;
        case "count-next":
            startSelection();
            break;
        case "turn-go":
            go("pick", { replace: true });
            break;
        case "toggle": {
            const group = el.dataset.group;
            const code = el.dataset.val;
            const current = picks[idx][group];

            picks[idx][group] = current.includes(code)
                ? current.filter((c) => c !== code)
                : [...current, code];

            persistPicks();
            updatePick();
            break;
        }
        case "pick-next":
            if (picks[idx].genres.length === 0) break;

            if (idx < picks.length - 1) {
                idx += 1;
                persistPicks();
                go("turn", { replace: true });
            } else {
                submitSession();
            }
            break;
        case "retry":
            submitSession();
            break;
        case "back-to-pick":
            submitError = "";
            go("pick", { replace: true });
            break;
    }
});

window.addEventListener("hashchange", render);

// 뒤로가기로 돌아왔을 때 저장된 상태를 다시 반영
window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
        count = getFlowCount();
        submitting = false;
        render();
    }
});

render();
