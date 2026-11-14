import { getCurrentUser } from "aws-amplify/auth";

import { requireLogin, apiFetch, publicFetch, ApiError } from "./api.js";
import { loadGenres } from "./genres.js";
import {
    GUEST_REQUEST_KEY,
    GUEST_RESULT_KEY,
    GUEST_EXCLUDED_LIMIT
} from "./guest-storage.js";
import {
    isValidCount,
    patchFlow,
    loadResultNames
} from "./flow-state.js";

// =====================================
// 추천 결과 화면 (최종 디자인 시안 result.html 기준)
//   1위 카드 + 사람별 일치도 막대 / 2·3위 / 취향 분석(Chart.js) / 저장 안내 / 다시 추천
// ?guest=1 이면 비회원 결과: 로그인 없이 받고 서버에는 아무것도 저장하지 않음
// =====================================

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

// 서버가 준 사람별 평균 일치율(participantMatch)과 계산값이 이 정도까지 다르면 같은 값으로 봄 (서버 반올림 여유)
const MATCH_TOLERANCE = 0.02;

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

const el = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
};

// 참여자 색 (css/result-page.css 의 --p1 ~ --p6)
const personColor = (i) => `var(--p${(i % 6) + 1})`;
const initialOf = (name) => Array.from(String(name).trim())[0] || "";

