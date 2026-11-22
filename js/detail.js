import { requireLogin, apiFetch, ApiError } from "./api.js";
import { getOttInfo } from "./ott.js";

// =====================================
// RecoMate - 작품 상세 페이지
// GET /api/contents/{mediaType}/{tmdbId}
// 로그인 전용
// =====================================

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const $ = (selector) => document.querySelector(selector);

const create = (tag, className = "", text = "") => {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    node.textContent = text;
    return node;
};

// =====================================
// 공통 유틸리티
// =====================================

const imageUrl = (path, size = "w500") =>
    path ? `${TMDB_IMAGE_BASE}/${size}${path}` : "";

const formatRuntime = (minutes) => {
    if (
        minutes === undefined ||
        minutes === null ||
        !Number.isFinite(Number(minutes)) ||
        Number(minutes) <= 0
    ) {
        return "정보 없음";
    }

    const total = Number(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;

    return hours ? `${hours}시간 ${mins}분` : `${mins}분`;
};

// =====================================
// 국가 코드 → 한국어 국가명 변환
// =====================================

const countryDisplayNames = new Intl.DisplayNames(
    ["ko-KR"],
    { type: "region" }
);

function formatCountries(countries) {
    if (!Array.isArray(countries) || countries.length === 0) {
        return "정보 없음";
    }

    const uniqueCountries = new Set();

    countries.forEach((country) => {
        if (typeof country !== "string") return;

        const code = country.trim().toUpperCase();

        if (!/^[A-Z]{2}$/.test(code)) return;

        try {
            const name = countryDisplayNames.of(code);

            if (name && name !== code) {
                uniqueCountries.add(name);
            } else {
                uniqueCountries.add(code);
            }
        } catch {
            uniqueCountries.add(code);
        }
    });

    return uniqueCountries.size
        ? Array.from(uniqueCountries).join(", ")
        : "정보 없음";
}

const addInfo = (list, label, value) => {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return;
    }

    list.append(
        create("dt", "", label),
        create("dd", "", String(value))
    );
};

// =====================================
// 토스트 알림
// =====================================

let toastTimer = null;

function showToast(message) {
    let toast = document.getElementById("detail-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "detail-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");

        Object.assign(toast.style, {
            position: "fixed",
            left: "50%",
            bottom: "40px",
            transform: "translate(-50%, 20px)",
            width: "max-content",
            maxWidth: "calc(100% - 40px)",
            padding: "18px 28px",
            background: "#2d2b29",
            color: "#f5f5f5",
            border: "1px solid #5b5752",
            borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(0,0,0,.35)",
            fontSize: "15px",
            lineHeight: "1.5",
            zIndex: "9999",
            opacity: "0",
            visibility: "hidden",
            transition:
                "opacity .2s ease, transform .2s ease, visibility .2s ease",
            pointerEvents: "none",
            boxSizing: "border-box"
        });

        document.body.appendChild(toast);
    }

    clearTimeout(toastTimer);

    toast.textContent = message;
    toast.style.visibility = "visible";
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, 0)";

    toastTimer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%, 20px)";
        toast.style.visibility = "hidden";
    }, 3000);
}

// =====================================
// 아이콘
// =====================================

const ICON_EYE = `
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
`;

const ICON_CHECK = `
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path d="m4 12 5 5L20 6"/>
    </svg>
`;

// =====================================
// 오류 화면
// =====================================

const showError = (message) => {
    $("#detail-loading").hidden = true;
    $("#detail-content").hidden = true;
    $("#detail-error").hidden = false;
    $("#detail-error-message").textContent = message;
};

// =====================================
// 작품 기본 정보
// =====================================

const renderBadges = (content) => {
    const badges = $("#hero-badges");
    badges.replaceChildren();

    badges.append(
        create(
            "span",
            "detail-badge",
            content.mediaType === "movie" ? "영화" : "TV 시리즈"
        )
    );

    if (typeof content.voteAverage === "number") {
        badges.append(
            create(
                "span",
                "detail-badge detail-rating",
                `★ ${content.voteAverage.toFixed(1)}`
            )
        );
    }

    const meta = [];

    if (content.releaseYear) {
        meta.push(String(content.releaseYear));
    }

    if (
        content.runtime !== undefined &&
        content.runtime !== null &&
        Number(content.runtime) > 0
    ) {
        meta.push(`${content.runtime}분`);
    }

    const countries = formatCountries(content.countries);

    if (countries !== "정보 없음") {
        meta.push(countries);
    }

    if (meta.length) {
        badges.append(
            create(
                "span",
                "detail-meta",
                meta.join(", ")
            )
        );
    }
};

