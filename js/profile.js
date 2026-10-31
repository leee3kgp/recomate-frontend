
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

// =====================================
// 상태 관리
// =====================================

let availableGenres = [];
let selectedGenres = [];
let profileReady = false;
let genresReady = false;

// =====================================
// 메시지 출력
// =====================================

function showMessage(message) {
    profileMessage.textContent = message;
}

// =====================================
// API 오류 처리
// =====================================

function handleApiError(error, action) {
    console.error(`${action} 실패:`, error);

    if (error.code === "NICKNAME_REQUIRED") {
        showMessage(
            "닉네임 설정이 필요합니다. " +
            "닉네임을 입력하고 저장한 뒤 다시 시도해주세요."
        );

        userNickname.focus();
        return;
    }

    showMessage(`${action} 실패: ${error.message}`);
}

// =====================================
// 프로필 조회
// =====================================

async function loadProfile() {
    try {
        const profile = await getUserProfile();

        userEmail.value = profile.email ?? "";
        userNickname.value = profile.nickname ?? "";

        profileReady = true;
        showMessage("");

    } catch (error) {
        profileReady = false;
        handleApiError(error, "프로필 조회");
    }
}

// =====================================
// 닉네임 변경
// =====================================

nicknameForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nickname = userNickname.value.trim();

    if (
        nickname.length < 1 ||
        [...nickname].length > 20
    ) {
        showMessage("닉네임은 1~20자로 입력해주세요.");
        return;
    }

    saveNicknameBtn.disabled = true;

    try {
        const updatedProfile =
            await updateUserProfile(nickname);

        userNickname.value =
            updatedProfile?.nickname ?? nickname;

        if (updatedProfile?.email) {
            userEmail.value = updatedProfile.email;
        }

        profileReady = true;
        showMessage("닉네임이 변경되었습니다.");

        // 닉네임 문제로 장르 조회가 실패했다면 재시도
        if (!genresReady) {
            await loadGenres();
        }

    } catch (error) {
        handleApiError(error, "닉네임 수정");

    } finally {
        saveNicknameBtn.disabled = false;
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
            const name = item.name ?? item.displayName ?? code;

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
// 선호 장르 화면 표시
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
        label.className = "genre-item";

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

    saveGenresBtn.disabled = false;
}

// =====================================
// 전체 장르 및 내 선호 장르 조회
// =====================================

async function loadGenres() {
    genresReady = false;
    saveGenresBtn.disabled = true;

    genreList.textContent = "장르 목록을 불러오는 중입니다.";

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
        genreList.textContent =
            "장르 정보를 불러오지 못했습니다.";

        handleApiError(error, "장르 조회");
    }
}

// =====================================
// 선호 장르 저장
// =====================================

saveGenresBtn.addEventListener("click", async () => {
    if (!genresReady) {
        showMessage("장르 목록을 먼저 불러와주세요.");
        return;
    }

    const checkedGenres = [
        ...genreList.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ].map((input) => input.value);

    saveGenresBtn.disabled = true;

    try {
        await updateUserGenres(checkedGenres);

        selectedGenres = checkedGenres;

        showMessage("선호 장르가 저장되었습니다.");

    } catch (error) {
        handleApiError(error, "선호 장르 저장");

    } finally {
        saveGenresBtn.disabled = false;
    }
});

// =====================================
// 회원 탈퇴
// =====================================

deleteAccountBtn.addEventListener("click", async () => {
    const confirmed = window.confirm(
        "정말 회원 탈퇴하시겠습니까?\n" +
        "계정 및 관련 데이터가 삭제됩니다.\n" +
        "이 작업은 되돌릴 수 없습니다."
    );

    if (!confirmed) {
        return;
    }

    deleteAccountBtn.disabled = true;

    try {
        await deleteUserAccount();

        alert("회원 탈퇴가 완료되었습니다.");

        await logout();

    } catch (error) {
        handleApiError(error, "회원 탈퇴");
        deleteAccountBtn.disabled = false;
    }
});

// =====================================
// 프로필 페이지 초기화
// =====================================

async function initializeProfile() {
    saveNicknameBtn.disabled = true;
    saveGenresBtn.disabled = true;
    deleteAccountBtn.disabled = true;

    const user = await getLoginUser();

    if (!user) {
        window.location.replace("login.html");
        return;
    }

    saveNicknameBtn.disabled = false;

    await Promise.all([
        loadProfile(),
        loadGenres()
    ]);

    deleteAccountBtn.disabled = false;
}

initializeProfile();
