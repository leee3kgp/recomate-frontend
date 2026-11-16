
import "./cognito-config.js";

import {
    signUp,
    confirmSignUp,
    resendSignUpCode,
    autoSignIn,
    fetchAuthSession,
    getCurrentUser
} from "aws-amplify/auth";

import {
    NICKNAME_MAX_LENGTH
} from "./nickname-input.js";

import {
    getPasswordChecks,
    getPasswordProblem,
    isValidPassword
} from "./password-rules.js";

// =====================================
// 회원가입 HTML 요소
// =====================================

const signupStep = document.getElementById("signup-step");
const verificationStep = document.getElementById("verification-step");

const form = document.getElementById("signupForm");

const nickname = document.getElementById("nickname");
const emailInput = document.getElementById("userId");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("passwordConfirm");

const agreeAll = document.getElementById("agreeAll");
const agreeTerms = document.getElementById("agreeTerms");
const agreePrivacy = document.getElementById("agreePrivacy");
const agreeAge = document.getElementById("agreeAge");

const signupButton = document.getElementById("signupButton");
const signupMessage = document.getElementById("signupMessage");

const fields = [
    ["nickname", "f-nickname", nickname],
    ["email", "f-email", emailInput],
    ["password", "f-password", password],
    ["confirm", "f-confirm", confirmPassword],
    ["agree", "f-agree", null]
];

const shown = {
    nickname: false,
    email: false,
    password: false,
    confirm: false,
    agree: false
};

let submitting = false;
let emailTaken = false;
let pendingEmail = "";

// =====================================
// 인증 HTML 요소
// =====================================

const verifyForm = document.getElementById("inline-verify-form");
const otpInputs = Array.from(
    document.querySelectorAll("#signup-otp input")
);

const verifyButton =
    document.getElementById("inline-verify-button");

const verifyMessage =
    document.getElementById("inline-verify-message");

const resendButton =
    document.getElementById("inline-resend");

const maskedEmail =
    document.getElementById("masked-email");

// =====================================
// 인증 상태
// =====================================

const RESEND_SECONDS = 30;

let resendRemaining = 0;
let resendTimer = null;

let isVerifying = false;
let isResending = false;
let verificationComplete = false;

// =====================================
// 비밀번호 보기
// =====================================

const eyeIcon = `
<svg viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
    <circle cx="12" cy="12" r="3"/>
</svg>`;

const eyeOffIcon = `
<svg viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2"
     stroke-linecap="round">
    <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.1 6.1C3.5 7.9 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1"/>
</svg>`;

document.querySelectorAll("[data-toggle-password]")
    .forEach((button) => {
        button.innerHTML = eyeIcon;

        button.addEventListener("click", () => {
            const input = document.getElementById(
                button.dataset.togglePassword
            );

            const visible = input.type === "password";

            input.type = visible ? "text" : "password";
            button.innerHTML = visible ? eyeOffIcon : eyeIcon;
        });
    });

// =====================================
// 닉네임 검사
// =====================================

function nicknameLength(value) {
    return Array.from(value.trim()).length;
}

function updateNicknameCount() {
    document.getElementById("nickname-count").textContent =
        `${nicknameLength(nickname.value)} / ${NICKNAME_MAX_LENGTH}`;
}

nickname.addEventListener("input", (event) => {
    if (!event.isComposing) {
        nickname.value = Array.from(nickname.value)
            .slice(0, NICKNAME_MAX_LENGTH)
            .join("");
    }

    updateNicknameCount();
    paint();
});

nickname.addEventListener("compositionend", () => {
    nickname.value = Array.from(nickname.value)
        .slice(0, NICKNAME_MAX_LENGTH)
        .join("");

    updateNicknameCount();
    paint();
});

// =====================================
// 비밀번호 검사
// =====================================

function updatePasswordRules() {
    const checks = getPasswordChecks(password.value);

    const rules = {
        length: checks.length,
        lower: checks.lowercase,
        number: checks.number,
        symbol: checks.symbol
    };

    Object.entries(rules).forEach(([name, valid]) => {
        const element = document.querySelector(
            `[data-rule="${name}"]`
        );

        if (element) {
            element.classList.toggle("ok", Boolean(valid));
        }
    });
}

// =====================================
// 약관 동의
// =====================================

const agreements = [
    agreeTerms,
    agreePrivacy,
    agreeAge
];

function allAgreed() {
    return agreements.every((item) => item.checked);
}

agreeAll.addEventListener("change", () => {
    agreements.forEach((item) => {
        item.checked = agreeAll.checked;
    });

    paint();
});

agreements.forEach((item) => {
    item.addEventListener("change", () => {
        agreeAll.checked = allAgreed();
        paint();
    });
});

