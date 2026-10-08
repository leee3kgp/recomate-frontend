
import "./cognito-config.js";

import {
    confirmSignUp,
    resendSignUpCode
} from "aws-amplify/auth";

// ================================
// HTML 요소
// ================================

const verifyForm = document.getElementById("verifyForm");
const codeInput = document.getElementById("verificationCode");

const verifyButton = document.getElementById("verifyButton");
const resendButton = document.getElementById("resendButton");

const emailText = document.getElementById("verificationEmail");
const verifyMessage = document.getElementById("verifyMessage");

// ================================
// 회원가입 이메일 가져오기
// ================================

const email = sessionStorage.getItem("pendingSignupEmail");

if (!email) {
    alert("인증할 이메일 정보가 없습니다. 회원가입부터 진행해주세요.");
    window.location.replace("signup.html");
} else {
    emailText.textContent = email;
}

// ================================
// 메시지 표시
// ================================

function showMessage(message, success = false) {
    verifyMessage.textContent = message;
    verifyMessage.className =
        "password-message " + (success ? "success" : "error");
}

// ================================
// 이메일 인증
// ================================

verifyForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    if (!email) return;

    const code = codeInput.value.trim();

    if (!/^\d{6}$/.test(code)) {
        showMessage("6자리 인증번호를 입력해주세요.");
        return;
    }

    verifyButton.disabled = true;
    verifyButton.textContent = "인증 중...";

    try {

        const result = await confirmSignUp({
            username: email,
            confirmationCode: code
        });

        if (result.isSignUpComplete) {

            sessionStorage.removeItem("pendingSignupEmail");

            alert("이메일 인증이 완료되었습니다.");

            window.location.href = "login.html";

        } else {

            showMessage("추가 인증 단계가 필요합니다.");
        }

    } catch (error) {

        console.error("이메일 인증 오류:", error);

        switch (error.name) {

            case "CodeMismatchException":
                showMessage("인증번호가 일치하지 않습니다.");
                break;

            case "ExpiredCodeException":
                showMessage("인증번호가 만료되었습니다. 재발송해주세요.");
                break;

            case "LimitExceededException":
            case "TooManyRequestsException":
                showMessage("요청 횟수가 초과되었습니다. 잠시 후 다시 시도해주세요.");
                break;

            default:
                showMessage("이메일 인증에 실패했습니다.");
        }

    } finally {

        verifyButton.disabled = false;
        verifyButton.textContent = "이메일 인증하기";
    }
});

// ================================
// 인증번호 재발송
// ================================

resendButton.addEventListener("click", async function () {

    if (!email) return;

    resendButton.disabled = true;

    try {

        await resendSignUpCode({
            username: email
        });

        showMessage(
            "인증번호가 다시 발송되었습니다.",
            true
        );

    } catch (error) {

        console.error("인증번호 재발송 오류:", error);

        showMessage("인증번호 재발송에 실패했습니다.");

    } finally {

        resendButton.disabled = false;
    }
});
