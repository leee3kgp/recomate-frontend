import { isLoggedIn, apiFetch, ApiError } from "./api.js";
import { loadGenres } from "./genres.js";

// =====================================
// 홈 화면 (최종 디자인 시안 index.html 기준)
//   비회원: 소개 + 인기 목록 블러 미리보기(API를 호출하지 않음) + 로그인 안내
//   회원  : 추천 시작 배너 + 인기 목록(GET /api/popular) + 최근 추천(GET /api/sessions)
//
// 인기 목록 API는 영화와 TV를 섞어 인기순 최대 20개를 돌려주므로,
// "전체 / 영화 / TV 시리즈" 탭과 "평점순 10개"는 프론트에서 type · voteAverage 로 거르고 정렬함
// =====================================

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const SHOW_COUNT = 10;               // 화면에 보여줄 개수
const CACHE_MS = 10 * 60 * 1000;     // 서버 캐시(10분)와 같은 간격으로 이전 조회를 재사용

const TYPES = [
    { value: "all", label: "전체" },
    { value: "movie", label: "영화" },
    { value: "tv", label: "TV 시리즈" }
];

// GET /api/popular 의 country 는 두 글자 ISO 3166-1 코드
const COUNTRIES = [
    { value: "", label: "모든 국가" },
    { value: "KR", label: "한국" },
    { value: "US", label: "미국" },
    { value: "JP", label: "일본" },
    { value: "GB", label: "영국" }
];

const el = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
};

const root = document.getElementById("home-root");

// 제목에서 색을 계산해 포스터가 없을 때의 배경으로 사용 (시안 posterHTML 과 같은 방식)
const hueOf = (text = "") => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

const posterBackground = (seed) => {
    const hue = hueOf(String(seed));

    return `linear-gradient(160deg, hsl(${hue} 60% 32%), hsl(${(hue + 40) % 360} 55% 14%))`;
};

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

// 인기 목록 자리에 보여줄 가짜 순위 카드 (실제 작품 정보 없이 모양만)
const placeholderRail = () => Array.from({ length: SHOW_COUNT }, (_, i) => `
    <li class="rank-item">
        <span class="num" aria-hidden="true">${i + 1}</span>
        <div>
            <article class="poster-card">
                <div class="poster" style="background:${posterBackground(i * 37 + 11)}"></div>
                <div><div class="line skeleton"></div><div class="line skeleton short"></div></div>
            </article>
        </div>
    </li>`).join("");

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
                <ol class="rail rank-rail" style="margin:16px 0 0;padding:0 0 8px;list-style:none">${placeholderRail()}</ol>
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
                <div class="posters3">${[1, 2, 3].map((rank) => `<div class="poster" style="background:${posterBackground(rank * 53)}"><span class="badge brand rank">${rank}위</span></div>`).join("")}</div>
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

// ---------- 회원: 인기 목록 ----------

const memberTrendHTML = () => `
    <section class="section" aria-labelledby="trend-title">
        <div class="section-head">
            <div>
                <h2 id="trend-title">요즘 많이 보는 10편</h2>
                <p class="muted" id="trend-sub" style="margin:4px 0 0;font-size:14px"></p>
            </div>
        </div>
        <div class="trend-filter">
            <div class="tabs" id="type-tabs" role="tablist" aria-label="콘텐츠 종류">
                ${TYPES.map((t, i) => `<button class="tab" type="button" role="tab" aria-selected="${i === 0}" data-type="${t.value}">${t.label}</button>`).join("")}
            </div>
            <div>
                <label class="sr-only" for="country">국가</label>
                <select class="input select" id="country">
                    ${COUNTRIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}
                </select>
            </div>
        </div>
        <div class="chips genre-filter" id="genre-filter" role="group" aria-label="장르 필터"></div>
        <div id="trend-body" aria-busy="true"></div>
        <p class="sr-only" id="trend-status" role="status"></p>
    </section>`;

