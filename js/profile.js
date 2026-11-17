import {
    getLoginUser,
    logout
} from "./auth-token.js";

import {
    getUserProfile,
    updateUserProfile,
    deleteUserAccount,
    getUserGenres,
    updateUserGenres,
    getAllGenres
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

const passwordModal = $("#pw-modal");
const withdrawModal = $("#withdraw-modal");

const withdrawConfirm = $("#wd-confirm");
const withdrawButton = $("#wd-go");
const withdrawError = $("#wd-error");

// =====================================
// 상태
// =====================================

let profileReady = false;
let genresReady = false;

let savingNickname = false;
let savingGenres = false;
let deletingAccount = false;

let originalNickname = "";

let availableGenres = [];
let selectedGenres = [];

let activeModal = null;
let previousFocus = null;

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

        document.querySelector("main .container").prepend(element);
    }

    element.textContent = message;

    element.style.color = isError
        ? "var(--danger)"
        : "var(--muted)";

    element.hidden = !message;
}

function handleError(error, action) {
    console.error(`${action} 실패:`, error);

    showMessage(
        `${action} 실패: ${error?.message || "잠시 후 다시 시도해주세요."}`,
        true
    );
}

// =====================================
// 프로필 상단 정보
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

    let error = "";

    if (!nickname) {
        error = "닉네임을 입력해주세요.";
    } else if (length > NICKNAME_MAX_LENGTH) {
        error = `닉네임은 최대 ${NICKNAME_MAX_LENGTH}자까지 입력할 수 있어요.`;
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

// =====================================
// 닉네임 변경
// =====================================

nicknameInput.addEventListener(
    "input",
    updateNicknameState
);

nicknameForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (!profileReady || savingNickname) {
            return;
        }

        if (!updateNicknameState() || nicknameSave.disabled) {
            return;
        }

        const nickname = nicknameInput.value.trim();

        savingNickname = true;
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
            showMessage("");
        } catch (error) {
            handleError(error, "닉네임 수정");
        } finally {
            savingNickname = false;
            updateNicknameState();
        }
    }
);

// =====================================
// 장르 데이터 정규화
// =====================================

function normalizeGenreCatalog(result) {
    const data = Array.isArray(result)
        ? result
        : Array.isArray(result?.genres)
            ? result.genres
            : [];

    return data
        .map((item) => {
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
        })
        .filter(Boolean);
}

function normalizeSelectedGenres(result) {
    const data = Array.isArray(result)
        ? result
        : Array.isArray(result?.genres)
            ? result.genres
            : [];

    return data
        .map((item) => {
            if (typeof item === "string") {
                return item;
            }

            return item?.code ?? null;
        })
        .filter(Boolean);
}

// =====================================
// 장르 선택 목록
// =====================================

function getSelectedGenreCodes() {
    return $$(
        '#pref-genres [data-genre][aria-pressed="true"]'
    ).map((button) => button.dataset.genre);
}

// =====================================
// 장르 화면 표시
// =====================================

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
            String(selectedGenres.includes(genre.code))
        );

        button.textContent = genre.name;

        genreContainer.appendChild(button);
    }
}

// =====================================
// 장르 조회
// =====================================

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

// =====================================
// 장르 저장 상태
// =====================================

function setGenreBusy(busy) {
    savingGenres = busy;

    $$("[data-genre]").forEach((button) => {
        button.disabled = busy;
    });
}

// =====================================
// 장르 클릭 시 자동 저장
// =====================================

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
        } catch (error) {
            console.error("선호 장르 저장 실패:", error);

            renderGenres();

            genreMessage.textContent =
                `장르를 저장하지 못했어요. ${error?.message || "다시 시도해주세요."}`;

            genreMessage.hidden = false;
        } finally {
            setGenreBusy(false);
        }
    }
);

// =====================================
// 본 콘텐츠
// 조회 API 미연동 상태
// =====================================

function initializeWatched() {
    const watchedList = $("#watched-list");

    watchedList.replaceChildren();

    const empty = document.createElement("div");
    empty.className = "empty";

    const title = document.createElement("h3");

    // 시안과 동일한 제목
    title.textContent = "아직 본 작품이 없어요";

    const description = document.createElement("p");

    // 시안과 동일한 안내 문구
    description.textContent =
        "추천 결과나 상세 화면에서 '이미 봤어요'를 눌러보세요.";

    empty.append(title, description);
    watchedList.appendChild(empty);
}

// =====================================
// 모달 열기
// =====================================

function openModal(modal) {
    if (!modal || activeModal) {
        return;
    }

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

// =====================================
// 모달 닫기
// =====================================

function closeModal() {
    if (!activeModal || deletingAccount) {
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
// 비밀번호 변경 안내
// =====================================

$("#change-password").addEventListener(
    "click",
    () => {
        openModal(passwordModal);
    }
);

// =====================================
// 회원 탈퇴 모달
// =====================================

$("#withdraw-open").addEventListener(
    "click",
    () => {
        withdrawConfirm.value = "";
        withdrawButton.disabled = true;
        withdrawError.textContent = "";

        openModal(withdrawModal);
    }
);

// =====================================
// 모달 닫기 버튼
// =====================================

$$("[data-close]").forEach((button) => {
    button.addEventListener(
        "click",
        closeModal
    );
});

// =====================================
// 모달 배경 클릭
// =====================================

$$(".modal-backdrop").forEach((modal) => {
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
});

// =====================================
// ESC 및 Tab 키
// =====================================

document.addEventListener("keydown", (event) => {
    if (!activeModal) {
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
    }

    if (event.key !== "Tab") {
        return;
    }

    const focusable = [
        ...activeModal.querySelectorAll(
            'button:not(:disabled), input:not(:disabled)'
        )
    ];

    if (!focusable.length) {
        event.preventDefault();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

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
});

// =====================================
// 로그아웃
// =====================================

$('[data-action="logout"]').addEventListener(
    "click",
    async () => {
        try {
            await logout();
        } catch (error) {
            handleError(error, "로그아웃");
        }
    }
);

// =====================================
// 회원 탈퇴 확인
// =====================================

withdrawConfirm.addEventListener(
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

withdrawButton.addEventListener(
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
        withdrawButton.textContent = "탈퇴 처리 중...";

        withdrawError.textContent = "";

        try {
            await deleteUserAccount();
        } catch (error) {
            console.error("회원 탈퇴 실패:", error);

            withdrawError.textContent =
                error?.message ||
                "회원 탈퇴에 실패했습니다.";

            deletingAccount = false;
            withdrawButton.disabled = false;
            withdrawButton.textContent = "탈퇴하기";

            return;
        }

        try {
            await logout();
        } catch (error) {
            console.error(
                "회원 탈퇴 후 로그아웃 실패:",
                error
            );

            window.location.replace(
                "/pages/login.html"
            );
        }
    }
);

// =====================================
// 사이드 메뉴 활성화
// =====================================

function activateSideNavigation() {
    const links = $$("#side-nav a");

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

    initializeWatched();

    try {
        const user = await getLoginUser();

        if (!user) {
            window.location.replace("login.html");
            return;
        }

        const [profile] = await Promise.all([
            getUserProfile(),
            loadGenres()
        ]);

        emailInput.value = profile?.email ?? "";

        originalNickname =
            typeof profile?.nickname === "string"
                ? profile.nickname.trim()
                : "";

        nicknameInput.value = originalNickname;

        profileReady = true;

        updateProfileHeader();
        updateNicknameState();

        showMessage("");
    } catch (error) {
        handleError(error, "프로필 조회");
    }

    activateSideNavigation();
}

initializeProfile();