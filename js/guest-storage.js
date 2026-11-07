// 비회원 추천은 서버에 저장되지 않으므로 같은 탭의 sessionStorage에만 둠
// 키가 "recomate:result:"로 시작해 로그아웃 때 clearStoredResults()가 함께 지움

// 장르 선택 화면에서 보낸 요청 { participantCount, participants }
export const GUEST_REQUEST_KEY = "recomate:result:guest:request";

// 결과 화면이 받은 응답 { recommendations, analysis } (새로고침 시 재사용)
export const GUEST_RESULT_KEY = "recomate:result:guest:data";

// "이미 봤어요"로 뺀 작품 [{ tmdbId, mediaType }] (요청마다 excluded로 다시 보냄)
export const GUEST_EXCLUDED_KEY = "recomate:result:guest:excluded";

// 백엔드 GuestRecommendationRequest.excluded 최대 개수
export const GUEST_EXCLUDED_LIMIT = 20;
