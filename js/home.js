import { isLoggedIn, apiFetch } from "./api.js";
import { GENRES, loadGenres } from "./genres.js";
import { TYPES, fetchPopular, popularErrorText, createPosterCard, placeholderRail, posterBackground } from "./popular.js";

// =====================================
// 홈 화면 (최종 디자인 시안 index.html 기준)
//   비회원: 소개 + 인기 목록 블러 미리보기(API를 호출하지 않음) + 로그인 안내
//   회원  : 추천 시작 배너 + 최근 추천(GET /api/sessions)
//           + 요즘 많이 보는 10편(GET /api/popular?type, 인기순 상위 10개) + 장르로 둘러보기
//
// "전체 / 영화 / TV 시리즈" 탭은 API type 파라미터로 조회하고, 전체 목록·필터는 요즘 대세(trending.html)에서
// =====================================

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const SHOW_COUNT = 10;

const el = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
};

const root = document.getElementById("home-root");

// 원본 시안 data.js의 미리보기 작품(m1, t4, m5)과 포스터를 그대로 사용
// t4는 원본에도 포스터 이미지가 없어 제목 대체 화면으로 표시
const PREVIEW_POSTERS = [
    { title: "인터스텔라", path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg" },
    { title: "궤도 정거장", path: "" },
    { title: "듄", path: "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg" }
];

// ---------- 공통 화면 조각 ----------

const landingHTML = (guest) => `
    <section class="landing" aria-labelledby="landing-title">
        <div class="landing-fx" aria-hidden="true"><div><i></i></div></div>
        <div class="container landing-inner">
            <h2 id="landing-title">함께 볼 콘텐츠, 고민하지 말고 골라보세요</h2>
            <p>참여자별 선호 장르를 모아 모두가 즐길 수 있는 영화, 드라마 TOP 3를 추천합니다.</p>
            <div class="row wrap">
                <a class="btn btn-primary btn-lg" href="start.html">같이 볼 콘텐츠 추천받기</a>
            </div>
            ${guest ? '<p class="landing-note">로그인 없이도 추천받을 수 있어요. 로그인하면 추천 기록 저장, 본 작품 빼기도 쓸 수 있어요.</p>' : ""}
        </div>
    </section>`;

const howHTML = (guest) => `
    <section class="section" id="how" aria-labelledby="how-title" style="margin-bottom:24px">
        <div class="section-head"><h2 id="how-title">추천은 이렇게 해요</h2></div>
        <ol class="steps-list">
            <li><span class="n">1단계</span><h3>인원과 이름 정하기</h3><p>2~6명까지 함께 고를 수 있어요. 이름을 적으면 결과에서 누구 취향인지 이름으로 보여줘요.</p></li>
            <li><span class="n">2단계</span><h3>한 명씩 장르 고르기</h3><p>한 화면에서 차례대로 각자 1~3개를 골라요. 앞사람이 고른 장르는 가려져서 눈치 보지 않아도 돼요.</p></li>
            <li><span class="n">3단계</span><h3>겹치는 취향으로 3편 추천</h3><p>여러 사람이 좋아한 장르를 먼저 반영하고, 모두가 세 편 중 최소 한 편은 자기 취향인 작품을 받도록 골라요. 이미 본 작품은 "이미 봤어요"를 누르면 다음 후보로 바뀌어요.</p></li>
        </ol>
        <p class="muted" style="font-size:13px;margin:18px 0 0">${guest
            ? "로그인하지 않아도 추천받을 수 있어요. 추천 기록 저장과 본 작품 빼기는 로그인 후에 쓸 수 있어요."
            : "추천 결과는 추천 기록에 저장되고, 이미 봤다고 표시한 작품은 그 추천에서 빠져요."}</p>
    </section>`;

// ---------- 비회원 ----------

const guestTrendHTML = () => `
    <section class="section" aria-labelledby="trend-title">
        <div class="section-head">
            <div>
                <h2 id="trend-title">요즘 많이 보는 10편</h2>
                <p class="muted" style="margin:4px 0 0;font-size:14px">로그인하면 지금 인기 있는 작품을 볼 수 있어요</p>
            </div>
        </div>
        <div class="blur-wrap">
            <!-- 모양만 보여주는 블러 미리보기: 읽거나 누를 수 없도록 숨김 -->
            <div class="blurred" aria-hidden="true" inert>
                <div class="trend-filter">
                    <div class="tabs">${TYPES.map((t, i) => `<button class="tab" type="button" aria-selected="${i === 0}" tabindex="-1">${t.label}</button>`).join("")}</div>
                </div>
                <ol class="rail rank-rail" style="margin:16px 0 0;padding:0 0 8px;list-style:none">${placeholderRail(SHOW_COUNT)}</ol>
            </div>
            <div class="lock">
                <div class="lock-card">
                    <h3>로그인하면 볼 수 있어요</h3>
                    <p>영화·드라마 인기 순위를 장르와 국가별로 둘러볼 수 있어요.</p>
                    <div class="row wrap">
                        <a class="btn btn-secondary" href="login.html">로그인</a>
                        <a class="btn btn-primary" href="signup.html">회원가입</a>
                    </div>
                    <small>추천은 로그인 없이도 받을 수 있어요.</small>
                </div>
            </div>
        </div>
    </section>`;

const guestExtraHTML = () => `
    <section class="section" aria-labelledby="why-title">
        <div class="section-head"><h2 id="why-title">RecoMate가 다른 점</h2></div>
        <div class="grid cols-3">
            <div class="card"><h3 style="margin:0 0 6px">모두의 취향을 한 번에</h3><p class="muted" style="margin:0;font-size:14px">한 사람 기준이 아니라, 함께 보는 2~6명이 고른 장르를 모두 합쳐서 추천해요.</p></div>
            <div class="card"><h3 style="margin:0 0 6px">아무도 소외되지 않게</h3><p class="muted" style="margin:0;font-size:14px">세 편 중 최소 한 편은 모든 사람의 취향에 맞도록 골라요. 누구 취향에 얼마나 맞는지 그래프로 보여줘요.</p></div>
            <div class="card"><h3 style="margin:0 0 6px">본 작품은 빼고</h3><p class="muted" style="margin:0;font-size:14px">이미 본 작품은 바로 다른 후보로 바꾸고, 다음 추천에서도 빼요.</p></div>
        </div>
    </section>`;

const guestJoinHTML = () => `
    <section class="section card row wrap" style="justify-content:space-between;margin-bottom:24px" aria-labelledby="join-title">
        <div>
            <h2 id="join-title" style="margin:0 0 4px;font-size:20px">추천 기록도 남기고 싶다면?</h2>
            <p class="muted" style="margin:0">로그인하면 추천 기록이 저장되고, 이미 본 작품을 빼고 추천받을 수 있어요.</p>
        </div>
        <div class="row"><a class="btn btn-secondary" href="login.html">로그인</a><a class="btn btn-primary" href="signup.html">회원가입</a></div>
    </section>`;

// ---------- 회원: 시작 영역 (소개 + 결과 예시) ----------

const heroHTML = () => `
    <section class="hero" aria-labelledby="intro-title">
        <div class="container hero-inner">
            <div>
                <h2 id="intro-title" style="font-size:clamp(26px,3.6vw,38px);line-height:1.25;margin:0 0 14px;letter-spacing:-0.02em">볼 게 너무 많아서 못 고르겠다면,<br>각자 장르만 고르세요</h2>
                <p>한 화면에서 차례대로 한 명씩 장르를 고르세요. 모두의 취향이 겹치는 영화·드라마 3편과, 누구 취향에 얼마나 맞는지를 함께 보여드려요.</p>
                <div class="row wrap">
                    <a class="btn btn-primary btn-lg" href="start.html">인원 정하고 시작하기</a>
                    <a class="btn btn-ghost btn-lg" href="#how">추천 방식 보기</a>
                </div>
                <div class="row wrap" style="margin-top:22px" aria-label="인원 바로 선택">
                    <span class="muted" style="font-size:14px">바로 시작</span>
                    ${[2, 3, 4, 5, 6].map((n) => `<a class="chip" href="start.html?count=${n}">${n}명</a>`).join("")}
                </div>
            </div>

            <!-- 결과 화면 미리보기: 실제 작품이 아니라 구성을 보여주는 예시 -->
            <figure class="preview" style="margin:0" aria-label="추천 결과 예시">
                <div class="row" style="justify-content:space-between">
                    <strong style="font-size:14px">정우, 다혜, 주현의 추천</strong>
                    <span class="muted" style="font-size:12px">결과 예시</span>
                </div>
                <div class="posters3">${PREVIEW_POSTERS.map((item, index) => `<div class="poster" style="background:${posterBackground(item.title)}"><span class="fallback">${item.title}</span>${item.path ? `<img src="${TMDB_IMAGE_BASE_URL}${item.path}" alt="${item.title} 포스터" loading="lazy" onerror="this.remove()">` : ""}<span class="badge brand rank">${index + 1}위</span></div>`).join("")}</div>
                <div>${[["정우", 100, "var(--p1)"], ["다혜", 100, "var(--p2)"], ["주현", 81, "var(--p3)"]].map(([name, pct, color]) => `
                    <div class="match-row" style="grid-template-columns:56px 1fr 40px">
                        <span class="row" style="gap:6px"><span class="p-dot" style="background:${color}"></span>${name}</span>
                        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
                        <b style="text-align:right;font-size:13px">${pct}%</b>
                    </div>`).join("")}</div>
                <figcaption class="muted" style="font-size:12px;margin-top:14px">1위 작품이 사람마다 얼마나 맞는지 보여줘요. 본 작품은 눌러서 바로 다른 작품으로 바꿀 수 있어요.</figcaption>
            </figure>
        </div>
    </section>`;

// ---------- 회원: 인기 목록 (시안 "요즘 많이 보는 10편") ----------

const memberTrendHTML = () => `
    <section class="section" aria-labelledby="trend-title">
        <div class="section-head">
            <div>
                <h2 id="trend-title">요즘 많이 보는 10편</h2>
                <p class="muted" style="margin:4px 0 0;font-size:14px">TMDB 인기 순위 기준</p>
            </div>
            <a class="btn btn-ghost btn-sm" href="trending.html">전체 보기</a>
        </div>
        <div class="tabs" id="type-tabs" role="tablist" aria-label="콘텐츠 종류">
            ${TYPES.map((t, i) => `<button class="tab" type="button" role="tab" aria-selected="${i === 0}" data-type="${t.value}">${t.label}</button>`).join("")}
        </div>
        <div id="trend-body" aria-busy="true"></div>
        <p class="sr-only" id="trend-status" role="status"></p>
    </section>`;

// 시안: 장르 칩을 누르면 요즘 대세 화면에서 해당 장르로 바로 필터
const genreLinksHTML = () => `
    <section class="section" aria-labelledby="genre-title">
        <div class="section-head"><h2 id="genre-title">장르로 둘러보기</h2></div>
        <div class="chips" id="genre-links"></div>
    </section>`;

function setupGenreLinks(genresReady) {
    const box = document.getElementById("genre-links");

    const render = (genres) => {
        box.replaceChildren(...genres.map((g) => {
            const link = el("a", "chip", g.name);

            link.href = `trending.html?genre=${encodeURIComponent(g.code)}`;

            return link;
        }));
    };

    render(GENRES);
    genresReady.then(render);
}

function setupMemberTrend(genresReady) {
    let type = "";
    let genreNames = Object.fromEntries(GENRES.map((g) => [g.code, g.name]));
    let requestId = 0;

    const body = document.getElementById("trend-body");
    const status = document.getElementById("trend-status");

    const railList = () => {
        const list = el("ol", "rail rank-rail");

        list.style.cssText = "margin:16px 0 0;padding:0 0 8px;list-style:none";

        return list;
    };

    const showSkeleton = () => {
        body.setAttribute("aria-busy", "true");

        const list = railList();

        list.innerHTML = placeholderRail(SHOW_COUNT);
        list.setAttribute("aria-hidden", "true");
        body.replaceChildren(list);
    };

    const showMessage = (title, text, action) => {
        body.setAttribute("aria-busy", "false");

        const card = el("div", "state-card");

        card.append(el("h3", "", title), el("p", "", text));

        if (action) {
            const button = el("button", "btn btn-secondary btn-sm", action.label);

            button.type = "button";
            button.addEventListener("click", action.run);
            card.append(button);
        }

        body.replaceChildren(card);
        status.textContent = title;
    };

    const render = (items) => {
        const picked = items.slice(0, SHOW_COUNT);

        if (!picked.length) {
            showMessage("지금은 보여줄 작품이 없어요", "잠시 후 다시 확인해주세요.", { label: "다시 시도", run: load });
            return;
        }

        body.setAttribute("aria-busy", "false");

        const list = railList();

        picked.forEach((item, i) => {
            const li = el("li", "rank-item");
            const num = el("span", "num", String(i + 1));
            const wrap = el("div");

            num.setAttribute("aria-hidden", "true");
            wrap.append(el("span", "sr-only", `${i + 1}위`), createPosterCard(item, { genreNames }));
            li.append(num, wrap);
            list.append(li);
        });

        body.replaceChildren(list);
        status.textContent = `인기 작품 ${picked.length}편을 보여줘요`;
    };

    async function load() {
        const id = ++requestId;

        showSkeleton();

        try {
            const items = await fetchPopular({ type });

            if (id === requestId) render(items);
        } catch (error) {
            if (id !== requestId) return;

            console.error("인기 목록 API 에러:", error);
            showMessage("인기 목록을 불러오지 못했어요", popularErrorText(error), { label: "다시 시도", run: load });
        }
    }

    document.getElementById("type-tabs").addEventListener("click", (e) => {
        const tab = e.target.closest("[data-type]");

        if (!tab || tab.dataset.type === type) return;

        type = tab.dataset.type;

        document.querySelectorAll("#type-tabs .tab").forEach((t) => {
            t.setAttribute("aria-selected", String(t === tab));
        });

        load();
    });

    genresReady.then((genres) => {
        genreNames = Object.fromEntries(genres.map((g) => [g.code, g.name]));
    });

    load();
}

// ---------- 회원: 최근 추천 ----------

const formatDate = (createdAt) => {
    const date = new Date(createdAt);

    return Number.isNaN(date.getTime())
        ? "날짜 정보 없음"
        : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
};

async function setupRecent(section) {
    try {
        const data = await apiFetch("/api/sessions?limit=2");
        const sessions = Array.isArray(data?.sessions) ? data.sessions : [];

        if (!sessions.length) {
            section.innerHTML = `
                <div class="card row wrap" style="justify-content:space-between">
                    <div><h3 id="recent-title" style="margin:0 0 4px">아직 추천 기록이 없어요</h3>
                    <p class="muted" style="margin:0">첫 추천을 받으면 여기에서 바로 다시 볼 수 있어요.</p></div>
                    <a class="btn btn-primary" href="start.html">추천 시작하기</a>
                </div>`;
            section.hidden = false;
            return;
        }

        section.innerHTML = '<div class="section-head"><h2 id="recent-title">최근 추천</h2><a class="btn btn-ghost btn-sm" href="profile.html#history">전체 기록</a></div><div class="grid cols-2"></div>';

        const grid = section.querySelector(".grid");

        sessions.forEach((session) => {
            const link = el("a", "card tight row recent-card");

            link.href = `result.html?sessionId=${encodeURIComponent(session.sessionId)}&count=${encodeURIComponent(session.participantCount)}`;

            const text = el("div", "grow");

            const date = el("div", "muted", formatDate(session.createdAt));

            date.style.fontSize = "13px";
            text.append(el("strong", "", `${session.participantCount}명이 함께 고른 추천`), date);

            link.append(text, el("span", "btn btn-secondary btn-sm", "다시 보기"));
            grid.append(link);
        });

        section.hidden = false;
    } catch (error) {
        console.error("추천 기록 조회 실패:", error);
        section.hidden = true;
    }
}

// ---------- 시작 ----------

const member = await isLoggedIn();

if (member) {
    root.innerHTML = `
        ${landingHTML(false)}
        ${heroHTML()}
        <div class="container">
            <section class="section" id="recent-section" aria-labelledby="recent-title" hidden></section>
            ${memberTrendHTML()}
            ${genreLinksHTML()}
            ${howHTML(false)}
        </div>`;

    const genresReady = loadGenres();

    setupMemberTrend(genresReady);
    setupGenreLinks(genresReady);
    setupRecent(document.getElementById("recent-section"));
} else {
    root.innerHTML = `
        ${landingHTML(true)}
        <div class="container">
            ${guestTrendHTML()}
            ${guestExtraHTML()}
            ${howHTML(true)}
            ${guestJoinHTML()}
        </div>`;
}