// =====================================
// 회원가입 유효성 검사
// =====================================

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function checks() {
    return {
        nickname:
            nicknameLength(nickname.value) >= 1 &&
            nicknameLength(nickname.value) <= NICKNAME_MAX_LENGTH,

        email:
            validEmail(emailInput.value.trim()) &&
            !emailTaken,

        password:
            isValidPassword(password.value),

        confirm:
            confirmPassword.value !== "" &&
            confirmPassword.value === password.value,

        agree:
            allAgreed()
    };
}

function paint() {
    const valid = checks();

    updateNicknameCount();
    updatePasswordRules();

    fields.forEach(([name, id, input]) => {
        const container = document.getElementById(id);
        const invalid = shown[name] && !valid[name];

        container.classList.toggle("invalid", invalid);

        if (input) {
            input.setAttribute(
                "aria-invalid",
                String(Boolean(invalid))
            );
        }
    });

    document.getElementById("f-nickname")
        .classList.toggle(
            "valid",
            shown.nickname && valid.nickname
        );

    return valid;
}

fields.forEach(([name, , input]) => {
    if (!input) return;

    input.addEventListener("blur", () => {
        shown[name] = true;
        paint();
    });

    if (input !== nickname) {
        input.addEventListener("input", paint);
    }
});

emailInput.addEventListener("input", () => {
    emailTaken = false;

    document.getElementById("email-error").textContent =
        "올바른 이메일 주소를 입력해주세요.";

    paint();
});

// =====================================
// 회원가입 메시지
// =====================================

function showSignupMessage(message) {
    signupMessage.textContent = message;
    signupMessage.hidden = !message;
}

function getSignupError(error) {
    switch (error.name) {
        case "UsernameExistsException":
            return "이미 가입된 이메일입니다.";

        case "InvalidPasswordException":
            return "비밀번호가 보안 규칙에 맞지 않습니다.";

        case "InvalidParameterException":
            return "입력한 회원가입 정보를 확인해주세요.";

        case "LimitExceededException":
        case "TooManyRequestsException":
            return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        default:
            return "회원가입에 실패했습니다. 다시 시도해주세요.";
    }
}

// =====================================
// 이메일 마스킹
// =====================================

function maskEmail(address) {
    const [local, domain] = address.split("@");

    if (!local || !domain) return address;

    const visibleCount = local.length > 2 ? 2 : 1;

    return (
        local.slice(0, visibleCount) +
        "*".repeat(Math.max(1, local.length - visibleCount)) +
        "@" +
        domain
    );
}

// =====================================
// 회원가입 단계 전환
// =====================================

function showVerificationStep() {
    maskedEmail.textContent = maskEmail(pendingEmail);

    signupStep.hidden = true;
    verificationStep.hidden = false;

    document.title = "이메일 인증 | RecoMate";

    // 비밀번호는 인증 화면에서 더 이상 표시하지 않음
    password.value = "";
    confirmPassword.value = "";

    window.scrollTo(0, 0);

    startResendTimer();
    otpInputs[0].focus();
}

// =====================================
// 회원가입
// =====================================

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitting) return;

    showSignupMessage("");

    Object.keys(shown).forEach((key) => {
        shown[key] = true;
    });

    const valid = paint();

    const firstInvalid = fields.find(
        ([name]) => !valid[name]
    );

    if (firstInvalid) {
        const [name, , input] = firstInvalid;

        if (name === "password") {
            document.getElementById("password-error").textContent =
                getPasswordProblem(password.value) ||
                "위 조건을 모두 채워주세요.";
        }

        if (name === "agree") {
            agreements.find((item) => !item.checked)?.focus();
        } else {
            input.focus();
        }

        return;
    }

    const emailValue = emailInput.value.trim();

    submitting = true;
    signupButton.disabled = true;
    signupButton.textContent = "인증번호 보내는 중";

    try {
        const result = await signUp({
            username: emailValue,
            password: password.value,

            options: {
                userAttributes: {
                    email: emailValue,
                    nickname: nickname.value.trim()
                },

                autoSignIn: true
            }
        });

        pendingEmail = emailValue;

        if (result.nextStep?.signUpStep === "CONFIRM_SIGN_UP") {
            sessionStorage.setItem(
                "pendingSignupEmail",
                pendingEmail
            );

            showVerificationStep();
            return;
        }

        if (result.isSignUpComplete) {
            await completeAutoLogin();
            return;
        }

        showSignupMessage("추가 회원가입 단계가 필요합니다.");

    } catch (error) {
        console.error("회원가입 오류:", error);

        if (error.name === "UsernameExistsException") {
            emailTaken = true;

            document.getElementById("email-error").textContent =
                "이미 가입된 이메일입니다.";

            paint();
        }

        showSignupMessage(getSignupError(error));

    } finally {
        submitting = false;
        signupButton.disabled = false;
        signupButton.textContent = "인증번호 받고 계속하기";
    }
});

// =====================================
// 인증번호 입력
// =====================================

function getCode() {
    return otpInputs.map((input) => input.value).join("");
}

