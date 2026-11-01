import { getCurrentUser } from "aws-amplify/auth";

import { apiFetch } from "./api.js";

const HISTORY_LIMIT = 5;

const historyContent = document.getElementById("historyContent");

const showMessage = (text) => {
    const message = document.createElement("p");
    message.className = "history-message";
    message.textContent = text;
    historyContent.replaceChildren(message);
};

const showLoginGuide = () => {
    const message = document.createElement("p");
    message.className = "history-message";
    message.textContent = "로그인하면 지난 추천 결과를 다시 볼 수 있습니다.";

    const link = document.createElement("a");
    link.className = "history-login";
    link.href = "login.html";
    link.textContent = "로그인하기";

    historyContent.replaceChildren(message, link);
};

const formatDate = (createdAt) => {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
        return "날짜 정보 없음";
    }

    return date.toLocaleString("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short"
    });
};

const createHistoryItem = (session) => {
    const item = document.createElement("li");

    const link = document.createElement("a");
    link.className = "history-link";
    link.href = `result.html?sessionId=${encodeURIComponent(session.sessionId)}&count=${encodeURIComponent(session.participantCount)}`;

    const date = document.createElement("span");
    date.textContent = formatDate(session.createdAt);

    const count = document.createElement("span");
    count.className = "history-count";
    count.textContent = `${session.participantCount}명`;

    link.append(date, count);
    item.appendChild(link);
    return item;
};

const renderHistory = (sessions) => {
    if (sessions.length === 0) {
        showMessage("아직 추천 기록이 없습니다.");
        return;
    }

    const list = document.createElement("ul");
    list.className = "history-list";
    sessions.forEach((session) => list.appendChild(createHistoryItem(session)));
    historyContent.replaceChildren(list);
};

const isLoggedIn = async () => {
    try {
        await getCurrentUser();
        return true;
    } catch {
        return false;
    }
};

// GET /api/sessions
const loadHistory = async () => {
    if (!(await isLoggedIn())) {
        showLoginGuide();
        return;
    }

    showMessage("추천 기록을 불러오는 중입니다...");

    try {
        const data = await apiFetch(`/api/sessions?limit=${HISTORY_LIMIT}`);
        renderHistory(data.sessions);
    } catch (error) {
        console.error("추천 기록 조회 실패:", error);

        if (error.name === "AuthSessionError") {
            showLoginGuide();
            return;
        }

        showMessage("추천 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
};

loadHistory();
