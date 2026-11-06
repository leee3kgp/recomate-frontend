// =====================================
// 추천 흐름 화면 전환 (홈 → 이용방법 → 인원 선택)
// - 시안처럼 페이지 이동 없이 #app 안의 화면만 교체
// - 주소 해시(#guide, #count)로 단계를 표시해서 새로고침·뒤로가기도 동작
// - 인원 선택 이후(장르 선택)는 select.html 로 이동 (이슈 #38 에서 같은 방식으로 전환할 예정)
// =====================================

import {
    MIN_PARTICIPANTS,
    MAX_PARTICIPANTS,
    getFlowCount,
    setFlowCount
} from "./flow-state.js";

const app = document.getElementById("app");

let count = getFlowCount();

// ---------- 화면 템플릿 (시안 views.home / guide / count) ----------

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
        </section>`
};

// ---------- 렌더링 ----------

const currentStep = () => {
    const step = window.location.hash.replace("#", "");
    return views[step] ? step : "home";
};

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

function render() {
    const step = currentStep();

    // 홈만 배경이 한 톤 어둡고, 나머지 단계는 선명한 배경 (시안 data-mode)
    document.body.dataset.mode = step === "home" ? "home" : "flow";
    document.title = step === "home"
        ? "RecoMate | 함께 고르는 콘텐츠"
        : "RecoMate | " + (step === "guide" ? "이용방법" : "인원 선택");

    app.innerHTML = views[step]();

    if (step === "count") updateCount();

    // 화면이 바뀌면 제목으로 포커스를 옮겨 스크린리더가 새 화면을 인식하게 함
    app.querySelector("h2, h3")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
}

function go(step) {
    window.location.hash = step === "home" ? "" : step;
}

// ---------- 이벤트 ----------

app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;

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
            setFlowCount(count);
            window.location.href = `select.html?count=${count}`;
            break;
    }
});

window.addEventListener("hashchange", render);

// 뒤로가기로 돌아왔을 때 저장된 인원 수를 다시 반영
window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
        count = getFlowCount();
        render();
    }
});

render();
