import { apiFetch } from "./api.js";

import {
    getLoginUser,
    logout,
    changePassword
} from "./auth-token.js";

import {
    getUserProfile,
    updateUserProfile,
    deleteUserAccount,
    getUserGenres,
    updateUserGenres,
    getAllGenres,
    getMyWatched,
    removeMyWatched,
    getMySettings,
    updateMySettings
} from "./user-api.js";

import {
    limitNicknameLength,
    NICKNAME_MAX_LENGTH
} from "./nickname-input.js";

// =====================================
// HTML 요소
// =====================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const nicknameInput = $("#nick");
const nicknameForm = $("#nick-form");
const nicknameSave = $("#nick-save");
const nicknameError = $("#nick-error");
const nicknameHint = $("#nick-hint");
const nicknameCount = $("#nick-count");
const emailInput = $("#email");

const genreContainer = $("#pref-genres");
const genreMessage = $("#genre-message");

const watchedList = $("#watched-list");
const watchedCount = $("#st-watched");
const withdrawWatchedCount = $("#wd-watched");
const historyCount = $("#st-history");
const withdrawHistoryCount = $("#wd-history");

const excludeWatchedSwitch =
    $('[data-setting="excludeWatched"]') ||
    $("#excludeWatched");

const passwordModal = $("#pw-modal");
const passwordForm = $("#pw-form");
const passwordCurrent = $("#pw-current");
const passwordNew = $("#pw-new");
const passwordConfirm = $("#pw-confirm");
const passwordSubmit = $("#pw-submit");
const passwordError = $("#pw-error");
const passwordMatchMessage = $("#pw-match-message");

const withdrawModal = $("#withdraw-modal");
const logoutModal = $("#logout-modal");
const logoutConfirmButton = $("#logout-confirm");

const withdrawConfirm = $("#wd-confirm");
const withdrawButton = $("#wd-go");
const withdrawError = $("#wd-error");

const TMDB_POSTER_URL =
    "https://image.tmdb.org/t/p/w185";

// =====================================
// 상태
// =====================================

let profileReady = false;
let genresReady = false;
let savingNickname = false;
let savingGenres = false;
let deletingAccount = false;
let loggingOut = false;
let changingPassword = false;

let originalNickname = "";
let availableGenres = [];
let selectedGenres = [];

let activeModal = null;
let previousFocus = null;

let watchedItems = [];
let watchedNextToken = null;
let watchedLoading = false;
let watchedTotalCount = 0;
let historyTotalCount = 0;

const deletingWatched = new Set();

let settingsReady = false;
let settingsSaving = false;
let currentExcludeWatched = true;

// =====================================
// 토스트
// =====================================

let toastTimer = null;
let toastElement = null;

