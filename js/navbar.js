
/* =========================================
   RecoMate - 공통 네비게이션
   Issue #45
========================================= */

// =====================================
// 현재 페이지 확인
// =====================================

const currentPage =
    window.location.pathname.split("/").pop() ||
    "index.html";

const navbarContainer =
    document.getElementById("navbar-container");

const isHome = currentPage === "index.html";
const isProfile = currentPage === "profile.html";

// =====================================
// 공통 네비게이션 생성
// =====================================

if (navbarContainer) {

    navbarContainer.innerHTML = `
        <nav class="nav-bar" aria-label="주 메뉴">

            <!-- 로고 -->
            <a class="logo" href="index.html">
                RecoMate
            </a>

            <!-- 데스크톱 왼쪽 메뉴 -->
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

            <!-- 데스크톱 오른쪽 메뉴 -->
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
                        <circle
                            cx="10.8"
                            cy="10.8"
                            r="6.8"
                        ></circle>
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

            </div>

            <!-- 모바일 메뉴 버튼 -->
            <button
                class="nav-menu-toggle"
                id="navMenuToggle"
                type="button"
                aria-label="메뉴 열기"
                aria-expanded="false"
                aria-controls="navMobilePanel"
            >
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path d="M4 7H20"></path>
                    <path d="M4 12H20"></path>
                    <path d="M4 17H20"></path>
                </svg>
            </button>

            <!-- 모바일 메뉴 패널 -->
            <div
                class="nav-mobile-panel"
                id="navMobilePanel"
            >

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

                <a
                    class="nav-btn ${isProfile ? "nav-active" : ""}"
                    href="profile.html"
                    ${isProfile ? 'aria-current="page"' : ""}
                >
                    프로필
                </a>

                <div class="nav-mobile-divider"></div>

            </div>

            <!-- 공통 인증 버튼 -->
            <a
                class="nav-btn nav-login"
                id="authButton"
                href="login.html"
            >
                sign-in
            </a>

        </nav>
    `;

    // =====================================
    // 모바일 메뉴 열기 / 닫기
    // =====================================

    const menuToggle =
        document.getElementById("navMenuToggle");

    const mobilePanel =
        document.getElementById("navMobilePanel");

    function closeMobileMenu() {
        mobilePanel.classList.remove("is-open");

        menuToggle.setAttribute(
            "aria-expanded",
            "false"
        );

        menuToggle.setAttribute(
            "aria-label",
            "메뉴 열기"
        );
    }

    function toggleMobileMenu() {
        const isOpen =
            mobilePanel.classList.toggle("is-open");

        menuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "메뉴 닫기" : "메뉴 열기"
        );
    }

    menuToggle.addEventListener(
        "click",
        toggleMobileMenu
    );

    // 메뉴 내부 링크 클릭 시 닫기
    mobilePanel.querySelectorAll("a").forEach(
        (link) => {
            link.addEventListener(
                "click",
                closeMobileMenu
            );
        }
    );

    // Escape 키로 메뉴 닫기
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                closeMobileMenu();
            }
        }
    );

    // 모바일에서 데스크톱으로 전환 시 닫기
    window.addEventListener(
        "resize",
        () => {
            if (window.innerWidth > 560) {
                closeMobileMenu();
            }
        }
    );
}
