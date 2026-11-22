/* =========================================
   RecoMate - 마이 페이지 탭 (profile.html, recomate-1 시안)
   - 탭 3개: #history(기본) / #watched / #settings, 주소로 열림
   - 추천 기록 탭은 처음 열 때만 js/history.js를 불러와 API 조회
   - 본 작품·설정은 기존 profile.js가 그대로 담당
   - 키보드: ←/→ 이동, Home/End 처음·끝
========================================= */

const TABS = ["history", "watched", "settings"];
const tabList = document.querySelector(".mp-tabs");

let historyStarted = false;

function currentTab() {
    const hash = window.location.hash.slice(1);

    return TABS.includes(hash) ? hash : "history";
}

function startHistoryOnce() {
    if (historyStarted) return;

    historyStarted = true;

    import("./history.js")
        .then(({ startHistory }) => startHistory())
        .catch((error) => {
            historyStarted = false;
            console.error("추천 기록 불러오기 실패:", error);
        });
}

function showTab(name) {
    for (const tab of TABS) {
        const selected = tab === name;
        const button = document.getElementById(`tab-${tab}`);

        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
        document.getElementById(`panel-${tab}`).hidden = !selected;
    }

    if (name === "history") startHistoryOnce();
}

function selectTab(name, focus = false) {
    // 탭 전환마다 뒤로 가기 기록이 쌓이지 않도록 replaceState
    if (window.location.hash !== `#${name}`) {
        history.replaceState(null, "", `#${name}`);
    }

    showTab(name);

    if (focus) document.getElementById(`tab-${name}`).focus();
}

tabList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");

    if (button) selectTab(button.dataset.tab);
});

tabList.addEventListener("keydown", (event) => {
    const index = TABS.indexOf(currentTab());
    const next = {
        ArrowRight: (index + 1) % TABS.length,
        ArrowLeft: (index - 1 + TABS.length) % TABS.length,
        Home: 0,
        End: TABS.length - 1
    }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    selectTab(TABS[next], true);
});

// 상단 개수(#history, #watched) 링크·약관의 profile.html#settings 링크
window.addEventListener("hashchange", () => showTab(currentTab()));

showTab(currentTab());
