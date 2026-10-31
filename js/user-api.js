
import {
    getIdToken,
    refreshTokens
} from "./auth-token.js";

// =====================================
// API Gateway 기본 주소
// =====================================

const API_BASE_URL =
    "https://rdjkqhp2el.execute-api.ap-southeast-2.amazonaws.com/dev";

// =====================================
// 사용자 API 공통 요청 함수
// =====================================

async function userApiRequest(path, options = {}) {

    async function sendRequest(token) {

        const headers = new Headers(options.headers || {});

        headers.set(
            "Authorization",
            `Bearer ${token}`
        );

        if (options.body !== undefined) {
            headers.set(
                "Content-Type",
                "application/json"
            );
        }

        return fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers
        });
    }

    // 현재 ID Token 가져오기
    const idToken = await getIdToken();

    let response = await sendRequest(idToken);

    // 인증 만료 시 토큰 갱신 후 재요청
    if (response.status === 401) {

        const refreshed = await refreshTokens();

        response = await sendRequest(
            refreshed.idToken
        );
    }

    // 오류 처리
    if (!response.ok) {

        let errorData = null;

        try {
            errorData = await response.json();
        } catch (error) {
            console.error("오류 응답 파싱 실패:", error);
        }

        const message =
            errorData?.error?.message ||
            `API 요청 실패 (${response.status})`;

        const apiError = new Error(message);

        apiError.status = response.status;
        apiError.code = errorData?.error?.code;

        throw apiError;
    }

    // 응답 본문이 없는 경우
    if (response.status === 204) {
        return null;
    }

    const text = await response.text();

    return text ? JSON.parse(text) : null;
}

// =====================================
// 1. 내 프로필 조회
// GET /api/users/me
// =====================================

export async function getUserProfile() {

    return userApiRequest("/api/users/me", {
        method: "GET"
    });
}

// =====================================
// 2. 닉네임 변경
// PATCH /api/users/me
// =====================================

export async function updateUserProfile(nickname) {

    return userApiRequest("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({
            nickname
        })
    });
}

// =====================================
// 3. 회원 탈퇴
// DELETE /api/users/me
// =====================================

export async function deleteUserAccount() {

    return userApiRequest("/api/users/me", {
        method: "DELETE"
    });
}

// =====================================
// 4. 내 선호 장르 조회
// GET /api/users/me/genres
// =====================================

export async function getUserGenres() {

    return userApiRequest("/api/users/me/genres", {
        method: "GET"
    });
}

// =====================================
// 5. 내 선호 장르 변경
// PUT /api/users/me/genres
// =====================================

export async function updateUserGenres(genres) {

    return userApiRequest("/api/users/me/genres", {
        method: "PUT",
        body: JSON.stringify({
            genres
        })
    });
}

// =====================================
// 6. 전체 장르 목록 조회
// GET /api/genres
// =====================================

export async function getAllGenres() {

    return userApiRequest("/api/genres", {
        method: "GET"
    });
}
