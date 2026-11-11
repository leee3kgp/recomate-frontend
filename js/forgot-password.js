
import "./cognito-config.js";

import {
    resetPassword
} from "aws-amplify/auth";

// =====================================
// HTML 요소 가져오기
// =====================================

const emailForm = document.getElementById("email-form");
const emailInput = document.getElementById("email");
const emailField = document.getElementById("f-email");
const sendButton = document.getElementById("send-btn");
const messageElement = document.getElementById(
    "forgotPasswordMessage"
);

// =====================================
// 메시지 출력
// =====================================

function showMessage(message, success = false) {
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.style.color = success
        ? "#52c788"
        : "#ff7777";
}

// =====================================
// 이메일 유효성 검사
// =====================================

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =====================================
// 인증번호 발송
// =====================================

if (emailForm && emailInput && sendButton) {

    emailForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();

        const valid = isValidEmail(email);

        emailField?.classList.toggle("invalid", !valid);

        if (!valid) {
            emailInput.focus();
            return;
        }

        sendButton.disabled = true;
        sendButton.textContent = "보내는 중";
        showMessage("");

        try {
            // AWS Cognito 비밀번호 재설정 요청
            const result = await resetPassword({
                username: email
            });

            const step = result.nextStep?.resetPasswordStep;

            if (
                step === "CONFIRM_RESET_PASSWORD_WITH_CODE"
            ) {
                // 다음 페이지에서 사용할 이메일 저장
                sessionStorage.setItem(
                    "pendingResetEmail",
                    email
                );

                // 기존 비밀번호 변경 화면으로 이동
                window.location.href = "reset-password.html";

                return;
            }

            if (step === "DONE") {
                showMessage(
                    "비밀번호 재설정 요청이 완료되었습니다.",
                    true
                );
                return;
            }

            showMessage(
                "비밀번호 재설정 단계를 확인해주세요."
            );

        } catch (error) {
            console.error(
                "비밀번호 재설정 요청 오류:",
                error
            );

            switch (error.name) {

                case "LimitExceededException":
                case "TooManyRequestsException":
                    showMessage(
                        "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                    );
                    break;

                case "InvalidParameterException":
                case "InvalidEmailRoleAccessPolicyException":
                    showMessage(
                        "인증번호를 보낼 수 없습니다. 잠시 후 다시 시도해주세요."
                    );
                    break;

                case "UserNotFoundException":
                    // 계정 존재 여부 노출 방지
                    showMessage(
                        "요청을 처리했습니다. 이메일을 확인해주세요.",
                        true
                    );
                    break;

                default:
                    showMessage(
                        "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요."
                    );
                    break;
            }

        } finally {
            sendButton.disabled = false;
            sendButton.textContent = "인증번호 받기";
        }
    });
}
