/* =========================================
   RecoMate - 공통 푸터
   Issue #45
   원본 디자인 시안 기준
========================================= */

// =====================================
// 공통 푸터 생성
// =====================================

function renderFooter() {
    const footerContainer =
        document.getElementById("site-footer");

    if (!footerContainer) return;

    footerContainer.classList.add("site-footer");

    footerContainer.innerHTML = `
        <div class="footer-container">

            <!-- RecoMate 로고 -->
            <a
                href="index.html"
                class="footer-logo"
                aria-label="RecoMate 홈으로 이동"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#e57a14"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                    style="width:20px;height:20px;flex:none;"
                >
                    <path
                        d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4V5Z"
                    />
                    <path
                        d="M12 5v2m0 3v4m0 3v2"
                        stroke-dasharray="2 2"
                    />
                </svg>

                <span>RecoMate</span>
            </a>

            <!-- 이용약관 / 개인정보처리방침 -->
            <nav
                class="footer-links"
                aria-label="서비스 정책"
            >
                <a href="terms.html">
                    이용약관
                </a>

                <a
                    href="privacy.html"
                    class="footer-privacy"
                >
                    개인정보처리방침
                </a>
            </nav>

            <!-- TMDB / JustWatch 출처 -->
            <div class="footer-credit">

                <a
                    class="footer-tmdb-logo"
                    href="https://www.themoviedb.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TMDB 공식 사이트 열기"
                >
                    <span class="footer-tmdb-text">TMDB</span>
                    <span
                        class="footer-tmdb-mark"
                        aria-hidden="true"
                    ></span>
                </a>

                <div class="footer-credit-text">
                    <p>
                        This product uses the TMDB API but is not
                        endorsed or certified by TMDB.
                    </p>

                    <p>
                        작품 정보와 포스터는 TMDB API를 사용하지만,
                        TMDB가 이 서비스를 보증하거나 인증하지 않습니다.
                        OTT 제공 정보 출처:
                        <a
                            href="https://www.justwatch.com/kr"
                            target="_blank"
                            rel="noopener noreferrer"
                        >JustWatch</a>.
                        제공 여부는 국가와 시점에 따라 달라질 수 있습니다.
                    </p>
                </div>
            </div>

            <!-- 저작권 -->
            <p class="footer-copyright">
                © ${new Date().getFullYear()} RecoMate,
                오소웨 2조 (학생 프로젝트)
            </p>

        </div>
    `;
}

// =====================================
// 문서 로드 후 실행
// =====================================

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        renderFooter,
        { once: true }
    );
} else {
    renderFooter();
}