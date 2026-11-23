
/* =========================================
   RecoMate - 공통 네비게이션

   - 상단 메뉴: 홈 / 요즘 대세(로그인 시) / 같이 볼 작품 찾기
   - 계정 영역: 비로그인 → 로그인·회원가입 버튼, 로그인 → "나" 드롭다운(마이 페이지·로그아웃), 추천 기록은 마이 페이지에서
   - 인증 관련 페이지에서는 계정 버튼 숨김
   - 작은 화면 ☰ 메뉴는 페이지 메뉴만, 계정 영역은 화면 크기와 상관없이 오른쪽 위
   - 로그인 상태는 auth-ui.js가 <html data-auth="in|out">로 표시
========================================= */

const currentPage =
    window.location.pathname.split("/").pop() ||
    "index.html";

const navbarContainer =
    document.getElementById("navbar-container");

const isHome = currentPage === "index.html";
const isStart = ["start.html", "select.html"].includes(currentPage);
const isTrending = currentPage === "trending.html";

// 인증 관련 페이지에서는 로그인·회원가입 버튼 제거
const isAuthPage = [
    "login.html",
    "forgot-password.html",
    "reset-password.html",
    "verify-email.html"
].includes(currentPage);

const ticketIcon = `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linejoin="round"
         aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/>
        <path d="M14 5v12" stroke-dasharray="2 2.5"/>
    </svg>
`;

const searchIcon = `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         aria-hidden="true">
        <circle cx="11" cy="11" r="7"/>
        <path d="M20 20l-3.5-3.5"/>
    </svg>
`;

const menuIcon = `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16"/>
    </svg>
`;

// 요즘 대세: 로그인 전용 화면이라 시안처럼 로그인했을 때만 메뉴에 표시
const trendingItem = `
    <a class="auth-in-only-link"
       href="trending.html"
       ${isTrending ? 'aria-current="page"' : ""}>
        요즘 대세
    </a>
`;

if (navbarContainer) {
    navbarContainer.innerHTML = `
        <header class="site-header">
            <nav class="nav-bar" aria-label="주 메뉴">
                <div class="nav-container">

                    <a class="logo"
                       href="index.html"
                       aria-label="RecoMate 홈">
                        ${ticketIcon}
                        <span>RecoMate</span>
                    </a>

                    <div class="main-nav">
                        <a href="index.html"
                           ${isHome ? 'aria-current="page"' : ""}>
                            홈
                        </a>

                        ${trendingItem}

                        <a href="start.html"
                           ${isStart ? 'aria-current="page"' : ""}>
                            같이 볼 작품 찾기
                        </a>
                    </div>

                    <div class="header-actions">

                        <span class="icon-btn nav-search-disabled"
                              role="img"
                              aria-label="검색 기능 준비 중"
                              title="검색 기능 준비 중입니다">
                            ${searchIcon}
                        </span>

                        ${!isAuthPage ? `
                            <!-- 비로그인: 로그인 + 회원가입 -->
                            <div class="nav-guest-actions">
                                <a class="nav-login-btn"
                                   href="login.html">
                                    로그인
                                </a>

                                <a class="nav-signup-btn"
                                   href="signup.html">
                                    회원가입
                                </a>
                            </div>

                            <!-- 로그인: "나" 드롭다운 -->
                            <div class="dropdown auth-in-only" id="profileDropdown">

                                <button
                                    class="avatar"
                                    id="profileAvatar"
                                    type="button"
                                    aria-label="내 계정 메뉴 열기"
                                    aria-haspopup="menu"
                                    aria-expanded="false"
                                    aria-controls="profileDropdownMenu">
                                    나
                                </button>

                                <div class="dropdown-menu"
                                     id="profileDropdownMenu"
                                     role="menu">

                                    <a href="profile.html"
                                       role="menuitem">
                                        마이 페이지
                                    </a>

                                    <hr>

                                    <a id="authButton"
                                       class="nav-auth-link"
                                       href="login.html"
                                       role="menuitem">
                                        로그인
                                    </a>

                                </div>
                            </div>
                        ` : ""}

                        <button
                            class="nav-menu-toggle"
                            id="navMenuToggle"
                            type="button"
                            aria-label="메뉴 열기"
                            aria-expanded="false"
                            aria-controls="navMobilePanel">
                            ${menuIcon}
                        </button>

                    </div>
                </div>

                <div class="nav-mobile-panel"
                     id="navMobilePanel">

                    <a href="index.html"
                       ${isHome ? 'aria-current="page"' : ""}>
                        홈
                    </a>

                    ${trendingItem}

                    <a href="start.html"
                       ${isStart ? 'aria-current="page"' : ""}>
                        같이 볼 작품 찾기
                    </a>
                    <!-- 계정 메뉴는 오른쪽 위에만 표시 -->
                </div>
            </nav>
        </header>
    `;

    // =====================================
    // 프로필 드롭다운
    // =====================================

    const dropdown =
        document.getElementById("profileDropdown");

    const avatar =
        document.getElementById("profileAvatar");

    const dropdownMenu =
        document.getElementById("profileDropdownMenu");

    function closeProfileMenu() {
        if (!dropdown || !avatar) return;

        dropdown.classList.remove("open");

        avatar.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    function toggleProfileMenu() {
        if (!dropdown || !avatar) return;

        const isOpen =
            dropdown.classList.toggle("open");

        avatar.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    }

    if (avatar && dropdown && dropdownMenu) {
        avatar.addEventListener("click", (event) => {
            event.stopPropagation();
            closeMobileMenu();
            toggleProfileMenu();
        });

        document.addEventListener("click", (event) => {
            if (!dropdown.contains(event.target)) {
                closeProfileMenu();
            }
        });

        dropdownMenu.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", closeProfileMenu);
        });
    }

    // =====================================
    // 모바일 메뉴
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

        if (isOpen) {
            closeProfileMenu();
        }
    }

    menuToggle.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();
            toggleMobileMenu();
        }
    );

    mobilePanel.querySelectorAll("a").forEach((link) => {
        link.addEventListener(
            "click",
            closeMobileMenu
        );
    });

    document.addEventListener("click", (event) => {
        if (
            !mobilePanel.contains(event.target) &&
            !menuToggle.contains(event.target)
        ) {
            closeMobileMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeProfileMenu();
            closeMobileMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 860) {
            closeMobileMenu();
        }
    });
}