function setupMemberTrend() {
    const state = { type: "all", genre: "", country: "" };
    const cache = new Map();   // "장르|국가" → { at, items }
    let genreNames = {};
    let requestId = 0;         // 느리게 도착한 이전 요청이 화면을 덮어쓰지 않도록

    const body = document.getElementById("trend-body");
    const status = document.getElementById("trend-status");
    const sub = document.getElementById("trend-sub");

    const cacheKey = () => `${state.genre}|${state.country}`;

    const readCache = () => {
        const hit = cache.get(cacheKey());

        return hit && Date.now() - hit.at < CACHE_MS ? hit.items : null;
    };

    // ----- 카드 -----

    const createCard = (item) => {
        const card = el("article", "poster-card");
        const poster = el("div", "poster");

        poster.style.background = posterBackground(item.title);
        poster.append(el("div", "fallback", item.title || ""));

        if (item.posterPath) {
            const img = document.createElement("img");

            img.loading = "lazy";
            img.alt = `${item.title || ""} 포스터`;
            img.src = `${TMDB_IMAGE_BASE_URL}${item.posterPath}`;
            img.addEventListener("error", () => img.remove(), { once: true });
            poster.append(img);
        }

        const info = el("div");
        const meta = el("div", "meta");

        meta.append(el("span", "", item.type === "movie" ? "영화" : "TV 시리즈"));

        if (item.releaseYear) meta.append(el("span", "", String(item.releaseYear)));

        if (Number(item.voteAverage) > 0) {
            meta.append(el("span", "score", `★ ${Number(item.voteAverage).toFixed(1)}`));
        }

        info.append(el("span", "title", item.title || ""), meta);
        card.append(poster, info);

        return card;
    };

    // ----- 상태별 본문 -----

    const showSkeleton = () => {
        body.setAttribute("aria-busy", "true");

        const list = el("ol", "rail rank-rail");

        list.style.cssText = "margin:16px 0 0;padding:0 0 8px;list-style:none";
        list.innerHTML = placeholderRail();
        list.setAttribute("aria-hidden", "true");
        body.replaceChildren(list);
    };

    const showMessage = (title, text, actions = []) => {
        body.setAttribute("aria-busy", "false");

        const card = el("div", "state-card");

        card.setAttribute("role", "status");
        card.append(el("h3", "", title), el("p", "", text));

        actions.forEach(({ label, run, primary }) => {
            const button = el("button", `btn ${primary ? "btn-primary" : "btn-secondary"} btn-sm`, label);

            button.type = "button";
            button.addEventListener("click", run);
            card.append(button);
        });

        body.replaceChildren(card);
        status.textContent = title;
    };

    // 영화/TV 탭으로 거르고 평점 높은 순으로 10개 (API 는 영화·TV 를 섞은 인기순 20개)
    const pickItems = (items) => items
        .filter((item) => state.type === "all" || item.type === state.type)
        .sort((a, b) => (Number(b.voteAverage) || 0) - (Number(a.voteAverage) || 0))
        .slice(0, SHOW_COUNT);

    const describeFilter = () => {
        const parts = [
            state.genre ? genreNames[state.genre] || state.genre : "",
            COUNTRIES.find((c) => c.value === state.country)?.value
                ? COUNTRIES.find((c) => c.value === state.country).label
                : ""
        ].filter(Boolean);

        sub.textContent = `${parts.length ? parts.join(" · ") : "TMDB"} 인기작 중 평점이 높은 순이에요`;
    };

    const resetFilters = () => {
        state.type = "all";
        state.genre = "";
        state.country = "";

        document.querySelectorAll("#type-tabs .tab").forEach((tab) => {
            tab.setAttribute("aria-selected", String(tab.dataset.type === "all"));
        });
        document.getElementById("country").value = "";
        syncGenreChips();
        load();
    };

    const render = (items) => {
        describeFilter();

        const picked = pickItems(items);

        if (!picked.length) {
            showMessage(
                "조건에 맞는 작품이 없어요",
                "장르를 바꾸거나 국가를 바꿔보세요.",
                [{ label: "필터 초기화", run: resetFilters, primary: false }]
            );
            return;
        }

        body.setAttribute("aria-busy", "false");

        const list = el("ol", "rail rank-rail");

        list.style.cssText = "margin:16px 0 0;padding:0 0 8px;list-style:none";

        picked.forEach((item, i) => {
            const li = el("li", "rank-item");
            const wrap = el("div");

            wrap.append(el("span", "sr-only", `${i + 1}위`), createCard(item));
            li.append(el("span", "num", String(i + 1)), wrap);
            li.firstChild.setAttribute("aria-hidden", "true");
            list.append(li);
        });

        body.replaceChildren(list);
        status.textContent = `${picked.length}편을 보여줘요`;
    };

    const errorText = (error) => {
        if (error instanceof ApiError && error.code === "UPSTREAM_ERROR") {
            return "인기 목록을 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
        }

        if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
            return error.message;
        }

        if (error instanceof ApiError && error.status === 429) {
            return "요청이 많아 잠시 후 다시 시도해주세요.";
        }

        return "인기 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
    };

    // GET /api/popular?genre=…&country=… (둘 다 선택, 없으면 전체 인기 목록)
    async function load() {
        // 이전 요청이 아직 진행 중이어도 그 응답은 무시되도록 먼저 번호를 올림
        const id = ++requestId;
        const cached = readCache();

        if (cached) {
            render(cached);
            return;
        }

        describeFilter();
        showSkeleton();

        const query = new URLSearchParams();

        if (state.genre) query.set("genre", state.genre);
        if (state.country) query.set("country", state.country);

        const queryText = query.toString();

        try {
            const data = await apiFetch(`/api/popular${queryText ? `?${queryText}` : ""}`);

            if (id !== requestId) return; // 그 사이 필터가 바뀜

            const items = Array.isArray(data?.items) ? data.items : [];

            cache.set(cacheKey(), { at: Date.now(), items });
            render(items);
        } catch (error) {
            if (id !== requestId) return;

            console.error("인기 목록 API 에러:", error);
            showMessage("인기 목록을 불러오지 못했어요", errorText(error), [
                { label: "다시 시도", run: load, primary: true }
            ]);
        }
    }

    // ----- 장르 칩 -----

    const genreBox = document.getElementById("genre-filter");

    function syncGenreChips() {
        genreBox.querySelectorAll(".chip").forEach((chip) => {
            chip.setAttribute("aria-pressed", String(chip.dataset.genre === state.genre));
        });
    }

    const buildGenreChips = (genres) => {
        genreNames = Object.fromEntries(genres.map((g) => [g.code, g.name]));

        genreBox.replaceChildren(...[{ code: "", name: "전체 장르" }, ...genres].map((g) => {
            const chip = el("button", "chip", g.name);

            chip.type = "button";
            chip.dataset.genre = g.code;
            chip.setAttribute("aria-pressed", String(g.code === state.genre));

            return chip;
        }));

        describeFilter();
    };

    genreBox.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-genre]");

        if (!chip || chip.dataset.genre === state.genre) return;

        state.genre = chip.dataset.genre;
        syncGenreChips();
        load();
    });

    document.getElementById("type-tabs").addEventListener("click", (e) => {
        const tab = e.target.closest("[data-type]");

        if (!tab || tab.dataset.type === state.type) return;

        state.type = tab.dataset.type;

        document.querySelectorAll("#type-tabs .tab").forEach((t) => {
            t.setAttribute("aria-selected", String(t === tab));
        });

        // 종류 탭은 이미 받은 20개를 다시 거르기만 함 (캐시가 만료됐으면 다시 조회)
        const items = readCache();

        if (items) {
            render(items);
        } else {
            load();
        }
    });

    document.getElementById("country").addEventListener("change", (e) => {
        state.country = e.target.value;
        load();
    });

    // 장르 이름은 먼저 기본 목록으로 그리고, 서버 목록이 오면 교체 (실패해도 기본 목록 사용)
    buildGenreChips([]);
    loadGenres().then(buildGenreChips);

    load();
}

// ---------- 회원: 최근 추천 ----------

const formatDate = (createdAt) => {
    const date = new Date(createdAt);

    return Number.isNaN(date.getTime())
        ? "날짜 정보 없음"
        : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
};

// GET /api/sessions?limit=2 (목록 항목에는 날짜와 인원만 있어 상세는 결과 화면에서 확인)
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

        section.innerHTML = '<div class="section-head"><h2 id="recent-title">최근 추천</h2></div><div class="grid cols-2"></div>';

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
        // 기록을 못 불러와도 홈의 나머지 기능에는 영향이 없으므로 영역만 숨김
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
            ${howHTML(false)}
        </div>`;

    setupMemberTrend();
    setupRecent(document.getElementById("recent-section"));
} else {
    // 비회원: 인기 목록 API 는 로그인이 필요하므로 호출하지 않고 블러 미리보기와 안내만 보여줌
    root.innerHTML = `
        ${landingHTML(true)}
        <div class="container">
            ${guestTrendHTML()}
            ${guestExtraHTML()}
            ${howHTML(true)}
            ${guestJoinHTML()}
        </div>`;
}
