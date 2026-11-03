
/* =========================================
   RecoMate 공통 네비게이션
========================================= */

// 현재 페이지 확인
const currentPage = window.location.pathname
    .split("/")
    .pop() || "index.html";

// 네비게이션을 삽입할 요소
const navbarContainer = document.getElementById("navbar-container");

// 현재 페이지에 따른 활성화 상태
const isHome = currentPage === "index.html";
const isProfile = currentPage === "profile.html";

// 공통 네비게이션 생성
if (navbarContainer) {

    navbarContainer.innerHTML = `
        <nav class="nav-bar" aria-label="주 메뉴">

            <a class="logo" href="index.html">
                RecoMate
            </a>

            <div class="nav-links">

                <a
                    class="nav-btn ${isHome ? "nav-active" : ""}"
                    href="index.html"
                    ${isHome ? 'aria-current="page"' : ""}
                >
                    홈
                </a>

                <span
                    class="nav-btn nav-btn-disabled"
                    aria-disabled="true"
                    title="준비 중입니다"
                >
                    요즘 대세 콘텐츠
                </span>

            </div>

            <div class="nav-actions">

                <span
                    class="nav-search-icon nav-btn-disabled"
                    role="img"
                    aria-label="검색 기능 준비 중"
                    title="검색 기능 준비 중입니다"
                >
                    <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <circle cx="10.8" cy="10.8" r="6.8"></circle>
                        <path d="M16 16L21 21"></path>
                    </svg>
                </span>

                <a
                    class="nav-btn ${isProfile ? "nav-active" : ""}"
                    href="profile.html"
                    ${isProfile ? 'aria-current="page"' : ""}
                >
                    프로필
                </a>

                <a
                    class="nav-btn nav-login"
                    id="authButton"
                    href="login.html"
                >
                    로그인
                </a>

            </div>

        </nav>
    `;
}
