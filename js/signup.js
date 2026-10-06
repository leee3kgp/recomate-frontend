const signupForm = document.getElementById("signupForm");

const nicknameInput = document.getElementById("nickname");
const userIdInput = document.getElementById("userId");

const passwordInput = document.getElementById("password");
const passwordConfirmInput =
    document.getElementById("passwordConfirm");

const checkIdButton =
    document.getElementById("checkIdButton");

const idCheckMessage =
    document.getElementById("idCheckMessage");

const passwordMessage =
    document.getElementById("passwordMessage");


// 아이디 중복확인 여부
let isIdChecked = false;


// ================================
// 아이디 중복확인
// ================================
checkIdButton.addEventListener("click", function () {

    const userId = userIdInput.value.trim();

    if (userId === "") {
        alert("아이디를 입력해주세요.");
        return;
    }

    /*
        추후 백엔드 아이디 중복확인 API 연결

        현재는 UI 테스트 단계이므로
        임시로 사용 가능한 아이디라고 처리
    */

    isIdChecked = true;

    idCheckMessage.textContent =
        "사용 가능한 아이디입니다.";

    idCheckMessage.className =
        "id-check-message success";
});


// 아이디를 다시 수정하면
// 중복확인을 다시 해야 함
userIdInput.addEventListener("input", function () {

    isIdChecked = false;

    idCheckMessage.textContent = "";
});


// ================================
// 비밀번호 실시간 확인
// ================================
passwordConfirmInput.addEventListener(
    "input",
    function () {

        const password = passwordInput.value;
        const passwordConfirm =
            passwordConfirmInput.value;

        if (passwordConfirm === "") {

            passwordMessage.textContent = "";
            return;
        }

        if (password === passwordConfirm) {

            passwordMessage.textContent =
                "비밀번호가 일치합니다.";

            passwordMessage.className =
                "password-message success";

        } else {

            passwordMessage.textContent =
                "비밀번호가 일치하지 않습니다.";

            passwordMessage.className =
                "password-message error";
        }
    }
);


// ================================
// 회원가입 버튼
// ================================
signupForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();

        const nickname =
            nicknameInput.value.trim();

        const userId =
            userIdInput.value.trim();

        const password =
            passwordInput.value;

        const passwordConfirm =
            passwordConfirmInput.value;


        // 빈칸 확인
        if (
            nickname === "" ||
            userId === "" ||
            password === "" ||
            passwordConfirm === ""
        ) {

            alert("모든 항목을 입력해주세요.");
            return;
        }


        // 아이디 중복확인 여부
        if (!isIdChecked) {

            alert("아이디 중복확인을 해주세요.");
            return;
        }


        // 비밀번호 확인
        if (password !== passwordConfirm) {

            alert("비밀번호가 일치하지 않습니다.");
            return;
        }


        /*
            추후 Cognito 회원가입 기능 연결

            nickname
            userId
            password
        */

        alert(
            "회원가입 기능은 Cognito 연동 후 활성화됩니다."
        );
    }
);