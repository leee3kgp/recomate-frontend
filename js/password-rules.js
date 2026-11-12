
// =====================================
// 비밀번호 조건 (Cognito User Pool 정책과 같은 기준)
// =====================================

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

// Cognito가 특수문자로 인정하는 문자: ASCII 기호 32개와 공백
// 한글·이모지·탭·전각 기호는 특수문자로 세지 않음
const SYMBOL_PATTERN = /[!-/:-@[-`{-~ ]/;

// Cognito는 앞뒤의 공백·탭·줄바꿈을 허용하지 않음 (가운데 공백은 허용)
const EDGE_WHITESPACE_PATTERN = /^[ \t\n\v\f\r]|[ \t\n\v\f\r]$/;

export function getPasswordChecks(password) {
    return {
        // 최소 길이는 UTF-16 단위(이모지 2자), 최대 길이는 실제 글자 수로 셈
        length: password.length >= PASSWORD_MIN_LENGTH,
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        symbol: SYMBOL_PATTERN.test(password)
    };
}

export function hasEdgeWhitespace(password) {
    return EDGE_WHITESPACE_PATTERN.test(password);
}

export function isTooLong(password) {
    return [...password].length > PASSWORD_MAX_LENGTH;
}

export function isValidPassword(password) {
    return (
        Object.values(getPasswordChecks(password)).every(Boolean) &&
        !hasEdgeWhitespace(password) &&
        !isTooLong(password)
    );
}

// 조건 표시만으로 알 수 없는 문제를 안내 (없으면 빈 문자열)
export function getPasswordProblem(password) {
    if (hasEdgeWhitespace(password)) {
        return "비밀번호 앞뒤에는 공백을 넣을 수 없습니다.";
    }

    if (isTooLong(password)) {
        return `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하로 입력해주세요.`;
    }

    return "";
}

export const PASSWORD_RULE_MESSAGE =
    "비밀번호는 12자 이상이며 소문자, 숫자, 특수문자(!@#$ 같은 키보드 기호)를 각각 1개 이상 포함해야 합니다.";
