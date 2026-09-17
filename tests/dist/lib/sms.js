"use strict";
// ---------------------------------------------------------------------------
// N1 SMS seam (Phase 3) — one place to send texts, provider behind config.
//
// Without SMS_API_URL + SMS_API_KEY the provider is "log" (dev behaviour
// identical to before: the message goes to the server console). Set:
//   SMS_API_URL   generic HTTP gateway endpoint (POST JSON)
//   SMS_API_KEY   bearer token for the gateway
//   SMS_SENDER_ID sender ID / short code shown to recipients
// The generic JSON contract is { to, from?, text } with a Bearer token —
// adapt the payload in sendSms() if the chosen aggregator differs.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSmsConfig = resolveSmsConfig;
exports.otpMessage = otpMessage;
exports.sendSms = sendSms;
function resolveSmsConfig(env = process.env) {
    var _a, _b, _c;
    const apiUrl = (_a = env.SMS_API_URL) === null || _a === void 0 ? void 0 : _a.trim();
    const apiKey = (_b = env.SMS_API_KEY) === null || _b === void 0 ? void 0 : _b.trim();
    if (apiUrl && apiKey) {
        return {
            provider: "http",
            apiUrl,
            apiKey,
            senderId: ((_c = env.SMS_SENDER_ID) === null || _c === void 0 ? void 0 : _c.trim()) || undefined,
        };
    }
    return { provider: "log" };
}
/** Standard OTP text (5-minute expiry, matching the phoneNumber plugin). */
function otpMessage(code) {
    return `Your TRACE verification code is ${code}. It expires in 5 minutes.`;
}
/**
 * Sends one SMS. Throws on gateway failure so callers can fall back
 * (e.g. log the OTP for dev sign-in) — never silently drop.
 */
async function sendSms(to, message, config = resolveSmsConfig()) {
    if (config.provider === "http" && config.apiUrl && config.apiKey) {
        const response = await fetch(config.apiUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(Object.assign(Object.assign({ to }, (config.senderId ? { from: config.senderId } : {})), { text: message })),
        });
        if (!response.ok) {
            throw new Error(`SMS gateway failed (${response.status}).`);
        }
        return { sent: true };
    }
    console.log(`[SMS] ${to} -> ${message}`);
    return { sent: false };
}
