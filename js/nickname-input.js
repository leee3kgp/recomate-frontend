
// =====================================
// 닉네임 길이 제한 (서버와 같은 실제 글자 수 기준)
// =====================================

export const NICKNAME_MAX_LENGTH = 20;

// maxlength는 UTF-16 단위라 이모지를 2자로 세므로, 실제 글자 수로 잘라냄
// 한글 조합 중에는 자르지 않고 조합이 끝난 뒤 확인함
export function limitNicknameLength(input, maxLength = NICKNAME_MAX_LENGTH) {

    if (!input) return;

    const trimToLimit = () => {
        const characters = [...input.value];

        if (characters.length <= maxLength) return;

        input.value = characters.slice(0, maxLength).join("");

        // 잘린 값으로 저장 버튼 상태 등을 다시 계산하도록 알림
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    input.addEventListener("input", (event) => {
        if (!event.isComposing) trimToLimit();
    });

    input.addEventListener("compositionend", trimToLimit);
}
