
import "./cognito-config.js";

import {
    confirmSignUp,
    resendSignUpCode
} from "aws-amplify/auth";

// =====================================
// HTML 요소
// =====================================

const verifyForm = document.getElementById("verifyForm");
const codeInput = document.getElementById("verificationCode");

const verifyButton = document.getElementById("verifyButton");
const resendButton = document.getElementById("resendButton");

const emailText = document.getElementById("verificationEmail");
const verifyMessage = document.getElementById("verifyMessage");

// =====================================
// 기본 설정 - 30초 타이머
// =====================================

const RESEND_SECONDS = 30;

let resendRemaining = RESEND_SECONDS;
let resendTimer = null;
let isResending = false;
let isVerifying = false;
let verificationComplete = false;

// =====================================
// 회원가입 이메일 가져오기
// =====================================

const email = sessionStorage.getItem("pendingSignupEmail");

function maskEmail(address) {

    const [local, domain] = address.split("@");

    if (!local || !domain) {
        return address;
    }

    const visible = local.slice(0, 1);

    return (
        visible +
        "*".repeat(Math.max(3, local.length - 1)) +
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

// =====================================
// 메시지 표시
// =====================================

function showMessage(message, success = false) {

    verifyMessage.textContent = message;

    verifyMessage.className =
        "password-message " +
        (success ? "success" : "error");
}

// =====================================
// 인증번호 입력 상태 확인
// =====================================

function updateVerifyButton() {

    if (verificationComplete || isVerifying) {

        verifyButton.disabled = true;
        return;
    }

    const code = codeInput.value.trim();

    verifyButton.disabled = !/^\d{6}$/.test(code);
}

codeInput.addEventListener(
    "input",
    updateVerifyButton
);

// =====================================
// 재전송 타이머 화면 갱신
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
            `${resendRemaining}초 후 재전송`;

    } else {

        resendButton.disabled = false;

        resendButton.textContent =
            "인증번호 재전송";
    }
}

// =====================================
// 재전송 타이머 정지
// =====================================

function stopResendTimer() {

    if (resendTimer !== null) {

        clearInterval(resendTimer);
        resendTimer = null;
    }
}

// =====================================
// 30초 재전송 타이머 시작
// =====================================

function startResendTimer() {

    stopResendTimer();

    resendRemaining = RESEND_SECONDS;

    updateResendButton();

    const endTime =
        Date.now() + RESEND_SECONDS * 1000;

    resendTimer = setInterval(() => {

        const millisecondsLeft =
            endTime - Date.now();

        resendRemaining = Math.max(
            0,
            Math.ceil(millisecondsLeft / 1000)
        );

        updateResendButton();

        if (resendRemaining <= 0) {

            stopResendTimer();
        }

    }, 250);
}

// =====================================
// 이메일 인증
// =====================================

verifyForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        if (
            !email ||
            isVerifying ||
            verificationComplete
        ) {
            return;
        }

        const code = codeInput.value.trim();

        if (!/^\d{6}$/.test(code)) {

            showMessage(
                "6자리 인증번호를 입력해주세요."
            );

            return;
        }

        isVerifying = true;

        verifyButton.disabled = true;
        verifyButton.textContent = "인증 중...";

        try {

            const result = await confirmSignUp({
                username: email,
                confirmationCode: code
            });

            if (result.isSignUpComplete) {

                verificationComplete = true;

                stopResendTimer();
                updateResendButton();

                sessionStorage.removeItem(
                    "pendingSignupEmail"
                );

                showMessage(
                    "이메일 인증이 완료되었습니다.",
                    true
                );

                verifyButton.textContent =
                    "인증 완료";

                alert(
                    "이메일 인증이 완료되었습니다."
                );

                window.location.href =
                    "login.html";

            } else {

                showMessage(
                    "추가 인증 단계가 필요합니다."
                );
            }

        } catch (error) {

            console.error(
                "이메일 인증 오류:",
                error
            );

            switch (error.name) {

                case "CodeMismatchException":

                    showMessage(
                        "인증번호가 일치하지 않습니다."
                    );
                    break;

                case "ExpiredCodeException":

                    showMessage(
                        "인증번호가 만료되었습니다. 재발송해주세요."
                    );
                    break;

                case "LimitExceededException":
                case "TooManyRequestsException":

                    showMessage(
                        "요청 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요."
                    );
                    break;

                default:

                    showMessage(
                        "이메일 인증에 실패했습니다."
                    );
            }

        } finally {

            isVerifying = false;

            if (!verificationComplete) {

                verifyButton.textContent =
                    "회원가입 하기";

                updateVerifyButton();
            }
        }
    }
);

// =====================================
// 인증번호 재발송
// =====================================

resendButton.addEventListener(
    "click",
    async function () {

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

            showMessage(
                "인증번호가 다시 발송되었습니다.",
                true
            );

            isResending = false;

            // 재발송 성공 후 30초 타이머 재시작
            startResendTimer();

        } catch (error) {

            console.error(
                "인증번호 재발송 오류:",
                error
            );

            switch (error.name) {

                case "LimitExceededException":
                case "TooManyRequestsException":

                    showMessage(
                        "재발송 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                    );
                    break;

                default:

                    showMessage(
                        "인증번호 재발송에 실패했습니다."
                    );
            }

            isResending = false;

            updateResendButton();
        }
    }
);

// =====================================
// 페이지 시작
// =====================================

updateVerifyButton();

if (email) {
    startResendTimer();
}

// =====================================
// 페이지 종료 시 타이머 정리
// =====================================

window.addEventListener(
    "pagehide",
    stopResendTimer
);
