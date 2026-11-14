// =====================================
// 추천 2단계 (select.html): 차례 안내 → 장르 선택 → 추천 요청(로딩)
//   참여자 수만큼 "차례 안내 → 장르 선택"을 반복하고 마지막에 추천을 요청
// - 회원   : POST /api/sessions 로 세션 생성 → result.html?sessionId=…
// - 비회원 : 서버에 아무것도 보내지 않고 요청을 이 탭에 저장 → result.html?guest=1
//            (result.js 가 POST /api/guest/recommendations 호출)
// - 서버 요청 본문은 { participantCount, participants:[{ index, genres }] } (API 명세)
//   이름·OTT·"이미 본 작품 빼기"는 화면용 값이라 보내지 않음
// =====================================

import { isLoggedIn, apiFetch, ApiError } from "./api.js";
import { RMFlow } from "./rm-flow.js";
import { loadGenres } from "./genres.js";
import { getUserGenres } from "./user-api.js";
import {
    GUEST_REQUEST_KEY,
    GUEST_RESULT_KEY,
    GUEST_EXCLUDED_KEY
} from "./guest-storage.js";
import {
    MIN_PARTICIPANTS,
    getFlow,
    patchFlow,
    getParticipants,
    createParticipants,
    saveResultNames
} from "./flow-state.js";

// 콘텐츠 종류. code 는 추천 결과의 mediaType 값("movie" | "tv")과 같음
const KINDS = [
    { code: "movie", name: "영화" },
    { code: "tv", name: "드라마" }
];

// 콘텐츠 종류 선호(보고 싶은 / 별로인)를 요청에 포함할지 여부
// 현재 API 명세에는 참여자별 index, genres 만 있어 false (모르는 필드를 서버가 거부하면 세션 생성이 실패할 수 있음)
// TODO: 백엔드에 필드가 추가되면 true 로 바꾸고 아래 필드명을 명세에 맞게 수정
const SEND_MEDIA_PREFERENCE = false;
const PAYLOAD_LIKE_FIELD = "likeMediaTypes";
const PAYLOAD_DISLIKE_FIELD = "dislikeMediaTypes";

// 요청이 아무리 빨라도 로딩/완료 연출이 보이도록 하는 최소 시간
const MIN_LOADING_MS = 1200;
const DONE_MS = 1100;

const LOADING_TITLE = '데이터를 취합중입니다<span class="ellipsis" aria-hidden="true"><i>.</i><i>.</i><i>.</i><i>.</i><i>.</i></span>';

const $ = (selector, root = document) => root.querySelector(selector);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// 로그인 여부 (비회원도 추천 흐름을 쓸 수 있고, 회원만 세션 저장·"이미 본 작품 빼기"를 씀)
const member = await isLoggedIn();

// ---------- 상태 ----------

// start.html 에서 정한 참여자. 없으면(주소로 바로 들어온 경우) 2명으로 시작
let P = getParticipants();

if (!P) {
    P = createParticipants(MIN_PARTICIPANTS);
    $("#no-session").hidden = false;
}

let cur = 0;                 // 현재 참여자 (P.length 이면 모두 끝남)
let genres = [];             // 장르 마스터 (서버 목록, 실패 시 기본 목록)
let prefilledNotice = false; // 프로필 선호 장르를 미리 골라뒀음을 안내할지
let submitting = false;
let opening = false;

const persist = () => patchFlow({ participants: P });

// ---------- 준비: 장르 목록 + (회원) 프로필 선호 장르 ----------

const genresReady = loadGenres();

// 참여자 1은 로그인한 본인이므로 프로필 선호 장르를 미리 골라둠 (세션당 한 번)
const prefillReady = (async () => {
    if (!member || getFlow().prefilled || P[0].genres.length) return [];

    try {
        const result = await getUserGenres();
        const codes = Array.isArray(result) ? result : result?.genres;

        return Array.isArray(codes) ? codes.filter((c) => typeof c === "string") : [];
    } catch {
        return [];
    }
})();

let readyPromise = null;

// 처음 한 번만 실행: 서버 장르 코드에 없는 선택값 제거 + 선호 장르 적용
function ready() {
    readyPromise ??= (async () => {
        const [list, pref] = await Promise.all([genresReady, prefillReady]);
        const valid = new Set(list.map((g) => g.code));

        genres = list;
        P.forEach((p) => { p.genres = p.genres.filter((code) => valid.has(code)); });

        const preferred = pref.filter((code) => valid.has(code));

        if (preferred.length && !P[0].genres.length) {
            P[0].genres = preferred;
            prefilledNotice = true;
        }

        if (member) patchFlow({ prefilled: true });
        persist();
    })();

    return readyPromise;
}

