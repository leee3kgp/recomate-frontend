import { apiFetch, ApiError } from "./api.js";

// =====================================
// RecoMate - 인기 목록 공통 (홈 "요즘 많이 보는 10편" · 요즘 대세 화면)
// GET /api/popular?genre&country&type&sort  (모두 선택, 로그인 필요)
//   genre  : 장르 코드 1개 (여러 장르 선택은 첫 장르만 보내고 나머지는 프론트에서 거름)
//   country: KR, US, JP, GB, FR, CN, IN, ES, DE, TH
//   type   : movie | tv (비우면 둘 다)
//   sort   : POPULAR(기본) | RATING | LATEST
// 응답 items[]: tmdbId, mediaType, title, posterPath, releaseYear, voteAverage, genres(장르 코드)
// =====================================

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const CACHE_MS = 5 * 60 * 1000;

export const TYPES = [
    { value: "", label: "전체" },
    { value: "movie", label: "영화" },
    { value: "tv", label: "TV 시리즈" }
];

export const SORTS = [
    { value: "POPULAR", label: "인기순" },
    { value: "RATING", label: "평점순" },
    { value: "LATEST", label: "최신순" }
];

// 명세의 국가 코드 순서 그대로, 한국어 이름은 Intl.DisplayNames로 변환
const COUNTRY_CODES = ["KR", "US", "JP", "GB", "FR", "CN", "IN", "ES", "DE", "TH"];

const regionNames = (() => {
    try {
        return new Intl.DisplayNames(["ko"], { type: "region" });
    } catch {
        return null;
    }
})();

export const COUNTRIES = COUNTRY_CODES.map((code) => ({
    value: code,
    label: regionNames?.of(code) || code
}));

export const isValidCountry = (code) => COUNTRY_CODES.includes(code);

// ---------- 응답 정규화 ----------
// 배포된 서버가 명세보다 이전 버전일 수 있어 필드 이름이 달라도 같은 모양으로 맞춤
//   mediaType ← mediaType | media_type | type ("MOVIE"/"TV" 대문자 포함)
//   tmdbId    ← tmdbId | id
//   genres    ← 장르 코드(명세) | 한국어·영어 TMDB 장르 이름 | TMDB 장르 ID → 내부 장르 코드 배열

// TMDB 장르 ID → 내부 장르 코드 (영화·TV)
const TMDB_GENRE_CODES = {
    28: ["ACTION"], 10759: ["ACTION"], 35: ["COMEDY"], 10749: ["ROMANCE"], 18: ["DRAMA"],
    878: ["SF"], 10765: ["SF", "FANTASY"], 14: ["FANTASY"], 27: ["HORROR"], 80: ["CRIME"],
    9648: ["MYSTERY"], 16: ["ANIMATION"]
};

// 이름 → 내부 장르 코드 (TV의 "Action & Adventure"처럼 번역 없는 영어 이름 포함)
const GENRE_NAME_CODES = {
    액션: ["ACTION"], 코미디: ["COMEDY"], 로맨스: ["ROMANCE"], 드라마: ["DRAMA"], SF: ["SF"], 판타지: ["FANTASY"],
    공포: ["HORROR"], 범죄: ["CRIME"], 미스터리: ["MYSTERY"], 애니메이션: ["ANIMATION"],
    "ACTION & ADVENTURE": ["ACTION"], "SCI-FI & FANTASY": ["SF", "FANTASY"], "SCIENCE FICTION": ["SF"],
    "SCI-FI": ["SF"], COMEDY: ["COMEDY"], ROMANCE: ["ROMANCE"], DRAMA: ["DRAMA"], FANTASY: ["FANTASY"],
    HORROR: ["HORROR"], CRIME: ["CRIME"], MYSTERY: ["MYSTERY"], ANIMATION: ["ANIMATION"], ACTION: ["ACTION"]
};

const toGenreCodes = (list) => {
    const codes = new Set();

    (Array.isArray(list) ? list : []).forEach((g) => {
        const value = g && typeof g === "object" ? g.code ?? g.id ?? g.name : g;

        if (typeof value === "number" || /^\d+$/.test(String(value))) {
            (TMDB_GENRE_CODES[Number(value)] || []).forEach((c) => codes.add(c));
        } else if (value) {
            const text = String(value).trim();

            (GENRE_NAME_CODES[text] || GENRE_NAME_CODES[text.toUpperCase()] || [text.toUpperCase()])
                .forEach((c) => codes.add(c));
        }
    });

    return [...codes];
};

