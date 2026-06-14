const twilio = require("twilio");
const { totp } = require("otplib");
const logger = require("../config/logger");
const { setOTP, getOTP, deleteOTP } = require("../config/redis");

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

let twilioClient;
if (
  !twilioAccountSid ||
  !twilioAuthToken ||
  !twilioMessagingServiceSid ||
  twilioAccountSid.startsWith("AC_your_") ||
  twilioAuthToken.includes("your_twilio_auth_token") ||
  twilioMessagingServiceSid.includes("your_messaging_service_sid")
) {
  logger.warn(
    "Twilio is not configured or still using placeholder credentials. SMS fallback will be disabled until valid credentials are provided."
  );
} else {
  try {
    twilioClient = twilio(twilioAccountSid, twilioAuthToken);
    logger.info("Twilio client initialized with Messaging Service SID");
  } catch (err) {
    logger.warn("Twilio client initialization failed — SMS disabled:", err.message);
  }
}

const sendSMS = async (to, body) => {
   console.log(`📱 [DEV] OTP for ${to}: ${body}`);
  if (!twilioClient) {
    logger.warn(`SMS skipped (Twilio not configured): ${to} — ${body}`);
    return;
  }
  try {
    await twilioClient.messages.create({
      body,
      messagingServiceSid: twilioMessagingServiceSid,
      to,
    });
    logger.info(`SMS sent to ${to}`);
  } catch (err) {
    logger.error(`SMS failed to ${to}: ${err.message}`);
    throw err;
  }
};
exports.sendSMS = sendSMS;

/**
 * Generate a 6-digit OTP, store in Redis, send via SMS.
 * Key: phone number
 */
exports.sendPhoneOTP = async (phone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const ttl = parseInt(process.env.OTP_EXPIRE_MINUTES || 10) * 60;

  await setOTP(phone, otp, ttl);

  await sendSMS(
    phone,
    `Your TrustLedger verification code is: ${otp}. Valid for ${process.env.OTP_EXPIRE_MINUTES || 10} minutes. Do not share this code.`
  );

  return otp; // returned only for dev/testing — never expose in prod response
};

/**
 * Verify OTP from Redis.
 */
exports.generateAgreementOTP = async (agreementId, creditorPhone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const ttl = parseInt(process.env.OTP_EXPIRE_MINUTES || 10) * 60;

  await setOTP(`agreement:${agreementId}`, otp, ttl);
  await sendSMS(creditorPhone, `TrustLedger Agreement OTP: ${otp} ...`);

  console.log(`🔐 OTP for agreement ${agreementId} (${creditorPhone}): ${otp}`); // ✅ logs to terminal
  return otp;
};
/**
 * Generate in-person agreement OTP (stored against agreementId).
 */
exports.generateAgreementOTP = async (agreementId, creditorPhone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const ttl = parseInt(process.env.OTP_EXPIRE_MINUTES || 10) * 60;

  await setOTP(`agreement:${agreementId}`, otp, ttl);
  await sendSMS(creditorPhone, `TrustLedger Agreement OTP: ${otp} ...`);

  console.log(`🔐 OTP for agreement ${agreementId} (${creditorPhone}): ${otp}`); // ✅ logs to terminal
  return otp;
};                                                                                                                                                            

exports.verifyPhoneOTP = async (phone, inputOtp) => {
  const stored = await getOTP(phone);
  if (!stored) return { valid: false, reason: "OTP expired or not found" };
  if (stored.otp !== String(inputOtp)) {
    return { valid: false, reason: "Incorrect OTP" };
  }
  await deleteOTP(phone);
  console.log(`✅ OTP verified for ${phone}: ${stored.otp}`);
  return { valid: true };
};

exports.sendPaymentReminderSMS = async (phone, firstName, agreementId, amount, currency) => {
  await sendSMS(
    phone,
    `TrustLedger Reminder: Hi ${firstName}, your payment of ${currency} ${amount} for agreement ${agreementId} is due soon. Login to pay: ${process.env.CLIENT_URL}`
  );
};

exports.sendAgreementSignedSMS = async (phone, firstName, agreementId) => {
  await sendSMS(
    phone,
    `TrustLedger: Hi ${firstName}, agreement ${agreementId} has been signed and is now ACTIVE. Login to view details.`
  );
};