function initializeToast() {
    if (!document.getElementById("profile-toast-style")) {
        const style = document.createElement("style");
        style.id = "profile-toast-style";

        style.textContent = `
            #profile-toast {
                position: fixed;
                left: 50%;
                bottom: 32px;
                z-index: 9999;
                width: max-content;
                max-width: calc(100vw - 40px);
                min-width: min(360px, calc(100vw - 40px));
                padding: 18px 24px;
                background: #2c2927;
                color: #f5f2ef;
                border: 1px solid rgba(255,255,255,0.18);
                border-radius: 12px;
                box-shadow: 0 16px 40px rgba(0,0,0,0.48);
                font-family:
                    "IBM Plex Sans KR",
                    "Apple SD Gothic Neo",
                    "Malgun Gothic",
                    sans-serif;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.6;
                opacity: 0;
                visibility: hidden;
                transform: translate(-50%, 12px);
                transition:
                    opacity 0.22s ease,
                    transform 0.22s ease,
                    visibility 0.22s ease;
                pointer-events: none;
            }

            #profile-toast.show {
                opacity: 1;
                visibility: visible;
                transform: translate(-50%, 0);
            }

            #profile-toast.error {
                border-color: rgba(232,106,95,0.5);
            }

            @media (max-width: 600px) {
                #profile-toast {
                    bottom: 20px;
                    padding: 16px 20px;
                    font-size: 14px;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #profile-toast {
                    transition: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    toastElement = document.getElementById("profile-toast");

    if (!toastElement) {
        toastElement = document.createElement("div");
        toastElement.id = "profile-toast";
        toastElement.setAttribute("role", "status");
        toastElement.setAttribute("aria-live", "polite");
        document.body.appendChild(toastElement);
    }
}

function showToast(message, isError = false) {
    if (!message) return;

    if (!toastElement) initializeToast();

    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    toastElement.textContent = message;
    toastElement.classList.toggle("error", isError);
    toastElement.classList.remove("show");

    void toastElement.offsetWidth;

    toastElement.classList.add("show");

    toastTimer = setTimeout(() => {
        toastElement.classList.remove("show");
        toastTimer = null;
    }, 3000);
}

initializeToast();

// =====================================
// 닉네임 길이 제한
// =====================================

limitNicknameLength(nicknameInput);
nicknameInput.removeAttribute("maxlength");

// =====================================
// 공통 메시지
// =====================================

function showMessage(message, isError = false) {
    let element = $("#profileMessage");

    if (!element) {
        element = document.createElement("p");
        element.id = "profileMessage";
        element.setAttribute("role", "status");
        element.setAttribute("aria-live", "polite");

        document.querySelector("main .container")
            ?.prepend(element);
    }

    if (!element) return;

    element.textContent = message;
    element.style.color = isError
        ? "var(--danger)"
        : "var(--muted)";
    element.hidden = !message;
}

function handleError(error, action) {
    console.error(`${action} 실패:`, error);

    const message =
        `${action} 실패: ${error?.message || "잠시 후 다시 시도해주세요."}`;

    showMessage(message, true);
    showToast(message, true);
}

// =====================================
// 프로필 상단
// =====================================

function updateProfileHeader() {
    const nickname = originalNickname || "사용자";

    $("#head-name").textContent = nickname;
    $("#head-email").textContent = emailInput.value;
    $("#big-avatar").textContent =
        Array.from(nickname)[0] || "?";
}

// =====================================
// 닉네임 검증
// =====================================

function updateNicknameState() {
    const nickname = nicknameInput.value.trim();
    const length = Array.from(nickname).length;

    nicknameCount.textContent =
        `${length}/${NICKNAME_MAX_LENGTH}`;

    nicknameCount.style.color =
        length > NICKNAME_MAX_LENGTH
            ? "var(--danger)"
            : "";

    let error = "";

    if (!nickname) {
        error = "닉네임을 입력해주세요.";
    } else if (length > NICKNAME_MAX_LENGTH) {
        error =
            `닉네임은 최대 ${NICKNAME_MAX_LENGTH}자까지 입력할 수 있어요.`;
    } else if (/[<>]/.test(nickname)) {
        error = "< > 기호는 사용할 수 없어요.";
    }

    nicknameError.textContent = error;

    $("#f-nick").classList.toggle(
        "invalid",
        Boolean(error)
    );

    nicknameHint.hidden = Boolean(error);

    nicknameSave.disabled =
        !profileReady ||
        savingNickname ||
        Boolean(error) ||
        nickname === originalNickname;

    return !error;
}

nicknameInput.addEventListener(
    "input",
    updateNicknameState
);

nicknameForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (!profileReady || savingNickname) return;

        if (
            !updateNicknameState() ||
            nicknameSave.disabled
        ) {
            return;
        }

        const nickname = nicknameInput.value.trim();

        savingNickname = true;
        nicknameSave.classList.add("is-loading");
        updateNicknameState();

        try {
            const response =
                await updateUserProfile(nickname);

            const savedNickname =
                typeof response?.nickname === "string"
                    ? response.nickname.trim()
                    : nickname;

            originalNickname = savedNickname;
            nicknameInput.value = savedNickname;

            if (response?.email) {
                emailInput.value = response.email;
            }

            updateProfileHeader();
            updateNicknameState();

            showMessage("");
            showToast("닉네임을 바꿨어요");
        } catch (error) {
            handleError(error, "닉네임 수정");
        } finally {
            savingNickname = false;
            nicknameSave.classList.remove("is-loading");
            updateNicknameState();
        }
    }
);

// =====================================
// 장르 데이터
// =====================================

function normalizeGenreCatalog(result) {
    const data = Array.isArray(result)
        ? result
        : Array.isArray(result?.genres)
            ? result.genres
            : [];

    return data.map((item) => {
        if (typeof item === "string") {
            return {
                code: item,
                name: item
            };
        }

        if (!item || typeof item !== "object") {
            return null;
        }

        if (typeof item.code !== "string") {
            return null;
        }

        return {
            code: item.code,
            name: String(
                item.name ??
                item.displayName ??
                item.code
            )
        };
    }).filter(Boolean);
}

function normalizeSelectedGenres(result) {
    const data = Array.isArray(result)
        ? result
        : Array.isArray(result?.genres)
            ? result.genres
            : [];

    return data.map((item) => {
        if (typeof item === "string") {
            return item;
        }

        return item?.code ?? null;
    }).filter(Boolean);
}

function getSelectedGenreCodes() {
    return $$(
        '#pref-genres [data-genre][aria-pressed="true"]'
    ).map((button) => button.dataset.genre);
}

function renderGenres() {
    genreContainer.replaceChildren();

    if (!availableGenres.length) {
        genreContainer.textContent =
            "표시할 장르 목록이 없습니다.";
        return;
    }

    for (const genre of availableGenres) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "chip";
        button.dataset.genre = genre.code;

        button.setAttribute(
            "aria-pressed",
            String(
                selectedGenres.includes(genre.code)
            )
        );

        button.textContent = genre.name;
        genreContainer.appendChild(button);
    }
}

async function loadGenres() {
    genresReady = false;

    genreContainer.textContent =
        "장르 정보를 불러오는 중입니다.";

    try {
        const [catalogResult, selectedResult] =
            await Promise.all([
                getAllGenres(),
                getUserGenres()
            ]);

        availableGenres =
            normalizeGenreCatalog(catalogResult);

        selectedGenres =
            normalizeSelectedGenres(selectedResult);

        genresReady = true;
        renderGenres();
    } catch (error) {
        genresReady = false;

        genreContainer.textContent =
            "장르 정보를 불러오지 못했습니다.";

        handleError(error, "장르 조회");
    }
}

function setGenreBusy(busy) {
    savingGenres = busy;

    $$("[data-genre]").forEach((button) => {
        button.disabled = busy;
    });
}

genreContainer.addEventListener(
    "click",
    async (event) => {
        const button =
            event.target.closest("[data-genre]");

        if (
            !button ||
            !genresReady ||
            savingGenres
        ) {
            return;
        }

        const currentlySelected =
            button.getAttribute("aria-pressed") === "true";

        button.setAttribute(
            "aria-pressed",
            String(!currentlySelected)
        );

        const nextGenres = getSelectedGenreCodes();

        setGenreBusy(true);
        genreMessage.hidden = true;
        genreMessage.textContent = "";

        try {
            await updateUserGenres(nextGenres);

            selectedGenres = [...nextGenres];

            genreMessage.textContent =
                "장르가 저장되었어요.";

            genreMessage.hidden = false;

            showToast("선호 장르를 저장했어요");
        } catch (error) {
            console.error("선호 장르 저장 실패:", error);

            renderGenres();

            genreMessage.textContent =
                `장르를 저장하지 못했어요. ${
                    error?.message || "다시 시도해주세요."
                }`;

            genreMessage.hidden = false;

            showToast(
                "장르를 저장하지 못했어요",
                true
            );
        } finally {
            setGenreBusy(false);
        }
    }
);

// =====================================
// 추천 기록 개수
// =====================================

async function loadHistoryCount() {
    if (!historyCount && !withdrawHistoryCount) {
        return;
    }

    const seenTokens = new Set();
    let nextToken = null;
    let total = 0;

    try {
        do {
            const query = new URLSearchParams({
                limit: "20"
            });

            if (nextToken) {
                query.set("nextToken", nextToken);
            }

            const response = await apiFetch(
                `/api/sessions?${query.toString()}`
            );

            const sessions =
                Array.isArray(response?.sessions)
                    ? response.sessions
                    : [];

            total += sessions.length;

            const token =
                response?.nextToken || null;

            if (token && seenTokens.has(token)) {
                throw new Error(
                    "추천 기록 페이지가 반복되어 조회를 중단했어요."
                );
            }

            if (token) {
                seenTokens.add(token);
            }

            nextToken = token;
        } while (nextToken);

        historyTotalCount = total;

        if (historyCount) {
            historyCount.textContent = String(total);
        }

        if (withdrawHistoryCount) {
            withdrawHistoryCount.textContent =
                String(total);
        }
    } catch (error) {
        console.error(
            "추천 기록 개수 조회 실패:",
            error
        );

        showToast(
            "추천 기록 개수를 불러오지 못했어요",
            true
        );
    }
}

// =====================================
// 본 콘텐츠 공통
// =====================================

function watchedKey(item) {
    return `${item.mediaType}:${item.tmdbId}`;
}

function getContentTypeLabel(mediaType) {
    if (mediaType === "movie") return "영화";
    if (mediaType === "tv") return "TV";

    return mediaType || "콘텐츠";
}

function getContentDetailUrl(item) {
    const params = new URLSearchParams({
        mediaType: String(item.mediaType),
        tmdbId: String(item.tmdbId)
    });

    return `detail.html?${params.toString()}`;
}

function createWatchedEmpty(title, description) {
    const empty = document.createElement("div");
    empty.className = "empty";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    empty.append(heading, paragraph);
    return empty;
}

// =====================================
// 본 콘텐츠 개수
// =====================================

function updateWatchedCount() {
    const countText = watchedNextToken
        ? `${watchedItems.length}+`
        : String(watchedItems.length);

    if (watchedCount) {
        watchedCount.textContent = countText;
    }

    if (withdrawWatchedCount) {
        withdrawWatchedCount.textContent = countText;
    }

    watchedTotalCount = watchedItems.length;
}

// =====================================
// 본 콘텐츠 포스터
// =====================================

function createWatchedPoster(item) {
    const link = document.createElement("a");

    link.href = getContentDetailUrl(item);
    link.style.width = "48px";
    link.style.flex = "none";

    if (item.posterPath) {
        const poster = document.createElement("img");

        poster.src =
            `${TMDB_POSTER_URL}${item.posterPath}`;

        poster.alt =
            `${item.title || "콘텐츠"} 포스터`;

        poster.loading = "lazy";
        poster.style.width = "100%";
        poster.style.aspectRatio = "2 / 3";
        poster.style.objectFit = "cover";
        poster.style.borderRadius = "6px";
        poster.style.display = "block";

        link.appendChild(poster);
    } else {
        const placeholder =
            document.createElement("div");

        placeholder.className = "poster";
        placeholder.textContent = "포스터 없음";
        placeholder.style.aspectRatio = "2 / 3";
        placeholder.style.display = "grid";
        placeholder.style.placeItems = "center";
        placeholder.style.fontSize = "10px";
        placeholder.style.textAlign = "center";

        link.appendChild(placeholder);
    }

    return link;
}

// =====================================
// 본 콘텐츠 목록 행
// =====================================

function createWatchedRow(item) {
    const row = document.createElement("div");
    row.className = "list-row";

    const posterLink = createWatchedPoster(item);

    const information = document.createElement("div");
    information.className = "grow";

    const titleLink = document.createElement("a");
    titleLink.href = getContentDetailUrl(item);

    const title = document.createElement("strong");
    title.textContent = item.title || "제목 없음";

    titleLink.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "sub";

    const type =
        getContentTypeLabel(item.mediaType);

    sub.textContent =
        [type, item.releaseYear]
            .filter(Boolean)
            .join(", ");

    information.append(titleLink, sub);

    const removeButton =
        document.createElement("button");

    removeButton.type = "button";
    removeButton.className =
        "btn btn-ghost btn-sm";

    removeButton.textContent =
        "목록에서 빼기";

    removeButton.dataset.unwatch =
        watchedKey(item);

    removeButton.disabled =
        deletingWatched.has(watchedKey(item));

    removeButton.setAttribute(
        "aria-label",
        `${item.title || "콘텐츠"} 목록에서 빼기`
    );

    row.append(
        posterLink,
        information,
        removeButton
    );

    return row;
}

// =====================================
// 본 콘텐츠 렌더링
// =====================================

function renderWatched() {
    if (!watchedList) return;

    watchedList.replaceChildren();
    updateWatchedCount();

    if (!watchedItems.length) {
        watchedList.appendChild(
            createWatchedEmpty(
                "아직 본 작품이 없어요",
                "추천 결과나 상세 화면에서 '이미 봤어요'를 눌러보세요."
            )
        );
    } else {
        for (const item of watchedItems) {
            watchedList.appendChild(
                createWatchedRow(item)
            );
        }
    }

    if (watchedNextToken) {
        const moreWrapper =
            document.createElement("div");

        moreWrapper.className = "actions";

        const moreButton =
            document.createElement("button");

        moreButton.type = "button";
        moreButton.className =
            "btn btn-secondary";

        moreButton.textContent = "더 보기";
        moreButton.disabled = watchedLoading;

        moreButton.addEventListener(
            "click",
            () => loadWatched(false)
        );

        moreWrapper.appendChild(moreButton);
        watchedList.appendChild(moreWrapper);
    }
}

// =====================================
// 본 콘텐츠 조회
// =====================================

async function loadWatched(reset = true) {
    if (!watchedList || watchedLoading) return;

    watchedLoading = true;

    const requestToken =
        reset ? null : watchedNextToken;

    if (reset) {
        watchedItems = [];
        watchedNextToken = null;

        watchedList.replaceChildren();

        watchedList.appendChild(
            createWatchedEmpty(
                "본 작품을 불러오는 중이에요",
                "잠시만 기다려주세요."
            )
        );
    }

    try {
        const response = await getMyWatched(
            20,
            requestToken
        );

        const incomingItems =
            Array.isArray(response?.items)
                ? response.items
                : [];

        const existingKeys = new Set(
            watchedItems.map(watchedKey)
        );

        for (const item of incomingItems) {
            const key = watchedKey(item);

            if (!existingKeys.has(key)) {
                watchedItems.push(item);
                existingKeys.add(key);
            }
        }

        watchedNextToken =
            response?.nextToken || null;

        renderWatched();
    } catch (error) {
        console.error("본 작품 조회 실패:", error);

        if (reset) {
            watchedList.replaceChildren();

            watchedList.appendChild(
                createWatchedEmpty(
                    "본 작품을 불러오지 못했어요",
                    error?.message ||
                    "잠시 후 다시 시도해주세요."
                )
            );
        } else {
            renderWatched();
        }

        handleError(error, "본 작품 조회");
    } finally {
        watchedLoading = false;
    }
}

// =====================================
// 본 콘텐츠 삭제
// =====================================

watchedList?.addEventListener(
    "click",
    async (event) => {
        const button =
            event.target.closest("[data-unwatch]");

        if (!button) return;

        const key = button.dataset.unwatch;

        if (deletingWatched.has(key)) return;

        const item = watchedItems.find(
            (content) => watchedKey(content) === key
        );

        if (!item) return;

        deletingWatched.add(key);

        button.disabled = true;
        button.classList.add("is-loading");

        try {
            await removeMyWatched(
                item.mediaType,
                item.tmdbId
            );

            watchedItems = watchedItems.filter(
                (content) =>
                    watchedKey(content) !== key
            );

            renderWatched();

            showMessage("");
            showToast("본 콘텐츠 목록에서 뺐어요");
        } catch (error) {
            handleError(error, "본 작품 삭제");

            button.disabled = false;
            button.classList.remove("is-loading");
        } finally {
            deletingWatched.delete(key);
        }
    }
);

// =====================================
// 자동 제외 설정 조회
// =====================================

async function loadWatchedSettings() {
    if (!excludeWatchedSwitch) return;

    settingsReady = false;
    excludeWatchedSwitch.disabled = true;

    try {
        const response = await getMySettings();

        currentExcludeWatched =
            response?.excludeWatched !== false;

        excludeWatchedSwitch.checked =
            currentExcludeWatched;

        settingsReady = true;
    } catch (error) {
        handleError(
            error,
            "자동 제외 설정 조회"
        );
    } finally {
        excludeWatchedSwitch.disabled =
            !settingsReady;
    }
}

// =====================================
// 자동 제외 설정 변경
// =====================================

excludeWatchedSwitch?.addEventListener(
    "change",
    async () => {
        if (!settingsReady || settingsSaving) {
            excludeWatchedSwitch.checked =
                currentExcludeWatched;
            return;
        }

        const nextValue =
            excludeWatchedSwitch.checked;

        settingsSaving = true;
        excludeWatchedSwitch.disabled = true;

        try {
            const response =
                await updateMySettings(nextValue);

            currentExcludeWatched =
                typeof response?.excludeWatched === "boolean"
                    ? response.excludeWatched
                    : nextValue;

            excludeWatchedSwitch.checked =
                currentExcludeWatched;

            showMessage("");

            showToast(
                currentExcludeWatched
                    ? "본 작품 자동 제외를 켰어요"
                    : "본 작품 자동 제외를 껐어요"
            );
        } catch (error) {
            excludeWatchedSwitch.checked =
                currentExcludeWatched;

            handleError(
                error,
                "자동 제외 설정 변경"
            );
        } finally {
            settingsSaving = false;
            excludeWatchedSwitch.disabled = false;
        }
    }
);

// =====================================
// 모달 공통
// =====================================

function openModal(modal) {
    if (!modal || activeModal) return;

    previousFocus = document.activeElement;
    activeModal = modal;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");

    const focusable = modal.querySelector(
        'input:not(:disabled), button:not(:disabled)'
    );

    focusable?.focus();
}

function closeModal() {
    if (
        !activeModal ||
        deletingAccount ||
        loggingOut ||
        changingPassword
    ) {
        return;
    }

    const modal = activeModal;

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");

    activeModal = null;
    document.body.classList.remove("modal-open");

    if (previousFocus?.isConnected) {
        previousFocus.focus();
    }

    previousFocus = null;
}

// =====================================
// 비밀번호 변경 조건
// =====================================

function getPasswordRules(password) {
    return {
        length: password.length >= 12,
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
}

function setPasswordRule(id, valid, label) {
    const element = $(id);

    if (!element) return;

    element.textContent =
        `${valid ? "●" : "○"} ${label}`;

    element.classList.toggle(
        "valid",
        valid
    );
}

function updatePasswordState() {
    if (!passwordForm) return false;

    const current = passwordCurrent.value;
    const next = passwordNew.value;
    const confirm = passwordConfirm.value;

    const rules = getPasswordRules(next);

    setPasswordRule(
        "#pw-rule-length",
        rules.length,
        "12자 이상"
    );

    setPasswordRule(
        "#pw-rule-lower",
        rules.lower,
        "소문자"
    );

    setPasswordRule(
        "#pw-rule-number",
        rules.number,
        "숫자"
    );

    setPasswordRule(
        "#pw-rule-special",
        rules.special,
        "특수문자"
    );

    const matches =
        Boolean(confirm) &&
        next === confirm;

    if (confirm) {
        passwordMatchMessage.hidden = false;

        passwordMatchMessage.textContent =
            matches
                ? "새 비밀번호가 일치해요."
                : "새 비밀번호가 일치하지 않아요.";

        passwordMatchMessage.classList.toggle(
            "success",
            matches
        );

        passwordMatchMessage.classList.toggle(
            "error",
            !matches
        );
    } else {
        passwordMatchMessage.hidden = true;
        passwordMatchMessage.textContent = "";
    }

    const valid =
        Boolean(current) &&
        Object.values(rules).every(Boolean) &&
        matches &&
        current !== next;

    passwordSubmit.disabled =
        !valid || changingPassword;

    return valid;
}

function resetPasswordForm() {
    if (!passwordForm) return;

    passwordForm.reset();

    passwordError.hidden = true;
    passwordError.textContent = "";

    passwordMatchMessage.hidden = true;
    passwordMatchMessage.textContent = "";

    passwordSubmit.textContent = "변경하기";
    passwordSubmit.classList.remove("is-loading");

    $$("[data-toggle-password]").forEach(
        (button) => {
            const input = document.getElementById(
                button.dataset.togglePassword
            );

            if (input) {
                input.type = "password";
            }

            button.setAttribute(
                "aria-pressed",
                "false"
            );

            button.setAttribute(
                "aria-label",
                "비밀번호 표시"
            );
        }
    );

    updatePasswordState();
}

function getPasswordErrorMessage(error) {
    const name = error?.name || "";
    const message = error?.message || "";

    if (
        name === "NotAuthorizedException" ||
        /incorrect|wrong|not authorized/i.test(message)
    ) {
        return "현재 비밀번호가 올바르지 않아요.";
    }

    if (
        name === "InvalidPasswordException" ||
        /password.*policy|password.*requirements/i.test(message)
    ) {
        return "새 비밀번호가 보안 조건에 맞지 않아요.";
    }

    if (
        name === "LimitExceededException" ||
        name === "TooManyRequestsException" ||
        name === "TooManyFailedAttemptsException"
    ) {
        return "요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
    }

    if (
        name === "UserUnAuthenticatedException" ||
        /not authenticated|sign in/i.test(message)
    ) {
        return "로그인 세션이 만료됐어요. 다시 로그인해주세요.";
    }

    return "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요.";
}

// =====================================
// 비밀번호 변경 모달 열기
// =====================================

$("#change-password")?.addEventListener(
    "click",
    () => {
        resetPasswordForm();
        openModal(passwordModal);
    }
);

// =====================================
// 비밀번호 보기 / 숨기기
// =====================================

$$("[data-toggle-password]").forEach(
    (button) => {
        button.addEventListener("click", () => {
            const input = document.getElementById(
                button.dataset.togglePassword
            );

            if (!input) return;

            const visible =
                input.type === "password";

            input.type = visible
                ? "text"
                : "password";

            button.setAttribute(
                "aria-pressed",
                String(visible)
            );

            button.setAttribute(
                "aria-label",
                visible
                    ? "비밀번호 숨기기"
                    : "비밀번호 표시"
            );
        });
    }
);

// =====================================
// 비밀번호 입력 실시간 검사
// =====================================

[
    passwordCurrent,
    passwordNew,
    passwordConfirm
].forEach((input) => {
    input?.addEventListener(
        "input",
        () => {
            passwordError.hidden = true;
            passwordError.textContent = "";

            updatePasswordState();
        }
    );
});

// =====================================
// 비밀번호 변경 요청
// =====================================

passwordForm?.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (changingPassword) return;
        if (!updatePasswordState()) return;

        const oldPassword =
            passwordCurrent.value;

        const newPassword =
            passwordNew.value;

        changingPassword = true;

        passwordSubmit.disabled = true;
        passwordSubmit.textContent =
            "변경 중...";

        passwordSubmit.classList.add(
            "is-loading"
        );

        passwordError.hidden = true;
        passwordError.textContent = "";

        try {
            await changePassword(
                oldPassword,
                newPassword
            );

            changingPassword = false;

            closeModal();
            resetPasswordForm();

            showMessage("");
            showToast("비밀번호를 변경했어요");
        } catch (error) {
            console.error(
                "비밀번호 변경 실패:",
                error
            );

            passwordError.textContent =
                getPasswordErrorMessage(error);

            passwordError.hidden = false;

            showToast(
                "비밀번호를 변경하지 못했어요",
                true
            );
        } finally {
            changingPassword = false;

            passwordSubmit.textContent =
                "변경하기";

            passwordSubmit.classList.remove(
                "is-loading"
            );

            updatePasswordState();
        }
    }
);

// =====================================
// 로그아웃 확인 모달
// =====================================

$('[data-action="logout"]')?.addEventListener(
    "click",
    () => {
        openModal(logoutModal);
    }
);

logoutConfirmButton?.addEventListener(
    "click",
    async () => {
        if (loggingOut) return;

        loggingOut = true;

        logoutConfirmButton.disabled = true;
        logoutConfirmButton.classList.add(
            "is-loading"
        );

        try {
            await logout({
                redirect: false
            });

            window.location.replace(
                "/pages/login.html"
            );
        } catch (error) {
            handleError(error, "로그아웃");

            loggingOut = false;

            logoutConfirmButton.disabled = false;
            logoutConfirmButton.classList.remove(
                "is-loading"
            );
        }
    }
);

// =====================================
// 회원 탈퇴 모달
// =====================================

$("#withdraw-open")?.addEventListener(
    "click",
    () => {
        withdrawConfirm.value = "";
        withdrawButton.disabled = true;

        if (withdrawError) {
            withdrawError.textContent = "";
        }

        if (withdrawWatchedCount) {
            withdrawWatchedCount.textContent =
                String(watchedTotalCount);
        }

        if (withdrawHistoryCount) {
            withdrawHistoryCount.textContent =
                String(historyTotalCount);
        }

        openModal(withdrawModal);
    }
);

// =====================================
// 모달 닫기 버튼
// =====================================

$$("[data-close], [data-close-modal]").forEach(
    (button) => {
        button.addEventListener(
            "click",
            closeModal
        );
    }
);

// =====================================
// 모달 배경 클릭
// =====================================

$$(".modal-backdrop").forEach(
    (modal) => {
        modal.addEventListener(
            "click",
            (event) => {
                if (event.target === modal) {
                    closeModal();
                }
            }
        );
    }
);

// =====================================
// ESC / Tab 키
// =====================================

document.addEventListener(
    "keydown",
    (event) => {
        if (!activeModal) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closeModal();
            return;
        }

        if (event.key !== "Tab") return;

        const focusable = [
            ...activeModal.querySelectorAll(
                'button:not(:disabled), input:not(:disabled)'
            )
        ].filter((element) => {
            return element.getClientRects().length > 0;
        });

        if (!focusable.length) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last =
            focusable[focusable.length - 1];

        if (
            event.shiftKey &&
            document.activeElement === first
        ) {
            event.preventDefault();
            last.focus();
        } else if (
            !event.shiftKey &&
            document.activeElement === last
        ) {
            event.preventDefault();
            first.focus();
        }
    }
);

// =====================================
// 회원 탈퇴 확인
// =====================================

withdrawConfirm?.addEventListener(
    "input",
    () => {
        withdrawButton.disabled =
            withdrawConfirm.value.trim() !== "탈퇴" ||
            deletingAccount;
    }
);

// =====================================
// 회원 탈퇴 API
// =====================================

withdrawButton?.addEventListener(
    "click",
    async () => {
        if (
            withdrawConfirm.value.trim() !== "탈퇴" ||
            deletingAccount
        ) {
            return;
        }

        deletingAccount = true;

        withdrawButton.disabled = true;
        withdrawButton.textContent =
            "탈퇴 처리 중...";

        withdrawButton.classList.add(
            "is-loading"
        );

        if (withdrawError) {
            withdrawError.textContent = "";
        }

        try {
            await deleteUserAccount();
        } catch (error) {
            console.error(
                "회원 탈퇴 실패:",
                error
            );

            if (withdrawError) {
                withdrawError.textContent =
                    error?.message ||
                    "회원 탈퇴에 실패했습니다.";
            } else {
                handleError(error, "회원 탈퇴");
            }

            deletingAccount = false;

            withdrawButton.disabled = false;
            withdrawButton.textContent =
                "탈퇴하기";

            withdrawButton.classList.remove(
                "is-loading"
            );

            return;
        }

        try {
            await logout({
                redirect: false
            });
        } catch (error) {
            console.error(
                "회원 탈퇴 후 로그아웃 실패:",
                error
            );
        } finally {
            window.location.replace(
                "/pages/index.html"
            );
        }
    }
);

// =====================================
// 사이드 메뉴 활성화
// =====================================

function activateSideNavigation() {
    // 페이지 안 섹션 링크만 (추천 기록은 history.html로 이동하는 링크)
    const links = $$('#side-nav a[href^="#"]');

    const scrollPosition =
        window.scrollY + 140;

    let activeLink = links[0];

    for (const link of links) {
        const target = document.querySelector(
            link.getAttribute("href")
        );

        if (
            target &&
            target.offsetTop <= scrollPosition
        ) {
            activeLink = link;
        }
    }

    links.forEach((link) => {
        link.classList.toggle(
            "active",
            link === activeLink
        );
    });
}

window.addEventListener(
    "scroll",
    activateSideNavigation,
    { passive: true }
);

// =====================================
// 프로필 초기화
// =====================================

async function initializeProfile() {
    nicknameSave.disabled = true;

    if (watchedList) {
        watchedList.replaceChildren();

        watchedList.appendChild(
            createWatchedEmpty(
                "본 작품을 불러오는 중이에요",
                "잠시만 기다려주세요."
            )
        );
    }

    if (excludeWatchedSwitch) {
        excludeWatchedSwitch.disabled = true;
    }

    try {
        const user = await getLoginUser();

        if (!user) {
            window.location.replace(
                "login.html"
            );
            return;
        }

        const [profile] = await Promise.all([
            getUserProfile(),
            loadGenres()
        ]);

        emailInput.value =
            profile?.email ?? "";

        originalNickname =
            typeof profile?.nickname === "string"
                ? profile.nickname.trim()
                : "";

        nicknameInput.value =
            originalNickname;

        profileReady = true;

        updateProfileHeader();
        updateNicknameState();

        showMessage("");

        await Promise.allSettled([
            loadWatched(true),
            loadWatchedSettings(),
            loadHistoryCount()
        ]);
    } catch (error) {
        handleError(
            error,
            "프로필 조회"
        );
    }

    activateSideNavigation();
}

initializeProfile();