
import "./cognito-config.js";

import { signUp } from "aws-amplify/auth";

// ================================
// HTML 요소
// ================================

const signupForm = document.getElementById("signupForm");

const nicknameInput = document.getElementById("nickname");
const userIdInput = document.getElementById("userId");

const passwordInput = document.getElementById("password");
const passwordConfirmInput =
    document.getElementById("passwordConfirm");

const passwordWarning =
    document.getElementById("passwordWarning");

const passwordMessage =
    document.getElementById("passwordMessage");

const signupMessage =
    document.getElementById("signupMessage");

const signupButton =
    document.getElementById("signupButton");

// 조건 표시 요소
const ruleLength = document.getElementById("ruleLength");
const ruleLowercase = document.getElementById("ruleLowercase");
const ruleNumber = document.getElementById("ruleNumber");
const ruleSpecial = document.getElementById("ruleSpecial");

// ================================
// 이메일 검사
// ================================

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ================================
// 비밀번호 조건 검사
// ================================

function getPasswordRules(password) {

    return {
        length: password.length >= 12,
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9\s]/.test(password)
    };
}

function isValidPassword(password) {

    const rules = getPasswordRules(password);

    return (
        rules.length &&
        rules.lowercase &&
        rules.number &&
        rules.special
    );
}

// ================================
// 비밀번호 조건 표시
// ================================

function updateRule(element, valid, text, hasInput) {

    if (valid) {

        element.textContent = "✓ " + text;
        element.className = "password-rule valid";

    } else {

        element.textContent = "○ " + text;

        element.className =
            "password-rule" +
            (hasInput ? " invalid" : "");
    }
}

// ================================
// 비밀번호 실시간 검사
// ================================

function checkPassword() {

    const password = passwordInput.value;

    const rules = getPasswordRules(password);

    const hasInput = password.length > 0;

    updateRule(
        ruleLength,
        rules.length,
        "12자 이상",
        hasInput
    );

    updateRule(
        ruleLowercase,
        rules.lowercase,
        "소문자 포함",
        hasInput
    );

    updateRule(
        ruleNumber,
        rules.number,
        "숫자 포함",
        hasInput
    );

    updateRule(
        ruleSpecial,
        rules.special,
        "특수문자 포함",
        hasInput
    );

    // 아무것도 입력하지 않은 경우
    if (!hasInput) {
        passwordWarning.textContent = "";
        return;
    }

    // 조건 미충족
    if (!isValidPassword(password)) {

        passwordWarning.textContent =
            "비밀번호는 12자 이상이며 소문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다.";

    } else {

        passwordWarning.textContent = "";
    }
}

// ================================
// 비밀번호 일치 검사
// ================================

function checkPasswordMatch() {

    const password = passwordInput.value;
    const confirm = passwordConfirmInput.value;

    if (confirm === "") {

        passwordMessage.textContent = "";
        passwordMessage.className = "password-message";
        return;
    }

    if (password === confirm) {

        passwordMessage.textContent =
            "비밀번호가 일치합니다.";

        passwordMessage.className =
            "password-message success";

    } else {

        passwordMessage.textContent =
            "비밀번호가 일치하지 않습니다.";

        passwordMessage.className =
            "password-message error";
    }
}

// ================================
// 입력 이벤트
// ================================

passwordInput.addEventListener("input", function () {

    checkPassword();
    checkPasswordMatch();

});

passwordConfirmInput.addEventListener(
    "input",
    checkPasswordMatch
);

// 초기 상태
checkPassword();

// ================================
// Cognito 회원가입
// ================================

signupForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const nickname = nicknameInput.value.trim();
        const email = userIdInput.value.trim();

        const password = passwordInput.value;
        const confirm = passwordConfirmInput.value;

        signupMessage.textContent = "";
        signupMessage.className = "signup-message";

        // 빈칸 검사
        if (!nickname || !email || !password || !confirm) {

            alert("모든 항목을 입력해주세요.");
            return;
        }

        // 이메일 검사
        if (!isValidEmail(email)) {

            alert("올바른 이메일 주소를 입력해주세요.");
            return;
        }

        // 비밀번호 조건 검사
        if (!isValidPassword(password)) {

            checkPassword();

            passwordWarning.textContent =
                "비밀번호 조건을 모두 충족해야 회원가입할 수 있습니다.";

            passwordInput.focus();
            return;
        }

        // 비밀번호 일치 검사
        if (password !== confirm) {

            passwordMessage.textContent =
                "비밀번호가 일치하지 않습니다.";

            passwordMessage.className =
                "password-message error";

            passwordConfirmInput.focus();
            return;
        }

        signupButton.disabled = true;
        signupButton.textContent = "회원가입 처리 중...";

        try {

            // AWS Cognito 회원가입
            const result = await signUp({

                username: email,

                password: password,

                options: {
                    userAttributes: {
                        email: email,
                        nickname: nickname
                    },
                    autoSignIn: false
                }

            });

            // 이메일 인증 필요
            if (
                result.nextStep?.signUpStep ===
                "CONFIRM_SIGN_UP"
            ) {

                sessionStorage.setItem(
                    "pendingSignupEmail",
                    email
                );

                alert(
                    "이메일로 인증번호가 발송되었습니다."
                );

                window.location.href =
                    "verify-email.html";

            }

            // 회원가입 완료
            else if (result.isSignUpComplete) {

                alert("회원가입이 완료되었습니다.");

                window.location.href =
                    "login.html";

            }

            else {

                signupMessage.textContent =
                    "추가 회원가입 단계가 필요합니다.";

                signupMessage.className =
                    "signup-message error";
            }

        } catch (error) {

            console.error("Cognito 회원가입 오류:", error);

            let message = "회원가입에 실패했습니다.";

            switch (error.name) {

                case "UsernameExistsException":

                    message = "이미 가입된 이메일입니다.";
                    break;

                case "InvalidPasswordException":

                    message =
                        "비밀번호가 Cognito 보안 규칙에 맞지 않습니다.";
                    break;

                case "InvalidParameterException":

                    message =
                        "회원가입 정보를 확인해주세요.";
                    break;

                case "LimitExceededException":
                case "TooManyRequestsException":

                    message =
                        "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
                    break;

                case "CodeDeliveryFailureException":

                    message =
                        "인증 이메일 발송에 실패했습니다.";
                    break;

                default:

                    message =
                        "회원가입에 실패했습니다. (" +
                        (error.name || "UnknownError") +
                        ")";
            }

            signupMessage.textContent = message;
            signupMessage.className = "signup-message error";

        } finally {

            signupButton.disabled = false;
            signupButton.textContent = "아이디 생성하기";
        }
    }
);
