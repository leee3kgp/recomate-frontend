// =====================================
// 추천 흐름 화면 전환 연출 (시안 assets/flow.js 를 ES 모듈로 옮김)
//   퇴장 → 입장, 단계별 배경 그라데이션 이동, 페이지 이동 전 커튼, 숫자 바운스
// 모든 함수는 호출 시점에 DOM 을 조회하므로 페이지 로드 순서와 무관
// =====================================

const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

let busy = false;

// 단계가 진행될수록 배경 그라데이션이 옆으로 천천히 흘러감. p: 0~1
function progress(p) {
    const fx = document.querySelector(".stage-fx");

    if (fx) {
        fx.style.backgroundPosition = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}% 50%`;
    }
}

function enter(el, dir) {
    el.hidden = false;

    // 긴 화면에서 넘어와도 새 화면은 맨 위에서 시작
    if (window.scrollY > 0) window.scrollTo(0, 0);

    el.classList.remove("is-out", "is-in");
    el.classList.toggle("back", dir < 0);

    void el.offsetWidth; // 애니메이션을 처음부터 다시 시작
    el.classList.add("is-in");

    el.querySelectorAll(".chips .chip").forEach((chip, i) => {
        chip.style.setProperty("--i", i);
    });
}

// from 패널은 밀려나며 사라지고, to 패널은 들어옴. dir: 1 = 앞으로, -1 = 뒤로
function swap(from, to, dir = 1, done) {
    if (busy) return false;

    if (!from || from === to || from.hidden || reduced) {
        if (from && from !== to) from.hidden = true;

        enter(to, dir);
        done?.();
        return true;
    }

    busy = true;
    from.classList.toggle("back", dir < 0);
    from.classList.add("is-out");

    let finished = false;

    const end = () => {
        if (finished) return;
        finished = true;

        from.removeEventListener("animationend", onEnd);
        from.hidden = true;
        from.classList.remove("is-out", "is-in");

        enter(to, dir);
        busy = false;
        done?.();
    };

    const onEnd = (e) => {
        if (e.target === from) end();
    };

    from.addEventListener("animationend", onEnd);
    setTimeout(end, 360); // animationend 가 오지 않아도 멈추지 않도록

    return true;
}

// 다른 페이지로 넘어가기 전에 지금 화면을 정리
function leave(el, cb) {
    if (reduced || !el) {
        cb();
        return;
    }

    el.classList.add("is-out");
    setTimeout(cb, 260);
}

// 어두운 화면으로 서서히 덮은 뒤 이동 (결과 화면이 검은 배경이라 색이 갑자기 바뀌지 않도록)
function curtain(cb) {
    if (reduced) {
        cb();
        return;
    }

    const el = document.createElement("div");

    el.className = "stage-curtain";
    document.body.appendChild(el);

    void el.offsetWidth;
    el.classList.add("on");

    setTimeout(cb, 520);
}

// 한 번 튀는 효과 (숫자가 바뀔 때 등)
function bump(el) {
    if (!el || reduced) return;

    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
}

export const RMFlow = {
    progress,
    enter,
    swap,
    leave,
    curtain,
    bump,
    get busy() {
        return busy;
    }
};
