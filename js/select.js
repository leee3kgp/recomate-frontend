import { requireLogin, apiFetch, ApiError } from "./api.js";
import { GENRES } from "./genres.js";

document.addEventListener('DOMContentLoaded', async () => {
    await requireLogin();

    const genresList = GENRES;
    const container = document.getElementById('participants-container');
    const countText = document.getElementById('participantCountText');
    const errorDiv = document.getElementById('error-message');
    const form = document.getElementById('preference-form');
    const submitBtn = document.getElementById('submit-btn');

    let isLoading = false;
    let participants = [];

    // (?count=N) 읽기
    const getInitialCount = () => {
        const searchParams = new URLSearchParams(window.location.search);
        const countParam = searchParams.get('count');
        const parsedCount = parseInt(countParam, 10);

        if (!isNaN(parsedCount) && parsedCount >= 2 && parsedCount <= 6) {
            return parsedCount;
        }
        return 2; // 기본값
    };

    const participantCount = getInitialCount();

    // 화면 상단에 인원수 표시
    if (countText) {
        countText.textContent = `${participantCount}명`;
    }

    // 화면(DOM) 그리는 함수
    const renderParticipants = () => {
        if (!container) return;
        container.innerHTML = ''; // 기존 카드 초기화

        participants.forEach((participant) => {
            const card = document.createElement('div');
            card.className = 'participant-card';

            const title = document.createElement('h3');
            title.className = 'participant-title';
            title.textContent = `참여자 ${participant.index}`;
            card.appendChild(title);

            const btnContainer = document.createElement('div');
            btnContainer.className = 'genre-btn-container';

            genresList.forEach((genre) => {
                const isSelected = participant.genres.includes(genre.code);
                const btn = document.createElement('button');

                btn.type = 'button';
                btn.textContent = genre.name;
                btn.disabled = isLoading;
                btn.className = 'genre-btn' + (isSelected ? ' selected' : '');

                // 장르 버튼 클릭 이벤트 (토글)
                btn.addEventListener('click', () => {
                    if (isSelected) {
                        participant.genres = participant.genres.filter((code) => code !== genre.code);
                    } else {
                        participant.genres.push(genre.code);
                    }
                    renderParticipants();
                });

                btnContainer.appendChild(btn);
            });

            card.appendChild(btnContainer);
            container.appendChild(card);
        });
    };

    // 인원수만큼 참여자 배열 생성
    participants = Array.from({ length: participantCount }, (_, i) => ({
        index: i + 1,
        genres: [],
    }));
    renderParticipants();

    const showError = (message) => {
        if (!errorDiv) return;
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    };

    // Submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (isLoading) return; // 이중 제출 방지

            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }

            // 모든 참여자가 최소 1개 이상 선택했는지 확인
            if (participants.some((p) => p.genres.length === 0)) {
                showError('모든 참여자가 최소 1개 이상의 장르를 선택해야 합니다.');
                return;
            }

            const requestPayload = { participantCount, participants };

            isLoading = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '추천 생성 중...';
            }
            renderParticipants();

            let redirecting = false;

            try {
                // POST /api/sessions → 201 { sessionId, ... }
                const data = await apiFetch('/api/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestPayload)
                });

                // 성공 시 결과 페이지로 이동
                redirecting = true;
                window.location.href = `result.html?sessionId=${encodeURIComponent(data.sessionId)}&count=${participantCount}`;

            } catch (error) {
                console.error('세션 생성 API 에러:', error);

                if (error instanceof ApiError && error.code === 'NICKNAME_REQUIRED') {
                    showError('닉네임 정보가 없어 추천을 시작할 수 없습니다. 닉네임을 확인해주세요.');
                } else {
                    showError(error.message || '세션 생성에 실패했습니다.');
                }
            } finally {
                // 이동 중이면 버튼을 잠근 채로 둠
                if (!redirecting) {
                    isLoading = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = '추천받기';
                    }
                    renderParticipants();
                }
            }
        });
    }
});
