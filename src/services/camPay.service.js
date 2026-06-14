const axios = require('axios');

class CamPayService {
  constructor() {
    this.apiUrl = process.env.CAMPAY_API_URL || 'https://www.campay.net/api/';
    this.accessToken = process.env.CAMPAY_PERMANENT_ACCESS_TOKEN;
    if (!this.accessToken) {
      console.warn('⚠️ CamPay permanent access token missing – disbursements disabled');
    }
    this.headers = {
      'Authorization': `Token ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Disburse money to a mobile money account (MTN or Orange)
   * @param {string} amount - Amount in XAF (as string)
   * @param {string} phoneNumber - Recipient phone (e.g., "2376XXXXXXXX")
   * @param {string} description - Transaction description
   * @param {string} externalReference - Your unique reference (e.g., payment._id)
   * @returns {Promise<Object>} CamPay response
   */
  async disburse(amount, phoneNumber, description, externalReference) {
    if (!this.accessToken) {
      throw new Error('CamPay not configured – missing access token');
    }

    const endpoint = `${this.apiUrl}collect/`; // Yes, the same endpoint is used for disbursements
    const payload = {
      amount: amount.toString(),
      currency: 'XAF',
      to: phoneNumber,
      description: description,
      external_reference: externalReference,
    };

    try {
      const response = await axios.post(endpoint, payload, { headers: this.headers });
      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      console.error('CamPay disbursement error:', errorMsg);
      throw new Error(`CamPay disbursement failed: ${errorMsg}`);
    }
  }

  /**
   * Check transaction status (optional but useful)
   * @param {string} reference - The transaction reference returned by disburse
   */
  async getTransactionStatus(reference) {
    const endpoint = `${this.apiUrl}transaction/${reference}/`;
    try {
      const response = await axios.get(endpoint, { headers: this.headers });
      return response.data;
    } catch (error) {
      console.error('CamPay status check error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new CamPayService();