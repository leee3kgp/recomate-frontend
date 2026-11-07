import { getCurrentUser } from "aws-amplify/auth";

import { requireLogin, apiFetch, publicFetch, ApiError } from "./api.js";
import { loadGenres } from "./genres.js";
import { setFlowCount } from "./flow-state.js";
import {
    GUEST_REQUEST_KEY,
    GUEST_RESULT_KEY,
    GUEST_EXCLUDED_KEY,
    GUEST_EXCLUDED_LIMIT
} from "./guest-storage.js";

// =====================================
// 추천 결과 화면
//   기본(#)   : TOP 3 추천 카드 + "이미 봤어요"
//   #report   : 그룹 취향 분석 리포트 (Chart.js)
// 두 화면은 같은 페이지 안에서 해시로 전환
// ?guest=1 이면 비회원 결과: 로그인 없이 받고 서버에는 아무것도 저장하지 않음
// =====================================

// 시안 색상 (css/common.css 의 --grad 와 같은 계열)
const BAR_TOP = '#c96a0b';
const BAR_BOTTOM = '#7b3593';
const CHART_FONT = "'Inter', 'Noto Sans KR', sans-serif";

async function initResultPage() {
    const params = new URLSearchParams(window.location.search);
    const isGuest = params.get('guest') === '1';

    if (!isGuest) {
        await requireLogin();
    }

    const app = document.getElementById('app');

    // TMDB 이미지 기본 URL (API 명세서: posterPath는 TMDB 경로만 반환)
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

    // 장르 마스터 매핑 (코드 -> 한국어명)
    const genreMap = (await loadGenres()).reduce((acc, curr) => {
        acc[curr.code] = curr.name;
        return acc;
    }, {});

    // URL 쿼리 스트링에서 sessionId 추출 (비회원은 세션이 없음)
    const sessionId = params.get('sessionId');

    if (!isGuest && !sessionId) {
        alert('유효하지 않은 접근입니다. 세션 ID가 없습니다.');
        window.location.href = 'index.html';
        return;
    }

    // 다시 추천받기: 같은 인원수를 채워 둔 인원 선택 화면(index.html#count) 열기
    const countParam = parseInt(params.get('count'), 10);

    if (countParam >= 2 && countParam <= 6) {
        setFlowCount(countParam);
    }

    // 추천은 세션당 1회만 생성 가능(409 RECOMMENDATION_EXISTS)하므로
    // 성공 응답을 저장해 두었다가 새로고침 시 재사용
    // 사용자별로 저장해 같은 탭의 다른 계정에 보이지 않게 함
    // 비회원은 다시 부르면 TMDB를 또 호출하므로 같은 방식으로 이 탭에만 저장
    const userId = isGuest ? null : (await getCurrentUser()).userId;
    const CACHE_KEY = isGuest ? GUEST_RESULT_KEY : `recomate:result:${userId}:${sessionId}`;
    const EXCLUDED_KEY = `recomate:excluded:${userId}:${sessionId}`; // 회원 전용

    const loadCache = () => {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const saveCache = (data) => {
        // 빈 결과는 다시 시도할 수 있도록 저장하지 않음
        if (!data?.recommendations?.length) return;

        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
            /* 저장 실패는 무시 */
        }
    };

    // ---------- 상태 ----------

    let data = null;            // { recommendations, analysis }
    let statusMessage = '';     // 불러오는 중 / 오류 안내
    let isLoading = false;      // 추천 생성 요청 진행 중
    let charts = [];            // 현재 화면의 Chart.js 인스턴스

    let excluding = false;      // "이미 봤어요" 제외 요청 진행 중 (중복 요청 방지)
    let seenError = '';         // 제외 요청 실패 안내

    // 비회원 "이미 봤어요" 목록 [{ tmdbId, mediaType }]
    // 서버에 기록하지 않고 이 탭에만 두며, 비회원 추천 요청마다 excluded 로 다시 보냄
    const loadGuestExcluded = () => {
        try {
            const list = JSON.parse(sessionStorage.getItem(GUEST_EXCLUDED_KEY));
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    };

    let guestExcluded = isGuest ? loadGuestExcluded() : [];

    // 지금까지 제외한 작품 수 (안내 문구용, 새로고침해도 유지)
    let excludedCount = isGuest
        ? guestExcluded.length
        : Number(sessionStorage.getItem(EXCLUDED_KEY)) || 0;

    const saveExcludedCount = () => {
        try {
            if (isGuest) {
                sessionStorage.setItem(GUEST_EXCLUDED_KEY, JSON.stringify(guestExcluded));
            } else {
                sessionStorage.setItem(EXCLUDED_KEY, String(excludedCount));
            }
        } catch {
            /* 저장 실패는 무시 */
        }
    };

    // 제외 후 결과 저장본 갱신: 결과가 있으면 교체, 비었으면 삭제
    // (saveCache 는 빈 결과를 건너뛰므로 이전 결과가 남지 않게 직접 삭제)
    const replaceCache = (d) => {
        if (d.recommendations.length) {
            saveCache(d);
            return;
        }

        try {
            sessionStorage.removeItem(CACHE_KEY);
        } catch {
            /* 무시 */
        }
    };

    const hasResults = (d) => d?.recommendations?.length > 0;
    const canShowReport = (d) => hasResults(d) && Boolean(d.analysis);

    // ---------- 카드 ----------

    // 제목에서 색을 계산해 포스터가 없을 때의 배경으로 사용
    const posterBackground = (title = '') => {
        const hue = [...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

        return `linear-gradient(160deg,hsl(${hue} 55% 22%),hsl(${(hue + 50) % 360} 60% 38%) 60%,hsl(${(hue + 100) % 360} 55% 18%))`;
    };

    // 카드 DOM 생성 (innerHTML 대신 textContent 사용 → XSS 방지)
    const createCard = (item, index) => {
        const card = document.createElement('article');
        card.className = 'mcard';

        const poster = document.createElement('div');
        poster.className = 'poster';
        poster.style.background = posterBackground(item.title);

        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `TOP ${Number(item.rank) || index + 1}`;

        const fallbackTitle = document.createElement('strong');
        fallbackTitle.textContent = item.title || '';

        poster.append(badge, fallbackTitle);

        if (item.posterPath) {
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = `${item.title || ''} 포스터`;
            img.src = `${TMDB_IMAGE_BASE_URL}${item.posterPath}`;
            img.addEventListener('error', () => poster.classList.add('no-poster'), { once: true });
            poster.prepend(img);
        } else {
            poster.classList.add('no-poster');
        }

        const info = document.createElement('div');
        info.className = 'minfo';

        const kind = document.createElement('div');
        kind.className = 'kind';
        const kindParts = [item.mediaType === 'movie' ? '영화' : 'TV 시리즈'];

        if (item.releaseYear) kindParts.push(String(item.releaseYear));
        if (Number(item.voteAverage) > 0) kindParts.push(`★ ${Number(item.voteAverage).toFixed(1)}`);

        kind.textContent = kindParts.join(' · ');

        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = item.title;

        const tags = document.createElement('div');
        tags.className = 'tags';
        (item.genres || []).forEach((code) => {
            const tag = document.createElement('span');
            tag.textContent = genreMap[code] || code;
            tags.appendChild(tag);
        });

        // 이 콘텐츠와 장르가 겹치는 참여자 (명세: matchedParticipants = 참여자 index 배열)
        const why = document.createElement('p');
        why.className = 'why';
        why.textContent = item.matchedParticipants?.length
            ? `참여자 ${item.matchedParticipants.join('·')}님 취향과 겹쳐요`
            : '그룹 전체 취향과 가장 가까운 콘텐츠예요';

        const seenBtn = document.createElement('button');
        seenBtn.type = 'button';
        seenBtn.className = 'seen-btn';
        seenBtn.dataset.act = 'seen';
        seenBtn.dataset.tmdbId = item.tmdbId;
        seenBtn.dataset.mediaType = item.mediaType;
        seenBtn.textContent = '이미 봤어요';
        seenBtn.disabled = excluding;

        info.append(kind, name, tags, why, seenBtn);
        card.append(poster, info);

        return card;
    };

    // 제외 안내 / 오류 문구 갱신
    const updateNotes = () => {
        const note = document.getElementById('seen-note');
        const error = document.getElementById('seen-error');
        const lead = document.getElementById('result-lead');
        if (!note || !error) return;

        const showNote = excludedCount > 0 && hasResults(data);

        note.hidden = !showNote;
        note.textContent = showNote ? `이미 본 ${excludedCount}개를 제외하고 다시 추천했어요` : '';

        error.hidden = !seenError;
        error.textContent = seenError;

        lead?.classList.toggle('has-note', showNote || Boolean(seenError));
    };

    // ---------- 화면 1: TOP 3 ----------

    const renderResultView = () => {
        app.innerHTML = `
            <section class="stage top">
                <div class="view">
                    <div class="panel wide">
                        <h3 tabindex="-1">그룹 맞춤 추천 결과</h3>
                        <p class="lead" id="result-lead">모든 참여자의 취향을 종합 분석하여 선정된 TOP 3 콘텐츠입니다</p>
                        <p class="re-note guest-note" id="guest-note"${isGuest ? '' : ' hidden'}>로그인하지 않아 이 결과는 저장되지 않아요. <a href="login.html">로그인</a>하면 추천 기록이 남아요.</p>
                        <p class="re-note" id="seen-note" role="status" hidden></p>
                        <p class="re-note error" id="seen-error" role="alert" hidden></p>
                        <div id="recommendations-container"></div>
                        <div class="foot" id="result-foot"></div>
                    </div>
                </div>
            </section>`;

        const container = document.getElementById('recommendations-container');
        const foot = document.getElementById('result-foot');

        if (statusMessage || !hasResults(data)) {
            container.className = 'empty';

            // 후보를 모두 제외했거나 추천 가능한 콘텐츠가 없는 경우 (시안 .empty 문구)
            container.textContent = statusMessage
                || '추천할 수 있는 콘텐츠를 모두 보셨거나 찾지 못했어요. 처음부터 다시 선택해 보세요.';

            // 불러오는 중에는 이동 버튼을 숨기고, 실패/빈 결과일 때만 다시 시작 링크 제공
            if (!isLoading) foot.append(createRetryLink('처음부터 다시 하기'));
            updateNotes();
            return;
        }

        container.className = 'cards';
        data.recommendations.forEach((item, i) => container.appendChild(createCard(item, i)));
        updateNotes();

        if (canShowReport(data)) {
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'link-btn';
            next.dataset.act = 'to-report';
            next.textContent = '다음';
            foot.append(next);
        } else {
            foot.append(createRetryLink('다시 추천받기'));
        }
    };

    const createRetryLink = (label) => {
        const link = document.createElement('a');
        link.className = 'link-btn';
        link.href = 'index.html#count';
        link.textContent = label;
        return link;
    };

    // ---------- 화면 2: 취향 분석 리포트 (Chart.js) ----------

    const destroyCharts = () => {
        charts.forEach((chart) => chart.destroy());
        charts = [];
    };

    // 막대 하나의 그라데이션: 막대 위 → 아래 (시안 .bar .fill 과 동일)
    // 애니메이션 중인 element 좌표(y == base) 대신, 최종 값 기준 픽셀 좌표로 계산
    const barGradient = (context) => {
        const { chart, raw } = context;
        const yScale = chart.scales?.y;
 
        if (!chart.chartArea || !yScale || !Number.isFinite(raw)) return BAR_BOTTOM;
 
        const top = yScale.getPixelForValue(raw);
        const base = yScale.getPixelForValue(0);
 
        if (!Number.isFinite(top) || !Number.isFinite(base) || top === base) return BAR_BOTTOM;
 
        const gradient = chart.ctx.createLinearGradient(0, top, 0, base);
 
        gradient.addColorStop(0, BAR_TOP);
        gradient.addColorStop(1, BAR_BOTTOM);
 
        return gradient;
    };

    // 막대 위에 값 표시 (시안 .bar .val) - Chart.js 기본 기능에는 없어 간단한 플러그인으로 처리
    const valueLabels = (format) => ({
        id: 'valueLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            const values = chart.data.datasets[0].data;

            ctx.save();
            ctx.font = `400 14px ${CHART_FONT}`;
            ctx.fillStyle = '#dddddd';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            meta.data.forEach((bar, i) => {
                ctx.fillText(format(values[i]), bar.x, bar.y - 6);
            });

            ctx.restore();
        }
    });

    const createBarChart = (canvas, rows, { max, format }) => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        canvas.setAttribute(
            'aria-label',
            rows.map((row) => `${row.label} ${format(row.value)}`).join(', ')
        );

        const chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: rows.map((row) => row.label),
                datasets: [{
                    data: rows.map((row) => row.value),
                    backgroundColor: barGradient,
                    borderWidth: 0,
                    borderRadius: { topLeft: 4, topRight: 4 },
                    borderSkipped: false,
                    maxBarThickness: 90,
                    categoryPercentage: 0.8,
                    barPercentage: 1,
                    minBarLength: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: reduceMotion ? false : { duration: 800 },
                layout: { padding: { top: 26, left: 6, right: 6 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }   // 값은 막대 위에 항상 표시
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: '#444444' },
                        ticks: {
                            color: '#cfcfcf',
                            font: { family: CHART_FONT, size: 13 },
                            autoSkip: false,
                            maxRotation: 0
                        }
                    },
                    y: {
                        display: false,
                        beginAtZero: true,
                        max
                    }
                }
            },
            plugins: [valueLabels(format)]
        });

        charts.push(chart);
    };

    const setSummary = (el, genreRows, matchRows) => {
        el.replaceChildren();

        if (!genreRows.length) {
            el.hidden = true;
            return;
        }

        const top = genreRows[0];

        el.append(
            '이 그룹은 ',
            Object.assign(document.createElement('em'), { textContent: top.label }),
            `를 ${top.value}명이 선택해 가장 선호도가 높았어요. `
        );

        if (matchRows.length) {
            const best = matchRows.reduce((a, b) => (b.value > a.value ? b : a));
            const worst = matchRows.reduce((a, b) => (b.value < a.value ? b : a));

            el.append(
                best.value === worst.value
                    ? '모든 참여자의 일치율이 같아요.'
                    : `${best.label}님의 취향이 가장 많이 반영됐고, ${worst.label}님은 상대적으로 덜 반영됐어요.`
            );
        }
    };

    const renderReportView = () => {
        const { analysis } = data;

        // 장르 선호도: 많이 선택된 순으로 최대 6개 (시안과 동일)
        const genreRows = [...(analysis.genreScores || [])]
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
            .map((item) => ({ label: genreMap[item.genre] || item.genre, value: item.count }));

        // 명세: matchRate는 0~1
        const matchRows = (analysis.participantMatch || []).map((item) => ({
            label: `참여자 ${item.index}`,
            value: Math.round(item.matchRate * 100)
        }));

        app.innerHTML = `
            <section class="stage top">
                <div class="view">
                    <div class="panel wide">
                        <h3 tabindex="-1">그룹 취향 분석 리포트</h3>
                        <p class="summary" id="report-summary"></p>
                        <div class="charts">
                            <div class="chart">
                                <h4>장르 선호도 분포</h4>
                                <div class="chart-canvas"><canvas id="genreChart" role="img"></canvas></div>
                                <p class="caption" id="genre-caption"></p>
                            </div>
                            <div class="chart">
                                <h4>참여자별 취향 일치율</h4>
                                <div class="chart-canvas"><canvas id="matchChart" role="img"></canvas></div>
                                <p class="caption">각 참여자가 고른 장르 중 TOP 3 콘텐츠에 담긴 장르의 비율이에요. 100%에 가까울수록 그 사람의 취향이 잘 반영된 추천이에요.</p>
                            </div>
                        </div>
                        <div class="foot" id="report-foot"></div>
                    </div>
                </div>
            </section>`;

        const people = matchRows.length ? `${matchRows.length}명` : '전체';

        document.getElementById('genre-caption').textContent =
            `참여자 ${people} 중 해당 장르를 선택한 인원 수예요. 막대가 높을수록 그룹이 함께 좋아하는 장르예요.`;

        setSummary(document.getElementById('report-summary'), genreRows, matchRows);

        document.getElementById('report-foot').append(createRetryLink('다시 추천 받기'));
        document.querySelector('#report-foot .link-btn').style.marginTop = '34px';

        // Chart.js 를 불러오지 못한 경우(네트워크 차단 등)에는 안내 문구로 대체
        const chartBoxes = [
            { id: 'genreChart', rows: genreRows, options: { max: Math.max(1, ...genreRows.map((r) => r.value)), format: (v) => `${v}명` } },
            { id: 'matchChart', rows: matchRows, options: { max: 100, format: (v) => `${v}%` } }
        ];

        chartBoxes.forEach(({ id, rows, options }) => {
            const canvas = document.getElementById(id);

            if (typeof Chart === 'undefined' || !rows.length) {
                const note = document.createElement('p');
                note.className = 'chart-fallback';
                note.textContent = typeof Chart === 'undefined'
                    ? '그래프를 불러오지 못했어요.'
                    : '표시할 데이터가 없어요.';
                canvas.closest('.chart-canvas').replaceWith(note);
                return;
            }

            createBarChart(canvas, rows, options);
        });
    };

    // ---------- 화면 전환 ----------

    const currentView = () => (
        window.location.hash === '#report' && canShowReport(data) ? 'report' : 'result'
    );

    const render = (keepPosition = false) => {
        destroyCharts();

        const view = currentView();

        document.title = view === 'report' ? 'RecoMate | 취향 분석 리포트' : 'RecoMate | 추천 결과';

        if (view === 'report') {
            renderReportView();
        } else {
            renderResultView();
        }

        // 제외 후 갱신은 스크롤 위치를 유지하고, 버튼 포커스가 사라지지 않게 첫 카드 버튼으로 이동
        if (keepPosition === true) {
            (app.querySelector('.seen-btn') || app.querySelector('h3'))?.focus({ preventScroll: true });
            return;
        }

        app.querySelector('h3')?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
    };

    app.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el) return;

        if (el.dataset.act === 'to-report') {
            window.location.hash = 'report';
            return;
        }

        if (el.dataset.act === 'seen') excludeItem(el);
    });

    window.addEventListener('hashchange', () => render());

    const show = (nextData, keepPosition = false) => {
        data = nextData;
        statusMessage = '';
        isLoading = false;
        render(keepPosition);
    };

    const showMessage = (text, loading = false) => {
        data = null;
        statusMessage = text;
        isLoading = loading;
        render();
    };

    // GET /api/sessions/{sessionId}
    // 서버에 저장된 결과 조회 (사용자 정보는 빼고 화면에 필요한 값만 저장)
    const loadSavedResult = async (keepPosition = false) => {
        const { recommendations, analysis } = await apiFetch(
            `/api/sessions/${encodeURIComponent(sessionId)}`
        );
        const saved = { recommendations, analysis };

        replaceCache(saved);
        show(saved, keepPosition);
    };

    // POST /api/guest/recommendations
    // 비회원 추천: 장르 선택 화면이 저장한 요청에 "이미 봤어요" 목록을 붙여 호출 (서버 저장 없음)
    const requestGuest = async (excluded) => {
        let payload = null;
        try {
            payload = JSON.parse(sessionStorage.getItem(GUEST_REQUEST_KEY));
        } catch {
            payload = null;
        }

        if (!payload?.participants?.length) {
            throw new ApiError(0, 'GUEST_REQUEST_MISSING', '선택한 장르 정보가 없습니다. 처음부터 다시 선택해 주세요.');
        }

        const result = await publicFetch('/api/guest/recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, excluded })
        });

        return {
            recommendations: result.recommendations || [],
            analysis: result.analysis || null
        };
    };

    const guestErrorMessage = (error) => {
        // API Gateway 호출 제한 (비회원 경로는 회원보다 낮음)
        if (error instanceof ApiError && error.status === 429) {
            return '요청이 많아 잠시 후 다시 시도해주세요.';
        }
        if (error instanceof ApiError && error.code === 'UPSTREAM_ERROR') {
            return '콘텐츠 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.';
        }
        return error.message || '추천을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    };

    // POST /api/sessions/{sessionId}/exclusions (비회원은 POST /api/guest/recommendations)
    // "이미 봤어요": 작품 1개를 제외하고 다음 후보로 채운 새 결과를 받아 화면과 저장본을 교체
    // (제외 취소 API는 없으므로 한 번 누르면 되돌릴 수 없음)
    const excludeItem = async (button) => {
        if (excluding) return;

        const tmdbId = Number(button.dataset.tmdbId);
        const mediaType = button.dataset.mediaType;

        if (!Number.isFinite(tmdbId) || !mediaType) return;

        // 비회원 제외 목록은 서버가 받는 최대 개수까지만
        if (isGuest && guestExcluded.length >= GUEST_EXCLUDED_LIMIT) {
            seenError = '더 이상 제외할 수 없어요. 처음부터 다시 선택해 보세요.';
            render(true);
            return;
        }

        excluding = true;
        seenError = '';

        // 요청 중에는 모든 "이미 봤어요" 버튼을 잠가 동시 제외로 인한 충돌을 막음
        app.querySelectorAll('.seen-btn').forEach((btn) => { btn.disabled = true; });
        button.textContent = '제외하는 중...';

        try {
            const seen = { tmdbId, mediaType };
            const result = isGuest
                ? await requestGuest([...guestExcluded, seen])
                : await apiFetch(
                    `/api/sessions/${encodeURIComponent(sessionId)}/exclusions`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(seen)
                    }
                );

            const next = {
                recommendations: result.recommendations || [],
                analysis: result.analysis || null
            };

            if (isGuest) {
                guestExcluded = [...guestExcluded, seen];
                excludedCount = guestExcluded.length;
            } else {
                excludedCount += 1;
            }
            saveExcludedCount();
            replaceCache(next);

            excluding = false;
            show(next, true);

        } catch (error) {
            console.error('제외 API 에러:', error);
            excluding = false;

            if (isGuest) {
                seenError = guestErrorMessage(error);
            } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
                // 화면의 결과가 서버와 어긋난 경우: 서버에 저장된 최신 결과로 다시 표시
                try {
                    seenError = '추천 결과가 바뀌어 최신 결과로 다시 불러왔어요.';
                    await loadSavedResult(true);
                    return;
                } catch (detailError) {
                    console.error('세션 조회 API 에러:', detailError);
                }
            } else if (error instanceof ApiError && error.code === 'CONCURRENT_UPDATE') {
                seenError = '다른 요청과 겹쳤어요. 잠시 후 다시 시도해주세요.';
            } else if (error instanceof ApiError && error.code === 'NOT_FOUND') {
                seenError = '존재하지 않거나 접근할 수 없는 세션입니다.';
            } else {
                seenError = error.message || '제외하지 못했어요. 잠시 후 다시 시도해주세요.';
            }

            render(true);
        }
    };

    // 새로고침 등으로 재방문한 경우 저장된 결과 사용
    const cached = loadCache();
    if (hasResults(cached)) {
        show(cached);
        return;
    }

    if (isGuest) {
        showMessage('추천 결과를 불러오는 중입니다...', true);

        try {
            const result = await requestGuest(guestExcluded);

            saveCache(result);
            show(result);
        } catch (error) {
            console.error('비회원 추천 API 에러:', error);
            showMessage(guestErrorMessage(error));
        }
        return;
    }

    // POST /api/sessions/{sessionId}/recommendations
    showMessage('추천 결과를 불러오는 중입니다...', true);

    try {
        const result = await apiFetch(
            `/api/sessions/${encodeURIComponent(sessionId)}/recommendations`,
            { method: 'POST' }
        );

        saveCache(result);
        show(result);

    } catch (error) {
        console.error('추천 API 에러:', error);

        if (error instanceof ApiError) {
            switch (error.code) {
                case 'RECOMMENDATION_EXISTS':
                    // 이미 생성된 세션인데 저장된 사본이 없는 경우 (다른 탭/브라우저 등)
                    try {
                        await loadSavedResult();
                    } catch (detailError) {
                        console.error('세션 조회 API 에러:', detailError);
                        showMessage('저장된 추천 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
                    }
                    return;
                case 'NOT_FOUND':
                    showMessage('존재하지 않거나 접근할 수 없는 세션입니다.');
                    return;
                case 'NETWORK_ERROR':
                    showMessage(error.message);
                    return;
                case 'UPSTREAM_ERROR':
                    showMessage('콘텐츠 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
                    return;
            }
        }

        showMessage(`오류가 발생했습니다: ${error.message}`);
    }
}

// 스크립트가 문서 로드 뒤에 실행돼도 화면을 그리도록 처리
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResultPage);
} else {
    initResultPage();
}
