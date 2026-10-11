document.addEventListener('DOMContentLoaded', () => {
    const genresList = window.RECOMATE_GENRES || [];
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

    let participantCount = getInitialCount();

    // 화면 상단에 인원수 표시
    if (countText) {
        countText.textContent = `${participantCount}명`;
    }

    // 인원수만큼 참여자 배열 초기화 및 생성
    const updateParticipantsArray = (count) => {
        participants = Array.from({ length: count }, (_, i) => ({
            index: i + 1,
            genres: participants[i] ? participants[i].genres : [],
        }));
        renderParticipants();
    };


    // 화면(DOM) 그리는 함수
    const renderParticipants = () => {
        if (!container) return;
        container.innerHTML = ''; // 기존 카드 초기화

        participants.forEach((participant) => {
            // 참여자 카드 박스 생성
            const card = document.createElement('div');
            card.className = 'participant-card';

            // 참여자 타이틀 (참여자 1, 참여자 2 ...)
            const title = document.createElement('h3');
            title.className = 'participant-title';
            title.textContent = `참여자 ${participant.index}`;
            card.appendChild(title);

            // 장르 버튼들을 감싸는 컨테이너
            const btnContainer = document.createElement('div');
            btnContainer.className = 'genre-btn-container';

            genresList.forEach((genre) => {
                const isSelected = participant.genres.includes(genre.code);
                const btn = document.createElement('button');
                
                btn.type = 'button';
                btn.textContent = genre.name;
                btn.disabled = isLoading;

                // 클래스로 스타일 제어
                btn.className = 'genre-btn' + (isSelected ? ' selected' : '');

                // 장르 버튼 클릭 이벤트 (토글)
                btn.addEventListener('click', () => {
                    if (isSelected) {
                        participant.genres = participant.genres.filter((code) => code !== genre.code);
                    } else {
                        participant.genres.push(genre.code);
                    }
                    renderParticipants(); // 데이터 변경 반영을 위해 재렌더링
                });

                btnContainer.appendChild(btn);
            });

            card.appendChild(btnContainer);
            container.appendChild(card);
        });
    };



    // Submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }

            // 모든 참여자가 최소 1개 이상 선택했는지 확인
            const hasEmptyGenre = participants.some((p) => p.genres.length === 0);
            if (hasEmptyGenre) {
                if (errorDiv) {
                    errorDiv.textContent = '모든 참여자가 최소 1개 이상의 장르를 선택해야 합니다.';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            const requestPayload = {
                participantCount,
                participants,
            };

            console.log('=== 생성된 Request Payload ===', JSON.stringify(requestPayload, null, 2));

            // 로딩 상태 변경
            isLoading = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '처리 중...';
            }
            renderParticipants();

            // 서버 통신 시뮬레이션 (300ms 딜레이)
            await new Promise((resolve) => setTimeout(resolve, 300));
            
            isLoading = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '추천받기';
            }
            renderParticipants();

            // 결과 확인용
            const resultText = participants
                .map((p) => `• 참여자 ${p.index}: ${p.genres.join(', ')}`)
                .join('\n');

            alert(`세션 생성 데이터\n\n총 인원수: ${participantCount}명\n` + resultText);
            window.location.href = `../pages/index.html`;
            //임의로 index.html 설정
            //window.location.href = `../pages/(추천결과).html?count=${participantCount}`;
        });
    }

    // 초기 실행
    updateParticipantsArray(participantCount);
});