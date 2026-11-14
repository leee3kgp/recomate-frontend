// =====================================
// 추천 흐름 상태 (인원 · 이름 · 옵션 · 참여자별 선택)
// start.html 에서 정한 값을 select.html 로 넘기고, 새로고침해도 이어가도록
// sessionStorage 한 곳에 저장
//
//   {
//     count, names[], ott[], excludeWatched,      ← start.html (1단계)
//     participants: [{ index, name, genres[], want[], avoid[] }],   ← select.html (2단계)
//     prefilled                                    ← 프로필 선호 장르를 미리 골라뒀는지
//   }
// 서버로 보내는 값(index, genres)과 화면용 값(name, want, avoid, ott …)을 구분해 둠
// =====================================

const FLOW_KEY = "recomate:flow";

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 6;
export const NAME_MAX_LENGTH = 10;

export function isValidCount(value) {
    return Number.isInteger(value)
        && value >= MIN_PARTICIPANTS
        && value <= MAX_PARTICIPANTS;
}

// 이름은 글자(이모지 포함) 기준으로 자름
export function limitName(value) {
    return Array.from(value).slice(0, NAME_MAX_LENGTH).join("");
}

export function getFlow() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(FLOW_KEY));

        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

// 일부 값만 덮어쓰기. 저장소를 쓸 수 없으면 false
export function patchFlow(patch) {
    try {
        sessionStorage.setItem(FLOW_KEY, JSON.stringify({ ...getFlow(), ...patch }));
        return true;
    } catch {
        return false;
    }
}

export function clearFlow() {
    try {
        sessionStorage.removeItem(FLOW_KEY);
    } catch {
        /* 무시 */
    }
}

export function getFlowCount() {
    const { count } = getFlow();

    return isValidCount(count) ? count : MIN_PARTICIPANTS;
}

const strings = (value) => (
    Array.isArray(value) ? value.filter((item) => typeof item === "string") : []
);

// 인원 수와 이름으로 참여자 목록 만들기 (이름이 비면 "참여자 N")
export function createParticipants(count, names = []) {
    return Array.from({ length: count }, (_, i) => ({
        index: i + 1,
        name: limitName(String(names[i] ?? "").trim()) || `참여자 ${i + 1}`,
        genres: [],
        want: [],
        avoid: []
    }));
}

// 저장된 참여자 선택값을 읽음. 없거나 형식이 맞지 않으면 null
export function getParticipants() {
    const { participants } = getFlow();

    if (!Array.isArray(participants) || !isValidCount(participants.length)) {
        return null;
    }

    return participants.map((p, i) => ({
        index: i + 1,
        name: typeof p?.name === "string" && p.name ? p.name : `참여자 ${i + 1}`,
        genres: strings(p?.genres),
        want: strings(p?.want),
        avoid: strings(p?.avoid)
    }));
}

// ---------- 결과 화면용 이름 ----------
// 결과 화면이 참여자 이름을 보여주도록 추천 요청이 성공한 뒤 이름을 따로 저장
// 키가 "recomate:result:"로 시작해 로그아웃 때 clearStoredResults()가 함께 지움
// key: 회원은 sessionId, 비회원은 "guest"

export const RESULT_NAMES_PREFIX = "recomate:result:names:";

export function saveResultNames(key, names) {
    try {
        sessionStorage.setItem(RESULT_NAMES_PREFIX + key, JSON.stringify(names));
    } catch {
        /* 저장 실패 시 결과 화면은 "참여자 N"으로 표시 */
    }
}

export function loadResultNames(key) {
    try {
        const names = JSON.parse(sessionStorage.getItem(RESULT_NAMES_PREFIX + key));

        return Array.isArray(names) ? names.map((name) => String(name ?? "")) : [];
    } catch {
        return [];
    }
}
