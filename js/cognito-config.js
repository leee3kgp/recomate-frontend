
import { Amplify } from "aws-amplify";

Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: "ap-southeast-2_Cjugq3j3p",
            userPoolClientId: "7h7kjle5d1dh6ogea95thrk20q",

            signUpVerificationMethod: "code",

            loginWith: {
                email: true
            }
        }
    }
});
