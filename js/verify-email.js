
import "./cognito-config.js";

import {
    confirmSignUp,
    resendSignUpCode,
    autoSignIn,
    fetchAuthSession,
    getCurrentUser
} from "aws-amplify/auth";

// =====================================
// HTML 요소
// =====================================

const verifyForm = document.getElementById("verify-form");
const otpContainer = document.getElementById("otp");

const otpInputs = Array.from(
    otpContainer.querySelectorAll("input")
);

const verifyButton = document.getElementById("verify-btn");
const resendButton = document.getElementById("resend");

const emailText = document.getElementById("masked-email");
const verifyMessage = document.getElementById("otp-msg");
const fromLogin = document.getElementById("from-login");

// =====================================
// 기본 설정
// =====================================

const RESEND_SECONDS = 30;
const DEFAULT_MESSAGE = "인증번호는 24시간 동안 쓸 수 있어요.";

let resendRemaining = RESEND_SECONDS;
let resendTimer = null;

let isResending = false;
let isVerifying = false;
let verificationComplete = false;

// =====================================
// 이메일 가져오기
// =====================================

const params = new URLSearchParams(window.location.search);

const email =
    sessionStorage.getItem("pendingSignupEmail") ||
    params.get("email") ||
    "";

if (email) {
    sessionStorage.setItem("pendingSignupEmail", email);
}

function maskEmail(address) {
    const [local, domain] = address.split("@");

    if (!local || !domain) {
        return address;
    }

    const visibleCount = local.length > 2 ? 2 : 1;

    return (
        local.slice(0, visibleCount) +
        "*".repeat(Math.max(1, local.length - visibleCount)) +
        "@" +
        domain
    );
}

if (!email) {
    alert(
        "인증할 이메일 정보가 없습니다. 회원가입부터 진행해주세요."
    );

    window.location.replace("signup.html");
} else {
    emailText.textContent = maskEmail(email);
}

fromLogin.hidden = params.get("from") !== "login";

// =====================================
// 메시지
// =====================================

function showMessage(message, type = "default") {
    verifyMessage.textContent = message;

    verifyMessage.className =
        type === "default" ? "muted" : "";

    verifyMessage.style.color = "";

    if (type === "error") {
        verifyMessage.style.color = "var(--danger)";
    }

    if (type === "success") {
        verifyMessage.style.color =
            "var(--success, #65d38c)";
    }
}

// =====================================
// OTP 입력값
// =====================================

function getCode() {
    return otpInputs.map((input) => input.value).join("");
}

function updateVerifyButton() {
    const code = getCode();

    verifyButton.disabled =
        verificationComplete ||
        isVerifying ||
        !/^\d{6}$/.test(code);
}

// =====================================
// OTP 여러 칸 채우기
// =====================================

function fillCode(value, startIndex = 0) {
    const digits = String(value)
        .replace(/\D/g, "")
        .slice(0, otpInputs.length - startIndex);

    if (!digits) return;

    digits.split("").forEach((digit, index) => {
        otpInputs[startIndex + index].value = digit;
    });

    const nextIndex = startIndex + digits.length;

    if (nextIndex < otpInputs.length) {
        otpInputs[nextIndex].focus();
    } else {
        otpInputs[otpInputs.length - 1].focus();
    }

    updateVerifyButton();
}

function clearCode() {
    otpInputs.forEach((input) => {
        input.value = "";
    });

    otpInputs[0].focus();
    updateVerifyButton();
}

// =====================================
// OTP 입력 이벤트
// =====================================

otpInputs.forEach((input, index) => {

    input.addEventListener("input", () => {
        if (verificationComplete || isVerifying) return;

        const digits = input.value.replace(/\D/g, "");

        if (digits.length > 1) {
            input.value = "";
            fillCode(digits, index);
            return;
        }

        input.value = digits;

        if (digits && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
        }

        updateVerifyButton();
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace") {
            if (input.value) {
                input.value = "";
                updateVerifyButton();
            } else if (index > 0) {
                otpInputs[index - 1].value = "";
                otpInputs[index - 1].focus();
                updateVerifyButton();
            }

            event.preventDefault();
        }

        if (event.key === "ArrowLeft" && index > 0) {
            event.preventDefault();
            otpInputs[index - 1].focus();
        }

        if (
            event.key === "ArrowRight" &&
            index < otpInputs.length - 1
        ) {
            event.preventDefault();
            otpInputs[index + 1].focus();
        }
    });

    input.addEventListener("paste", (event) => {
        event.preventDefault();

        const pasted = event.clipboardData
            .getData("text")
            .replace(/\D/g, "")
            .slice(0, 6);

        if (!pasted) return;

        if (pasted.length === 6) {
            otpInputs.forEach((box) => {
                box.value = "";
            });

            fillCode(pasted, 0);
        } else {
            fillCode(pasted, index);
        }
    });

    input.addEventListener("focus", () => {
        input.select();
    });
});

// =====================================
// 재발송 버튼 상태
// =====================================

function updateResendButton() {
    if (verificationComplete) {
        resendButton.disabled = true;
        resendButton.textContent = "인증 완료";
        return;
    }

    if (isResending) {
        resendButton.disabled = true;
        resendButton.textContent = "재전송 중...";
        return;
    }

    if (resendRemaining > 0) {
        resendButton.disabled = true;
        resendButton.textContent =
            `다시 받기 (${resendRemaining}초)`;
        return;
    }

    resendButton.disabled = false;
    resendButton.textContent = "인증번호 다시 받기";
}

// =====================================
// 재발송 타이머
// =====================================

