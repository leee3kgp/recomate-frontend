
/* =========================================
   RecoMate - 공통 푸터
   Issue #45
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
        <div class="container">

            <!-- 서비스 안내 -->
            <div class="footer-links">
                <b>RecoMate</b>
                <span>함께 고르는 영화·드라마 추천 서비스</span>
            </div>

            <!-- 서비스 정보 -->
            <div class="footer-meta">
                <span>© ${new Date().getFullYear()} RecoMate</span>
            </div>

            <!-- 안내 문구 -->
            <div class="footer-note">
                RecoMate는 여러 사람의 콘텐츠 취향을
                바탕으로 영화와 드라마를 추천하는 서비스입니다.
            </div>

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
