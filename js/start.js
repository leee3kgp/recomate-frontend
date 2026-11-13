// =====================================
// 추천 1단계 (start.html): 이용방법 → 인원 → 이름 → 추천 옵션
// - 비회원도 진행 가능. 회원만 "이미 본 작품 빼기"를 쓸 수 있음
// - 입력 값은 flow-state 에 저장해 2단계(select.html)로 넘김
// - 홈의 "N명 바로 시작"처럼 ?count=N 으로 들어오면 이용방법·인원 단계는 건너뜀
// =====================================

import { isLoggedIn } from "./api.js";
import { RMFlow } from "./rm-flow.js";
import { getUserProfile } from "./user-api.js";
import {
    MIN_PARTICIPANTS,
    MAX_PARTICIPANTS,
    isValidCount,
    limitName,
    getFlow,
    patchFlow,
    createParticipants
} from "./flow-state.js";

// 시안의 참여자 색 (css/flow-stage.css 의 --p1 ~ --p6)
const P_COLORS = ["var(--p1)", "var(--p2)", "var(--p3)", "var(--p4)", "var(--p5)", "var(--p6)"];

// 구독 OTT 선택지 (시안). TODO: 추천 API 에 OTT 조건이 생기면 요청에 포함
const OTT_LIST = ["넷플릭스", "티빙", "쿠팡플레이", "디즈니+", "웨이브", "왓챠", "라프텔"];

const $ = (selector, root = document) => root.querySelector(selector);
const $all = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// 로그인 여부 (비회원도 추천 흐름을 쓸 수 있고, 회원만 세션 저장·"이미 본 작품 빼기"를 씀)
const member = await isLoggedIn();

// ---------- 상태 ----------

const saved = getFlow();
const paramCount = parseInt(new URLSearchParams(window.location.search).get("count"), 10);

// 우선순위: 주소의 ?count → 이 탭에서 정해 둔 값 → 2명
let count = isValidCount(paramCount)
    ? paramCount
    : isValidCount(saved.count) ? saved.count : MIN_PARTICIPANTS;

let names = Array.isArray(saved.names) ? saved.names.map((n) => String(n ?? "")) : [];
let ott = Array.isArray(saved.ott) ? saved.ott.filter((o) => OTT_LIST.includes(o)) : [];

// ---------- 단계 이동 (한 화면에 질문 하나) ----------

const panels = $all(".stage-panel");
const dots = $all("#dots i");
let step = 0;

function paintStep() {
    dots.forEach((dot, i) => {
        dot.className = i === step ? "on" : i < step ? "done" : "";
    });

    RMFlow.progress(step / (panels.length - 1) * 0.45);
}

function focusTitle() {
    $("h1", panels[step])?.focus({ preventScroll: true });
}

function go(next, instant = false) {
    next = Math.max(0, Math.min(panels.length - 1, next));

    if (instant) {
        step = next;
        panels.forEach((panel, i) => { panel.hidden = i !== step; });
        RMFlow.enter(panels[step], 1);
        paintStep();
        return;
    }

    if (next === step || RMFlow.busy) return;

    const from = panels[step];
    const dir = next > step ? 1 : -1;

    step = next;
    paintStep();
    RMFlow.swap(from, panels[step], dir, focusTitle);
}

$all("[data-next]").forEach((button) => button.addEventListener("click", () => go(step + 1)));
$all("[data-prev]").forEach((button) => button.addEventListener("click", () => go(step - 1)));

// ---------- 인원 ----------

function paint() {
    $("#count").textContent = count;
    $("#minus").disabled = count <= MIN_PARTICIPANTS;
    $("#plus").disabled = count >= MAX_PARTICIPANTS;

    renderNames();
}

$("#minus").addEventListener("click", () => {
    if (count > MIN_PARTICIPANTS) {
        count -= 1;
        paint();
        RMFlow.bump($("#count"));
    }
});

$("#plus").addEventListener("click", () => {
    if (count < MAX_PARTICIPANTS) {
        count += 1;
        paint();
        RMFlow.bump($("#count"));
    }
});

// ---------- 이름 ----------

