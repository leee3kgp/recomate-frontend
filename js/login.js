
import "./cognito-config.js";

import {
    signIn,
    fetchAuthSession,
    getCurrentUser
} from "aws-amplify/auth";

// =====================================
// HTML 요소 가져오기
// =====================================

const loginForm = document.getElementById("loginForm");
const userIdInput = document.getElementById("userId");
const passwordInput = document.getElementById("password");

const loginButton = document.getElementById("loginButton");
const loginMessage = document.getElementById("loginMessage");

// =====================================
// 메시지 출력
// =====================================

function showMessage(message, success = false) {

    loginMessage.textContent = message;

    loginMessage.style.color =
        success ? "green" : "red";
}

// =====================================
// 로그인 성공 처리
// =====================================

function showLoginSuccess(user) {

    showMessage(
        "이미 로그인된 상태입니다.",
        true
    );

    console.log("현재 로그인 사용자:", user.username);

    // 메인 페이지가 완성되면 이동 처리
    // window.location.href = "/pages/main.html";
}

// =====================================
// 기존 로그인 세션 확인
// =====================================

async function checkLoginSession() {

    try {

        // 현재 로그인된 사용자 확인
        const user = await getCurrentUser();

        // Cognito 인증 세션 확인
        const session = await fetchAuthSession();

        const idToken =
            session.tokens?.idToken?.toString();

        const accessToken =
            session.tokens?.accessToken?.toString();

        // 기존 로그인 상태가 유효한 경우
        if (user && idToken && accessToken) {

            console.log("기존 로그인 세션 확인 성공");
            console.log("사용자:", user.username);
            console.log("ID Token 존재:", true);
            console.log("Access Token 존재:", true);

            showLoginSuccess(user);

            return true;
        }

    } catch (error) {

        // 로그인하지 않은 경우 정상적으로 발생 가능
        console.log("기존 로그인 세션 없음");
    }

    return false;
}

// =====================================
// 페이지 로딩 시 로그인 상태 확인
// =====================================

checkLoginSession();

// =====================================
// 로그인 버튼 클릭
// =====================================

loginForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const email = userIdInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {

            showMessage(
                "이메일과 비밀번호를 입력해주세요."
            );

            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "로그인 중...";

        try {

            // 1. 기존 로그인 세션 확인
            const alreadyLoggedIn =
                await checkLoginSession();

            if (alreadyLoggedIn) {

                // 이미 로그인 상태라면 재로그인 방지
                return;
            }

            // 2. Cognito SRP 로그인
            const result = await signIn({

                username: email,
                password: password,

                options: {
                    authFlowType: "USER_SRP_AUTH"
                }

            });

            // 3. 로그인 성공
            if (result.isSignedIn) {

                const session =
                    await fetchAuthSession();

                const idToken =
                    session.tokens?.idToken?.toString();

                const accessToken =
                    session.tokens?.accessToken?.toString();

                if (!idToken || !accessToken) {

                    throw new Error(
                        "JWT 토큰 발급 확인 실패"
                    );
                }

                const user = await getCurrentUser();

                console.log("Cognito 로그인 성공");
                console.log("사용자 ID:", user.userId);

                console.log(
                    "ID Token 발급:",
                    Boolean(idToken)
                );

                console.log(
                    "Access Token 발급:",
                    Boolean(accessToken)
                );

                showMessage(
                    "로그인에 성공했습니다.",
                    true
                );

                passwordInput.value = "";

                // 메인 페이지 완성 후 이동 처리
                // window.location.href = "/pages/main.html";

            } else {

                const step =
                    result.nextStep?.signInStep;

                if (step === "CONFIRM_SIGN_UP") {

                    sessionStorage.setItem(
                        "pendingSignupEmail",
                        email
                    );

                    window.location.href =
                        "verify-email.html";

                } else {

                    showMessage(
                        "추가 인증 단계가 필요합니다: " +
                        (step || "Unknown")
                    );
                }
            }

        } catch (error) {

            console.error(
                "Cognito 로그인 오류:",
                error
            );

            switch (error.name) {

                case "UserAlreadyAuthenticatedException":

                    await checkLoginSession();
                    break;

                case "NotAuthorizedException":
                case "UserNotFoundException":

                    showMessage(
                        "이메일 또는 비밀번호가 올바르지 않습니다."
                    );

                    break;

                case "UserNotConfirmedException":

                    sessionStorage.setItem(
                        "pendingSignupEmail",
                        email
                    );

                    window.location.href =
                        "verify-email.html";

                    break;

                case "LimitExceededException":
                case "TooManyRequestsException":

                    showMessage(
                        "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                    );

                    break;

                default:

                    showMessage(
                        "로그인에 실패했습니다. 잠시 후 다시 시도해주세요."
                    );
            }

        } finally {

            loginButton.disabled = false;
            loginButton.textContent = "로그인하기";
        }
    }
);
