document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('recommendations-container');

    // TMDB 이미지 기본 URL (API 명세서: posterPath는 TMDB 경로만 반환)
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

    // 장르 마스터 매핑 (코드 -> 한국어명)
    const genreMap = (window.RECOMATE_GENRES || []).reduce((acc, curr) => {
        acc[curr.code] = curr.name;
        return acc;
    }, {
        // genres.js 로드 실패 시 디폴트 매핑 예비
        ACTION: '액션', COMEDY: '코미디', ROMANCE: '로맨스',
        DRAMA: '드라마', SF: 'SF', FANTASY: '판타지',
        HORROR: '공포', CRIME: '범죄', MYSTERY: '미스터리',
        ANIMATION: '애니메이션'
    });

    // API 명세서 규격의 TOP 3 추천 더미 JSON 데이터
    const dummyRecommendations = {
        sessionId: "01JAB38Z99XYZ1234567890ABC",
        recommendations: [
            {
                rank: 1,
                tmdbId: 603,
                mediaType: "movie",
                title: "매트릭스",
                posterPath: "/f89U3ADrloiB1s9GkdPOEpXUk5H.jpg",
                genres: ["ACTION", "SF"]
            },
            {
                rank: 2,
                tmdbId: 299536,
                mediaType: "movie",
                title: "어벤져스: 인피니티 워",
                posterPath: "/7WsyChLLEz336PRefzL2Spng3vE.jpg",
                genres: ["ACTION", "SF", "FANTASY"]
            },
            {
                rank: 3,
                tmdbId: 1399,
                mediaType: "tv",
                title: "왕좌의 게임",
                posterPath: "/1XS1oqL89opfnbLl8P2B212A43L.jpg",
                genres: ["DRAMA", "SF", "FANTASY"]
            }
        ]
    };

    // 카드 DOM 생성 함수
    const createRecommendationCard = (item) => {
        const card = document.createElement('div');
        card.className = `recommend-card rank-${item.rank}`;

        const posterSrc = item.posterPath 
            ? `${TMDB_IMAGE_BASE_URL}${item.posterPath}`
            : 'https://via.placeholder.com/500x750?text=No+Image';

        const mediaTypeName = item.mediaType === 'movie' ? '영화' : 'TV 시리즈';

        // 장르 코드를 한글로 변환
        const genreTagsHtml = item.genres
            .map(code => `<span class="genre-tag">${genreMap[code] || code}</span>`)
            .join('');

        card.innerHTML = `
            <div class="rank-badge">TOP ${item.rank}</div>
            <div class="poster-wrapper">
                <img class="poster-img" src="${posterSrc}" alt="${item.title}" loading="lazy">
            </div>
            <div class="card-content">
                <span class="media-type-tag">${mediaTypeName}</span>
                <h3 class="content-title">${item.title}</h3>
                <div class="genre-tags">
                    ${genreTagsHtml}
                </div>
            </div>
        `;

        return card;
    };

    // 화면에 TOP 3 카드 출력
    const renderRecommendations = (data) => {
        if (!container) return;
        container.innerHTML = '';

        if (!data || !data.recommendations || data.recommendations.length === 0) {
            container.innerHTML = '<p class="no-result">추천 결과가 없습니다.</p>';
            return;
        }

        data.recommendations.forEach((item) => {
            const cardNode = createRecommendationCard(item);
            container.appendChild(cardNode);
        });
    };

    // 더미 데이터 초기 렌더링
    renderRecommendations(dummyRecommendations);
});