// ---------- 화면 전환 ----------

const ORDER = ["handoff", "picker", "loading"];
let shown = null;

function show(id, dir = 1) {
    const to = $(`#${id}`);
    const from = shown ? $(`#${shown}`) : null;

    shown = id;

    ORDER.forEach((name) => {
        if (name !== id && name !== from?.id) $(`#${name}`).hidden = true;
    });

    RMFlow.swap(from, to, dir, () => {
        if (id !== "loading") $("h1", to)?.focus({ preventScroll: true });
    });
}

function dots(done = false) {
    $("#dots").innerHTML = P.map((_, i) => (
        `<i class="${done || i < cur ? "done" : i === cur ? "on" : ""}"></i>`
    )).join("");

    RMFlow.progress(0.5 + Math.min(cur, P.length) / P.length * 0.5);
}

const title = () => `${P[cur].name}님의 장르 선택 차례입니다`;

// ---------- 차례 안내 ----------

function handoff() {
    $("#handoff-title").textContent = title();
    dots();
    show("handoff");
}

$("#handoff-go").addEventListener("click", async () => {
    if (RMFlow.busy || opening) return;

    opening = true;

    try {
        await ready();
        picker(1);
    } finally {
        opening = false;
    }
});

// ---------- 장르 · 콘텐츠 종류 선택 ----------

function chipsHTML(list, picked, attr) {
    return list.map((item) => (
        `<button class="chip" type="button" ${attr}="${escapeHtml(item.code)}" aria-pressed="${picked.includes(item.code)}">${escapeHtml(item.name)}</button>`
    )).join("");
}

function picker(dir = 1) {
    const p = P[cur];

    $("#cur-title").textContent = title();
    $("#genres").innerHTML = chipsHTML(genres, p.genres, "data-genre");
    $("#want").innerHTML = chipsHTML(KINDS, p.want, "data-want");
    $("#avoid").innerHTML = chipsHTML(KINDS, p.avoid, "data-avoid");
    $("#prev").hidden = cur === 0;
    $("#done").textContent = cur === P.length - 1 ? "추천받기" : "다음";

    message();
    dots();
    show("picker", dir);
}

// 장르 1개 이상 필수, 1~3개를 권장
function message() {
    const n = P[cur].genres.length;
    const box = $("#pick-msg");

    $("#done").disabled = n === 0;

    box.style.color = n > 3 ? "var(--warning)" : "";
    box.textContent = n === 0
        ? "장르를 최소 1개 골라주세요."
        : n > 3
            ? `${n}개 골랐어요. 너무 많으면 취향이 흐려질 수 있어요.`
            : `${n}개 골랐어요.`;

    if (cur === 0 && prefilledNotice && n) {
        box.textContent += " 프로필의 선호 장르를 미리 골라뒀어요. 바꿔도 돼요.";
    }
}

const toggle = (list, code) => (
    list.includes(code) ? list.filter((x) => x !== code) : [...list, code]
);

$("#genres").addEventListener("click", (e) => {
    const button = e.target.closest("[data-genre]");
    if (!button) return;

    const p = P[cur];
    const code = button.dataset.genre;

    if (cur === 0) prefilledNotice = false;

    p.genres = toggle(p.genres, code);
    button.setAttribute("aria-pressed", String(p.genres.includes(code)));

    persist();
    message();
});

// "보고 싶은"과 "안 끌리는"은 서로 겹칠 수 없음: 한쪽을 고르면 다른 쪽에서는 빠짐
function kindClick(e, key, other, attr, otherAttr, otherBox) {
    const button = e.target.closest(`[${attr}]`);
    if (!button) return;

    const p = P[cur];
    const code = button.getAttribute(attr);

    p[key] = toggle(p[key], code);
    button.setAttribute("aria-pressed", String(p[key].includes(code)));

    if (p[key].includes(code) && p[other].includes(code)) {
        p[other] = p[other].filter((x) => x !== code);

        $(`[${otherAttr}="${code}"]`, $(otherBox))?.setAttribute("aria-pressed", "false");
    }

    persist();
}

$("#want").addEventListener("click", (e) => kindClick(e, "want", "avoid", "data-want", "data-avoid", "#avoid"));
$("#avoid").addEventListener("click", (e) => kindClick(e, "avoid", "want", "data-avoid", "data-want", "#want"));

$("#prev").addEventListener("click", () => {
    if (cur > 0 && !RMFlow.busy) {
        cur -= 1;
        picker(-1);
    }
});

$("#done").addEventListener("click", () => {
    if (!P[cur].genres.length || RMFlow.busy) return;

    persist();

    if (cur < P.length - 1) {
        cur += 1;
        handoff();
    } else {
        submit();
    }
});

// ---------- 추천 요청 ----------

