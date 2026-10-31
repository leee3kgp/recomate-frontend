import "./cognito-config.js";

import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

// 배포 시 .env.production 에 VITE_API_BASE_URL 지정 (개발 중에는 빈 값 + vite proxy)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const LOGIN_PAGE = "login.html";

// ================================
// 로그인 필수 페이지 가드
// ================================

export async function requireLogin() {
    try {
        await getCurrentUser();
        const session = await fetchAuthSession();

        if (!session.tokens?.idToken) {
            throw new Error("NO_ID_TOKEN");
        }
    } catch {
        window.location.replace(LOGIN_PAGE);
        // 이후 코드가 실행되지 않도록 대기
        return new Promise(() => {});
    }
}

async function getIdToken(forceRefresh = false) {
    const session = await fetchAuthSession({ forceRefresh });
    const idToken = session.tokens?.idToken?.toString();

    if (!idToken) {
        const error = new Error("인증 세션이 만료되었습니다. 다시 로그인해주세요.");
        error.name = "AuthSessionError";
        throw error;
    }

    return idToken;
}

// ================================
// 백엔드 호출 공통 함수
// - ID Token을 Authorization: Bearer 로 전달
// - 401이면 강제 갱신 후 "한 번만" 재요청 (명세 5.5)
// - 에러 응답({ error: { code, message } })을 ApiError로 변환
// ================================

export class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

async function send(path, options, forceRefresh) {
    const idToken = await getIdToken(forceRefresh);

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${idToken}`);

    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

export async function apiFetch(path, options = {}) {
    let response = await send(path, options, false);

    if (response.status === 401) {
        try {
            response = await send(path, options, true);
        } catch {
            window.location.replace(LOGIN_PAGE);
            return new Promise(() => {});
        }

        if (response.status === 401) {
            window.location.replace(LOGIN_PAGE);
            return new Promise(() => {});
        }
    }

    if (!response.ok) {
        // 게이트웨이 오류(502 등)는 JSON이 아닐 수 있음
        let code = "UNKNOWN_ERROR";
        let message = `요청에 실패했습니다. (HTTP ${response.status})`;

        try {
            const body = await response.json();
            code = body?.error?.code || code;
            message = body?.error?.message || message;
        } catch {
            /* JSON 아님 */
        }

        throw new ApiError(response.status, code, message);
    }

    return response.json();
}
