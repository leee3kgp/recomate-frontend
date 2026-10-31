import { requireLogin, apiFetch, ApiError } from "./api.js";
import { GENRES } from "./genres.js";

document.addEventListener('DOMContentLoaded', async () => {
    await requireLogin();

    const recommendationsContainer = document.getElementById('recommendations-container');

    // TMDB 이미지 기본 URL (API 명세서: posterPath는 TMDB 경로만 반환)
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

    // 포스터가 없을 때 쓰는 인라인 placeholder (외부 서비스 의존 제거)
    const NO_IMAGE_SRC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750">' +
        '<rect width="100%" height="100%" fill="#e5e5e5"/>' +
        '<text x="50%" y="50%" fill="#888" font-size="32" text-anchor="middle" ' +
        'font-family="sans-serif">No Image</text></svg>'
    );

    // 장르 마스터 매핑 (코드 -> 한국어명)
    const genreMap = (GENRES).reduce((acc, curr) => {
        acc[curr.code] = curr.name;
        return acc;
    }, {});

    // URL 쿼리 스트링에서 sessionId 추출
    const sessionId = new URLSearchParams(window.location.search).get('sessionId');

    if (!sessionId) {
        alert('유효하지 않은 접근입니다. 세션 ID가 없습니다.');
        window.location.href = 'index.html';
        return;
    }

    // 다시 추천받기: 같은 인원수로 선택 화면 열기
    const countParam = parseInt(new URLSearchParams(window.location.search).get('count'), 10);
    const retryBtn = document.querySelector('.result-actions .primary-btn');

    if (retryBtn && countParam >= 2 && countParam <= 6) {
        retryBtn.href = `select.html?count=${countParam}`;
    }

    // 추천은 세션당 1회만 생성 가능(409 RECOMMENDATION_EXISTS)하므로
    // 성공 응답을 저장해 두었다가 새로고침 시 재사용
    const CACHE_KEY = `recomate:result:${sessionId}`;

    const loadCache = () => {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const saveCache = (data) => {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
            /* 저장 실패는 무시 */
        }
    };

    const showMessage = (text) => {
        recommendationsContainer.replaceChildren();
        const p = document.createElement('p');
        p.className = 'no-result';
        p.textContent = text;
        recommendationsContainer.appendChild(p);
    };

    // 카드 DOM 생성 함수 (innerHTML 대신 textContent 사용 → XSS 방지)
    const createRecommendationCard = (item) => {
        const card = document.createElement('div');
        card.className = `recommend-card rank-${Number(item.rank) || 0}`;

        const badge = document.createElement('div');
        badge.className = 'rank-badge';
        badge.textContent = `TOP ${item.rank}`;

        const posterWrapper = document.createElement('div');
        posterWrapper.className = 'poster-wrapper';

        const img = document.createElement('img');
        img.className = 'poster-img';
        img.loading = 'lazy';
        img.alt = item.title || '';
        img.src = item.posterPath ? `${TMDB_IMAGE_BASE_URL}${item.posterPath}` : NO_IMAGE_SRC;
        img.addEventListener('error', () => { img.src = NO_IMAGE_SRC; }, { once: true });
        posterWrapper.appendChild(img);

        const content = document.createElement('div');
        content.className = 'card-content';

        const mediaType = document.createElement('span');
        mediaType.className = 'media-type-tag';
        mediaType.textContent = item.mediaType === 'movie' ? '영화' : 'TV 시리즈';

        const title = document.createElement('h3');
        title.className = 'content-title';
        title.textContent = item.title;

        const tags = document.createElement('div');
        tags.className = 'genre-tags';
        (item.genres || []).forEach((code) => {
            const tag = document.createElement('span');
            tag.className = 'genre-tag';
            tag.textContent = genreMap[code] || code;
            tags.appendChild(tag);
        });

        content.append(mediaType, title, tags);
        card.append(badge, posterWrapper, content);
        return card;
    };

    // 화면에 TOP 3 카드 출력
    const renderRecommendations = (recommendations) => {
        if (!recommendations || recommendations.length === 0) {
            showMessage('추천 결과가 없습니다.');
            return;
        }

        recommendationsContainer.replaceChildren();
        recommendations.forEach((item) => {
            recommendationsContainer.appendChild(createRecommendationCard(item));
        });
    };

    // Chart.js 렌더링 함수
    const renderCharts = (analysis) => {
        if (!analysis || typeof Chart === 'undefined') return;

        const genreCtx = document.getElementById('genreChart').getContext('2d');

        new Chart(genreCtx, {
            type: 'bar',
            data: {
                labels: analysis.genreScores.map(item => genreMap[item.genre] || item.genre),
                datasets: [{
                    label: '선택한 참여자 수',
                    data: analysis.genreScores.map(item => item.count),
                    backgroundColor: '#555555',
                    borderColor: '#111111',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });

        const matchCtx = document.getElementById('matchChart').getContext('2d');

        new Chart(matchCtx, {
            type: 'bar',
            data: {
                labels: analysis.participantMatch.map(item => `참여자 ${item.index}`),
                datasets: [{
                    label: '취향 일치율 (%)',
                    // 명세: matchRate는 0~1
                    data: analysis.participantMatch.map(item => Math.round(item.matchRate * 100)),
                    backgroundColor: '#9f9f9f',
                    borderColor: '#555555',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    };

    const render = (data) => {
        renderRecommendations(data.recommendations);
        renderCharts(data.analysis);
    };

    // 새로고침 등으로 재방문한 경우 저장된 결과 사용
    const cached = loadCache();
    if (cached) {
        render(cached);
        return;
    }

    // POST /api/sessions/{sessionId}/recommendations
    showMessage('추천 결과를 불러오는 중입니다...');

    try {
        const data = await apiFetch(
            `/api/sessions/${encodeURIComponent(sessionId)}/recommendations`,
            { method: 'POST' }
        );

        saveCache(data);
        render(data);

    } catch (error) {
        console.error('추천 API 에러:', error);

        if (error instanceof ApiError) {
            switch (error.code) {
                case 'RECOMMENDATION_EXISTS':
                    // 이미 생성된 세션인데 저장된 사본이 없는 경우 (다른 탭/브라우저 등)
                    showMessage('이미 추천이 생성된 세션입니다. "다시 추천받기"로 새로 시작해주세요.');
                    return;
                case 'NOT_FOUND':
                    showMessage('존재하지 않거나 접근할 수 없는 세션입니다.');
                    return;
                case 'UPSTREAM_ERROR':
                    showMessage('콘텐츠 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
                    return;
            }
        }

        showMessage(`오류가 발생했습니다: ${error.message}`);
    }
});
