
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

// =====================================
// HTML 요소 가져오기
// =====================================

const profileMessage = document.getElementById("profileMessage");

const userEmail = document.getElementById("userEmail");
const userNickname = document.getElementById("userNickname");
const nicknameForm = document.getElementById("nicknameForm");
const saveNicknameBtn = document.getElementById("saveNicknameBtn");

const genreList = document.getElementById("genreList");
const saveGenresBtn = document.getElementById("saveGenresBtn");

const deleteAccountBtn = document.getElementById("deleteAccountBtn");

const nicknameMessage = document.getElementById("nick-msg");
const genreMessage = document.getElementById("genre-msg");

// =====================================
// 상태 관리
// =====================================

let availableGenres = [];
let selectedGenres = [];
let originalNickname = "";

let profileReady = false;
let genresReady = false;

let savingNickname = false;
let savingGenres = false;

let deleteModal = null;
let deletingAccount = false;
let previousFocus = null;

const flashTimers = new Map();

// =====================================
// 공통 메시지
// =====================================

function showMessage(message) {
    if (profileMessage) {
        profileMessage.textContent = message;
    }
}

// =====================================
// 원본 시안 flash() 기능
// 저장 메시지 2.2초 표시
// =====================================

function flash(id, message, bad = false) {
    const element = document.getElementById(id);

    if (!element) {
        return;
    }

    const previousTimer = flashTimers.get(id);

    if (previousTimer) {
        clearTimeout(previousTimer);
    }

    element.textContent = message;
    element.classList.toggle("bad", bad);
    element.classList.add("on");

    const timer = setTimeout(() => {
        element.classList.remove("on");
        flashTimers.delete(id);
    }, 2200);

    flashTimers.set(id, timer);
}

// =====================================
// API 오류 처리
// =====================================

function handleApiError(error, action, messageId = null) {
    console.error(`${action} 실패:`, error);

    if (error?.code === "NICKNAME_REQUIRED") {
        const message =
            "닉네임 설정이 필요합니다. " +
            "닉네임을 입력하고 저장한 뒤 다시 시도해주세요.";

        showMessage(message);

        if (messageId) {
            flash(messageId, "닉네임 설정이 필요해요", true);
        }

        userNickname.focus();
        return;
    }

    const errorMessage =
        error?.message || "알 수 없는 오류";

    showMessage(`${action} 실패: ${errorMessage}`);

    if (messageId) {
        flash(messageId, "저장하지 못했어요", true);
    }
}

// =====================================
// 닉네임 저장 버튼 상태
// =====================================

function updateNicknameButton() {
    const nickname = userNickname.value.trim();

    const changed = nickname !== originalNickname;

    const valid =
        nickname.length > 0 &&
        [...nickname].length <= 20;

    saveNicknameBtn.disabled =
        !profileReady ||
        savingNickname ||
        !changed ||
        !valid;
}

// =====================================
// 선호 장르 저장 버튼 상태
// =====================================

function getCheckedGenres() {
    return [
        ...genreList.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ].map((input) => input.value);
}

function sameGenres(first, second) {
    if (first.length !== second.length) {
        return false;
    }

    const firstSet = new Set(first);
    const secondSet = new Set(second);

    if (firstSet.size !== secondSet.size) {
        return false;
    }

    return [...firstSet].every(
        (code) => secondSet.has(code)
    );
}

function updateGenresButton() {
    if (!genresReady || savingGenres) {
        saveGenresBtn.disabled = true;
        return;
    }

    const checkedGenres = getCheckedGenres();

    saveGenresBtn.disabled = sameGenres(
        checkedGenres,
        selectedGenres
    );
}

// =====================================
// 프로필 조회
// =====================================

async function loadProfile() {
    profileReady = false;
    updateNicknameButton();

    try {
        const profile = await getUserProfile();

        userEmail.value = profile.email ?? "";
        userNickname.value = profile.nickname ?? "";

        originalNickname = userNickname.value.trim();

        profileReady = true;

        updateNicknameButton();
        showMessage("");

    } catch (error) {
        profileReady = false;
        updateNicknameButton();

        handleApiError(error, "프로필 조회");
    }
}

// =====================================
// 닉네임 입력 변경 감지
// =====================================

userNickname.addEventListener("input", () => {
    updateNicknameButton();
});

// =====================================
// 닉네임 저장
// =====================================

nicknameForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!profileReady || savingNickname) {
        return;
    }

    const nickname = userNickname.value.trim();

    if (
        nickname.length < 1 ||
        [...nickname].length > 20
    ) {
        flash(
            "nick-msg",
            "닉네임은 1~20자로 입력해주세요",
            true
        );
        return;
    }

    if (nickname === originalNickname) {
        updateNicknameButton();
        return;
    }

    savingNickname = true;
    updateNicknameButton();

    try {
        const updatedProfile =
            await updateUserProfile(nickname);

        const savedNickname =
            updatedProfile?.nickname ?? nickname;

        userNickname.value = savedNickname;
        originalNickname = savedNickname.trim();

        if (updatedProfile?.email) {
            userEmail.value = updatedProfile.email;
        }

        profileReady = true;

        showMessage("");

        // 원본 시안: 버튼 오른쪽 초록색 메시지
        flash("nick-msg", "저장했어요");

        if (!genresReady) {
            await loadGenres();
        }

    } catch (error) {
        handleApiError(
            error,
            "닉네임 수정",
            "nick-msg"
        );

    } finally {
        savingNickname = false;
        updateNicknameButton();
    }
});

// =====================================
// 장르 데이터 변환
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

            const code = item.code;

            const name =
                item.name ??
                item.displayName ??
                code;

            if (typeof code !== "string") {
                return null;
            }

            return {
                code,
                name: String(name)
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
// 장르 화면 표시
// =====================================

function renderGenres() {
    genreList.replaceChildren();

    if (availableGenres.length === 0) {
        genreList.textContent =
            "표시할 장르 목록이 없습니다.";

        saveGenresBtn.disabled = true;
        return;
    }

    for (const genre of availableGenres) {
        const label = document.createElement("label");
        label.className = "genre-item chip";

        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.value = genre.code;

        checkbox.checked =
            selectedGenres.includes(genre.code);

        const span = document.createElement("span");
        span.textContent = genre.name;

        label.append(checkbox, span);
        genreList.appendChild(label);
    }

    updateGenresButton();
}

// =====================================
// 장르 선택 변경 감지
// =====================================

genreList.addEventListener("change", (event) => {
    if (
        event.target.matches(
            'input[type="checkbox"]'
        )
    ) {
        updateGenresButton();
    }
});

// =====================================
// 장르 조회
// =====================================

async function loadGenres() {
    genresReady = false;
    updateGenresButton();

    genreList.textContent =
        "장르 목록을 불러오는 중입니다.";

    try {
        const [catalogResult, userGenresResult] =
            await Promise.all([
                getAllGenres(),
                getUserGenres()
            ]);

        availableGenres =
            normalizeGenreCatalog(catalogResult);

        selectedGenres =
            normalizeSelectedGenres(userGenresResult);

        genresReady = true;

        renderGenres();

    } catch (error) {
        genresReady = false;

        genreList.textContent =
            "장르 정보를 불러오지 못했습니다.";

        updateGenresButton();

        handleApiError(error, "장르 조회");
    }
}

// =====================================
// 선호 장르 저장
// =====================================

saveGenresBtn.addEventListener("click", async () => {
    if (!genresReady || savingGenres) {
        return;
    }

    const checkedGenres = getCheckedGenres();

    if (sameGenres(checkedGenres, selectedGenres)) {
        updateGenresButton();
        return;
    }

    savingGenres = true;
    updateGenresButton();

    try {
        await updateUserGenres(checkedGenres);

        selectedGenres = [...checkedGenres];

        showMessage("");

        // 원본 시안: 버튼 오른쪽 초록색 메시지
        flash("genre-msg", "저장했어요");

    } catch (error) {
        handleApiError(
            error,
            "선호 장르 저장",
            "genre-msg"
        );

    } finally {
        savingGenres = false;
        updateGenresButton();
    }
});

// =====================================
// 회원 탈퇴 모달 생성
// =====================================

function createDeleteModal() {
    const modal = document.createElement("div");

    modal.className = "modal";
    modal.id = "deleteModal";

    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute(
        "aria-labelledby",
        "deleteModalTitle"
    );
    modal.setAttribute(
        "aria-describedby",
        "deleteModalDescription"
    );

    modal.innerHTML = `
        <div class="box">
            <h4 id="deleteModalTitle">
                정말 탈퇴할까요?
            </h4>

            <p id="deleteModalDescription">
                계정과 선호 장르, 추천 기록이 삭제될 수 있어요.<br>
                이 작업은 되돌릴 수 없어요.
            </p>

            <p
                class="modal-error"
                id="deleteModalError"
                role="alert"
                hidden
            ></p>

            <div class="two">
                <button
                    type="button"
                    class="btn-gray"
                    data-act="modal-cancel"
                >
                    취소
                </button>

                <button
                    type="button"
                    class="btn-red"
                    data-act="modal-confirm"
                >
                    탈퇴하기
                </button>
            </div>
        </div>
    `;

    return modal;
}

// =====================================
// 회원 탈퇴 모달 열기
// =====================================

function openDeleteModal() {
    if (deleteModal || deletingAccount) {
        return;
    }

    previousFocus = document.activeElement;

    deleteModal = createDeleteModal();

    document.body.appendChild(deleteModal);
    document.body.classList.add("modal-open");

    const cancelBtn =
        deleteModal.querySelector(
            '[data-act="modal-cancel"]'
        );

    const confirmBtn =
        deleteModal.querySelector(
            '[data-act="modal-confirm"]'
        );

    cancelBtn.addEventListener(
        "click",
        closeDeleteModal
    );

    confirmBtn.addEventListener(
        "click",
        confirmDeleteAccount
    );

    deleteModal.addEventListener("click", (event) => {
        if (event.target === deleteModal) {
            closeDeleteModal();
        }
    });

    cancelBtn.focus();
}

// =====================================
// 회원 탈퇴 모달 닫기
// =====================================

function closeDeleteModal() {
    if (!deleteModal || deletingAccount) {
        return;
    }

    deleteModal.remove();
    deleteModal = null;

    document.body.classList.remove("modal-open");

    if (previousFocus?.isConnected) {
        previousFocus.focus();
    }

    previousFocus = null;
}

// =====================================
// 회원 탈퇴 API 호출
// =====================================

async function confirmDeleteAccount() {
    if (!deleteModal || deletingAccount) {
        return;
    }

    deletingAccount = true;

    const cancelBtn =
        deleteModal.querySelector(
            '[data-act="modal-cancel"]'
        );

    const confirmBtn =
        deleteModal.querySelector(
            '[data-act="modal-confirm"]'
        );

    const errorMessage =
        deleteModal.querySelector("#deleteModalError");

    cancelBtn.disabled = true;
    confirmBtn.disabled = true;

    confirmBtn.textContent = "탈퇴 처리 중...";

    errorMessage.hidden = true;
    errorMessage.textContent = "";

    let accountDeleted = false;

    try {
        await deleteUserAccount();

        accountDeleted = true;

        deleteModal.remove();
        deleteModal = null;

        document.body.classList.remove("modal-open");

        previousFocus = null;

        await logout();

        window.location.replace("index.html");

    } catch (error) {
        console.error("회원 탈퇴 처리 실패:", error);

        if (accountDeleted) {
            window.location.replace("login.html");
            return;
        }

        handleApiError(error, "회원 탈퇴");

        errorMessage.textContent =
            `회원 탈퇴 실패: ${
                error?.message || "알 수 없는 오류"
            }`;

        errorMessage.hidden = false;

        cancelBtn.disabled = false;
        confirmBtn.disabled = false;

        confirmBtn.textContent = "탈퇴하기";
        confirmBtn.focus();

    } finally {
        deletingAccount = false;
    }
}

// =====================================
// 모달 키보드 동작
// =====================================

document.addEventListener("keydown", (event) => {
    if (!deleteModal) {
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteModal();
        return;
    }

    if (event.key !== "Tab") {
        return;
    }

    const buttons = [
        ...deleteModal.querySelectorAll(
            "button:not(:disabled)"
        )
    ];

    if (buttons.length === 0) {
        event.preventDefault();
        return;
    }

    const first = buttons[0];
    const last = buttons[buttons.length - 1];

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
// 회원 탈퇴 버튼
// =====================================

deleteAccountBtn.addEventListener("click", () => {
    openDeleteModal();
});

// =====================================
// 프로필 페이지 초기화
// =====================================

async function initializeProfile() {
    profileReady = false;
    genresReady = false;

    saveNicknameBtn.disabled = true;
    saveGenresBtn.disabled = true;
    deleteAccountBtn.disabled = true;

    const user = await getLoginUser();

    if (!user) {
        window.location.replace("login.html");
        return;
    }

    await Promise.all([
        loadProfile(),
        loadGenres()
    ]);

    deleteAccountBtn.disabled = false;

    updateNicknameButton();
    updateGenresButton();
}

initializeProfile();
