import { InternalError } from "./error";

interface CaptchaResponse {
  success: boolean;
}

export default async function validateCaptcha(
  secret: string,
  response: string,
  remoteip: string
) {
  console.log(secret);
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret,
      response,
      remoteip,
    }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (res.status !== 200) {
    throw new InternalError("Error validating captcha.");
  }

  const data = await res.json<CaptchaResponse>();

  return data.success;
}
