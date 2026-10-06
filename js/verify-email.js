const verifyForm = document.getElementById("verifyForm");
const resendButton = document.getElementById("resendButton");

verifyForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const verificationCode =
        document.getElementById("verificationCode").value.trim();

    if (verificationCode === "") {
        alert("인증번호를 입력해주세요.");
        return;
    }

    /*
        추후 Cognito 이메일 인증 기능 연결 위치
    */

    alert("이메일 인증 기능은 Cognito 연동 후 활성화됩니다.");
});

resendButton.addEventListener("click", function () {

    /*
        추후 Cognito 인증번호 재전송 기능 연결 위치
    */

    alert("인증번호 재전송 기능은 Cognito 연동 후 활성화됩니다.");
});