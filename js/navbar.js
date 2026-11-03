
/* =========================================
   RecoMate 공통 네비게이션
   원본 시안 기반 UI
========================================= */

// 현재 페이지 확인
const currentPage = window.location.pathname
    .split("/")
    .pop() || "index.html";

// 네비게이션 삽입 위치
const navbarContainer = document.getElementById("navbar-container");

// 페이지 활성화 상태
const isHome = currentPage === "index.html";
const isProfile = currentPage === "profile.html";

// 공통 네비게이션 생성
if (navbarContainer) {

    navbarContainer.innerHTML = `
        <nav class="nav-bar" aria-label="주 메뉴">

            <!-- RecoMate 로고 -->
            <a class="logo" href="index.html">
                RecoMate
            </a>

            <!-- 왼쪽 메뉴 -->
            <div class="nav-links">

                <!-- 홈 -->
                <a
                    class="nav-btn ${isHome ? "nav-active" : ""}"
                    href="index.html"
                    ${isHome ? 'aria-current="page"' : ""}
                >
                    홈
                </a>

                <!-- 요즘 대세 콘텐츠 -->
                <span
                    class="nav-btn nav-btn-disabled"
                    aria-disabled="true"
                    title="준비 중입니다"
                >
                    요즘 대세 콘텐츠
                </span>

            </div>

            <!-- 오른쪽 메뉴 -->
            <div class="nav-actions">

                <!-- 검색 돋보기 아이콘 -->
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
                        width="21"
                        height="21"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <circle
                            cx="10.8"
                            cy="10.8"
                            r="6.8"
                        ></circle>

                        <path
                            d="M16 16L21 21"
                        ></path>
                    </svg>
                </span>

                <!-- 프로필 -->
                <a
                    class="nav-btn ${isProfile ? "nav-active" : ""}"
                    href="profile.html"
                    ${isProfile ? 'aria-current="page"' : ""}
                >
                    프로필
                </a>

                <!-- 로그인 / 로그아웃 -->
                <a
                    class="nav-btn nav-login"
                    id="authButton"
                    href="login.html"
                >
                    sign-in
                </a>

            </div>

        </nav>
    `;
}