const yearOf = (raw) => {
    const year = Number(raw.releaseYear ?? raw.year);

    if (Number.isInteger(year) && year > 0) return year;

    const date = raw.releaseDate || raw.release_date || raw.firstAirDate || raw.first_air_date || "";
    const parsed = Number(String(date).slice(0, 4));

    return parsed > 0 ? parsed : null;
};

function normalizeItem(raw) {
    const rawType = String(raw.mediaType ?? raw.media_type ?? raw.type ?? raw.contentType ?? "").toLowerCase();
    const mediaType = rawType === "tv" || rawType === "movie"
        ? rawType
        : raw.firstAirDate || raw.first_air_date || (raw.name && !raw.title) ? "tv" : "movie";

    return {
        tmdbId: Number(raw.tmdbId ?? raw.tmdb_id ?? raw.id),
        mediaType,
        title: raw.title || raw.name || "",
        posterPath: raw.posterPath ?? raw.poster_path ?? null,
        releaseYear: yearOf(raw),
        voteAverage: Number(raw.voteAverage ?? raw.vote_average ?? raw.rating) || 0,
        genres: toGenreCodes(raw.genres ?? raw.genreCodes ?? raw.genre_ids ?? raw.genreIds)
    };
}

// ---------- 조회 (같은 조건은 잠시 재사용) ----------

const cache = new Map();

async function request({ genre = "", country = "", type = "", sort = "POPULAR" }) {
    const query = new URLSearchParams();

    if (genre) query.set("genre", genre);
    if (country) query.set("country", country);
    if (type) query.set("type", type);
    if (sort && sort !== "POPULAR") query.set("sort", sort);

    const key = query.toString();
    const hit = cache.get(key);

    if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

    const data = await apiFetch(`/api/popular${key ? `?${key}` : ""}`);
    const items = (Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [])
        .filter((raw) => raw && typeof raw === "object")
        .map(normalizeItem);

    cache.set(key, { at: Date.now(), items });

    return items;
}

const itemKey = (item) => `${item.mediaType}:${item.tmdbId}`;

const compareBySort = (sort) => {
    if (sort === "RATING") return (a, b) => b.voteAverage - a.voteAverage || a.rank - b.rank;
    if (sort === "LATEST") return (a, b) => (b.releaseYear || 0) - (a.releaseYear || 0) || a.rank - b.rank;

    return (a, b) => a.rank - b.rank; // 인기순: 서버 순서
};

// genres: 장르 코드 배열 → 고른 장르를 모두 포함한 작품만 (시안과 같은 AND 필터)
//   0~1개: 서버가 거른 목록 그대로
//   2개 이상: API가 장르를 1개만 받으므로 장르마다 조회하고,
//            모든 장르 목록에 나온 작품(또는 응답 genres[]에 해당 장르 코드가 있는 작품)만 남김
// 종류·정렬은 서버에도 보내지만, 서버가 무시하는 경우를 위해 프론트에서도 한 번 더 거르고 정렬
// limit: 최대 개수 (기본 20)
export async function fetchPopular({ genres = [], country = "", type = "", sort = "POPULAR", limit = 20 } = {}) {
    const targets = genres.length ? genres : [""];
    const lists = await Promise.all(targets.map((genre) => request({ genre, country, type, sort })));
    const merged = new Map();

    lists.forEach((items, listIndex) => {
        items.forEach((item, position) => {
            if (type && item.mediaType !== type) return;

            const key = itemKey(item);
            const entry = merged.get(key) || { ...item, rank: Infinity, matched: new Set() };

            entry.rank = Math.min(entry.rank, position);

            if (targets[listIndex]) entry.matched.add(targets[listIndex]);

            genres.forEach((code) => {
                if (item.genres.includes(code)) entry.matched.add(code);
            });

            merged.set(key, entry);
        });
    });

    return [...merged.values()]
        .filter((entry) => genres.every((code) => entry.matched.has(code)))
        .map(({ matched, ...item }) => item)
        .sort(compareBySort(sort))
        .slice(0, limit);
}

