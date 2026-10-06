const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const userId = document.getElementById("userId").value.trim();
    const password = document.getElementById("password").value.trim();

    if (userId === "" || password === "") {
        alert("아이디와 비밀번호를 입력해주세요.");
        return;
    }

    // 추후 Cognito 로그인 API 연결 위치
    console.log("아이디:", userId);
    console.log("비밀번호 입력 완료");

    alert("로그인 기능은 Cognito 연동 후 활성화됩니다.");
});