// =====================================
// 장르
// =====================================

const renderGenres = (genres) => {
    const box = $("#hero-genres");
    box.replaceChildren();

    genres.forEach((genre) => {
        box.append(
            create("span", "detail-chip", genre)
        );
    });
};

// =====================================
// 줄거리 아래 작품 정보
// =====================================

const renderInfo = (content) => {
    const info = $("#info");
    info.replaceChildren();

    addInfo(
        info,
        "종류",
        content.mediaType === "movie" ? "영화" : "TV 시리즈"
    );

    addInfo(
        info,
        "공개",
        content.releaseDate || content.releaseYear
    );

    addInfo(
        info,
        "상영 시간",
        formatRuntime(content.runtime)
    );

    if (content.mediaType === "tv") {
        addInfo(
            info,
            "시즌",
            content.seasons === undefined
                ? ""
                : `${content.seasons}개`
        );

        addInfo(
            info,
            "회차",
            content.episodes === undefined
                ? ""
                : `${content.episodes}회`
        );
    }

    addInfo(
        info,
        "국가",
        formatCountries(content.countries)
    );

    addInfo(
        info,
        content.mediaType === "movie" ? "감독" : "제작자",
        (content.creators || []).join(", ") || "정보 없음"
    );

    addInfo(
        info,
        "장르",
        (content.genres || []).join(", ") || "정보 없음"
    );

    if (typeof content.voteAverage === "number") {
        addInfo(
            info,
            "평점",
            `★ ${content.voteAverage.toFixed(1)} (TMDB${
                content.voteCount
                    ? `, ${content.voteCount.toLocaleString()}명 평가`
                    : ""
            })`
        );
    }
};

// =====================================
// OTT - 공식 사이트 이동
// =====================================

const renderProviders = (providers) => {
    const box = $("#ott");
    box.replaceChildren();

    if (!providers.length) {
        box.append(
            create(
                "p",
                "detail-muted",
                "현재 확인된 국내 구독형 OTT가 없어요."
            )
        );
        return;
    }

    const seenNames = new Set();

    providers.forEach((provider) => {
        const ott = getOttInfo(provider);
        const key = ott.name.trim().toLocaleLowerCase("ko-KR");

        if (seenNames.has(key)) return;
        seenNames.add(key);

        const label = `${ott.name}에서 보기`;

        if (ott.url) {
            const link = create(
                "a",
                "detail-provider",
                label
            );

            link.href = ott.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            link.setAttribute(
                "aria-label",
                `${ott.name} 공식 사이트 열기 (새 창)`
            );

            box.append(link);
        } else {
            const item = create(
                "span",
                "detail-provider detail-provider-disabled",
                label
            );

            item.title =
                "현재 이 OTT의 공식 사이트 링크가 등록되지 않았어요.";

            box.append(item);
        }
    });
};

// =====================================
// 출연진
// 시안에서는 주요 출연진 영역 숨김
// =====================================

const renderCast = (cast) => {
    const box = $("#cast");

    if (!box) return;

    box.replaceChildren();

    if (!cast.length) {
        box.append(
            create(
                "p",
                "detail-muted",
                "출연진 정보가 없어요."
            )
        );
        return;
    }

    cast.forEach((person) => {
        const card = create("article", "detail-person");

        if (person.profilePath) {
            const img = document.createElement("img");

            img.src = imageUrl(person.profilePath, "w185");
            img.alt = `${person.name} 프로필`;
            img.loading = "lazy";

            card.append(img);
        } else {
            card.append(
                create(
                    "div",
                    "detail-person-placeholder",
                    "사진 없음"
                )
            );
        }

        const info = create("div", "detail-person-info");

        info.append(
            create(
                "div",
                "detail-person-name",
                person.name
            )
        );

        if (person.character) {
            info.append(
                create(
                    "div",
                    "detail-person-role",
                    person.character
                )
            );
        }

        card.append(info);
        box.append(card);
    });
};

// =====================================
// 본 작품 목록 API 조회 (상세 응답에 watched가 없을 때만 사용)
// GET /api/users/me/watched
// =====================================