// 제목에서 색을 계산해 포스터가 없을 때의 배경으로 사용 (시안 posterHTML 과 같은 방식)
const posterBackground = (title = "") => {
    const hue = [...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

    return `linear-gradient(160deg, hsl(${hue} 60% 32%), hsl(${(hue + 40) % 360} 55% 14%))`;
};

async function initResultPage() {
    const params = new URLSearchParams(window.location.search);
    const isGuest = params.get("guest") === "1";

    if (!isGuest) {
        await requireLogin();
    }

    const app = document.getElementById("app");

    // 장르 마스터 매핑 (코드 -> 한국어명)
    const genreMap = (await loadGenres()).reduce((acc, curr) => {
        acc[curr.code] = curr.name;
        return acc;
    }, {});

    const genreName = (code) => genreMap[code] || code;

    // URL 쿼리 스트링에서 sessionId 추출 (비회원은 세션이 없음)
    const sessionId = params.get("sessionId");

    if (!isGuest && !sessionId) {
        alert("유효하지 않은 접근입니다. 세션 ID가 없습니다.");
        window.location.href = "index.html";
        return;
    }

    // 다시 추천받기: 같은 인원수로 이름 입력 단계(start.html?count=N)부터 시작
    const countParam = parseInt(params.get("count"), 10);
    const retryUrl = isValidCount(countParam) ? `start.html?count=${countParam}` : "start.html";

    // 추천은 세션당 1회만 생성 가능(409 RECOMMENDATION_EXISTS)하므로
    // 성공 응답을 저장해 두었다가 새로고침 시 재사용
    // 사용자별로 저장해 같은 탭의 다른 계정에 보이지 않게 함
    // 비회원은 다시 부르면 TMDB를 또 호출하므로 같은 방식으로 이 탭에만 저장
    const userId = isGuest ? null : (await getCurrentUser()).userId;
    const CACHE_KEY = isGuest ? GUEST_RESULT_KEY : `recomate:result:${userId}:${sessionId}`;
    const EXCLUDED_KEY = `recomate:excluded:${userId}:${sessionId}`; // 회원 전용

    // 결과 화면에 보여줄 참여자 이름 (장르 선택 화면이 추천 요청 성공 뒤에 저장)
    const names = loadResultNames(isGuest ? "guest" : sessionId);

    // ---------- 상태 ----------

    let data = null;            // { recommendations, analysis }
    let participants = null;    // [{ index, genres[] }] 일치도 계산에 사용 (모르면 null)
    let statusMessage = "";     // 불러오는 중 / 오류 안내
    let isLoading = false;      // 추천 생성 요청 진행 중
    let charts = [];            // 현재 화면의 Chart.js 인스턴스

    let excluding = false;      // "이미 봤어요" 제외 요청 진행 중 (중복 요청 방지)
    let seenError = "";         // 제외 요청 실패 안내
    let lastChange = "";        // 방금 제외하고 바뀐 작품 안내
    let flashText = "";         // 공유 결과, "준비 중" 같은 잠깐 보이는 안내
    let flashLink = null;       // 안내 뒤에 붙는 링크 { label, href } (예: 로그인)
    let flashTimer = null;

    const hasResults = (d) => d?.recommendations?.length > 0;

    // ---------- 저장본 (sessionStorage) ----------

    const loadCache = () => {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const normalizeParticipants = (list) => {
        if (!Array.isArray(list) || !list.length) return null;

        const result = list.map((p) => ({
            index: Number(p?.index),
            genres: Array.isArray(p?.genres) ? p.genres.filter((g) => typeof g === "string") : null
        }));

        return result.every((p) => Number.isInteger(p.index) && p.genres) ? result : null;
    };

    const saveCache = (d) => {
        // 빈 결과는 다시 시도할 수 있도록 저장하지 않음
        if (!d?.recommendations?.length) return;

        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...d, participants }));
        } catch {
            /* 저장 실패는 무시 */
        }
    };

    // 제외 후 결과 저장본 갱신: 결과가 있으면 교체, 비었으면 삭제
    // (saveCache 는 빈 결과를 건너뛰므로 이전 결과가 남지 않게 직접 삭제)
    const replaceCache = (d) => {
        if (d.recommendations.length) {
            saveCache(d);
            return;
        }

        try {
            sessionStorage.removeItem(CACHE_KEY);
        } catch {
            /* 무시 */
        }
    };

    // ---------- "이미 봤어요"(회원 전용) 제외 횟수 ----------
    // 비회원은 "이미 봤어요"를 쓸 수 없고 로그인 안내만 보여줌 (시안 기준)

    // 지금까지 제외한 작품 수 (안내 문구용, 새로고침해도 유지)
    let excludedCount = isGuest ? 0 : Number(sessionStorage.getItem(EXCLUDED_KEY)) || 0;

    const saveExcludedCount = () => {
        try {
            sessionStorage.setItem(EXCLUDED_KEY, String(excludedCount));
        } catch {
            /* 저장 실패는 무시 */
        }
    };

    // ---------- 다른 작품 보기 (서버 전용 API 가 없어 비회원 추천 API 의 excluded 를 사용) ----------
    // 이미 보여준 작품을 모두 excluded 로 보내면 다음 후보 3편을 받음. 이 API 는 서버에 아무것도 저장하지 않음
    // → 다른 작품 묶음은 이 화면에서만 보이고 새로고침하면 처음 추천(저장된 결과)으로 돌아감

    let pages = null;           // [{ recommendations, analysis }] 0번 = 저장된 추천. null 이면 아직 다른 작품을 보지 않음
    let pageIndex = 0;          // 지금 보는 묶음
    let rerolling = false;      // 다른 작품 불러오는 중
    let localSeen = [];         // 다른 작품 묶음에서 "이미 봤어요"로 뺀 작품 (이 화면에서만)

    // 회원이 서버에 제외한 작품 (서버는 제외 목록을 알려주지 않아 이 탭에 따로 기억해 둠)
    const SEEN_ITEMS_KEY = `recomate:excluded:items:${userId}:${sessionId}`;

    const loadSeenItems = () => {
        if (isGuest) return [];

        try {
            const list = JSON.parse(sessionStorage.getItem(SEEN_ITEMS_KEY));
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    };

    const rememberSeen = (seen) => {
        try {
            sessionStorage.setItem(SEEN_ITEMS_KEY, JSON.stringify([...loadSeenItems(), seen]));
        } catch {
            /* 저장 실패는 무시 */
        }
    };

    // ---------- 참여자 / 일치도 계산 ----------

    // 참여자별 선택 장르: 비회원은 장르 선택 화면이 저장한 요청, 회원은 세션 조회 응답에 들어 있음
    const fetchParticipants = async () => {
        if (isGuest) {
            try {
                return normalizeParticipants(JSON.parse(sessionStorage.getItem(GUEST_REQUEST_KEY))?.participants);
            } catch {
                return null;
            }
        }

        const session = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`);

        return normalizeParticipants(session?.participants);
    };

    // 일치도 막대에 필요하지만 없어도 화면은 그릴 수 있으므로 실패는 조용히 무시
    const ensureParticipants = async () => {
        if (participants) return;

        try {
            participants = await fetchParticipants();
        } catch (error) {
            console.error("참여자 정보 조회 에러:", error);
            participants = null;
        }
    };

    // 화면에 그릴 참여자 목록 [{ index, name, genres|null }]
    const getPeople = () => {
        const count = participants?.length
            || data?.analysis?.participantMatch?.length
            || (isValidCount(countParam) ? countParam : 0);

        return Array.from({ length: count }, (_, i) => ({
            index: i + 1,
            name: names[i] || `참여자 ${i + 1}`,
            genres: participants?.find((p) => p.index === i + 1)?.genres ?? null
        }));
    };

    // API 명세의 일치율: 겹치는 장르 수 ÷ min(참여자가 고른 장르 수, 작품 장르 수)
    const matchRate = (itemGenres, personGenres) => {
        const picked = new Set(personGenres);
        const overlap = itemGenres.filter((g) => picked.has(g)).length;
        const base = Math.min(personGenres.length, itemGenres.length);

        return base ? overlap / base : 0;
    };

    // 작품별 · 사람별 일치율 [작품][사람] (0~1)
    // 서버가 알려 준 값과 어긋나면 틀린 퍼센트를 보여주지 않도록 null (막대 대신 도트로 표시)
    //   1) 장르가 겹친다고 계산된 사람 = 서버의 matchedParticipants
    //   2) 사람별 평균 = 서버의 participantMatch.matchRate
    const buildMatchModel = (recs, people, analysis) => {
        if (!recs.length || !people.length || people.some((p) => !p.genres)) return null;

        const rates = recs.map((item) => people.map((p) => matchRate(item.genres || [], p.genres)));

        const sameMatched = recs.every((item, k) => (
            !Array.isArray(item.matchedParticipants)
            || people.every((p, i) => (rates[k][i] > 0) === item.matchedParticipants.includes(p.index))
        ));

        const serverAvg = new Map((analysis?.participantMatch || []).map((m) => [m.index, m.matchRate]));

        const sameAverage = people.every((p, i) => {
            const server = serverAvg.get(p.index);
            if (typeof server !== "number") return true;

            const mine = rates.reduce((sum, row) => sum + row[i], 0) / rates.length;

            return Math.abs(mine - server) <= MATCH_TOLERANCE;
        });

        return sameMatched && sameAverage ? rates : null;
    };

    const average = (values) => values.reduce((a, b) => a + b, 0) / (values.length || 1);

    // ---------- 카드 조각 ----------

    const createPoster = (item, rank) => {
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

        poster.append(el("span", "badge brand rank", `${rank}위`));

        return poster;
    };

    const createMeta = (item) => {
        const meta = el("div", "meta");

        meta.append(el("span", "", item.mediaType === "movie" ? "영화" : "TV 시리즈"));

        if (item.releaseYear) meta.append(el("span", "", String(item.releaseYear)));

        if (Number(item.voteAverage) > 0) {
            meta.append(el("span", "score", `★ ${Number(item.voteAverage).toFixed(1)}`));
        }

        const card = el("div", "poster-card");
        card.append(meta);

        return card;
    };

    // 사람별 점: 이 작품과 장르가 겹치는 참여자(matchedParticipants)만 진하게
    const createDots = (item, people) => {
        const wrap = el("div", "row");

        wrap.style.gap = "6px";
        wrap.setAttribute("aria-label", "사람별 일치");

        if (!Array.isArray(item.matchedParticipants) || !people.length) return null;

        people.forEach((p, i) => {
            const dot = el("span", "p-dot");
            const matched = item.matchedParticipants.includes(p.index);

            dot.title = `${p.name} ${matched ? "취향과 겹쳐요" : "겹치는 장르 없음"}`;
            dot.style.background = personColor(i);
            dot.style.opacity = matched ? "1" : "0.3";
            wrap.append(dot);
        });

        const count = people.filter((p) => item.matchedParticipants.includes(p.index)).length;
        const label = el("span", "muted", `${count}/${people.length}명 취향`);

        label.style.fontSize = "12px";
        label.style.marginLeft = "4px";
        wrap.append(label);

        return wrap;
    };

    // 사람별 일치도 막대 (시안 .match-row)
    const createMatchRows = (rates, people) => {
        const box = el("div");

        box.style.marginBottom = "18px";

        people.forEach((p, i) => {
            const pct = Math.round(rates[i] * 100);
            const row = el("div", "match-row");

            const who = el("span", "row");
            who.style.gap = "8px";
            who.style.minWidth = "0";

            const dot = el("span", "p-dot");
            dot.style.background = personColor(i);

            const label = el("span", "", p.name);
            label.style.overflow = "hidden";
            label.style.textOverflow = "ellipsis";
            label.style.whiteSpace = "nowrap";

            who.append(dot, label);

            const track = el("div", "bar-track");
            const fill = el("div", "bar-fill");

            fill.dataset.w = String(pct);
            fill.style.background = personColor(i);
            track.append(fill);

            const value = el("b", "", `${pct}%`);
            value.style.textAlign = "right";

            row.append(who, track, value);
            box.append(row);
        });

        return box;
    };

    // ---------- API 가 아직 없는 기능의 자리 버튼 ----------

    // 잠깐 보이는 안내 (일정 시간 뒤 원래 안내로 돌아감)
    const flash = (text, link = null, duration = 4500) => {
        flashText = text;
        flashLink = link;
        renderNotices();

        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
            flashText = "";
            flashLink = null;
            renderNotices();
        }, duration);
    };

    // 비회원이 "이미 봤어요"를 누르면 로그인 안내 (시안: 로그인하면 본 작품을 빼고 추천받을 수 있어요)
    const promptLogin = () => flash(
        "로그인하면 본 작품을 빼고 추천받을 수 있어요.",
        { label: "로그인", href: "login.html" },
        8000
    );

    const comingSoon = (name) => flash(`‘${name}’ 기능은 준비 중이에요.`);

    // 작품 상세 보기: 상세 화면과 API 가 생기면 이동하도록 연결
    // TODO: 상세 페이지 주소가 정해지면 comingSoon 대신 이동 처리
    const createDetailButton = (item) => {
        const btn = el("button", "btn btn-primary");

        btn.type = "button";
        btn.dataset.act = "detail";
        btn.dataset.title = item.title || "";
        btn.title = "준비 중이에요";
        btn.innerHTML = ICON_PLAY;
        btn.append("상세 보기");

        return btn;
    };

    // 포스터도 상세 보기로 들어가는 입구 (시안의 포스터 링크 자리)
    const createPosterLink = (item, rank) => {
        const link = el("button", "poster-link");

        link.type = "button";
        link.dataset.act = "detail";
        link.dataset.title = item.title || "";
        link.setAttribute("aria-label", `${item.title || ""} 상세 보기`);
        link.append(createPoster(item, rank));

        return link;
    };

    // 이 작품을 볼 수 있는 OTT (시안의 "여기서 볼 수 있어요")
    // TODO: 추천 응답에 OTT 정보가 추가되면 여기서 읽어 이름 배열을 돌려줌. 지금은 정보가 없어 빈 배열
    const getProviders = () => [];

    const createOtt = () => {
        const box = el("div");
        const providers = getProviders();

        box.style.marginTop = "6px";

        const label = el("div", "muted", "여기서 볼 수 있어요");

        label.style.fontSize = "13px";
        label.style.marginBottom = "8px";
        box.append(label);

        if (!providers.length) {
            const empty = el("span", "muted", "OTT 정보를 준비 중이에요");

            empty.style.fontSize = "13px";
            box.append(empty);

            return box;
        }

        const list = el("div", "ott");

        providers.forEach((name) => {
            const link = el("a", "", name);

            link.href = "#";
            list.append(link);
        });

        box.append(list);

        return box;
    };

    const createSeenButton = (item, small) => {
        const btn = el("button", `btn btn-ghost${small ? " btn-sm" : ""}`);

        btn.type = "button";
        btn.dataset.act = "seen";
        btn.dataset.tmdbId = item.tmdbId;
        btn.dataset.mediaType = item.mediaType;
        btn.dataset.title = item.title || "";
        btn.innerHTML = ICON_CHECK;
        btn.append("이미 봤어요");

        if (isGuest) {
            const tag = el("span", "muted", " · 로그인 필요");

            tag.style.fontSize = "12px";
            btn.append(tag);
        }

        btn.disabled = excluding || rerolling;

        return btn;
    };

    const createScore = (rates, small) => {
        if (!rates) return null;

        const score = el("div", `score${small ? " sm" : ""}`);

        score.append(
            el("b", "", `${Math.round(average(rates) * 100)}%`),
            el("span", "", small ? "맞는 정도" : "모두와 맞는 정도")
        );

        return score;
    };

    // ---------- 화면: 1위 / 2·3위 ----------

    const renderWinner = (box, item, rates, people) => {
        box.replaceChildren();

        const posterWrap = el("div", "winner");
        posterWrap.append(createPosterLink(item, 1));

        const card = el("div", "card");
        const top = el("div", "row");

        top.style.alignItems = "start";

        const head = el("div");
        head.style.flex = "1";
        head.style.minWidth = "0";

        const title = el("h2", "", item.title);
        title.id = "w-title";
        title.style.margin = "10px 0 4px";
        title.style.fontSize = "28px";

        head.append(el("span", "badge brand", "1위"), title, createMeta(item));
        top.append(head);

        const score = createScore(rates, false);
        if (score) top.append(score);

        const chips = el("div", "chips");
        chips.style.margin = "14px 0";
        (item.genres || []).forEach((g) => chips.append(el("span", "badge", genreName(g))));

        card.append(top, chips);

        if (rates) {
            card.append(createMatchRows(rates, people));
        } else {
            const dots = createDots(item, people);

            if (dots) {
                dots.style.marginBottom = "18px";
                card.append(dots);
            }
        }

        card.append(createOtt());

        const actions = el("div", "row wrap");
        actions.style.marginTop = "20px";
        actions.append(createDetailButton(item), createSeenButton(item, false));
        card.append(actions);

        box.append(posterWrap, card);
    };

    const renderAlternatives = (box, items, allRates, people) => {
        box.replaceChildren();

        if (!items.length) {
            box.append(el("p", "muted", "더 보여드릴 작품이 없어요."));
            return;
        }

        items.forEach((item, k) => {
            const rates = allRates ? allRates[k + 1] : null;
            const card = el("article", "card tight alt-item");

            const side = el("div", "winner");
            side.append(createPosterLink(item, k + 2));

            const main = el("div");
            main.style.minWidth = "0";

            const head = el("div", "row");
            head.style.justifyContent = "space-between";
            head.style.alignItems = "start";

            const text = el("div");
            text.style.minWidth = "0";

            const title = el("div", "", item.title);
            title.style.fontWeight = "800";
            title.style.fontSize = "17px";

            text.append(title, createMeta(item));
            head.append(text);

            const score = createScore(rates, true);
            if (score) head.append(score);

            main.append(head);

            // 퍼센트를 확신할 수 없으면 도트, 가능하면 사람별 막대 대신 도트를 작게 (2·3위는 시안과 같이 도트)
            const dots = createDots(item, people);

            if (dots) {
                const holder = el("div");
                holder.style.margin = "10px 0";
                holder.append(dots);
                main.append(holder);
            }

            main.append(createOtt());

            const actions = el("div", "actions");
            actions.append(createSeenButton(item, true));
            main.append(actions);

            card.append(side, main);
            box.append(card);
        });
    };

    // ---------- 취향 분석 (Chart.js, 불러오지 못하면 막대로 대신 그림) ----------

    const destroyCharts = () => {
        charts.forEach((chart) => chart.destroy());
        charts = [];
    };

    const cssVar = (name) => getComputedStyle(app).getPropertyValue(name).trim();

    // 브랜드 그라데이션: 차트 영역 아래 → 위. chartArea 가 아직 없으면(첫 옵션 계산) 단색으로 대체
    const brandGradient = (context) => {
        const { chart } = context;
        const area = chart.chartArea;

        if (!area || !Number.isFinite(area.top) || !Number.isFinite(area.bottom)) return "#9e4d4b";

        const gradient = chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);

        gradient.addColorStop(0, "#793988");
        gradient.addColorStop(0.52, "#9e4d4b");
        gradient.addColorStop(1, "#c16311");

        return gradient;
    };

    // Chart.js 가 없거나 그리다 실패하면 같은 데이터를 막대(.match-row)로 그림
    const drawFallbackBars = (box, rows) => {
        box.replaceChildren(...rows.map((r) => {
            const row = el("div", "match-row");
            const track = el("div", "bar-track");
            const fill = el("div", "bar-fill");

            fill.dataset.w = String(r.pct);
            fill.style.background = r.color;
            track.append(fill);

            const value = el("b", "", r.text);
            value.style.textAlign = "right";

            row.append(el("span", "", r.label), track, value);

            return row;
        }));
    };

    const drawChart = (canvasId, fallbackId, rows, max) => {
        const canvas = document.getElementById(canvasId);
        const fallback = document.getElementById(fallbackId);

        const useFallback = () => {
            canvas.parentNode.hidden = true;
            fallback.hidden = false;
            drawFallbackBars(fallback, rows);
        };

        if (typeof Chart === "undefined") {
            useFallback();
            return;
        }

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        canvas.setAttribute("aria-label", rows.map((r) => `${r.label} ${r.text}`).join(", "));

        try {
            charts.push(new Chart(canvas, {
                type: "bar",
                data: {
                    labels: rows.map((r) => r.label),
                    datasets: [{
                        data: rows.map((r) => r.value),
                        borderRadius: 4,
                        maxBarThickness: 36,
                        backgroundColor: (ctx) => {
                            const r = rows[ctx.dataIndex];

                            return typeof r.chartColor === "function" ? r.chartColor(ctx) : r.chartColor;
                        }
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: reduceMotion ? false : { duration: 600 },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (item) => rows[item.dataIndex].text } }
                    },
                    scales: {
                        x: { ticks: { color: cssVar("--text-2") }, grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            max,
                            ticks: { color: cssVar("--muted"), precision: 0 },
                            grid: { color: cssVar("--line") }
                        }
                    }
                }
            }));
        } catch (error) {
            console.error("차트 생성 에러:", error);
            useFallback();
        }
    };

    const renderAnalysis = (people) => {
        const { analysis, recommendations } = data;

        destroyCharts();

        // 장르 선호도: 장르별로 고른 사람 수 (많은 순)
        const total = people.length;
        const genreRows = [...(analysis?.genreScores || [])]
            .sort((a, b) => b.count - a.count)
            .map((g) => ({
                label: genreName(g.genre),
                value: g.count,
                pct: total ? Math.round((g.count / total) * 100) : 0,
                text: `${g.count}명`,
                color: "var(--grad)",
                chartColor: brandGradient
            }));

        // 사람별 일치도: 서버가 계산한 값 (참여자별로 추천 작품 평균, matchRate 는 0~1)
        const matchRows = (analysis?.participantMatch || []).map((m) => {
            const i = m.index - 1;
            const pct = Math.round(m.matchRate * 100);

            return {
                label: people[i]?.name || `참여자 ${m.index}`,
                value: pct,
                pct,
                text: `${pct}%`,
                color: personColor(i),
                chartColor: cssVar(`--p${(i % 6) + 1}`)
            };
        });

        const genreMax = Math.max(1, total, ...genreRows.map((r) => r.value));

        drawChart("genre-chart", "genre-bars", genreRows, genreMax);
        drawChart("match-chart", "match-bars", matchRows, 100);

        // 모두가 함께 고른 장르
        const common = genreRows.length && total
            ? (analysis.genreScores || []).filter((g) => g.count === total)
            : [];

        const badge = document.getElementById("common-badge");

        badge.textContent = common.length ? `모두 좋아하는 장르 ${common.length}개` : "공통 장르 없음";
        badge.className = `badge ${common.length ? "success" : "warning"}`;

        document.getElementById("genre-note").textContent = common.length
            ? `모두 ${common.map((g) => genreName(g.genre)).join(", ")} 장르를 골랐어요.`
            : "모두가 함께 고른 장르는 없어요.";

        // 추천 작품 중 장르가 하나도 겹치지 않은 사람 (서버의 matchedParticipants 기준)
        const missed = people.filter((p) => !recommendations.some(
            (item) => item.matchedParticipants?.includes(p.index)
        ));
        const known = recommendations.every((item) => Array.isArray(item.matchedParticipants));

        document.getElementById("match-note").textContent = !known || !people.length
            ? "각 참여자가 고른 장르가 추천 작품에 얼마나 담겼는지 보여줘요."
            : missed.length
                ? `${missed.map((p) => p.name).join(", ")}님이 고른 장르와 겹치는 작품이 없어요. 장르를 조금 넓혀보세요.`
                : "추천 작품 중 한 편 이상이 모든 사람의 취향과 겹쳐요.";

        // 사람별 고른 장르
        const list = document.getElementById("people");

        list.replaceChildren(...people.map((p, i) => {
            const row = el("div", "list-row");
            const avatar = el("span", "p-avatar", initialOf(p.name));

            avatar.style.background = personColor(i);

            const grow = el("div", "grow");

            grow.append(el("strong", "", p.name));

            if (p.genres) {
                grow.append(el("div", "sub", p.genres.map(genreName).join(", ") || "고른 장르 없음"));
            }

            row.append(avatar, grow);

            return row;
        }));
    };

    // ---------- 화면 전체 ----------

    const createRetryLink = (label, primary = true) => {
        const link = el("a", `btn ${primary ? "btn-primary" : "btn-secondary"}`, label);

        link.href = retryUrl;

        return link;
    };

    // 같은 사람들로 장르만 다시 고르기: 이름과 (알고 있다면) 고른 장르를 넘기고 바로 장르 선택으로
    const startAgain = () => {
        const people = getPeople();

        if (!isValidCount(people.length)) {
            window.location.href = retryUrl;
            return;
        }

        patchFlow({
            count: people.length,
            names: people.map((p) => (names[p.index - 1] || "")),
            participants: people.map((p) => ({
                index: p.index,
                name: p.name,
                genres: p.genres ? [...p.genres] : [],
                want: [],
                avoid: []
            })),
            prefilled: true
        });

        window.location.href = "select.html";
    };

    // 공유하기: 결과 주소는 본인만 열 수 있어서(회원 세션) / 저장되지 않아서(비회원) 공유할 수 없음
    // TODO : 공유 기능이 생기면 여기서 처리
    const shareResult = () => {
        comingSoon("공유하기");
    };

    const renderMessage = (text) => {
        app.innerHTML = '<div class="container"><div class="card empty" id="state-card" role="status" style="margin-top:28px"></div></div>';

        const card = document.getElementById("state-card");

        card.append(el("h3", "", text));

        // 불러오는 중에는 이동 버튼을 숨기고, 실패일 때만 다시 시작 링크 제공
        if (!isLoading) {
            const actions = el("div", "row wrap");

            actions.style.justifyContent = "center";
            actions.style.marginTop = "18px";
            actions.append(createRetryLink("처음부터 다시 하기"));
            card.append(actions);
        }
    };

    const renderPage = () => {
        const recs = [...data.recommendations].sort((a, b) => (a.rank || 0) - (b.rank || 0));
        const people = getPeople();
        const rates = buildMatchModel(recs, people, data.analysis);

        app.innerHTML = `
            <div class="container">
                <div class="section-head" style="margin-top:0;align-items:center;flex-wrap:wrap">
                    <div>
                        <div class="muted" style="font-size:13px">방금 받은 추천</div>
                        <h1 id="result-title" tabindex="-1" style="margin:4px 0 10px;font-size:26px"></h1>
                        <div class="participants" id="pills" aria-label="함께 고른 사람"></div>
                        <div class="muted" id="set-note" style="font-size:13px;margin-top:10px" hidden></div>
                    </div>
                    <div class="row wrap">
                        <button class="btn btn-secondary btn-sm" type="button" data-act="share">공유하기</button>
                        <button class="btn btn-secondary btn-sm" type="button" data-act="reroll"${rerolling ? " disabled" : ""}>${rerolling ? "불러오는 중..." : "다른 작품 보기"}</button>
                        <button class="btn btn-ghost btn-sm" type="button" data-act="first-set"${pageIndex > 0 ? "" : " hidden"}>처음 추천으로</button>
                        <button class="btn btn-ghost btn-sm" type="button" data-act="again">장르 다시 고르기</button>
                    </div>
                </div>

                <div class="alert info" id="notice" role="status" hidden></div>
                <div class="alert error" id="seen-error" role="alert" hidden></div>

                <section class="result-top" id="winner-wrap" aria-labelledby="w-title"></section>

                <section class="section" aria-labelledby="alt-title">
                    <div class="section-head"><h2 id="alt-title" style="margin:0;font-size:20px">이런 작품도 잘 맞아요</h2></div>
                    <div class="grid cols-2" id="alts"></div>
                </section>

                <section class="section grid cols-2">
                    <div class="card">
                        <div class="panel-title"><h3>장르 선호도</h3><span class="badge" id="common-badge"></span></div>
                        <div class="chart-box"><canvas id="genre-chart" role="img" aria-label="장르별로 고른 사람 수"></canvas></div>
                        <div class="genre-bars" id="genre-bars" hidden></div>
                        <p class="muted" style="font-size:13px;margin:14px 0 0" id="genre-note"></p>
                    </div>
                    <div class="card">
                        <div class="panel-title"><h3>사람별 취향 일치도</h3></div>
                        <div class="chart-box"><canvas id="match-chart" role="img" aria-label="참여자별 추천 작품 평균 일치도"></canvas></div>
                        <div class="genre-bars" id="match-bars" hidden></div>
                        <p class="muted" style="font-size:13px;margin:14px 0 0" id="match-note"></p>
                        <div class="list" id="people" style="margin-top:8px"></div>
                    </div>
                </section>

                <section class="section">
                    <div class="card row wrap" id="save-box"></div>
                </section>

                <section class="section card" style="text-align:center">
                    <h3>다른 조합도 받아볼까요?</h3>
                    <p class="muted" style="margin:0 0 14px;font-size:14px">같은 사람들과 장르를 다시 고르거나, 처음부터 새로 시작할 수 있어요.</p>
                    <div class="row wrap" style="justify-content:center">
                        <button class="btn btn-primary" type="button" data-act="again">같은 사람들과 다시 추천받기</button>
                        <a class="btn btn-ghost" href="start.html">처음부터 새로</a>
                    </div>
                </section>
            </div>`;

        document.getElementById("result-title").textContent = `함께 보기 좋은 ${recs.length}편이에요`;

        // 함께 고른 사람
        document.getElementById("pills").replaceChildren(...people.map((p, i) => {
            const pill = el("span", "p-pill");
            const avatar = el("span", "p-avatar", initialOf(p.name));

            avatar.style.background = personColor(i);
            pill.append(avatar, p.name);

            return pill;
        }));

        renderNotices();

        const setNote = document.getElementById("set-note");

        setNote.hidden = pageIndex === 0;
        setNote.textContent = pageIndex > 0
            ? `다른 작품 ${pageIndex}번째 묶음이에요. 이 묶음은 저장되지 않아요.`
            : "";

        renderWinner(document.getElementById("winner-wrap"), recs[0], rates?.[0] ?? null, people);
        renderAlternatives(document.getElementById("alts"), recs.slice(1), rates, people);
        renderAnalysis(people);
        renderSaveBox();

        // 막대가 0에서 차오르도록 다음 프레임에 너비 지정
        requestAnimationFrame(() => {
            app.querySelectorAll(".bar-fill[data-w]").forEach((bar) => {
                bar.style.width = `${bar.dataset.w}%`;
            });
        });
    };

    const renderExhausted = () => {
        app.innerHTML = `
            <div class="container">
                <section class="card empty" style="margin-top:28px">
                    <h3>이 조건으로는 더 추천할 작품이 없어요</h3>
                    <p style="margin:0 0 18px">장르를 조금 넓히거나 콘텐츠 종류를 바꿔보세요.</p>
                    <div class="row wrap" style="justify-content:center">
                        <button class="btn btn-primary" type="button" data-act="again">장르 다시 고르기</button>
                        <a class="btn btn-secondary" href="start.html">옵션 바꾸기</a>
                    </div>
                </section>
            </div>`;
    };

    // 제외 안내 / 오류 문구
    function renderNotices() {
        const notice = document.getElementById("notice");
        const error = document.getElementById("seen-error");

        if (!notice || !error) return;

        const text = flashText
            || lastChange
            || (excludedCount > 0 && pageIndex === 0 ? `이미 본 ${excludedCount}개를 제외하고 추천했어요.` : "");

        notice.hidden = !text;
        notice.textContent = text;

        if (flashText && flashLink) {
            const link = el("a", "link", flashLink.label);

            link.href = flashLink.href;
            notice.append(" ", link);
        }

        error.hidden = !seenError;
        error.textContent = seenError;
    }

    // 저장 안내: 비회원은 저장되지 않음을 알리고 로그인으로 안내
    function renderSaveBox() {
        const box = document.getElementById("save-box");
        const text = el("div");

        text.style.flex = "1";
        text.style.minWidth = "220px";

        if (isGuest) {
            const sub = el("div", "muted", "지금은 저장되지 않아요. 새로고침하면 이 탭에서만 다시 볼 수 있어요.");

            sub.style.fontSize = "14px";
            text.append(el("strong", "", "로그인하면 추천 기록을 남기고 본 작품을 뺄 수 있어요"), sub);

            const actions = el("div", "row");
            const login = el("a", "btn btn-secondary", "로그인");
            const signup = el("a", "btn btn-primary", "회원가입");

            login.href = "login.html";
            signup.href = "signup.html";
            actions.append(login, signup);
            box.append(text, actions);
            return;
        }

        const sub = el("div", "muted", pageIndex > 0
            ? "다른 작품 묶음은 저장되지 않아요. 처음 추천은 내 계정에 저장되어 있어요."
            : "이 추천은 내 계정에 저장되어 있어요.");

        sub.style.fontSize = "14px";
        text.append(el("strong", "", "추천 결과를 저장했어요"), sub);
        box.append(text);
    }

    // ---------- 렌더링 진입점 ----------

    const render = (keepPosition = false) => {
        destroyCharts();

        if (statusMessage) {
            renderMessage(statusMessage);
        } else if (!hasResults(data)) {
            renderExhausted();
        } else {
            renderPage();
        }

        // 제외 후 갱신은 스크롤 위치를 유지하고, 버튼 포커스가 사라지지 않게 첫 버튼으로 이동
        if (keepPosition === true) {
            (app.querySelector('[data-act="seen"]') || app.querySelector("h1, h3"))
                ?.focus({ preventScroll: true });
            return;
        }

        app.querySelector("h1, h3")?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
    };

    const show = (nextData, keepPosition = false) => {
        data = nextData;
        statusMessage = "";
        isLoading = false;
        render(keepPosition);
    };

    const showMessage = (text, loading = false) => {
        data = null;
        statusMessage = text;
        isLoading = loading;
        render();
    };

    app.addEventListener("click", (e) => {
        const target = e.target.closest("[data-act]");

        if (!target) return;

        if (target.dataset.act === "seen") excludeItem(target);
        if (target.dataset.act === "again") startAgain();
        if (target.dataset.act === "share") shareResult();
        if (target.dataset.act === "reroll") rerollItems();
        if (target.dataset.act === "first-set") goToPage(0);
        if (target.dataset.act === "detail") comingSoon("상세 보기");
    });

    // ---------- API ----------

    // GET /api/sessions/{sessionId}
    // 서버에 저장된 결과 조회 (화면에 필요한 값만 저장). 응답에 참여자 선택 장르가 들어 있음
    const loadSavedResult = async (keepPosition = false) => {
        const session = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
        const saved = {
            recommendations: session.recommendations || [],
            analysis: session.analysis || null
        };

        participants = normalizeParticipants(session.participants) || participants;

        replaceCache(saved);
        show(saved, keepPosition);
    };

    // POST /api/guest/recommendations
    // 비회원 추천: 장르 선택 화면이 저장한 요청에 "이미 봤어요" 목록을 붙여 호출 (서버 저장 없음)
    const requestGuest = async (excluded = [], customPayload = null) => {
        let payload = customPayload;

        // 처음 추천(비회원)은 장르 선택 화면이 저장한 요청을 사용
        if (!payload) {
            try {
                payload = JSON.parse(sessionStorage.getItem(GUEST_REQUEST_KEY));
            } catch {
                payload = null;
            }
        }

        if (!payload?.participants?.length) {
            throw new ApiError(0, "GUEST_REQUEST_MISSING", "선택한 장르 정보가 없습니다. 처음부터 다시 선택해 주세요.");
        }

        const result = await publicFetch("/api/guest/recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // 비회원은 "이미 봤어요"를 쓰지 않으므로 보통 excluded 없이 호출 (API 는 생략 가능)
            body: JSON.stringify({ ...payload, ...(excluded.length && { excluded }) })
        });

        return {
            recommendations: result.recommendations || [],
            analysis: result.analysis || null
        };
    };

    const guestErrorMessage = (error) => {
        // API Gateway 호출 제한 (비회원 경로는 회원보다 낮음)
        if (error instanceof ApiError && error.status === 429) {
            return "요청이 많아 잠시 후 다시 시도해주세요.";
        }

        if (error instanceof ApiError && error.code === "UPSTREAM_ERROR") {
            return "콘텐츠 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.";
        }

        return error.message || "추천을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    };

    const itemKey = (item) => `${item.mediaType}:${item.tmdbId}`;

    // POST /api/sessions/{sessionId}/exclusions (비회원은 POST /api/guest/recommendations)
    // "이미 봤어요": 작품 1개를 제외하고 다음 후보로 채운 새 결과를 받아 화면과 저장본을 교체
    // (제외 취소 API는 없으므로 한 번 누르면 되돌릴 수 없음)
    async function excludeItem(button) {
        if (excluding) return;

        if (isGuest) {
            promptLogin();
            return;
        }

        // 다른 작품 묶음의 작품은 서버 결과에 없어 제외 API 를 쓸 수 없음 → 화면 안에서만 교체
        if (pageIndex > 0) {
            excludeLocal(button);
            return;
        }

        const tmdbId = Number(button.dataset.tmdbId);
        const mediaType = button.dataset.mediaType;
        const goneTitle = button.dataset.title;

        if (!Number.isFinite(tmdbId) || !mediaType) return;

        excluding = true;
        seenError = "";
        renderNotices();

        // 요청 중에는 모든 "이미 봤어요" 버튼을 잠가 동시 제외로 인한 충돌을 막음
        app.querySelectorAll('[data-act="seen"]').forEach((btn) => { btn.disabled = true; });
        button.textContent = "제외하는 중...";

        try {
            const seen = { tmdbId, mediaType };
            const result = await apiFetch(
                `/api/sessions/${encodeURIComponent(sessionId)}/exclusions`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(seen)
                }
            );

            const next = {
                recommendations: result.recommendations || [],
                analysis: result.analysis || null
            };

            // 새로 들어온 작품 (이전 결과에 없던 것)
            const before = new Set(data.recommendations.map(itemKey));
            const added = next.recommendations.find((item) => !before.has(itemKey(item)));

            lastChange = added
                ? `‘${goneTitle}’ 대신 ‘${added.title}’을(를) 넣었어요.`
                : "더 바꿀 작품이 없어요.";

            excludedCount += 1;
            saveExcludedCount();
            rememberSeen(seen);

            // 서버 결과가 바뀌었으므로 이전에 불러온 다른 작품 묶음은 버림
            pages = null;
            pageIndex = 0;
            localSeen = [];
            replaceCache(next);

            excluding = false;
            show(next, true);

        } catch (error) {
            console.error("제외 API 에러:", error);
            excluding = false;

            if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
                // 화면의 결과가 서버와 어긋난 경우: 서버에 저장된 최신 결과로 다시 표시
                try {
                    seenError = "추천 결과가 바뀌어 최신 결과로 다시 불러왔어요.";
                    lastChange = "";
                    await loadSavedResult(true);
                    return;
                } catch (detailError) {
                    console.error("세션 조회 API 에러:", detailError);
                }
            } else if (error instanceof ApiError && error.code === "CONCURRENT_UPDATE") {
                seenError = "다른 요청과 겹쳤어요. 잠시 후 다시 시도해주세요.";
            } else if (error instanceof ApiError && error.code === "NOT_FOUND") {
                seenError = "존재하지 않거나 접근할 수 없는 세션입니다.";
            } else {
                seenError = error.message || "제외하지 못했어요. 잠시 후 다시 시도해주세요.";
            }

            render(true);
        }
    }

    // ---------- 다른 작품 보기 ----------

    const uniqueItems = (items) => {
        const map = new Map();

        items.forEach((item) => {
            map.set(itemKey(item), { tmdbId: Number(item.tmdbId), mediaType: item.mediaType });
        });

        return [...map.values()];
    };

    // 다음 후보를 요청할 때 뺄 작품: 이미 보여준 작품 + 제외한 작품
    const excludedForNext = () => uniqueItems([
        ...(pages || []).flatMap((page) => page.recommendations),
        ...loadSeenItems(),
        ...localSeen
    ]);

    // 다음 후보 요청 본문: 참여자 선택 장르를 알아야 만들 수 있음
    const buildCandidateRequest = () => {
        if (!participants?.length) return null;

        return {
            participantCount: participants.length,
            participants: participants.map(({ index, genres }) => ({ index, genres }))
        };
    };

    // 작품이 바뀐 묶음의 사람별 일치율 (서버 값은 서버가 고른 3편 기준이라 다시 계산)
    const deriveParticipantMatch = (recs) => participants.map((p) => ({
        index: p.index,
        matchRate: recs.length
            ? Math.round(average(recs.map((item) => matchRate(item.genres || [], p.genres))) * 100) / 100
            : 0
    }));

    // 요청 중에는 눌러도 반응하지 않도록 버튼을 잠금
    const lockActions = (label) => {
        app.querySelectorAll('[data-act="seen"], [data-act="reroll"]').forEach((btn) => {
            btn.disabled = true;
        });

        if (label) label.textContent = "불러오는 중...";
    };

    const goToPage = (index) => {
        if (!pages?.[index]) return;

        pageIndex = index;
        lastChange = "";
        seenError = "";
        show(pages[index]);
    };

    // 다른 작품 보기: 지금까지 보여준 작품을 빼고 다음 3편. 후보가 없으면 처음 추천으로 돌아감 (시안과 같은 순환)
    async function rerollItems() {
        if (rerolling || excluding || !hasResults(data)) return;

        const request = buildCandidateRequest();

        if (!request) {
            flash("다른 작품을 불러올 수 없어요. 참여자 정보를 확인하지 못했어요.");
            return;
        }

        // 처음 누를 때 지금 보이는 추천을 0번 묶음으로 둠
        pages ??= [{ recommendations: data.recommendations, analysis: data.analysis }];

        // 이미 불러온 다음 묶음이 있으면 서버를 부르지 않고 이동
        if (pageIndex + 1 < pages.length) {
            goToPage(pageIndex + 1);
            return;
        }

        const excluded = excludedForNext();
        const backToFirst = () => {
            goToPage(0);
            flash("더 보여드릴 작품이 없어요. 처음 추천으로 돌아왔어요.");
        };

        // API 가 한 번에 받는 excluded 는 최대 개수가 있음
        if (excluded.length > GUEST_EXCLUDED_LIMIT) {
            backToFirst();
            return;
        }

        rerolling = true;
        seenError = "";
        lockActions(app.querySelector('[data-act="reroll"]'));

        try {
            const result = await requestGuest(excluded, request);
            const known = new Set(excluded.map(itemKey));
            const fresh = result.recommendations.filter((item) => !known.has(itemKey(item)));

            rerolling = false;

            if (!fresh.length) {
                backToFirst();
                return;
            }

            pages.push({
                recommendations: fresh.map((item, i) => ({ ...item, rank: i + 1 })),
                analysis: result.analysis
            });

            goToPage(pages.length - 1);
        } catch (error) {
            console.error("다른 작품 조회 에러:", error);
            rerolling = false;
            seenError = guestErrorMessage(error);
            render(true);
        }
    }

    // 다른 작품 묶음에서 "이미 봤어요"(회원): 서버에는 기록하지 않고 이 화면에서만 빼고 다음 후보로 채움
    async function excludeLocal(button) {
        if (excluding || rerolling) return;

        const request = buildCandidateRequest();
        const seen = { tmdbId: Number(button.dataset.tmdbId), mediaType: button.dataset.mediaType };

        if (!request || !Number.isFinite(seen.tmdbId) || !seen.mediaType) return;

        const goneTitle = button.dataset.title;
        const page = pages[pageIndex];

        excluding = true;
        seenError = "";
        renderNotices();
        lockActions();
        button.textContent = "제외하는 중...";

        localSeen = [...localSeen, seen];

        try {
            const remaining = page.recommendations.filter((item) => itemKey(item) !== itemKey(seen));
            const excluded = excludedForNext(); // 이 작품을 포함해 이미 보여준 작품 + 제외한 작품

            let added = null;

            if (excluded.length <= GUEST_EXCLUDED_LIMIT) {
                const result = await requestGuest(excluded, request);
                const known = new Set(excluded.map(itemKey));

                added = result.recommendations.find((item) => !known.has(itemKey(item))) || null;
            }

            const recs = (added ? [...remaining, added] : remaining).map((item, i) => ({ ...item, rank: i + 1 }));

            excluding = false;

            // 이 묶음이 비면 처음 추천으로
            if (!recs.length) {
                pages.splice(pageIndex, 1);
                goToPage(0);
                flash("이 묶음의 작품을 모두 뺐어요. 처음 추천으로 돌아왔어요.");
                return;
            }

            pages[pageIndex] = {
                recommendations: recs,
                analysis: {
                    genreScores: page.analysis?.genreScores || [],
                    participantMatch: deriveParticipantMatch(recs)
                }
            };

            lastChange = added
                ? `‘${goneTitle}’ 대신 ‘${added.title}’을(를) 넣었어요.`
                : "더 바꿀 작품이 없어요.";

            show(pages[pageIndex], true);
        } catch (error) {
            console.error("다른 묶음 제외 에러:", error);
            excluding = false;
            localSeen = localSeen.filter((item) => itemKey(item) !== itemKey(seen));
            seenError = guestErrorMessage(error);
            render(true);
        }
    }

    // ---------- 시작 ----------

    // 새로고침 등으로 재방문한 경우 저장된 결과 사용
    const cached = loadCache();

    if (hasResults(cached)) {
        participants = normalizeParticipants(cached.participants);

        if (!participants) {
            await ensureParticipants();
            saveCache(cached);
        }

        show({ recommendations: cached.recommendations, analysis: cached.analysis });
        return;
    }

    if (isGuest) {
        showMessage("추천 결과를 불러오는 중입니다...", true);

        try {
            const result = await requestGuest();

            await ensureParticipants();
            saveCache(result);
            show(result);
        } catch (error) {
            console.error("비회원 추천 API 에러:", error);
            showMessage(guestErrorMessage(error));
        }

        return;
    }

    // POST /api/sessions/{sessionId}/recommendations
    showMessage("추천 결과를 불러오는 중입니다...", true);

    try {
        const result = await apiFetch(
            `/api/sessions/${encodeURIComponent(sessionId)}/recommendations`,
            { method: "POST" }
        );

        await ensureParticipants();
        saveCache(result);
        show(result);

    } catch (error) {
        console.error("추천 API 에러:", error);

        if (error instanceof ApiError) {
            switch (error.code) {
                case "RECOMMENDATION_EXISTS":
                    // 이미 생성된 세션인데 저장된 사본이 없는 경우 (다른 탭/브라우저 등)
                    try {
                        await loadSavedResult();
                    } catch (detailError) {
                        console.error("세션 조회 API 에러:", detailError);
                        showMessage("저장된 추천 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
                    }
                    return;
                case "NOT_FOUND":
                    showMessage("존재하지 않거나 접근할 수 없는 세션입니다.");
                    return;
                case "NETWORK_ERROR":
                    showMessage(error.message);
                    return;
                case "UPSTREAM_ERROR":
                    showMessage("콘텐츠 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.");
                    return;
            }
        }

        showMessage(`오류가 발생했습니다: ${error.message}`);
    }
}

// 스크립트가 문서 로드 뒤에 실행돼도 화면을 그리도록 처리
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initResultPage);
} else {
    initResultPage();
}
