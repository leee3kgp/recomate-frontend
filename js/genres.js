import { publicFetch } from "./api.js";

// API 응답을 기다리는 최대 시간
const LOAD_TIMEOUT_MS = 3000;

// RecoMate_API_명세서.pdf / 9. 장르 마스터 v1 / 참고
// 서버 목록을 받지 못했을 때 사용하는 기본 목록
export const GENRES = [
    { code: 'ACTION', name: '액션' },
    { code: 'COMEDY', name: '코미디' },
    { code: 'ROMANCE', name: '로맨스' },
    { code: 'DRAMA', name: '드라마' },
    { code: 'SF', name: 'SF' },
    { code: 'FANTASY', name: '판타지' },
    { code: 'HORROR', name: '공포' },
    { code: 'CRIME', name: '범죄' },
    { code: 'MYSTERY', name: '미스터리' },
    { code: 'ANIMATION', name: '애니메이션' },
];

// GET /api/genres
// 서버 목록을 가져오고, 실패하거나 늦으면 기본 목록 사용
export async function loadGenres() {
    try {
        // 공개 API라 비회원도 서버 목록을 받음
        const data = await publicFetch('/api/genres', {
            signal: AbortSignal.timeout(LOAD_TIMEOUT_MS)
        });

        return data?.genres?.length ? data.genres : GENRES;
    } catch {
        return GENRES;
    }
}