async function checkWatchedStatus(content) {
    const targetMediaType = String(content.mediaType);
    const targetTmdbId = Number(content.tmdbId);

    let nextToken = null;
    const seenTokens = new Set();

    do {
        const params = new URLSearchParams();
        params.set("limit", "20");

        if (nextToken) {
            params.set("nextToken", nextToken);
        }

        const response = await apiFetch(
            `/api/users/me/watched?${params.toString()}`
        );

        const items = Array.isArray(response?.items)
            ? response.items
            : [];

        const isWatched = items.some((item) =>
            String(item.mediaType) === targetMediaType &&
            Number(item.tmdbId) === targetTmdbId
        );

        if (isWatched) {
            return true;
        }

        const newToken = response?.nextToken || null;

        if (!newToken) {
            return false;
        }

        if (seenTokens.has(newToken)) {
            throw new Error(
                "본 작품 목록의 페이지 정보를 확인하지 못했어요."
            );
        }

        seenTokens.add(newToken);
        nextToken = newToken;
    } while (nextToken);

    return false;
}

// =====================================
// 이미 봤어요 버튼
// =====================================

function updateWatchedButton(watched) {
    const button = $("#watched-btn");

    if (!button) return;

    button.innerHTML = watched
        ? `${ICON_CHECK}<span>봤어요</span>`
        : `${ICON_EYE}<span>이미 봤어요</span>`;

    button.setAttribute(
        "aria-pressed",
        String(watched)
    );
}

// =====================================
// 본 작품 저장·삭제
// POST /api/users/me/watched
// DELETE /api/users/me/watched/{mediaType}/{tmdbId}
// =====================================

async function setupWatchedButton(content) {
    const button = $("#watched-btn");

    if (!button) return;

    let watched = false;
    let pending = false;
    let ready = false;

    // 상태 확인이 끝나기 전에는 클릭 불가
    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    updateWatchedButton(false);

    try {
        // 상세 응답의 watched(요청마다 서버가 새로 조회)를 우선 사용
        // 응답에 없을 때만 본 작품 목록을 넘겨 가며 확인
        watched = typeof content.watched === "boolean"
            ? content.watched
            : await checkWatchedStatus(content);
        updateWatchedButton(watched);

        ready = true;
        button.disabled = false;
    } catch (error) {
        console.error(
            "본 작품 상태 조회 실패:",
            error
        );

        showToast(
            "본 작품 상태를 불러오지 못했어요. 새로고침 후 다시 시도해주세요."
        );
    } finally {
        button.removeAttribute("aria-busy");
    }

    button.addEventListener("click", async () => {
        if (!ready || pending) return;

        pending = true;
        button.disabled = true;

        try {
            if (watched) {
                await apiFetch(
                    `/api/users/me/watched/` +
                    `${encodeURIComponent(content.mediaType)}/` +
                    `${encodeURIComponent(content.tmdbId)}`,
                    {
                        method: "DELETE"
                    }
                );
            } else {
                await apiFetch(
                    "/api/users/me/watched",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            tmdbId: content.tmdbId,
                            mediaType: content.mediaType
                        })
                    }
                );
            }

            watched = !watched;
            updateWatchedButton(watched);

            showToast(
                watched
                    ? "본 작품으로 표시했어요. 다음 추천에서 제외할게요"
                    : "본 작품에서 뺐어요"
            );
        } catch (error) {
            console.error(
                "본 작품 저장/삭제 실패:",
                error
            );

            showToast(
                error?.message ||
                "본 작품 상태를 변경하지 못했어요."
            );
        } finally {
            pending = false;
            button.disabled = !ready;
        }
    });
}

// =====================================
// 공유 버튼
// =====================================

const setupShareButton = () => {
    $("#share-btn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(
                window.location.href
            );

            showToast("링크를 복사했어요. 친구에게 보내보세요!");
        } catch {
            showToast("링크를 복사하지 못했어요.");
        }
    });
};

// =====================================
// 예고편 팝업 - 원본 디자인 시안
// =====================================