export function popularErrorText(error) {
    if (error instanceof ApiError) {
        if (error.code === "NETWORK_ERROR") return error.message;
        if (error.code === "UPSTREAM_ERROR") return "인기 목록을 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
        if (error.code === "VALIDATION_ERROR") return "선택한 필터를 확인할 수 없어요. 필터를 초기화해주세요.";
        if (error.status === 429) return "요청이 많아 잠시 후 다시 시도해주세요.";
    }

    return "인기 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
}

// ---------- 카드 (시안 RM.cardHTML / RM.posterHTML) ----------

const el = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
};

const hueOf = (text = "") => [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

export const posterBackground = (seed) => {
    const hue = hueOf(String(seed));

    return `linear-gradient(160deg, hsl(${hue} 60% 32%), hsl(${(hue + 40) % 360} 55% 14%))`;
};

export const typeLabel = (mediaType) => (mediaType === "tv" ? "TV 시리즈" : "영화");

export function detailUrl(item) {
    const params = new URLSearchParams({
        mediaType: String(item.mediaType),
        tmdbId: String(item.tmdbId)
    });

    return `detail.html?${params.toString()}`;
}

const canOpen = (item) =>
    (item.mediaType === "movie" || item.mediaType === "tv") &&
    Number.isSafeInteger(item.tmdbId) && item.tmdbId > 0;

// genreNames: { ACTION: "액션", ... } (포스터 위 장르 미리보기용)
export function createPosterCard(item, { rank = 0, genreNames = {} } = {}) {
    const title = item.title || "제목 없음";
    const card = el("article", "poster-card");
    const poster = el("div", "poster");

    poster.style.background = posterBackground(title);
    poster.append(el("div", "fallback", title));

    if (item.posterPath) {
        const img = document.createElement("img");

        img.loading = "lazy";
        img.alt = `${title} 포스터`;
        img.src = `${TMDB_IMAGE_BASE_URL}${item.posterPath}`;
        img.addEventListener("error", () => img.remove(), { once: true });
        poster.append(img);
    }

    if (rank) poster.append(el("span", "badge brand rank", `${rank}위`));

    const genres = (Array.isArray(item.genres) ? item.genres : [])
        .map((code) => genreNames[code] || code)
        .filter(Boolean);

    if (genres.length) {
        // 마우스를 올리면 보이는 장르 미리보기 (상세 화면에 전체 정보가 있으므로 화면 낭독기에서는 숨김)
        const peek = el("div", "peek");

        peek.setAttribute("aria-hidden", "true");
        peek.append(el("b", "", genres.join(", ")));
        poster.append(peek);
    }

    const meta = el("div", "meta");

    meta.append(el("span", "", typeLabel(item.mediaType)));

    if (item.releaseYear) meta.append(el("span", "", String(item.releaseYear)));

    if (Number(item.voteAverage) > 0) {
        meta.append(el("span", "score", `★ ${Number(item.voteAverage).toFixed(1)}`));
    }

    const info = el("div");

    if (canOpen(item)) {
        const href = detailUrl(item);
        const posterLink = el("a");
        const titleLink = el("a", "title", title);

        posterLink.href = href;
        posterLink.setAttribute("aria-label", `${title} 상세 보기`);
        posterLink.append(poster);
        titleLink.href = href;
        info.append(titleLink, meta);
        card.append(posterLink, info);
    } else {
        info.append(el("span", "title", title), meta);
        card.append(poster, info);
    }

    return card;
}

// 순위 레일 자리 표시 (불러오는 중 / 비회원 블러 미리보기)
export const placeholderRail = (count) => Array.from({ length: count }, (_, i) => `
    <li class="rank-item">
        <span class="num" aria-hidden="true">${i + 1}</span>
        <div>
            <article class="poster-card">
                <div class="poster" style="background:${posterBackground(i * 37 + 11)}"></div>
                <div><div class="line skeleton"></div><div class="line skeleton short"></div></div>
            </article>
        </div>
    </li>`).join("");
