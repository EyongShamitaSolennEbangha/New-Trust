const axios = require('axios');

class MobileMoneyService {
  constructor() {
    this.apiUrl = process.env.CAMPAY_API_URL || 'https://www.campay.net/api/';
    this.accessToken = process.env.CAMPAY_PERMANENT_ACCESS_TOKEN;
    this.headers = {
      'Authorization': `Token ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async initiateMobileMoneyCollection(provider, amount, currency, phone, agreementId) {
    // Clean phone: remove spaces, ensure it starts with 237 without '+'
    let cleanPhone = phone.replace(/\s+/g, '');
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
    if (!cleanPhone.startsWith('237')) cleanPhone = '237' + cleanPhone;

    const payload = {
      amount: amount.toString(),
      currency: 'XAF',
      to: cleanPhone,
      description: `Payment for agreement ${agreementId}`,
      external_reference: `payment_${agreementId}_${Date.now()}`,
    };

    try {
      const response = await axios.post(`${this.apiUrl}collect/`, payload, { headers: this.headers });
      return {
        status: response.data.status === 'SUCCESSFUL' ? 'confirmed' : 'pending',
        transactionId: response.data.reference,
        gatewayReference: response.data.reference,
        message: response.data.message || 'Payment initiated',
      };
    } catch (error) {
      console.error('CamPay error:', error.response?.data || error.message);
      throw new Error('Mobile money payment failed');
    }
  }
}

module.exports = new MobileMoneyService();