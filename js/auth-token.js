import "./cognito-config.js";

import {
    fetchAuthSession,
    getCurrentUser,
    signOut,
    updatePassword
} from "aws-amplify/auth";

// ================================
// 로그인 사용자 확인
// ================================

export async function getLoginUser() {
    try {
        return await getCurrentUser();
    } catch {
        return null;
    }
}

// ================================
// ID Token 가져오기
// ================================

export async function getIdToken() {
    const session = await fetchAuthSession();

    const idToken =
        session.tokens?.idToken?.toString();

    if (!idToken) {
        throw new Error("ID Token이 없습니다.");
    }

    return idToken;
}

// ================================
// Access Token 가져오기
// ================================

export async function getAccessToken() {
    const session = await fetchAuthSession();

    const accessToken =
        session.tokens?.accessToken?.toString();

    if (!accessToken) {
        throw new Error("Access Token이 없습니다.");
    }

    return accessToken;
}

// ================================
// 강제 토큰 갱신
// ================================

export async function refreshTokens() {
    const session = await fetchAuthSession({
        forceRefresh: true
    });

    const idToken =
        session.tokens?.idToken?.toString();

    const accessToken =
        session.tokens?.accessToken?.toString();

    if (!idToken || !accessToken) {
        throw new Error("토큰 갱신에 실패했습니다.");
    }

    return {
        idToken,
        accessToken
    };
}

// ================================
// 인증이 필요한 API 요청
// ================================

export async function authFetch(url, options = {}) {
    const idToken = await getIdToken();

    const headers = new Headers(options.headers || {});

    headers.set(
        "Authorization",
        `Bearer ${idToken}`
    );

    return fetch(url, {
        ...options,
        headers
    });
}

// ================================
// 비밀번호 변경
// AWS Cognito / Amplify
// ================================

export async function changePassword(
    oldPassword,
    newPassword
) {
    if (!oldPassword || !newPassword) {
        throw new Error(
            "현재 비밀번호와 새 비밀번호를 입력해주세요."
        );
    }

    await updatePassword({
        oldPassword,
        newPassword
    });
}

// ================================
// 추천 결과 저장본 삭제
// ================================

export function clearStoredResults() {
    try {
        Object.keys(sessionStorage)
            .filter(
                (key) =>
                    key.startsWith("recomate:result:") ||
                    key.startsWith("recomate:excluded:") ||
                    key === "recomate:flow"
            )
            .forEach((key) => {
                sessionStorage.removeItem(key);
            });
    } catch {
        // 저장소 접근 실패는 무시
    }
}

// ================================
// 로그아웃
// redirect: false면 페이지 이동하지 않음
// 기존 logout() 호출은 로그인 화면으로 이동
// ================================

export async function logout(options = {}) {
    const { redirect = true } = options;

    clearStoredResults();

    await signOut();

    if (redirect) {
        window.location.href = "/pages/login.html";
    }
}