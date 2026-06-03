const { messaging, userTokens } = require('./firebase');

async function sendPushNotification(phoneNumber, title, body) {
  const fcmToken = userTokens.get(phoneNumber);
  if (!fcmToken) {
    console.log(`No FCM token for ${phoneNumber}`);
    return false;
  }
  const message = { notification: { title, body }, token: fcmToken };
  try {
    await messaging.send(message);
    return true;
  } catch (error) {
    console.error('FCM send error:', error);
    return false;
  }
}

module.exports = { sendPushNotification };