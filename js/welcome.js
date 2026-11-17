/* =========================================
   가입 직후 환영 배너 (pages/index.html의 #welcome-banner)
   - 회원가입·이메일 인증이 끝나면 index.html?welcome=1로 이동 (signup.js, verify-email.js)
   - ?welcome=1일 때만 표시하고 주소에서 바로 지워 새로고침 시 다시 뜨지 않게 함
   - "시작하기"가 있는 안내라 자동으로 사라지지 않고 닫기 버튼으로 닫음
   스타일: css/welcome.css (공통 토스트와 같은 위치·모양)
========================================= */

const banner = document.getElementById("welcome-banner");
const url = new URL(window.location.href);

if (banner && url.searchParams.get("welcome") === "1") {
    url.searchParams.delete("welcome");
    history.replaceState(null, "", url.pathname + url.search + url.hash);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "welcome-close";
    close.setAttribute("aria-label", "환영 안내 닫기");
    close.textContent = "닫기";
    close.addEventListener("click", () => {
        banner.hidden = true;
    });
    banner.appendChild(close);

    banner.hidden = false;
}