function setupTrailerModal() {
    const trailerButton = $("#trailer-btn");

    if (!trailerButton) return;

    const style = document.createElement("style");

    style.textContent = `
        .detail-trailer-overlay {
            position: fixed;
            inset: 0;
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(0, 0, 0, .72);
        }

        .detail-trailer-overlay[hidden] {
            display: none !important;
        }

        .detail-trailer-dialog {
            width: min(100%, 768px);
            padding: 26px;
            border: 1px solid rgba(255, 255, 255, .18);
            border-radius: 14px;
            background: #242424;
            color: #f5f5f5;
            box-shadow: 0 20px 60px rgba(0, 0, 0, .45);
        }

        .detail-trailer-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 22px;
        }

        .detail-trailer-heading h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
        }

        .detail-trailer-close {
            display: grid;
            place-items: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: 0;
            background: transparent;
            color: #c8c8c8;
            font-size: 28px;
            line-height: 1;
            cursor: pointer;
        }

        .detail-trailer-close:hover {
            color: #fff;
        }

        .detail-trailer-placeholder {
            display: grid;
            place-items: center;
            width: 100%;
            aspect-ratio: 16 / 9;
            border-radius: 8px;
            background: #0b0b0b;
            color: #888;
            font-size: 14px;
            text-align: center;
        }

        @media (max-width: 560px) {
            .detail-trailer-overlay {
                padding: 16px;
            }

            .detail-trailer-dialog {
                padding: 18px;
            }

            .detail-trailer-heading {
                margin-bottom: 16px;
            }
        }
    `;

    document.head.append(style);

    const overlay = document.createElement("div");

    overlay.className = "detail-trailer-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
        <section
            class="detail-trailer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-trailer-title"
        >
            <div class="detail-trailer-heading">
                <h2 id="detail-trailer-title">
                    예고편
                </h2>

                <button
                    class="detail-trailer-close"
                    type="button"
                    aria-label="예고편 닫기"
                >
                    &times;
                </button>
            </div>

            <div class="detail-trailer-placeholder">
                예고편 영상 자리 (디자인 시안)
            </div>
        </section>
    `;

    document.body.append(overlay);

    const closeButton = overlay.querySelector(
        ".detail-trailer-close"
    );

    let previousFocus = null;

    const closeModal = () => {
        overlay.hidden = true;
        document.body.style.overflow = "";

        (previousFocus || trailerButton).focus();
    };

    trailerButton.disabled = false;
    trailerButton.removeAttribute("title");

    trailerButton.addEventListener("click", () => {
        previousFocus = document.activeElement;

        overlay.hidden = false;
        document.body.style.overflow = "hidden";

        closeButton.focus();
    });

    closeButton.addEventListener("click", closeModal);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            closeModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (overlay.hidden) return;

        if (event.key === "Escape") {
            closeModal();
        }

        if (event.key === "Tab") {
            event.preventDefault();
            closeButton.focus();
        }
    });
}

// =====================================
// 상세 페이지 렌더링
// =====================================

const renderDetail = (content) => {
    document.title =
        `${content.title || "콘텐츠 상세"} | RecoMate`;

    $("#hero-title").textContent =
        content.title || "제목 없음";

    $("#hero-original").textContent =
        content.originalTitle &&
        content.originalTitle !== content.title
            ? content.originalTitle
            : "";

    $("#overview").textContent =
        content.overview ||
        "등록된 줄거리 정보가 없어요.";

    const poster = $("#hero-poster");

    if (content.posterPath) {
        poster.src = imageUrl(content.posterPath);
        poster.hidden = false;
    } else {
        poster.hidden = true;
    }

    if (content.backdropPath) {
        $("#hero-bg").style.backgroundImage =
            `url("${imageUrl(content.backdropPath, "original")}")`;
    }

    renderBadges(content);
    renderGenres(content.genres || []);
    renderInfo(content);
    renderProviders(content.providers || []);
    renderCast(content.cast || []);

    // 본 작품 API에서 실제 저장 상태 조회
    setupWatchedButton(content);

    setupShareButton();

    $("#detail-loading").hidden = true;
    $("#detail-content").hidden = false;
};

// =====================================
// 페이지 초기화
// =====================================

async function initDetailPage() {
    await requireLogin();

    const params = new URLSearchParams(
        window.location.search
    );

    const mediaType = params.get("mediaType");
    const tmdbId = Number(params.get("tmdbId"));

    if (
        !["movie", "tv"].includes(mediaType) ||
        !Number.isSafeInteger(tmdbId) ||
        tmdbId <= 0
    ) {
        showError("작품 주소가 올바르지 않아요.");
        return;
    }

    const back = $("#detail-back");

    back.addEventListener("click", (event) => {
        event.preventDefault();

        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = "index.html";
        }
    });

    setupTrailerModal();

    try {
        const content = await apiFetch(
            `/api/contents/` +
            `${encodeURIComponent(mediaType)}/` +
            `${encodeURIComponent(tmdbId)}`
        );

        renderDetail(content);
    } catch (error) {
        console.error(
            "작품 상세 조회 실패:",
            error
        );

        if (error instanceof ApiError) {
            if (error.code === "NOT_FOUND") {
                showError("작품을 찾을 수 없어요.");
                return;
            }

            if (error.code === "UPSTREAM_ERROR") {
                showError(
                    "콘텐츠 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요."
                );
                return;
            }
        }

        showError(
            error.message ||
            "작품 정보를 불러오지 못했어요."
        );
    }
}

// =====================================
// 문서 로드 후 실행
// =====================================

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initDetailPage
    );
} else {
    initDetailPage();
}