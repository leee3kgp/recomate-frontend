
/* =========================================
   RecoMate - 공통 토스트 알림
   Issue #45
========================================= */

const TOAST_DURATION = 3500;

// =====================================
// 토스트 영역 생성
// =====================================

function getToastZone() {
    let zone = document.getElementById("toast-zone");

    if (!zone) {
        zone = document.createElement("div");

        zone.id = "toast-zone";
        zone.className = "toast-zone";

        zone.setAttribute(
            "aria-label",
            "알림 메시지"
        );

        document.body.appendChild(zone);
    }

    return zone;
}

// =====================================
// 토스트 표시
// =====================================

export function showToast(
    message,
    type = "info",
    duration = TOAST_DURATION,
    options = {}
) {
    const { action } = options;
    const zone = getToastZone();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    toast.setAttribute(
        "role",
        type === "error" ? "alert" : "status"
    );

    const messageElement =
        document.createElement("span");

    messageElement.className = "toast-message";
    messageElement.textContent = String(message);

    // 액션(예: 되돌리기)이 있으면 시안처럼 닫기 대신 액션 버튼 하나만 표시
    const button =
        document.createElement("button");

    button.type = "button";

    if (action) {
        button.className = "toast-action";
        button.textContent = String(action.label);
    } else {
        button.className = "toast-close";
        button.textContent = "닫기";
        button.setAttribute(
            "aria-label",
            "알림 닫기"
        );
    }

    toast.appendChild(messageElement);
    toast.appendChild(button);

    zone.appendChild(toast);

    let timeoutId = null;

    function removeToast() {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        toast.remove();
    }

    button.addEventListener("click", () => {
        if (action && typeof action.onClick === "function") {
            action.onClick();
        }

        removeToast();
    });

    if (duration > 0) {
        timeoutId = setTimeout(
            removeToast,
            duration
        );
    }

    return toast;
}

// =====================================
// 알림 종류별 함수
// =====================================

export function toastSuccess(message) {
    return showToast(message, "success");
}

export function toastError(message) {
    return showToast(message, "error");
}

export function toastWarning(message) {
    return showToast(message, "warning");
}

export function toastInfo(message) {
    return showToast(message, "info");
}