// API 명세: { participantCount, participants: [{ index, genres }] }
function buildRequest() {
    return {
        participantCount: P.length,
        participants: P.map(({ index, genres: picked, want, avoid }) => ({
            index,
            genres: picked,
            ...(SEND_MEDIA_PREFERENCE && want.length && { [PAYLOAD_LIKE_FIELD]: want }),
            ...(SEND_MEDIA_PREFERENCE && avoid.length && { [PAYLOAD_DISLIKE_FIELD]: avoid })
        }))
    };
}

// 요청을 보내고 이동할 결과 화면 주소와 결과 저장 키(회원: sessionId, 비회원: "guest")를 돌려줌
async function sendRequest() {
    const request = buildRequest();
    const count = request.participantCount;

    // 비회원: 세션을 만들지 않고 요청만 이 탭에 저장. 결과 화면이 비회원 추천 API 를 호출
    if (!member) {
        try {
            sessionStorage.setItem(GUEST_REQUEST_KEY, JSON.stringify(request));
            sessionStorage.removeItem(GUEST_RESULT_KEY);
            sessionStorage.removeItem(GUEST_EXCLUDED_KEY);
        } catch {
            throw new Error("브라우저 저장소를 사용할 수 없어 추천을 진행할 수 없어요. 로그인 후 이용해주세요.");
        }

        return { target: `result.html?guest=1&count=${count}`, key: "guest" };
    }

    // 회원: POST /api/sessions → 201 { sessionId, ... }
    const data = await apiFetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
    });

    if (!data?.sessionId) {
        throw new Error("세션 정보를 받지 못했어요. 잠시 후 다시 시도해주세요.");
    }

    return {
        target: `result.html?sessionId=${encodeURIComponent(data.sessionId)}&count=${count}`,
        key: data.sessionId
    };
}

function errorMessage(error) {
    if (error instanceof ApiError && error.code === "NICKNAME_REQUIRED") {
        return "닉네임 설정이 필요해요. 프로필에서 닉네임을 저장한 뒤 다시 시도해주세요.";
    }

    return error?.message || "추천을 시작하지 못했어요. 잠시 후 다시 시도해주세요.";
}

// ---------- 로딩 / 완료 / 실패 표시 ----------

function swapText(...elements) {
    elements.forEach((el) => {
        el.classList.remove("swap-text");
        void el.offsetWidth;
        el.classList.add("swap-text");
    });
}

function showProgress() {
    $("#loading-box").classList.remove("done");
    $("#loading-title").innerHTML = LOADING_TITLE;
    $("#loading-sub").textContent = "잠시만 기다려주세요";
    $("#loading-actions").hidden = true;
}

function showDone() {
    $("#loading-box").classList.add("done");
    swapText($("#loading-title"), $("#loading-sub"));
    $("#loading-title").textContent = "완료되었습니다!";
    $("#loading-sub").textContent = "결과 화면으로 이동해요";
}

function showError(text) {
    $("#loading-box").classList.remove("done");
    swapText($("#loading-title"), $("#loading-sub"));
    $("#loading-title").textContent = "추천을 시작하지 못했어요";
    $("#loading-sub").textContent = text;
    $("#loading-actions").hidden = false;
    $("#retry").focus({ preventScroll: true });
}

async function submit() {
    if (submitting) return; // 이중 제출 방지

    submitting = true;
    cur = P.length;
    dots(true);
    showProgress();

    if (shown !== "loading") show("loading");

    const startedAt = Date.now();
    let target;
    let resultKey;

    try {
        ({ target, key: resultKey } = await sendRequest());
    } catch (error) {
        console.error("추천 요청 에러:", error);
        showError(errorMessage(error));
        submitting = false;
        return;
    }

    await wait(Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt)));
    showDone();

    // 결과 화면에 보여줄 이름만 따로 넘김 (고른 장르는 서버/요청 쪽 값을 사용)
    // (이름을 적지 않아 "참여자 N"으로 표시된 사람은 빈 값으로 저장해 다시 추천받을 때 입력칸을 채우지 않음)
    saveResultNames(resultKey, P.map((p, i) => (p.name === `참여자 ${i + 1}` ? "" : p.name)));

    // 서버로 넘어간 선택 내용은 더 두지 않음 (이름·인원은 다시 하기를 위해 남김)
    patchFlow({ participants: null, prefilled: false });

    await wait(DONE_MS);
    RMFlow.curtain(() => { window.location.href = target; });
}

$("#retry").addEventListener("click", () => submit());

$("#back-to-pick").addEventListener("click", () => {
    if (RMFlow.busy) return;

    submitting = false;
    cur = P.length - 1;
    picker(-1);
});

// ---------- 시작 ----------

handoff();
