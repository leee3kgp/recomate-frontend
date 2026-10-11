
const modalOverlay = document.getElementById('count-modal-overlay');
const openBtn = document.getElementById('open-modal-btn');
const submitBtn = document.getElementById('submit-btn');
const closeBtn = document.getElementById('close-btn');
const minusBtn = document.getElementById('minus-btn');
const plusBtn = document.getElementById('plus-btn');
const countDisplay = document.getElementById('guest-count');

let count = 2;

openBtn.addEventListener('click', () => {
    modalOverlay.classList.add('active');
});

minusBtn.addEventListener('click', () => {
    if (count > 2) { // 최소 인원수 제한(2명 이상)
        count--;
        countDisplay.textContent = `${count}명`;
        }
});

plusBtn.addEventListener('click', () => {
    if (count < 6) { // 최대 인원수 제한(API 명세서에 따라 설정)
        count++;
        countDisplay.textContent = `${count}명`;
    }
});

closeBtn.addEventListener('click', () => {
    modalOverlay.classList.remove('active');

    count = 2; // count 초기화
    countDisplay.textContent = `${count}명`;
});

submitBtn.addEventListener('click', () => { 
    window.location.href = `../pages/select.html?count=${count}`;

    // 모달 창 닫고 초기화
    modalOverlay.classList.remove('active');
    count = 2;
    countDisplay.textContent = `${count}명`;
});