
import "./cognito-config.js";

import {
    confirmResetPassword,
    resetPassword
} from "aws-amplify/auth";

// =====================================
// HTML 요소
// =====================================

const resetForm = document.getElementById("resetPasswordForm");
const otpContainer = document.getElementById("otp");
const otpInputs = Array.from(
    otpContainer?.querySelectorAll("input") || []
);

const passwordInput = document.getElementById("newPassword");
const confirmInput = document.getElementById("confirmPassword");
const confirmField = document.getElementById("confirmPasswordField");

const resetButton = document.getElementById("resetPasswordButton");
const resetMessage = document.getElementById("resetPasswordMessage");

const resendButton = document.getElementById("resendResetCode");
const togglePasswordButton = document.getElementById("toggleNewPassword");
const passwordRules = document.getElementById("passwordRules");

const sentTo = document.getElementById("sent-to");
const stepReset = document.getElementById("step-reset");
const stepDone = document.getElementById("step-done");
const resetAuthFoot = document.getElementById("resetAuthFoot");

// =====================================
// 재설정 대상 이메일
// =====================================

const email = sessionStorage.getItem("pendingResetEmail");

let isSubmitting = false;
let isResending = false;
let resendLocked = false;
let isComplete = false;

if (sentTo) {
    sentTo.textContent = email || "이메일";
}

// =====================================
// 메시지
// =====================================

function showMessage(message, success = false) {
    if (!resetMessage) return;

    resetMessage.textContent = message;
    resetMessage.style.color = success
        ? "#6cc08b"
        : "#e86a5f";
}

// =====================================
// 비밀번호 조건
// =====================================

function getPasswordChecks(password) {
    return {
        length: password.length >= 12,
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: /[^A-Za-z0-9]/.test(password)
    };
}

function isValidPassword(password) {
    return Object.values(
        getPasswordChecks(password)
    ).every(Boolean);
}

function updatePasswordRules() {
    if (!passwordRules || !passwordInput) return;

    const checks = getPasswordChecks(passwordInput.value);

    passwordRules.querySelectorAll("[data-rule]").forEach((item) => {
        const rule = item.dataset.rule;
        const valid = Boolean(checks[rule]);

        item.classList.toggle("valid", valid);
    });
}

// =====================================
// 인증번호 6자리 입력
// =====================================

function getOtpCode() {
    return otpInputs
        .map((input) => input.value)
        .join("");
}

function distributeOtp(value, startIndex = 0) {
    const digits = String(value)
        .replace(/\D/g, "")
        .slice(0, otpInputs.length - startIndex);

    if (!digits) return;

    digits.split("").forEach((digit, index) => {
        otpInputs[startIndex + index].value = digit;
    });

    const nextIndex = Math.min(
        startIndex + digits.length,
        otpInputs.length - 1
    );

    otpInputs[nextIndex]?.focus();
    updateFormState();
}

otpInputs.forEach((input, index) => {
    input.setAttribute("pattern", "[0-9]*");

    input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "");

        if (digits.length > 1) {
            input.value = "";
            distributeOtp(digits, index);
            return;
        }

        input.value = digits;

        if (digits && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
        }

        updateFormState();
    });

    input.addEventListener("keydown", (event) => {
        if (
            event.key === "Backspace" &&
            !input.value &&
            index > 0
        ) {
            otpInputs[index - 1].focus();
            otpInputs[index - 1].value = "";
            updateFormState();
        }

        if (
            event.key === "ArrowLeft" &&
            index > 0
        ) {
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
        const pasted = event.clipboardData?.getData("text") || "";
        const digits = pasted.replace(/\D/g, "");

        if (!digits) return;

        event.preventDefault();

        if (digits.length === otpInputs.length) {
            otpInputs.forEach((item) => {
                item.value = "";
            });

            distributeOtp(digits, 0);
        } else {
            distributeOtp(digits, index);
        }
    });
});

// =====================================
// 비밀번호 확인
// =====================================

function updateConfirmState() {
    if (!confirmField || !passwordInput || !confirmInput) {
        return;
    }

    const hasConfirmation = confirmInput.value.length > 0;
    const matches = passwordInput.value === confirmInput.value;

    confirmField.classList.toggle(
        "invalid",
        hasConfirmation && !matches
    );
}

// =====================================
// 변경 버튼 활성화
// =====================================

function updateFormState() {
    updatePasswordRules();
    updateConfirmState();

    if (!resetButton) return;

    const code = getOtpCode();
    const password = passwordInput?.value || "";
    const confirmation = confirmInput?.value || "";

    const codeValid = /^\d{6}$/.test(code);
    const passwordValid = isValidPassword(password);
    const passwordsMatch =
        confirmation.length > 0 &&
        password === confirmation;

    resetButton.disabled = !(
        email &&
        codeValid &&
        passwordValid &&
        passwordsMatch &&
        !isSubmitting &&
        !isComplete
    );
}

passwordInput?.addEventListener("input", updateFormState);
confirmInput?.addEventListener("input", updateFormState);

// =====================================
// 비밀번호 보기 / 숨기기
// =====================================

