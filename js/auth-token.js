
import "./cognito-config.js";

import {
    fetchAuthSession,
    getCurrentUser,
    signOut
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
// 만료 시 Amplify 자동 갱신 시도
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

    // 요청 직전 최신 ID Token 가져오기
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
// 추천 결과 저장본 삭제
// ================================

// result.js가 저장한 결과(recomate:result:{userId}:{sessionId}, 비회원 recomate:result:guest:*)와
// "이미 봤어요" 횟수(recomate:excluded:{userId}:{sessionId})를 지움
export function clearStoredResults() {

    try {
        Object.keys(sessionStorage)
            .filter((key) => key.startsWith("recomate:result:") || key.startsWith("recomate:excluded:"))
            .forEach((key) => sessionStorage.removeItem(key));
    } catch {
        /* 저장소 접근 실패는 무시 */
    }
}

// ================================
// 로그아웃
// ================================

export async function logout() {

    // 탈퇴로 계정이 먼저 삭제돼 signOut이 실패해도 저장본은 지움
    clearStoredResults();

    await signOut();

    window.location.href = "/pages/login.html";
}
