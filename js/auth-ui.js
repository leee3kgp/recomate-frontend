
import "./cognito-config.js";

import {
    getCurrentUser,
    fetchAuthSession,
    signOut
} from "aws-amplify/auth";

import { clearStoredResults } from "./auth-token.js";

// =====================================
// HTML 요소 가져오기
// =====================================

const authButton = document.getElementById("authButton");

// =====================================
// 로그인 상태 변수
// =====================================

let isLoggedIn = false;

// =====================================
// 로그아웃 상태 UI
// =====================================

function showLoggedOutUI() {

    if (!authButton) return;

    isLoggedIn = false;

    // 시안에 맞춰 sign-in 표시
    authButton.textContent = "sign-in";
    authButton.href = "login.html";

    authButton.style.visibility = "visible";
    authButton.style.pointerEvents = "auto";
}

// =====================================
// 로그인 상태 UI
// =====================================

function showLoggedInUI() {

    if (!authButton) return;

    isLoggedIn = true;

    // 로그인 상태에서는 로그아웃 표시
    authButton.textContent = "sign-out";
    authButton.removeAttribute("href");

    authButton.style.visibility = "visible";
    authButton.style.pointerEvents = "auto";
}

// =====================================
// 로그인 세션 확인
// =====================================

async function checkAuthSession() {

    if (!authButton) return;

    // 세션 확인 중 버튼 숨기기
    authButton.style.visibility = "hidden";
    authButton.style.pointerEvents = "none";

    try {

        // Cognito 사용자 확인
        const user = await getCurrentUser();

        // JWT 세션 확인 및 자동 갱신 시도
        const session = await fetchAuthSession();

        const idToken =
            session.tokens?.idToken?.toString();

        const accessToken =
            session.tokens?.accessToken?.toString();

        if (!user || !idToken || !accessToken) {
            throw new Error("유효한 로그인 세션 없음");
        }

        showLoggedInUI();

    } catch {

        // 로그인하지 않은 정상 상태도 여기로 오므로 기록하지 않음
        showLoggedOutUI();
    }
}

// =====================================
// 로그인 / 로그아웃 버튼 클릭
// =====================================

if (authButton) {

    authButton.addEventListener("click", async (event) => {

        // 로그아웃 상태에서는 로그인 페이지 이동
        if (!isLoggedIn) {
            return;
        }

        event.preventDefault();

        // 중복 클릭 방지
        authButton.style.pointerEvents = "none";
        authButton.textContent = "signing out...";

        try {

            // 이전 계정의 추천 결과 저장본 삭제 후 Cognito 로그아웃
            clearStoredResults();

            await signOut();

            isLoggedIn = false;

            // 로그인 페이지로 이동
            window.location.replace("login.html");

        } catch (error) {

            console.error("로그아웃 실패:", error);

            alert("로그아웃에 실패했습니다.");

            authButton.textContent = "sign-out";
            authButton.style.pointerEvents = "auto";
        }
    });
}

// =====================================
// 페이지 로딩 시 로그인 상태 확인
// =====================================

checkAuthSession();