togglePasswordButton?.addEventListener("click", () => {
    if (!passwordInput) return;

    const isVisible = passwordInput.type === "text";

    passwordInput.type = isVisible
        ? "password"
        : "text";

    togglePasswordButton.setAttribute(
        "aria-pressed",
        String(!isVisible)
    );

    togglePasswordButton.setAttribute(
        "aria-label",
        isVisible ? "비밀번호 보기" : "비밀번호 숨기기"
    );
});

// =====================================
// 인증번호 다시 받기
// =====================================

function showResendError(error) {
    switch (error?.name) {
        case "LimitExceededException":
        case "TooManyRequestsException":
            showMessage(
                "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
            );
            break;

        case "InvalidParameterException":
            showMessage(
                "인증번호를 다시 요청할 수 없습니다. 처음부터 다시 진행해주세요."
            );
            break;

        default:
            showMessage(
                "인증번호 재발송에 실패했습니다. 잠시 후 다시 시도해주세요."
            );
    }
}

resendButton?.addEventListener("click", async () => {
    if (!email || isResending || resendLocked || isComplete) {
        return;
    }

    isResending = true;
    resendButton.disabled = true;
    resendButton.textContent = "발송 중...";
    showMessage("");

    try {
        const result = await resetPassword({
            username: email
        });

        const nextStep = result.nextStep?.resetPasswordStep;

        if (
            nextStep &&
            nextStep !== "CONFIRM_RESET_PASSWORD_WITH_CODE"
        ) {
            throw new Error(
                `예상하지 못한 인증 단계: ${nextStep}`
            );
        }

        otpInputs.forEach((input) => {
            input.value = "";
        });

        otpInputs[0]?.focus();
        updateFormState();

        showMessage(
            "인증번호를 다시 발송했습니다. 새로 받은 인증번호를 입력해주세요.",
            true
        );

        // 반복 발송을 막기 위한 클라이언트 측 제한
        resendLocked = true;

    } catch (error) {
        console.error("인증번호 재발송 오류:", error);
        showResendError(error);

    } finally {
        isResending = false;
        resendButton.textContent = "다시 받기";
        resendButton.disabled = resendLocked;
    }
});

// =====================================
// 비밀번호 변경 완료 화면
// =====================================

function showCompletionScreen() {
    isComplete = true;

    if (stepReset) {
        stepReset.hidden = true;
    }

    if (stepDone) {
        stepDone.hidden = false;
    }

    if (resetAuthFoot) {
        resetAuthFoot.hidden = true;
    }

    otpInputs.forEach((input) => {
        input.value = "";
    });

    if (passwordInput) {
        passwordInput.value = "";
    }

    if (confirmInput) {
        confirmInput.value = "";
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// =====================================
// Cognito 비밀번호 변경
// =====================================

resetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting || isComplete) {
        return;
    }

    if (!email) {
        showMessage(
            "재설정 요청 정보가 없습니다. 비밀번호 재설정을 다시 요청해주세요."
        );
        return;
    }

    const code = getOtpCode();
    const newPassword = passwordInput?.value || "";
    const confirmation = confirmInput?.value || "";

    if (!/^\d{6}$/.test(code)) {
        showMessage("인증번호 6자리를 입력해주세요.");
        otpInputs[0]?.focus();
        return;
    }

    if (!isValidPassword(newPassword)) {
        showMessage(
            "비밀번호는 12자 이상이며 소문자, 숫자, 특수문자를 포함해야 합니다."
        );
        passwordInput?.focus();
        return;
    }

    if (newPassword !== confirmation) {
        showMessage("비밀번호가 일치하지 않습니다.");
        confirmInput?.focus();
        return;
    }

    isSubmitting = true;
    resetButton.disabled = true;
    resetButton.textContent = "비밀번호 변경 중...";
    showMessage("");

    try {
        await confirmResetPassword({
            username: email,
            confirmationCode: code,
            newPassword
        });

        sessionStorage.removeItem("pendingResetEmail");

        showCompletionScreen();

    } catch (error) {
        console.error("비밀번호 변경 오류:", error);

        switch (error?.name) {
            case "CodeMismatchException":
                showMessage(
                    "인증번호가 올바르지 않습니다. 다시 확인해주세요."
                );
                break;

            case "ExpiredCodeException":
                showMessage(
                    "인증번호가 만료되었습니다. 인증번호를 다시 요청해주세요."
                );
                break;

            case "InvalidPasswordException":
                showMessage(
                    "비밀번호가 보안 조건을 충족하지 않습니다."
                );
                break;

            case "LimitExceededException":
            case "TooManyRequestsException":
                showMessage(
                    "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                );
                break;

            default:
                showMessage(
                    "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요."
                );
        }

    } finally {
        isSubmitting = false;

        if (!isComplete) {
            resetButton.textContent = "비밀번호 변경";
            updateFormState();
        }
    }
});

// =====================================
// 초기 화면 설정
// =====================================

if (!email) {
    showMessage(
        "비밀번호 재설정 요청 정보가 없습니다. 로그인 화면에서 다시 요청해주세요."
    );

    if (resendButton) {
        resendButton.disabled = true;
    }
}

updateFormState();
