const Notification = require('../models/Notification');

async function createNotification({ organization, type, title, body, actor, resourceId }) {
  try {
    await Notification.create({ organization, type, title, body, actor, resourceId });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

module.exports = { createNotification };
