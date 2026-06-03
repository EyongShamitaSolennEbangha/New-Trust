const crypto = require("crypto");
const logger = require("../config/logger");

const supportedProviders = ["mtn", "orange"];

exports.initiateMobileMoneyCollection = async (
  provider,
  amount,
  currency,
  phone,
  agreementId,
) => {
  if (!supportedProviders.includes(provider)) {
    throw new Error(`Unsupported mobile money provider: ${provider}`);
  }

  const transactionId = `MM-${provider.toUpperCase()}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const gatewayReference = `GW-${provider.toUpperCase()}-${Date.now()}`;

  logger.info(
    `Mobile money collection requested: provider=${provider}, amount=${amount}, currency=${currency}, phone=${phone}, agreement=${agreementId}`,
  );

  if (process.env.MOBILE_MONEY_SIMULATE === "true") {
    return {
      status: "confirmed",
      transactionId,
      gatewayReference,
      message: `Simulated ${provider.toUpperCase()} payment confirmed.`,
    };
  }

  return {
    status: "pending",
    transactionId,
    gatewayReference,
    message: `A ${provider.toUpperCase()} payment request has been created. Confirm the payment from the mobile wallet prompt on ${phone}.`,
  };
};

exports.parseCallbackPayload = async (payload) => {
  return {
    provider: payload.provider,
    paymentId: payload.paymentId,
    transactionId: payload.transactionId,
    gatewayReference: payload.gatewayReference,
    status: payload.status,
    amount: payload.amount,
    currency: payload.currency,
  };
};