function renderNames() {
    $("#names").innerHTML = Array.from({ length: count }, (_, i) => (
        `<div class="name-row">
            <span class="p-avatar" style="background:${P_COLORS[i]}">${i + 1}</span>
            <label class="sr-only" for="name-${i}">참여자 ${i + 1} 이름</label>
            <input class="input" id="name-${i}" data-i="${i}" placeholder="참여자 ${i + 1}" value="${escapeHtml(names[i] || "")}" maxlength="40" autocomplete="off">
        </div>`
    )).join("");
}

// 이름 저장 + 글자 수 제한 (한글 조합 중에는 값을 건드리지 않고 조합이 끝난 뒤 적용)
function applyName(input) {
    const i = Number(input.dataset.i);
    const limited = limitName(input.value);

    if (limited !== input.value) input.value = limited;

    names[i] = limited.trim();
}

$("#names").addEventListener("input", (e) => {
    if (!e.target.matches("input")) return;

    if (e.isComposing) {
        names[Number(e.target.dataset.i)] = e.target.value.trim();
        return;
    }

    applyName(e.target);
});

$("#names").addEventListener("compositionend", (e) => {
    if (e.target.matches("input")) applyName(e.target);
});

$("#names").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("input") || e.isComposing) return;

    e.preventDefault();

    const inputs = $all("#names input");
    const idx = inputs.indexOf(e.target);

    if (idx < inputs.length - 1) {
        inputs[idx + 1].focus();
    } else {
        go(step + 1);
    }
});

$("#clear-names").addEventListener("click", () => {
    names = [];
    renderNames();
});

// ---------- 옵션 ----------

$("#ott").innerHTML = OTT_LIST.map((name) => (
    `<button class="chip" type="button" aria-pressed="${ott.includes(name)}" data-ott="${escapeHtml(name)}">${escapeHtml(name)}</button>`
)).join("");

$("#ott").addEventListener("click", (e) => {
    const button = e.target.closest("[data-ott]");
    if (!button) return;

    const on = button.getAttribute("aria-pressed") !== "true";
    const name = button.dataset.ott;

    button.setAttribute("aria-pressed", String(on));
    ott = on ? [...ott, name] : ott.filter((o) => o !== name);
});

// "이미 본 작품 빼기"는 회원 전용. TODO: 서버가 시청 이력을 반영하면 요청에 포함
if (member) {
    $("#exclude-watched").checked = saved.excludeWatched !== false;
    $("#watched-hint").textContent = "이미 본 작품으로 표시한 작품은 빼고 추천해요.";
    $("#login-hint").textContent = "결과는 추천 기록에 자동으로 저장돼요.";
} else {
    // 비회원: 스위치는 숨기고 로그인 안내만 보여줌
    const input = $("#exclude-watched");

    input.checked = false;
    input.disabled = true;
    input.closest(".switch").hidden = true;

    $("#watched-hint").innerHTML = '로그인하면 쓸 수 있어요. <a class="link" href="login.html">로그인</a> · <a class="link" href="signup.html">회원가입</a>';
    $("#login-hint").textContent = "로그인하지 않으면 추천 기록이 저장되지 않아요.";
}

// ---------- 2단계로 넘기기 ----------

$("#next").addEventListener("click", () => {
    if (RMFlow.busy) return;

    const trimmed = names.slice(0, count);

    // 참여자 선택값은 새로 시작 (인원이나 이름이 바뀌었을 수 있음)
    patchFlow({
        count,
        names: trimmed,
        ott,
        excludeWatched: member && $("#exclude-watched").checked,
        participants: createParticipants(count, trimmed),
        prefilled: false
    });

    RMFlow.leave(panels[step], () => { window.location.href = "select.html"; });
});

// ---------- 시작 ----------

paint();

// 회원이면 참여자 1 이름을 닉네임으로 미리 채움 (직접 적은 이름은 덮어쓰지 않음)
if (member && !names[0]) {
    getUserProfile().then((profile) => {
        if (!profile?.nickname || names[0]) return;

        names[0] = limitName(profile.nickname);

        const input = $("#name-0");
        if (input && !input.value) input.value = names[0];
    }).catch(() => { /* 닉네임 없이 진행 */ });
}

// 홈의 "N명 바로 시작"으로 들어오면 이용방법·인원 단계는 건너뜀
go(isValidCount(paramCount) ? 2 : 0, true);