function stopResendTimer() {
    if (resendTimer !== null) {
        clearInterval(resendTimer);
        resendTimer = null;
    }
}

function startResendTimer() {
    stopResendTimer();

    resendRemaining = RESEND_SECONDS;
    updateResendButton();

    const endTime = Date.now() + RESEND_SECONDS * 1000;

    resendTimer = setInterval(() => {
        const remaining = endTime - Date.now();

        resendRemaining = Math.max(
            0,
            Math.ceil(remaining / 1000)
        );

        updateResendButton();

        if (resendRemaining <= 0) {
            stopResendTimer();
        }
    }, 250);
}

// =====================================
// Cognito 오류 메시지
// =====================================

function getVerifyError(error) {
    switch (error.name) {
        case "CodeMismatchException":
            return "인증번호가 맞지 않아요. 다시 확인해주세요.";

        case "ExpiredCodeException":
            return "인증번호가 만료되었습니다. 다시 받아주세요.";

        case "LimitExceededException":
        case "TooManyRequestsException":
            return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        case "UserNotFoundException":
            return "가입 정보를 찾을 수 없습니다. 다시 회원가입해주세요.";

        case "NotAuthorizedException":
            return "이미 인증되었거나 인증할 수 없는 계정입니다.";

        default:
            return "이메일 인증에 실패했습니다.";
    }
}

function getResendError(error) {
    switch (error.name) {
        case "LimitExceededException":
        case "TooManyRequestsException":
            return "재발송 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        case "UserNotFoundException":
            return "가입 정보를 찾을 수 없습니다.";

        case "NotAuthorizedException":
            return "이미 인증이 완료되었거나 재발송할 수 없습니다.";

        default:
            return "인증번호 재발송에 실패했습니다.";
    }
}

// =====================================
// 인증 후 로그인 세션 확인
// =====================================

async function hasValidLoginSession() {
    try {
        const user = await getCurrentUser();
        const session = await fetchAuthSession();

        const idToken =
            session.tokens?.idToken?.toString();

        const accessToken =
            session.tokens?.accessToken?.toString();

        return Boolean(user && idToken && accessToken);

    } catch (error) {
        console.warn("로그인 세션 확인 실패:", error);
        return false;
    }
}

// =====================================
// 인증 성공 후 자동 로그인
// =====================================

async function completeSignUpLogin() {
    showMessage(
        "이메일 인증 완료! 자동 로그인 중입니다.",
        "success"
    );

    verifyButton.textContent = "로그인 중";

    try {
        const result = await autoSignIn();

        if (
            result.isSignedIn &&
            await hasValidLoginSession()
        ) {
            sessionStorage.removeItem("pendingSignupEmail");

            window.location.replace("index.html?welcome=1");
            return;
        }

        console.warn(
            "추가 로그인 단계:",
            result.nextStep?.signInStep
        );

    } catch (error) {
        console.warn(
            "Cognito 자동 로그인 불가:",
            error
        );
    }

    // 자동 로그인이 지원되지 않거나
    // 정상적인 로그인 세션이 생성되지 않은 경우
    sessionStorage.removeItem("pendingSignupEmail");

    alert(
        "이메일 인증이 완료되었습니다. 로그인해주세요."
    );

    window.location.replace("login.html");
}

// =====================================
// 이메일 인증
// =====================================

verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (
        !email ||
        isVerifying ||
        verificationComplete
    ) {
        return;
    }

    const code = getCode();

    if (!/^\d{6}$/.test(code)) {
        showMessage("6자리 인증번호를 입력해주세요.", "error");
        return;
    }

    isVerifying = true;

    verifyButton.disabled = true;
    verifyButton.classList.add("is-loading");
    verifyButton.textContent = "확인 중";

    try {
        const result = await confirmSignUp({
            username: email,
            confirmationCode: code
        });

        if (result.isSignUpComplete) {
            verificationComplete = true;

            stopResendTimer();
            updateResendButton();

            otpInputs.forEach((input) => {
                input.disabled = true;
            });

            await completeSignUpLogin();
            return;
        }

        showMessage(
            "추가 인증 단계가 필요합니다.",
            "error"
        );

    } catch (error) {
        console.error("이메일 인증 오류:", error);

        showMessage(
            getVerifyError(error),
            "error"
        );

        if (
            error.name === "CodeMismatchException" ||
            error.name === "ExpiredCodeException"
        ) {
            clearCode();
        }

    } finally {
        isVerifying = false;
        verifyButton.classList.remove("is-loading");

        if (!verificationComplete) {
            verifyButton.textContent = "인증하고 시작하기";
            updateVerifyButton();
        }
    }
});

// =====================================
// 인증번호 재발송
// =====================================

resendButton.addEventListener("click", async () => {
    if (
        !email ||
        isResending ||
        verificationComplete ||
        resendRemaining > 0
    ) {
        return;
    }

    isResending = true;
    updateResendButton();

    try {
        await resendSignUpCode({
            username: email
        });

        clearCode();

        showMessage(
            "인증번호가 다시 발송되었습니다.",
            "success"
        );

        isResending = false;
        startResendTimer();

    } catch (error) {
        console.error("인증번호 재발송 오류:", error);

        showMessage(
            getResendError(error),
            "error"
        );

        isResending = false;
        updateResendButton();
    }
});

// =====================================
// 초기화
// =====================================

showMessage(DEFAULT_MESSAGE);
updateVerifyButton();
updateResendButton();

if (email) {
    startResendTimer();
}

// =====================================
// 페이지 종료 시 타이머 정리
// =====================================

window.addEventListener("pagehide", stopResendTimer);
