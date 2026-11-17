import { isLoggedIn } from "./api.js";

// =====================================
// 로그인 안내 모달 (비회원이 로그인 전용 기능을 눌렀을 때)
//   - 페이지 전체를 막는 api.js의 requireLogin()과 달리, 지금 화면에 머문 채 모달로 안내
//   - 로그인·회원가입으로 갈 때 돌아올 주소를 같은 탭 sessionStorage에 저장하고,
//     login.js가 로그인 성공 후 takeReturnTo()로 꺼내 그 화면으로 돌려보냄
//   스타일: css/login-gate.css
// =====================================

const RETURN_TO_KEY = "recomate:returnTo";

// 오래된 주소로 엉뚱하게 돌아가지 않도록 저장 후 30분까지만 사용
const RETURN_TO_TTL_MS = 30 * 60 * 1000;

const DEFAULT_TITLE = "로그인이 필요해요";

let dialog;
let opener;

// 같은 사이트의 주소만 허용 (다른 사이트로 보내는 open redirect 방지)
function sameOriginPath(raw) {
    try {
        const url = new URL(raw, window.location.origin);

        if (url.origin !== window.location.origin) return null;

        return url.pathname + url.search + url.hash;
    } catch {
        return null;
    }
}

function rememberReturnTo(returnTo) {
    const path = sameOriginPath(returnTo);

    if (!path) return;

    try {
        sessionStorage.setItem(RETURN_TO_KEY, JSON.stringify({ path, at: Date.now() }));
    } catch {
        // 저장소를 쓸 수 없으면 로그인 후 기본 화면(홈)으로 이동
    }
}

/**
 * 로그인 안내에서 저장한 돌아갈 주소를 꺼내고 지운다 (한 번만 사용).
 * 없거나 30분이 지났거나 다른 사이트 주소면 null.
 */
export function takeReturnTo() {
    try {
        const raw = sessionStorage.getItem(RETURN_TO_KEY);

        sessionStorage.removeItem(RETURN_TO_KEY);

        if (!raw) return null;

        const { path, at } = JSON.parse(raw);

        if (typeof at !== "number" || Date.now() - at > RETURN_TO_TTL_MS) return null;

        return sameOriginPath(path);
    } catch {
        return null;
    }
}

function buildDialog() {
    const node = document.createElement("dialog");

    node.className = "login-gate";
    node.setAttribute("aria-labelledby", "login-gate-title");
    node.setAttribute("aria-describedby", "login-gate-reason");
    node.innerHTML = `
        <div class="login-gate__panel">
            <h2 class="login-gate__title" id="login-gate-title"></h2>
            <p class="login-gate__reason" id="login-gate-reason"></p>
            <div class="login-gate__actions">
                <a class="btn btn-primary" data-gate="login" href="login.html">로그인</a>
                <a class="btn btn-outline" data-gate="signup" href="signup.html">회원가입</a>
                <button class="btn btn-ghost" type="button" data-gate="close">닫기</button>
            </div>
        </div>`;

    // 바깥(어두운 배경)을 누르면 닫기. 패널 안쪽 클릭은 무시
    node.addEventListener("click", (event) => {
        if (event.target === node) node.close();
    });

    node.querySelector('[data-gate="close"]').addEventListener("click", () => node.close());

    // ESC로 닫혀도 여기로 들어옴: 원래 누른 버튼으로 포커스를 돌려줌
    node.addEventListener("close", () => {
        document.body.classList.remove("login-gate-open");

        if (opener && document.contains(opener)) opener.focus();

        opener = null;
    });

    document.body.append(node);

    return node;
}

/**
 * 로그인 안내 모달을 연다.
 * @param {object} options
 * @param {string} [options.title]    제목 (기본 "로그인이 필요해요")
 * @param {string} options.reason     로그인하면 할 수 있는 것 한 줄
 * @param {string} [options.returnTo] 로그인 후 돌아올 주소 (기본: 지금 화면)
 */
export function openLoginGate({ title = DEFAULT_TITLE, reason, returnTo = window.location.href } = {}) {
    dialog ??= buildDialog();

    if (dialog.open) return;

    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    dialog.querySelector(".login-gate__title").textContent = title;
    dialog.querySelector(".login-gate__reason").textContent = reason || "";

    // 로그인·회원가입 링크를 누르는 순간에만 돌아올 주소를 저장 (닫기만 하면 저장하지 않음)
    for (const link of dialog.querySelectorAll('[data-gate="login"], [data-gate="signup"]')) {
        link.onclick = () => rememberReturnTo(returnTo);
    }

    document.body.classList.add("login-gate-open");
    dialog.showModal();

    // 주 버튼(로그인)에 포커스
    dialog.querySelector('[data-gate="login"]').focus();
}

/**
 * 로그인했으면 next()를 실행하고, 아니면 로그인 안내 모달을 연다.
 * 버튼 하나만 로그인 전용으로 막을 때 사용 (페이지 전체는 requireLogin 사용).
 */
export async function withLogin(next, options) {
    if (await isLoggedIn()) return next();

    openLoginGate(options);

    return undefined;
}
