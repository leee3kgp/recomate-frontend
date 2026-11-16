
/* =========================================
   RecoMate - 공통 네비게이션
   원본 디자인 시안 적용
   기존 auth-ui.js 연동 유지
========================================= */

const currentPage =
    window.location.pathname.split("/").pop() ||
    "index.html";

const navbarContainer =
    document.getElementById("navbar-container");

const isHome = currentPage === "index.html";
const isProfile = currentPage === "profile.html";
const isStart = ["start.html", "select.html"].includes(currentPage);
const isHistory = currentPage === "history.html";
const isTrending = currentPage === "trending.html";

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

                        <a href="trending.html"
                           ${isTrending ? 'aria-current="page"' : ""}>
                            요즘 대세
                        </a>

                        <a href="start.html"
                           ${isStart ? 'aria-current="page"' : ""}>
                            같이 추천받기
                        </a>

                        <a href="history.html"
                           ${isHistory ? 'aria-current="page"' : ""}>
                            추천 기록
                        </a>
                    </div>

                    <div class="header-actions">

                        <span class="icon-btn nav-search-disabled"
                              role="img"
                              aria-label="검색 기능 준비 중"
                              title="검색 기능 준비 중입니다">
                            ${searchIcon}
                        </span>

                        <div class="dropdown" id="profileDropdown">

                            <button
                                class="avatar"
                                id="profileAvatar"
                                type="button"
                                aria-label="프로필 메뉴 열기"
                                aria-haspopup="menu"
                                aria-expanded="false"
                                aria-controls="profileDropdownMenu">
                                나
                            </button>

                            <div class="dropdown-menu"
                                 id="profileDropdownMenu"
                                 role="menu">

                                <div class="user-line">
                                    <strong>내 계정</strong>
                                    <span id="navAccountStatus">
                                        계정 메뉴
                                    </span>
                                </div>

                                <hr>

                                <a href="profile.html"
                                   role="menuitem">
                                    내 프로필
                                </a>

                                <a href="history.html"
                                   role="menuitem">
                                    추천 기록
                                </a>

                                <hr>

                                <a id="authButton"
                                   class="nav-auth-link"
                                   href="login.html"
                                   role="menuitem">
                                    sign-in
                                </a>

                            </div>
                        </div>

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

                    <a href="trending.html"
                       ${isTrending ? 'aria-current="page"' : ""}>
                        요즘 대세
                    </a>

                    <a href="start.html"
                       ${isStart ? 'aria-current="page"' : ""}>
                        같이 추천받기
                    </a>

                    <a href="history.html"
                       ${isHistory ? 'aria-current="page"' : ""}>
                        추천 기록
                    </a>

                    <a href="profile.html"
                       ${isProfile ? 'aria-current="page"' : ""}>
                        내 프로필
                    </a>
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

    const authButton =
        document.getElementById("authButton");

    const accountStatus =
        document.getElementById("navAccountStatus");

    function closeProfileMenu() {
        dropdown.classList.remove("open");

        avatar.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    function toggleProfileMenu() {
        const isOpen =
            dropdown.classList.toggle("open");

        avatar.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    }

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

    // =====================================
    // 기존 인증 UI 연동
    // auth-ui.js의 authButton 사용 유지
    // =====================================

    function syncAuthUI() {
        const text =
            (authButton.textContent || "")
                .trim()
                .toLowerCase();

        const isLogout =
            text.includes("sign-out") ||
            text.includes("log-out") ||
            text.includes("logout") ||
            text.includes("로그아웃");

        const isLogin =
            text.includes("sign-in") ||
            text.includes("log-in") ||
            text.includes("login") ||
            text.includes("로그인");

        if (isLogout) {
            accountStatus.textContent = "로그인됨";

            avatar.setAttribute(
                "aria-label",
                "내 프로필 메뉴 열기"
            );
        } else if (isLogin) {
            accountStatus.textContent = "로그인해 주세요";

            avatar.textContent = "나";

            avatar.setAttribute(
                "aria-label",
                "계정 메뉴 열기"
            );
        }
    }

    const authObserver =
        new MutationObserver(syncAuthUI);

    authObserver.observe(authButton, {
        childList: true,
        characterData: true,
        subtree: true
    });

    syncAuthUI();

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