function updateVerifyButton() {
    verifyButton.disabled =
        isVerifying ||
        verificationComplete ||
        !/^\d{6}$/.test(getCode());
}

function clearCode() {
    otpInputs.forEach((input) => {
        input.value = "";
    });

    otpInputs[0].focus();
    updateVerifyButton();
}

function fillCode(value, startIndex = 0) {
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

    otpInputs[nextIndex].focus();
    updateVerifyButton();
}

otpInputs.forEach((input, index) => {

    input.addEventListener("input", () => {
        if (isVerifying || verificationComplete) return;

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
            event.preventDefault();

            if (input.value) {
                input.value = "";
            } else if (index > 0) {
                otpInputs[index - 1].value = "";
                otpInputs[index - 1].focus();
            }

            updateVerifyButton();
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

        const digits = event.clipboardData
            .getData("text")
            .replace(/\D/g, "")
            .slice(0, 6);

        if (!digits) return;

        if (digits.length === 6) {
            otpInputs.forEach((box) => {
                box.value = "";
            });

            fillCode(digits, 0);
        } else {
            fillCode(digits, index);
        }
    });

    input.addEventListener("focus", () => {
        input.select();
    });
});

// =====================================
// 인증 메시지
// =====================================

function showVerifyMessage(message, type = "default") {
    verifyMessage.textContent = message;

    verifyMessage.className =
        "verification-status " +
        (type === "default" ? "muted" : type);
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

function startResendTimer() {
    stopResendTimer();

    resendRemaining = RESEND_SECONDS;
    updateResendButton();

    const endTime = Date.now() + RESEND_SECONDS * 1000;

    resendTimer = setInterval(() => {
        resendRemaining = Math.max(
            0,
            Math.ceil((endTime - Date.now()) / 1000)
        );

        updateResendButton();

        if (resendRemaining === 0) {
            stopResendTimer();
        }
    }, 250);
}

// =====================================
// 인증번호 재발송
// =====================================

resendButton.addEventListener("click", async () => {
    if (
        !pendingEmail ||
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
            username: pendingEmail
        });

        clearCode();

        showVerifyMessage(
            "인증번호가 다시 발송되었습니다.",
            "success"
        );

        isResending = false;
        startResendTimer();

    } catch (error) {
        console.error("인증번호 재발송 오류:", error);

        isResending = false;
        updateResendButton();

        showVerifyMessage(
            error.name === "LimitExceededException" ||
            error.name === "TooManyRequestsException"
                ? "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                : "인증번호 재발송에 실패했습니다.",
            "error"
        );
    }
});

// =====================================
// 로그인 세션 확인
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
        console.warn("세션 확인 실패:", error);
        return false;
    }
}

// =====================================
// 인증 완료 후 자동 로그인
// =====================================

async function completeAutoLogin() {
    showVerifyMessage(
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
            "자동 로그인 추가 단계:",
            result.nextStep?.signInStep
        );

    } catch (error) {
        console.warn("자동 로그인 오류:", error);
    }

    // 자동 로그인이 불가능하면 인증 완료 상태를 유지하고
    // 일반 로그인 페이지로 안내
    sessionStorage.removeItem("pendingSignupEmail");

    alert(
        "이메일 인증이 완료되었습니다. 로그인해주세요."
    );

    window.location.replace("login.html");
}

// =====================================
// 이메일 인증 오류
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
            return "가입 정보를 찾을 수 없습니다.";

        case "NotAuthorizedException":
            return "이미 인증되었거나 인증할 수 없는 계정입니다.";

        default:
            return "이메일 인증에 실패했습니다.";
    }
}

// =====================================
// 이메일 인증
// =====================================

verifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (
        !pendingEmail ||
        isVerifying ||
        verificationComplete
    ) {
        return;
    }

    const code = getCode();

    if (!/^\d{6}$/.test(code)) {
        showVerifyMessage(
            "6자리 인증번호를 입력해주세요.",
            "error"
        );
        return;
    }

    isVerifying = true;

    verifyButton.disabled = true;
    verifyButton.classList.add("is-loading");
    verifyButton.textContent = "확인 중";

    try {
        const result = await confirmSignUp({
            username: pendingEmail,
            confirmationCode: code
        });

        if (result.isSignUpComplete) {
            verificationComplete = true;

            stopResendTimer();
            updateResendButton();

            otpInputs.forEach((input) => {
                input.disabled = true;
            });

            await completeAutoLogin();
            return;
        }

        showVerifyMessage(
            "추가 인증 단계가 필요합니다.",
            "error"
        );

    } catch (error) {
        console.error("이메일 인증 오류:", error);

        showVerifyMessage(
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
// 초기화
// =====================================

updateNicknameCount();
updatePasswordRules();
paint();
updateVerifyButton();
updateResendButton();

window.addEventListener("pagehide", stopResendTimer);
