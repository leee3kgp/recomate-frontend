// =====================================
// OTT 공식 사이트 정보 (작품 상세·추천 결과 화면 공용)
// provider: GET /api/contents/{mediaType}/{tmdbId} 응답의 providers[] 항목 { id, name, logoPath }
// =====================================

const OTT_BY_ID = {
    8: {
        name: "넷플릭스",
        url: "https://www.netflix.com/kr/"
    },
    337: {
        name: "디즈니플러스",
        url: "https://www.disneyplus.com/ko-kr"
    },
    97: {
        name: "왓챠",
        url: "https://watcha.com/"
    },
    356: {
        name: "웨이브",
        url: "https://www.wavve.com/"
    },
    350: {
        name: "애플 TV",
        url: "https://tv.apple.com/kr"
    },
    119: {
        name: "아마존 프라임 비디오",
        url: "https://www.primevideo.com/"
    },
    283: {
        name: "크런치롤",
        url: "https://www.crunchyroll.com/"
    }
};

const OTT_BY_NAME = [
    {
        keywords: ["netflix", "넷플릭스"],
        name: "넷플릭스",
        url: "https://www.netflix.com/kr/"
    },
    {
        keywords: ["disney", "디즈니"],
        name: "디즈니플러스",
        url: "https://www.disneyplus.com/ko-kr"
    },
    {
        keywords: ["coupang", "쿠팡"],
        name: "쿠팡플레이",
        url: "https://www.coupangplay.com/"
    },
    {
        keywords: ["tving", "티빙"],
        name: "티빙",
        url: "https://www.tving.com/"
    },
    {
        keywords: ["wavve", "웨이브"],
        name: "웨이브",
        url: "https://www.wavve.com/"
    },
    {
        keywords: ["watcha", "왓챠"],
        name: "왓챠",
        url: "https://watcha.com/"
    },
    {
        keywords: ["laftel", "라프텔"],
        name: "라프텔",
        url: "https://laftel.net/"
    },
    {
        keywords: ["apple tv", "애플 tv"],
        name: "애플 TV",
        url: "https://tv.apple.com/kr"
    },
    {
        keywords: ["prime video", "amazon", "프라임"],
        name: "아마존 프라임 비디오",
        url: "https://www.primevideo.com/"
    },
    {
        keywords: ["crunchyroll", "크런치롤"],
        name: "크런치롤",
        url: "https://www.crunchyroll.com/"
    }
];

export function getOttInfo(provider) {
    const id = Number(provider.id);

    if (OTT_BY_ID[id]) {
        return OTT_BY_ID[id];
    }

    const name = String(provider.name || "").toLowerCase();

    const matched = OTT_BY_NAME.find((ott) =>
        ott.keywords.some((keyword) => name.includes(keyword))
    );

    if (matched) {
        return {
            name: matched.name,
            url: matched.url
        };
    }

    return {
        name: provider.name || "OTT",
        url: null
    };
}

// 같은 OTT가 여러 번 오면(예: 광고형 요금제) 한 번만 남김
export function getUniqueOtts(providers = []) {
    const seen = new Set();

    return providers
        .map(getOttInfo)
        .filter((ott) => {
            const key = ott.name.trim().toLocaleLowerCase("ko-KR");

            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });
}
