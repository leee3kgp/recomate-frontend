// =====================================
// 추천 흐름 상태 (이용방법 → 인원 선택 → 장르 선택)
// - 시안의 sessionStorage 'recomate-flow' 키와 같은 이름 사용
// - 페이지가 바뀌어도, 새로고침해도 탭이 열려 있는 동안 유지
// =====================================

const FLOW_KEY = "recomate-flow";

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 6;

// 허용 범위(2~6)의 정수인지 확인
export function isValidCount(value) {
    return Number.isInteger(value)
        && value >= MIN_PARTICIPANTS
        && value <= MAX_PARTICIPANTS;
}

function loadFlow() {
    try {
        const raw = sessionStorage.getItem(FLOW_KEY);
        const parsed = raw ? JSON.parse(raw) : null;

        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

// 저장된 인원 수 (없거나 잘못된 값이면 기본값 2명)
export function getFlowCount() {
    const { count } = loadFlow();

    return isValidCount(count) ? count : MIN_PARTICIPANTS;
}

// 인원 수 저장 (허용 범위를 벗어난 값은 저장하지 않음)
export function setFlowCount(count) {
    if (!isValidCount(count)) return;

    try {
        sessionStorage.setItem(
            FLOW_KEY,
            JSON.stringify({ ...loadFlow(), count })
        );
    } catch {
        /* 저장 실패는 무시 (URL 쿼리로도 인원 수를 전달함) */
    }
}
